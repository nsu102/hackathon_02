"""Owned Electron UI + real native capture; synthetic microphone and authored screen.

Requires existing camera/mic/screen permissions; never changes OS security toggles.
The underlay covers the monitor with authored PIM concept notes before any capture.
"""
from pathlib import Path
import json,os,signal,socket,subprocess,time,tempfile,base64
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];qa=Path(tempfile.mkdtemp(prefix='native-qa-',dir=root/'.build'))
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
log=(root/'.build/native-app-qa.log').open('w')
process=subprocess.Popen([str(root/'overlay/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),str(root/'overlay'),'--study-qa-underlay',f'--remote-debugging-port={port}'],cwd=root,env={**os.environ,'STUDY_QA_DATA':str(qa),'STUDY_NATIVE_QA':'1'},stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
key_down="const {uIOhook:h,UiohookKey:k}=require('./overlay/node_modules/uiohook-napi');for(const key of [k.Meta,k.Shift,k.F12])h.keyToggle(key,'down');"
key_up="const {uIOhook:h,UiohookKey:k}=require('./overlay/node_modules/uiohook-napi');for(const key of [k.F12,k.Shift,k.Meta])h.keyToggle(key,'up');"
report={'fixture':'authored PIM concept underlay; synthetic Korean WebAudio microphone; separate QA records'}
try:
 with sync_playwright() as p:
  for _ in range(100):
   try:browser=p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}',timeout=1500);break
   except Exception:
    if process.poll() is not None:raise RuntimeError('QA app exited before debug connection')
    time.sleep(.2)
  else:raise RuntimeError('QA debug port not ready')
  page=None
  for _ in range(50):
   page=next((page for context in browser.contexts for page in context.pages if page.url=='study://app/index.html'),None)
   if page:break
   time.sleep(.2)
  if not page:raise RuntimeError('QA main renderer missing')
  page.wait_for_function("() => !document.getElementById('start').disabled",timeout=25000)
  permissions=page.evaluate("window.studyBridge.window('permission-status')");report['permissions']=permissions
  assert permissions['microphone']=='granted' and permissions['screen']=='granted',permissions
  page.evaluate('''encoded=>{const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{if(constraints.video)throw new Error('No camera in QA');const context=new AudioContext();const destination=context.createMediaStreamDestination();const source=context.createBufferSource();source.buffer=await context.decodeAudioData(bytes.buffer.slice(0));source.loop=true;source.connect(destination);await context.resume();source.start();const track=destination.stream.getAudioTracks()[0],stop=track.stop.bind(track);track.stop=()=>{stop();source.stop();context.close();};return destination.stream;}});}''',base64.b64encode((root/'tests/fixtures/voice-question.wav').read_bytes()).decode())
  page.evaluate("window.studyBridge.window('show-main',{section:'settings'})")
  page.locator('#focus-enabled').uncheck();page.locator('#goal').fill('PIM Is All You Need · CENT 구조 이해');page.locator('#material').fill('1 Introduction\nCENT는 CXL로 메모리 장치를 연결하는 LLM 추론 시스템이다.\n2 Motivation\ndecoding은 순차적 토큰 생성으로 메모리 대역폭이 중요하다.\n3 Architecture\nPIM과 PNM이 연산을 나누어 처리한다.');page.locator('#material').dispatch_event('change');page.locator('#start').click();page.locator('#learning').wait_for(state='visible')
  assert permissions.get('accessibility'), '손쉬운 사용 권한이 없어 실제 전역 키 검증을 진행하지 않았습니다.'
  page.evaluate("window.studyBridge.window('show-main',{section:'voice-settings'})")
  page.locator('#voice-consent').check();page.locator('#read-answer').check();page.locator('#voice-shortcut').fill('CommandOrControl+Shift+F12');page.locator('#voice-enable').click();page.wait_for_function("() => document.getElementById('voice-enable').textContent.includes('끄기')")
  subprocess.run(['node','-e',key_down],cwd=root,check=True);page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')",timeout=15000)
  report['native_recording_started']=True;assert page.locator('#voice-attachment').is_visible()
  page.wait_for_timeout(2600);subprocess.run(['node','-e',key_up],cwd=root,check=True);page.wait_for_function("() => document.querySelectorAll('#chat .assistant').length>0",timeout=90000)
  report['voice_answer_received']=True
  page.wait_for_function("() => document.getElementById('tts-status').textContent.includes('읽고 있어요')",timeout=60000)
  report['tts_playback_started']=True
  page.wait_for_function("() => document.getElementById('tts-stop').hidden",timeout=90000)
  report['tts_playback_ended']=True
  page.evaluate("window.studyBridge.window('show-main',{section:'settings'})");page.locator('#settings').wait_for(state='visible');page.locator('#permission-check').click();report['permission_ui']=page.locator('#permission-status').inner_text()
  page.locator('#checklist-editor input[type=checkbox]').first.check();page.wait_for_function("() => document.getElementById('checklist-status').textContent.startsWith('1/')")
  report['checklist_saved']=True;page.locator('#end').click()
 (root/'docs/qa/native-app-checklist-voice.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False))
except Exception as exc:
 report['error']=str(exc);(root/'docs/qa/native-app-checklist-voice.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');raise
finally:
 subprocess.run(['node','-e',key_up],cwd=root,check=False,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 os.killpg(process.pid,signal.SIGTERM) if process.poll() is None else None
 process.wait(timeout=10);log.close()
