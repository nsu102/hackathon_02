from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
import threading,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 page=browser.new_page(viewport={'width':370,'height':330},device_scale_factor=2);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script("window.sent=[];window.bubbleBridge={onState:cb=>window.setBubble=cb,action:async(action)=>window.sent.push(action),resize:height=>window.measuredHeight=height}")
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/bubble.html')
 state={'kind':'nag','text':'화면 밖을 향한 지 8초가 지났어요. 자료로 돌아와 한 줄만 더 읽어봐요.','question':'','phase':'idle','attachment':False,'speaking':False}
 page.evaluate('s=>window.setBubble(s)',state)
 assert page.get_by_role('alertdialog').is_visible()
 assert page.locator('#bubble').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgba(66, 24, 31, 0.97)'
 assert page.locator('#talk,#consent,#materials,#voice-talk').count()==0
 assert all(page.locator(selector).is_hidden() for selector in ['#history','#attachment','#speech-stop','#cancel'])
 page.locator('[data-action=grace]').click();assert page.evaluate('window.sent.at(-1)')=='grace'
 page.locator('[data-action=false-alarm]').click();assert page.evaluate('window.sent.at(-1)')=='false-alarm'
 page.locator('#settings').click();assert page.evaluate('window.sent.at(-1)')=='settings'
 page.locator('#dismiss').click();assert page.evaluate('window.sent.at(-1)')=='dismiss'
 assert page.evaluate('document.documentElement.scrollWidth')==370
 page.screenshot(path=str(root/'docs/qa/focus-dialog.png'),omit_background=True)
 state.update(kind='error',text='<img src=x onerror=alert(1)>');page.evaluate('s=>window.setBubble(s)',state);assert page.locator('img').count()==1 and '<img' in page.locator('#body').inner_text()
 assert not errors,errors
 passed=['red alert dialog','no conversation or recording controls','focus grace','false alarm correction','settings action','dismiss action','370px no horizontal overflow','untrusted text stays text']
 (root/'docs/qa/bubble-ui.json').write_text(json.dumps({'passed':passed,'page_errors':errors},ensure_ascii=False,indent=2)+'\n');print(f'Warning dialog: {len(passed)} scenarios passed')
 browser.close()
server.shutdown();server.server_close()
