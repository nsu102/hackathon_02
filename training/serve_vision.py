"""Authenticated OpenAI-compatible VLM server behind the owner's SSH tunnel."""
import argparse,base64,hmac,io,json,os,threading,time,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer

def main():
 p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--adapter');p.add_argument('--port',type=int,default=8001);p.add_argument('--host',default='127.0.0.1');args=p.parse_args()
 token=os.environ.get('STUDY_SERVING_KEY','')
 if len(token)<24:raise ValueError('Set a private STUDY_SERVING_KEY')
 import torch
 from PIL import Image
 from transformers import AutoProcessor,AutoModelForImageTextToText
 processor=AutoProcessor.from_pretrained(args.model,local_files_only=True,min_pixels=256*28*28,max_pixels=1280*28*28)
 model=AutoModelForImageTextToText.from_pretrained(args.model,local_files_only=True,dtype=torch.bfloat16,attn_implementation='sdpa',device_map={'':0})
 if args.adapter:
  from peft import PeftModel
  model=PeftModel.from_pretrained(model,args.adapter)
 model.eval();lock=threading.Lock()
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*_):pass
  def reply(self,status,value):
   raw=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
  def authorized(self):
   if not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+token):self.reply(401,{'error':'Bearer token required'});return False
   return True
  def do_GET(self):
   if not self.authorized():return
   if self.path=='/v1/models':self.reply(200,{'data':[{'id':'study-signal-personal','object':'model'}]})
   else:self.reply(404,{'error':'Unknown route'})
  def do_POST(self):
   if not self.authorized():return
   if self.path!='/v1/chat/completions':self.reply(404,{'error':'Unknown route'});return
   acquired=False
   try:
    length=int(self.headers.get('Content-Length','0'))
    if not 0<length<=15_000_000 or self.headers.get('Transfer-Encoding'):raise ValueError('Invalid body size')
    value=json.loads(self.rfile.read(length));messages=value['messages']
    if value.get('model')!='study-signal-personal':raise ValueError('Unknown model')
    if not isinstance(messages,list) or not 1<=len(messages)<=8 or value.get('stream') not in (None,False):raise ValueError('Invalid conversation')
    prepared=[];images=0
    for message in messages:
     if message.get('role') not in {'system','user','assistant'}:raise ValueError('Invalid role')
     content=message.get('content');parts=[]
     if isinstance(content,str):
      if len(content)>40000:raise ValueError('Text too large')
      prepared.append({'role':message['role'],'content':content});continue
     if not isinstance(content,list):raise ValueError('Invalid content')
     for part in content:
      if part.get('type')=='text' and isinstance(part.get('text'),str) and len(part['text'])<=40000:parts.append({'type':'text','text':part['text']})
      elif part.get('type')=='image_url':
       data=part['image_url']['url']
       if not isinstance(data,str) or not data.startswith('data:image/png;base64,') or len(data)>8_000_100:raise ValueError('Only bounded inline PNG allowed')
       raw=base64.b64decode(data.split(',',1)[1],validate=True);image=Image.open(io.BytesIO(raw))
       if image.format!='PNG' or image.width>8192 or image.height>8192:raise ValueError('Invalid image')
       parts.append({'type':'image','image':image.convert('RGB')});images+=1
      else:raise ValueError('Unsupported content')
     prepared.append({'role':message['role'],'content':parts})
    if images>1:raise ValueError('One selected screen per request')
    acquired=lock.acquire(blocking=False)
    if not acquired:self.reply(429,{'error':'Model busy'});return
    inputs=processor.apply_chat_template(prepared,add_generation_prompt=True,tokenize=True,return_dict=True,return_tensors='pt',enable_thinking=False).to(model.device)
    with torch.inference_mode():output=model.generate(**inputs,max_new_tokens=640,do_sample=False)
    generated=output[0,inputs['input_ids'].shape[-1]:]
    text=processor.decode(generated,skip_special_tokens=True)
    eos=model.generation_config.eos_token_id;eos=eos if isinstance(eos,list) else [eos]
    reason='length' if len(generated)>=640 and int(generated[-1]) not in eos else 'stop'
    self.reply(200,{'id':uuid.uuid4().hex,'object':'chat.completion','model':'study-signal-personal','choices':[{'index':0,'finish_reason':reason,'message':{'role':'assistant','content':text}}]})
   except (ValueError,KeyError,TypeError):self.reply(400,{'error':'Invalid request'})
   except Exception:self.reply(500,{'error':'Local vision inference failed'})
   finally:
    if acquired:lock.release()
 print('Study Signal private vision endpoint ready',flush=True);ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()
if __name__=='__main__':main()
