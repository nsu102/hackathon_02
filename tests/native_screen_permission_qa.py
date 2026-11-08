"""Probe the installed app screen permission. No pixels stored or sent to an API."""
from pathlib import Path
import argparse,json,os,signal,socket,subprocess,tempfile,time
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--probe',action='store_true');parser.add_argument('--report',default='screen-permission.json');args=parser.parse_args()
qa=Path(tempfile.mkdtemp(prefix='screen-permission-',dir=root/'.build'))
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=(root/'.build/native-screen-permission.log').open('w')
process=subprocess.Popen(['/usr/bin/open','-W','-a','/Applications/Study Signal.app','--args',f'--remote-debugging-port={port}'],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 with sync_playwright() as p:
  for _ in range(60):
   try:browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}',timeout=1000);break
   except Exception:
    if process.poll() is not None:raise RuntimeError('QA app exited')
    time.sleep(.2)
  else:raise RuntimeError('QA port not ready')
  discovery=browser.new_browser_cdp_session();page=None
  for _ in range(60):
   page=next((page for context in browser.contexts for page in context.pages if page.url=='study://app/index.html'),None)
   if page:break
   discovery.send('Target.getTargets');time.sleep(.1)
  if not page:raise RuntimeError('Main renderer missing')
  page.wait_for_function("() => !document.getElementById('start').disabled",timeout=30000)
  status=page.evaluate("window.studyBridge.window('permission-status')")
  result={'version':status['version'],'runtime':status['runtime'],'packaged':status['packaged'],'installed_path_correct':status['app_path']=='/Applications/Study Signal.app','screen_before':status['screen'],'probe_attempted':args.probe,'screen_pixels_saved':False,'external_model_called':False}
  if args.probe:
   probe=page.evaluate("async()=>{try{return await window.studyBridge.window('permission-screen-test')}catch(e){return {ok:false,error:e.message}}}")
   result['probe']=probe
   result['screen_after']=page.evaluate("window.studyBridge.window('permission-status')")['screen']
  (root/'.build'/args.report).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
finally:
 if process.poll() is None:
  subprocess.run(['/usr/bin/osascript','-e','tell application id \"dev.studysignal.mac\" to quit'],capture_output=True,timeout=10)
 process.wait(timeout=10);log.close()
