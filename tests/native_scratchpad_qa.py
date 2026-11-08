"""Verify an owned native scratchpad window with authored text and isolated pad data."""
from pathlib import Path
import argparse,json,os,signal,socket,subprocess,tempfile,time
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--executable',type=Path,default=root/'overlay/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');args=parser.parse_args()
qa=Path(tempfile.mkdtemp(prefix='scratchpad-native-',dir=root/'.build'))
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=(root/'.build/native-scratchpad.log').open('w')
command=[str(args.executable)]+([str(root/'overlay')] if args.executable.name=='Electron' else [])+['--study-qa-underlay',f'--remote-debugging-port={port}']
process=subprocess.Popen(command,cwd=root,env={**os.environ,'STUDY_QA_DATA':str(qa),'STUDY_NATIVE_QA':'1'},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 with sync_playwright() as p:
  for _ in range(60):
   try:browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}',timeout=1000);break
   except Exception:
    if process.poll() is not None:raise RuntimeError('QA app exited')
    time.sleep(.2)
  else:raise RuntimeError('QA debug port not ready')
  page=None
  for _ in range(60):
   page=next((v for c in browser.contexts for v in c.pages if v.url=='study://app/index.html'),None)
   if page:break
   time.sleep(.2)
  if not page:raise RuntimeError('Main renderer missing')
  page.wait_for_function("() => !document.getElementById('start').disabled",timeout=30000)
  page.evaluate("window.studyBridge.window('scratchpad-show')")
  pad=None
  for _ in range(50):
   pad=next((v for c in browser.contexts for v in c.pages if v.url=='study://app/scratchpad.html'),None)
   if pad:break
   page.wait_for_timeout(100)
  if not pad:raise RuntimeError('Scratchpad renderer missing')
  pad.locator('#draft').fill('Native QA: table 1 다시 확인');pad.locator('#add').click();pad.locator('.entry').wait_for()
  request=page.evaluate("window.studyBridge.window('scratchpad-begin')")
  pad.locator('.entry.pending').wait_for()
  page.evaluate("async id=>{await window.studyBridge.window('scratchpad-complete',{id,message:{content:'캐시는 반복적인 메모리 접근을 줄입니다.',artifact:{kind:'translation',title:'작성된 예제 번역',summary:'현재 보이는 문단 기준',source_note:'QA authored fixture'}}});}",request)
  pad.locator('.summary').wait_for();assert '반복적인' in pad.locator('.body').last.inner_text()
  bounds=page.evaluate("window.studyBridge.window('overlay-bounds')")
  stored=json.loads((qa/'scratchpad/pad.json').read_text());assert len(stored['entries'])==2 and stored['entries'][-1]['status']=='ready'
  page.evaluate("window.studyBridge.window('scratchpad-show')")
  pad.reload();pad.locator('.summary').wait_for();assert pad.locator('.entry').count()==2
  report={'environment':'native Electron; isolated local pad; authored text; no external request','packaged':args.executable.name!='Electron','native_window_opened':True,'note_saved':True,'request_completed_in_place':True,'translation_summary_displayed':True,'reload_restored':True,'overlay_bounds':bounds,'physical_microphone_tested':False}
  (root/'docs/qa/native-scratchpad.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
finally:
 if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
 process.wait(timeout=10);log.close()
