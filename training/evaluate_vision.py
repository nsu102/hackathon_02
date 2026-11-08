"""Compare base and LoRA on held-out pages and matched unreadable views."""
from pathlib import Path
import argparse,contextlib,json,re,time
from vision_data import check_splits,prompt

def score(raw,row):
 try:
  text=raw.strip()
  if text.startswith('```'):text=re.sub(r'^```(?:json)?\s*|\s*```$','',text)
  value=json.loads(text);valid=set(value)=={'content','question','answer'} and all(isinstance(v,str) for v in value.values())
 except (ValueError,TypeError):value={'content':raw};valid=False
 answer=value.get('content','');norm=lambda s:re.sub(r'[\s,]','',s).casefold()
 facts=[norm(f) in norm(answer) for f in row['expected_facts']]
 abstains=any(v in answer for v in ['흐','선명','확대','읽기 어려','읽을 수 없','확인하기 어려','확인할 수 없'])
 return {'json_valid':valid,'fact_fraction':sum(facts)/len(facts),'abstains':abstains,'content':answer}

def main():
 p=argparse.ArgumentParser();p.add_argument('--data',required=True);p.add_argument('--model',required=True);p.add_argument('--adapter',required=True);p.add_argument('--output',required=True);args=p.parse_args()
 import torch
 from PIL import Image,ImageFilter
 from transformers import AutoProcessor,AutoModelForImageTextToText
 from peft import PeftModel
 groups=check_splits(args.data);processor=AutoProcessor.from_pretrained(args.model,local_files_only=True,min_pixels=256*28*28,max_pixels=1280*28*28)
 model=AutoModelForImageTextToText.from_pretrained(args.model,local_files_only=True,dtype=torch.bfloat16,attn_implementation='sdpa',device_map={'':0});model=PeftModel.from_pretrained(model,args.adapter);model.eval();results={}
 for name in ['base','adapter']:
  values=[]
  with model.disable_adapter() if name=='base' else contextlib.nullcontext():
   for row in groups['test']:
    image=Image.open(row['image_path']).convert('RGB');started=time.monotonic()
    inputs=processor.apply_chat_template(prompt(row,image),add_generation_prompt=True,tokenize=True,return_dict=True,return_tensors='pt',enable_thinking=False).to(model.device)
    with torch.inference_mode():output=model.generate(**inputs,max_new_tokens=512,do_sample=False)
    raw=processor.decode(output[0,inputs['input_ids'].shape[-1]:],skip_special_tokens=True);values.append({'id':row['id'],'answerable':row['answerable'],'seconds':round(time.monotonic()-started,2),**score(raw,row)})
    print(name,row['id'],values[-1]['json_valid'],values[-1]['fact_fraction'],flush=True)
  results[name]={'rows':values,'json_valid_rate':sum(v['json_valid'] for v in values)/len(values),'answerable_fact_fraction':sum(v['fact_fraction'] for v in values if v['answerable'])/sum(v['answerable'] for v in values),'unanswerable_abstention':sum(v['abstains'] for v in values if not v['answerable'])/sum(not v['answerable'] for v in values)}
 summary={'model':'Qwen/Qwen3-VL-8B-Instruct','test_rows':len(groups['test']),'test_source_pages':sorted({r['page'] for r in groups['test']}),'metrics':{name:{k:v for k,v in result.items() if k!='rows'} for name,result in results.items()},'production_ready':False,'limitations':['single document, page-disjoint pilot','fact matching is a string proxy, not an independent semantic accuracy judge','synthetic questions do not establish real user accuracy'],'results':results}
 Path(args.output).write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n');print(json.dumps(summary['metrics']),flush=True)
if __name__=='__main__':main()
