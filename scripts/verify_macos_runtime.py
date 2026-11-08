"""Exercise the frozen backend and model without Python/Homebrew on its PATH.

Only a synthetic question and authored material are sent to OpenRouter with --live.
No API key, raw media or local bearer token is written to the report.
"""
from pathlib import Path
import argparse,http.client,json,os,secrets,socket,subprocess,tempfile,time,base64,wave,shutil
ROOT=Path(__file__).resolve().parents[1]

def main():
 parser=argparse.ArgumentParser();parser.add_argument('service',type=Path);parser.add_argument('weights',type=Path);parser.add_argument('--live',action='store_true');parser.add_argument('--report',default='macos-runtime.json');args=parser.parse_args()
 import sys
 sys.path.insert(0,str(ROOT))
 from last_hour.config import load_env
 load_env(ROOT/'.env')
 env={**os.environ,'PATH':'/usr/bin:/bin','HF_HUB_OFFLINE':'1','STUDY_GAZE_WEIGHTS':str(args.weights.resolve())}
 service=args.service.resolve();report={'service':service.name,'architecture':'arm64','external_python_on_path':False}
 with tempfile.TemporaryDirectory(dir=ROOT/'.build') as folder:
  cwd=Path(folder)
  check=subprocess.run([str(service),'self-check'],cwd=cwd,env=env,capture_output=True,text=True,timeout=60)
  if check.returncode:raise RuntimeError(check.stderr[-3000:])
  report['self_check']=json.loads(check.stdout)
  worker=subprocess.Popen([str(service),'neural','--model','unigaze_l16_joint'],cwd=cwd,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
  try:
   import select
   if not select.select([worker.stdout],[],[],90)[0]:raise RuntimeError('Model readiness timed out')
   ready=json.loads(worker.stdout.readline())
   if not ready.get('ready'):raise RuntimeError('Frozen model did not load: '+json.dumps(ready))
   worker.stdin.close();worker.wait(timeout=10);report['neural_ready']=ready
  finally:
   if worker.poll() is None:worker.kill();worker.wait()
  extracted=subprocess.run([str(service),'extract-material',str(ROOT/'tests/fixtures/reference-notes.pdf')],cwd=cwd,env=env,capture_output=True,text=True,timeout=20)
  if extracted.returncode:raise RuntimeError('Frozen PDF extraction failed: '+extracted.stdout)
  material=json.loads(extracted.stdout);assert material['ok'] and '37' in material['text'];report['pdf_material']={'name':material['name'],'pages':material['pages'],'contains_reference_code':True}
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  token=secrets.token_urlsafe(32);env.update(LAST_HOUR_TOKEN=token,LAST_HOUR_DATA=str(cwd/'data'))
  backend=subprocess.Popen([str(service),'serve','--port',str(port)],cwd=cwd,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  def request(method,route,body=None):
   conn=http.client.HTTPConnection('127.0.0.1',port,timeout=110);conn.request(method,route,json.dumps(body) if body is not None else None,{'Authorization':'Bearer '+token,'Content-Type':'application/json'})
   response=conn.getresponse();value=json.loads(response.read());conn.close()
   if response.status not in (200,201):raise RuntimeError('Backend request failed: '+str(value))
   return value
  try:
   for _ in range(100):
    try:health=request('GET','/health');break
    except (OSError,http.client.HTTPException):
     if backend.poll() is not None:raise RuntimeError(backend.stderr.read().decode()[-3000:])
     time.sleep(.1)
   else:raise RuntimeError('Frozen backend not ready')
   report['health']={'version':health.get('api_version',health.get('version')),'study_model':health['study_model']}
   session=request('POST','/study/sessions',{'goal':'조건부 확률의 기준 이해하기','material':'빨간 카드 4장 중 별 표시가 2장이다. 빨강이라는 조건 아래 별 확률은 2/4이다.','minutes':20,'ai_enabled':args.live})
   if args.live:
    started=time.monotonic();answer=request('POST','/study/sessions/'+session['id']+'/assist',{'mode':'chat','message':'이 예시에서 분모가 4인 이유를 한 문장으로 설명해줘.'})
    report['live_answer']={'content':answer['content'],'source':answer['source'],'seconds':round(time.monotonic()-started,2)}
   if args.live:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
     browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
     page=browser.new_page(viewport={'width':1000,'height':600})
     page.set_content('<html lang="ko"><meta charset="utf-8"><body style="padding:40px;font:28px/1.8 system-ui;background:#f8faf3;color:#142016"><h1>조건부 확률</h1><p>빨간 카드 4장 중 별 표시는 2장입니다.</p><p>P(별 | 빨강) = 2 / 4 = 1 / 2</p><p>빨간 카드라는 조건이 새로운 전체를 만듭니다.</p></body></html>')
     png=page.screenshot();browser.close()
    request('POST','/study/sessions/'+session['id']+'/materials',{'material':'[첨부 자료: reference-notes.pdf]\n'+material['text']})
    frame={'capture':{'png':base64.b64encode(png).decode(),'width':1000,'height':600,'display_id':'authored-fixture','captured_at_ms':1000},'target':{'selection':'screen','calibration_id':None},'consent':True}
    started=time.monotonic();vision=request('POST','/study/sessions/'+session['id']+'/screen-help',{**frame,'message':'첨부 자료의 고유 확인 코드와 화면에서 별 카드일 확률을 알려줘.'})
    combined=' '.join(vision['message'][k] for k in ['content','question','answer']);assert '37' in combined;assert any(v in combined for v in ['2/4','1/2','50%'])
    report['screen_and_pdf']={'content':vision['message']['content'],'seconds':round(time.monotonic()-started,2),'reference_code_verified':True,'screen_probability_verified':True}
    audio_path=cwd/'question.webm';run=subprocess.run([shutil.which('ffmpeg'),'-hide_banner','-loglevel','error','-y','-i',str(ROOT/'tests/fixtures/voice-question.wav'),'-c:a','libopus',str(audio_path)],capture_output=True)
    if run.returncode:raise RuntimeError('Synthetic audio encoding failed')
    with wave.open(str(ROOT/'tests/fixtures/voice-question.wav')) as wav:duration=round(wav.getnframes()/wav.getframerate()*1000)
    started=time.monotonic();voice=request('POST','/study/sessions/'+session['id']+'/context-help',{**frame,'audio':base64.b64encode(audio_path.read_bytes()).decode(),'duration_ms':duration,'speech_detected':True})
    report['voice_and_screen']={'transcript':voice['transcript'],'content':voice['message']['content'],'seconds':round(time.monotonic()-started,2)}
    saved=''.join(f.read_text() for f in (cwd/'data').rglob('*.json'));assert frame['capture']['png'] not in saved;assert base64.b64encode(audio_path.read_bytes()).decode() not in saved
    report['media_persisted']=False
   request('POST','/study/sessions/'+session['id']+'/end',{})
  finally:backend.terminate();backend.wait(timeout=10)
 report['private_data_embedded']=False
 out=ROOT/'docs/qa'/args.report;out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(report,ensure_ascii=False))
if __name__=='__main__':main()
