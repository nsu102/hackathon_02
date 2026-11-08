"""Native Start/End navigation, isolated records, no camera or external request."""
from pathlib import Path
import os,json,signal,socket,subprocess,tempfile,time,argparse
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];qa=Path(tempfile.mkdtemp(prefix='simple-native-',dir=root/'.build'))
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
parser=argparse.ArgumentParser();parser.add_argument('--executable',type=Path,default=root/'overlay/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');args=parser.parse_args()
log=(qa/'app.log').open('w');exe=args.executable
process=subprocess.Popen([str(exe),*([str(root/'overlay')] if exe.name=='Electron' else []),'--study-qa-underlay',f'--remote-debugging-port={port}'],cwd=root,env={**os.environ,'STUDY_QA_DATA':str(qa)},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
report={'packaged':exe.name!='Electron','environment':'real Electron and backend; isolated data; camera and AI off; no external requests'}
try:
 with sync_playwright() as p:
  for _ in range(80):
   try:browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}',timeout=1000);break
   except Exception:
    if process.poll() is not None:raise RuntimeError('App exited before opening')
    time.sleep(.15)
  else:raise RuntimeError('Debug port not ready')
  page=None
  for _ in range(50):
   page=next((v for c in browser.contexts for v in c.pages if v.url=='study://app/index.html'),None)
   if page:break
   browser.new_browser_cdp_session().send('Target.getTargets');time.sleep(.1)
  assert page,'Main window missing'
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.wait_for_function("() => !document.getElementById('start').disabled",timeout=25000)
  report['start_enabled']=True
  assert page.locator('#sample,#calibration,#show-gaze,#focus-mode').count()==0
  page.evaluate("window.studyBridge.window('show-main',{section:'settings'})")
  page.locator('#focus-settings>summary').click();page.locator('#focus-enabled').uncheck()
  page.locator('#connection-settings>summary').click();page.locator('#ai').uncheck();page.locator('#settings-back').click()
  page.locator('#goal').fill('시작 버튼 동작 확인');page.locator('#start').click();page.locator('#learning').wait_for(state='visible')
  report['start_clicked_and_running']=True;assert page.locator('#setup').is_hidden()
  page.locator('#pause').click();page.wait_for_function("() => document.getElementById('pause').textContent==='다시 공부하기'")
  page.locator('#pause').click();page.wait_for_function("() => document.getElementById('pause').textContent==='잠깐 쉬기'")
  page.locator('#end').click();page.locator('#summary').wait_for(state='visible');page.locator('#new-session').click()
  page.locator('#start').click();page.locator('#learning').wait_for(state='visible');report['second_start_works']=True
  page.locator('#end').click();page.locator('#summary').wait_for(state='visible')
  assert not errors,errors;report['page_errors']=errors;report['passed']=True
except Exception as exc:
 report['error']=str(exc);raise
finally:
 (root/'docs/qa/simple-study-native.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
 if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
 process.wait(timeout=10);log.close()
