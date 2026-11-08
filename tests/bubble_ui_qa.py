from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
import threading,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 page=browser.new_page(viewport={'width':370,'height':510},device_scale_factor=2)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("window.sent=[];window.bubbleBridge={onState:cb=>window.setBubble=cb,action:async(action,value)=>window.sent.push({action,value}),resize:height=>window.measuredHeight=height}")
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/bubble.html')
 state=dict(kind='voice',text='녹음 중 · 단축키를 놓으면 전송해요.',question='',phase='recording',attachment=True,materials=1)
 page.evaluate('s=>window.setBubble(s)',state)
 assert page.locator('#talk,#consent,#materials,#add-material').count()==0
 assert page.locator('#cancel').is_visible();assert '자료 1개' in page.locator('#attachment').inner_text()
 page.locator('#cancel').click();assert page.evaluate("window.sent.at(-1).action")=='cancel'
 state.update(speaking=True,speechStatus='자연스러운 음성 준비 중…',kind='answer',phase='idle',question='CENT에서 CXL이 왜 필요해?',text='CXL은 호스트와 여러 메모리 장치를 연결해요. CENT는 이 연결을 통해 메모리 가까이에서 추론 연산을 나눠 처리해요.')
 page.evaluate('s=>window.setBubble(s)',state);assert page.locator('#cancel').is_hidden()
 page.locator('#speech-stop').click();assert page.evaluate("window.sent.at(-1).action")=='tts-stop'
 assert page.locator('#history').is_visible();page.locator('#history').click();assert page.evaluate("window.sent.at(-1).action")=='history'
 assert page.evaluate('document.documentElement.scrollWidth')==370
 page.screenshot(path=str(root/'docs/qa/bubble-answer.png'),omit_background=True)
 state.update(kind='nag',text='화면으로 돌아와서 한 줄만 더 읽자.',attachment=False);page.evaluate('s=>window.setBubble(s)',state);page.locator('[data-action=grace]').click();assert page.evaluate("window.sent.at(-1).action")=='grace'
 state.update(kind='answer',text='<img src=x onerror=alert(1)>');page.evaluate('s=>window.setBubble(s)',state);assert page.locator('img').count()==1;assert '<img' in page.locator('#body').inner_text()
 assert not errors,errors
 (root/'docs/qa/bubble-ui.json').write_text(json.dumps(dict(passed=['no talk button or consent form','cancel held recording','recording and attached screenshot','PIM answer and history','focus grace action','untrusted text stays text','370px no horizontal overflow','stop generated speech'],page_errors=errors),ensure_ascii=False,indent=2))
 browser.close()
server.shutdown();server.server_close();print('Bubble UI: 8 scenarios passed; no JavaScript errors')
