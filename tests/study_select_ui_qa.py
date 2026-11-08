from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
import threading,json
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
fixture='''<meta charset="utf-8"><link rel="stylesheet" href="/overlay/study-theme.css"><link rel="stylesheet" href="/overlay/study-select.css"><style>body{padding:24px}.settings{width:100%}label{margin-bottom:16px}button#outside{margin:12px 0}#bottom{position:fixed;bottom:12px;right:24px}</style><section class="settings"><label>이탈 감도 <select id="sensitivity"><option value="relaxed">여유롭게</option><option value="balanced" selected>보통</option><option value="sensitive">민감하게</option></select></label><label>알림 말투 <select id="tone"><option value="playful">장난스럽게</option><option disabled value="disabled">사용 불가</option><option value="firm">단호하게</option></select></label><button id="outside">다른 곳</button><select id="bottom" aria-label="아래 선택"><option>하나</option><option>둘</option><option>셋</option></select></section><script type="module">import {enhanceSelects} from '/overlay/study-select.mjs';window.changed=0;document.querySelector('#sensitivity').onchange=()=>window.changed++;enhanceSelects();</script>'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');page=browser.new_page(viewport={'width':380,'height':360},device_scale_factor=2);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.route('**/select-fixture.html',lambda route:route.fulfill(content_type='text/html',body=fixture));page.goto(f'http://127.0.0.1:{server.server_port}/select-fixture.html');page.locator('.study-select-trigger').first.wait_for()
 assert page.locator('.study-select-trigger').count()==3
 button=page.get_by_role('combobox',name='이탈 감도');button.click();page.get_by_role('option',name='민감하게',exact=True).click();assert page.locator('#sensitivity').input_value()=='sensitive';assert page.evaluate('window.changed')==1
 button.press('ArrowDown');button.press('Home');button.press('Enter');assert page.locator('#sensitivity').input_value()=='relaxed'
 button.press('ArrowDown');button.press('End');button.press('Escape');assert page.locator('#sensitivity').input_value()=='relaxed';assert button.get_attribute('aria-expanded')=='false'
 button.click();page.locator('#outside').click();assert button.get_attribute('aria-expanded')=='false'
 tone=page.get_by_role('combobox',name='알림 말투');tone.press('ArrowDown');tone.press('Home');tone.press('ArrowDown');tone.press('Enter');assert page.locator('#tone').input_value()=='firm'
 page.evaluate("document.querySelector('#sensitivity').value='balanced'");assert button.inner_text()=='보통'
 page.evaluate("document.querySelector('#tone').disabled=true");page.wait_for_function("() => document.querySelector('[data-select-id=tone]').disabled")
 page.evaluate("document.querySelector('#tone').disabled=false;const o=new Option('차분하게','calm');document.querySelector('#tone').append(o);document.querySelector('#tone').value='calm'");page.wait_for_function("() => document.querySelector('[data-select-id=tone]').textContent==='차분하게'")
 for control in [button,tone]:
  metrics=control.evaluate("el=>{const a=el.getBoundingClientRect(),b=el.querySelector('svg').getBoundingClientRect();return {dy:Math.abs(a.y+a.height/2-b.y-b.height/2),right:a.right-b.right}}")
  assert metrics['dy']<=.5 and 8<=metrics['right']<=13,metrics
 button.click();menu=page.locator('[role=listbox]:visible');assert menu.evaluate("el=>getComputedStyle(el).backgroundColor")=='rgb(37, 37, 37)';page.screenshot(path=str(root/'docs/qa/study-select.png'),omit_background=True)
 before=page.locator('#sensitivity').input_value();button.press('Meta+Shift+Enter');assert page.locator('#sensitivity').input_value()==before;assert button.get_attribute('aria-expanded')=='false'
 button.click();button.press('Tab');assert button.get_attribute('aria-expanded')=='false'
 page.evaluate("() => {const wrap=document.querySelector('#bottom').parentElement;wrap.style.position='fixed';wrap.style.bottom='12px';wrap.style.right='24px';}")
 page.get_by_role('combobox',name='아래 선택').click();bounds=page.locator('[role=listbox]:visible').bounding_box();assert bounds['y']>=8 and bounds['y']+bounds['height']<=352
 assert page.evaluate('document.documentElement.scrollWidth')<=380
 assert not errors,errors
 report={'passed':['all selects enhanced','pointer choice updates existing change handler once','keyboard navigation and commit','Escape cancels','outside click closes','disabled option skipped','programmatic value sync','disabled state sync','dynamic options sync','chevrons vertically centered and equally inset','dark themed popup','global command shortcuts do not change selection','Tab closes','popup stays in viewport','380px no overflow'],'page_errors':errors}
 (root/'docs/qa/study-select.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('Study Select: 15 scenarios passed')
 browser.close()
server.shutdown();server.server_close()
