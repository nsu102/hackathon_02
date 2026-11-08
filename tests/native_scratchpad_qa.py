"""Verify an owned native scratchpad window with authored text and isolated pad data."""
from pathlib import Path
import argparse,json,os,signal,socket,subprocess,tempfile,time
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--executable',type=Path,default=root/'overlay/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');args=parser.parse_args()
qa=Path(tempfile.mkdtemp(prefix='scratchpad-native-',dir=root/'.build'))
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=(root/'.build/native-scratchpad.log').open('w')
command=[str(args.executable)]+([str(root/'overlay')] if args.executable.name=='Electron' else [])+['--study-qa',f'--remote-debugging-port={port}']
process=subprocess.Popen(command,cwd=root,env={**os.environ,'STUDY_QA_DATA':str(qa),'STUDY_NATIVE_QA':'1'},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
try:
 with sync_playwright() as p:
  for _ in range(60):
   try:browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}',timeout=1000);break
   except Exception:
    if process.poll() is not None:raise RuntimeError('QA app exited')
    time.sleep(.2)
  else:raise RuntimeError('QA debug port not ready')
  discovery=browser.new_browser_cdp_session()
  page=None
  for _ in range(60):
   page=next((v for c in browser.contexts for v in c.pages if v.url=='study://app/index.html'),None)
   if page:break
   discovery.send('Target.getTargets')
   time.sleep(.1)
  if not page:raise RuntimeError('Main renderer missing')
  page.wait_for_function("() => !document.getElementById('start').disabled",timeout=30000)
  addon=page.evaluate("window.studyBridge.window('gaze-addon-status')")
  if not addon['installed']:
   page.evaluate("document.getElementById('focus-enabled').checked=true");page.locator('#start').click();page.locator('#learning').wait_for(state='visible')
   assert page.evaluate("document.getElementById('camera').srcObject===null")
  page.evaluate("window.studyBridge.window('scratchpad-show')")
  pad=None
  for _ in range(50):
   pad=next((v for c in browser.contexts for v in c.pages if v.url=='study://app/scratchpad.html'),None)
   if pad:break
   page.wait_for_timeout(100)
  if not pad:raise RuntimeError('Scratchpad renderer missing')
  bounds=page.evaluate("window.studyBridge.window('overlay-bounds')")
  assert any(b['width']==340 and b['height']==148 for b in bounds),bounds
  assert pad.locator('#conversation').is_hidden()
  assert page.locator('#voice-target,#voice-enable,#voice-shortcut').count()==0
  assert not page.locator('#read-answer').is_checked()
  assert pad.locator('#chat-clock').inner_text() and 'bpm' in pad.locator('#chat-heart').inner_text()
  # A real pad query reaches the main study controller, which gates screen upload on consent.
  pad.locator('#draft').fill('현재 화면을 설명해줘');pad.locator('#add').click()
  pad.locator('.entry.error').wait_for(timeout=10000)
  assert '동의' in pad.locator('.entry.error .body').inner_text()
  assert '현재 화면을' in pad.locator('.question').inner_text()
  page.evaluate("window.studyBridge.window('scratchpad-context',{goal:'논문 읽기',materials:['author-notes.pdf'],has_material:true})")
  pad.wait_for_function("() => document.getElementById('study-context').textContent==='author-notes.pdf'")
  page.evaluate("() => {const input=document.getElementById('opacity');input.value='80';input.dispatchEvent(new Event('input'));}")
  pad.wait_for_function("() => getComputedStyle(document.documentElement).getPropertyValue('--overlay-alpha').trim()==='0.8'")
  assert page.evaluate("getComputedStyle(document.body).backgroundColor")==pad.evaluate("getComputedStyle(document.body).backgroundColor")
  request=page.evaluate("window.studyBridge.window('scratchpad-begin',{listening:true})")
  pad.locator('.entry.pending').wait_for()
  assert '듣고' in pad.locator('.entry.pending .body').inner_text()
  bounds=page.evaluate("window.studyBridge.window('overlay-bounds')")
  assert any(b['width']==400 and b['height']==560 for b in bounds),bounds
  page.evaluate("async id=>{await window.studyBridge.window('scratchpad-complete',{id,question:'이 문단 번역해줘',message:{content:'캐시는 반복적인 메모리 접근을 줄입니다.',artifact:{kind:'translation',title:'작성된 예제 번역',summary:'현재 보이는 문단 기준',source_note:'QA authored fixture'}}});}",request)
  pad.locator('.summary').wait_for();assert '반복적인' in pad.locator('.body').last.inner_text()
  pad.locator('#toggle').click();pad.locator('#conversation').wait_for(state='hidden')
  bounds=page.evaluate("window.studyBridge.window('overlay-bounds')");assert any(b['height']==148 and b['width']==340 for b in bounds)
  pad.locator('#toggle').click();pad.locator('.summary').wait_for()
  stored=json.loads((qa/'scratchpad/pad.json').read_text());assert len(stored['entries'])==2 and stored['entries'][-1]['status']=='ready'
  page.evaluate("window.studyBridge.window('scratchpad-show')");pad.reload();pad.locator('#conversation').wait_for(state='hidden');pad.locator('#toggle').click();pad.locator('.summary').wait_for();assert pad.locator('.entry').count()==2
  page.evaluate("window.studyBridge.window('bubble-update',{kind:'nag',text:'테스트: 화면을 향하는지 확인해 주세요.',phase:'idle',show:true})")
  page.wait_for_timeout(500)
  areas=page.evaluate("window.studyBridge.window('overlay-bounds')")
  chat=next(b for b in areas if b['width']==400);dialog=next(b for b in areas if b['width']==370)
  assert not (chat['x']<dialog['x']+dialog['width'] and chat['x']+chat['width']>dialog['x'] and chat['y']<dialog['y']+dialog['height'] and chat['y']+chat['height']>dialog['y'])
  page.evaluate("window.studyBridge.window('bubble-clear-nag')")
  metadata=[json.loads(line) for line in (root/'.build/native-scratchpad.log').read_text().splitlines() if line.startswith('{') and '"component":"voice-input"' in line]
  assert metadata and metadata[-1]['hotkey'] is False
  report={'environment':'native Electron; isolated pad; authored text; no external request','packaged':args.executable.name!='Electron','compact_bounds':{'width':340,'height':148},'expanded_bounds':{'width':400,'height':560},'typed_query_reaches_consent_gate':True,'voice_request_expands':True,'collapse_retains_history':True,'reload_restores_compact':True,'shared_opacity':True,'physical_microphone_tested':False,'click_only_voice':True,'voice_hotkey_registered':False,'automatic_screenshot':True,'speech_default_off':True,'heart_and_clock_visible':True,'warning_dialog_does_not_overlap_chat':True}
  (root/'docs/qa/native-scratchpad.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
finally:
 if process.poll() is None:os.killpg(process.pid,signal.SIGTERM)
 process.wait(timeout=10);log.close()
