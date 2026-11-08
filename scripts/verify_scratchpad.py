"""Live voice -> screen translation using authored fixtures only.

No user PDF, desktop, face or real microphone is sent to a model.
"""
from pathlib import Path
import base64,http.client,json,os,secrets,subprocess,tempfile,threading,time,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from http.server import ThreadingHTTPServer
from last_hour.config import load_env
from last_hour.api import make_handler
from last_hour.engine import Service

ROOT=Path(__file__).resolve().parents[1]
def main():
 from playwright.sync_api import sync_playwright
 load_env(ROOT/'.env');token=secrets.token_urlsafe(32)
 with tempfile.TemporaryDirectory(dir=ROOT/'.build') as folder:
  work=Path(folder);service=Service(work/'data');server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(service,token,None));server.daemon_threads=True;threading.Thread(target=server.serve_forever,daemon=True).start()
  def request(route,body):
   conn=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=120);conn.request('POST',route,json.dumps(body),{'Authorization':'Bearer '+token,'Content-Type':'application/json'});response=conn.getresponse();value=json.loads(response.read());conn.close()
   if response.status not in (200,201):raise RuntimeError(str(value))
   return value
  try:
   with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');page=browser.new_page(viewport={'width':1200,'height':780})
    page.set_content('<html lang="en"><meta charset="utf-8"><body style="padding:65px;font:24px/1.8 Georgia;background:#f7f6f0;color:#20251e"><small>STUDY SIGNAL · AUTHORED TEST FIXTURE</small><h1>Cache-aware Memory Access</h1><p>A cache reduces repeated accesses to main memory.</p><p>In this illustrative experiment, the average access latency decreased from 120 ns to 80 ns. This is a reduction of 40 ns, or approximately 33.3%.</p><p>These numbers describe this example only. They are not a benchmark result for real hardware.</p></body></html>')
    png=page.screenshot();browser.close()
   subprocess.run(['/usr/bin/say','-v','Yuna','-o',str(work/'question.aiff'),'이거 한국어로 번역해 줘. 핵심 요약도 같이 정리해 줘.'],check=True)
   subprocess.run(['/opt/homebrew/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(work/'question.aiff'),'-c:a','libopus',str(work/'question.webm')],check=True)
   duration=float(subprocess.check_output(['/opt/homebrew/bin/ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(work/'question.webm')],text=True))
   session=request('/study/sessions',{'goal':'영어 학습 화면 번역','material':'','ai_enabled':True});started=time.monotonic()
   value=request('/study/sessions/'+session['id']+'/context-help',{'audio':base64.b64encode((work/'question.webm').read_bytes()).decode(),'duration_ms':round(duration*1000),'speech_detected':True,'consent':True,'capture':{'png':base64.b64encode(png).decode(),'width':1200,'height':780,'display_id':'authored-fixture','captured_at_ms':1000},'target':{'selection':'screen','calibration_id':None}})
   message=value['message'];assert message['artifact']['kind']=='translation';assert message['artifact']['summary'].strip();assert all(v in message['content'] for v in ['120','80','40']);assert '캐시' in message['content']
   persisted=''.join(f.read_text() for f in (work/'data').rglob('*.json'));assert base64.b64encode(png).decode() not in persisted
   report={'scenario':'synthetic Korean voice -> authored English screen -> Korean translation and summary','transcript':value['transcript'],'seconds':round(time.monotonic()-started,2),'message':message,'original_numbers_preserved':True,'media_saved':False,'user_pdf_sent':False,'physical_microphone_and_capture_tested':False}
   (ROOT/'docs/qa/scratchpad-live.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
   request('/study/sessions/'+session['id']+'/end',{})
  finally:server.shutdown();server.server_close()
if __name__=='__main__':main()
