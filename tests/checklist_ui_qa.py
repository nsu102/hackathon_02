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
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');page=browser.new_page(viewport={'width':330,'height':540},device_scale_factor=2);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script("window.actions=[];window.checklistBridge={onState:cb=>window.setPlan=cb,action:async(name,value)=>window.actions.push({name,value}),resize:height=>window.height=height}")
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/checklist.html')
 state={'plan':{'id':'a'*64,'title':'조건부 확률 이해하기','source':'ai','sources':['probability-notes.pdf'],'items':[{'id':'b'*16,'label':'조건에 따라 기준 집합이 달라지는 이유 설명하기','evidence':'조건에 해당하는 경우만 새로운 전체로 삼는다.','done':True},{'id':'c'*16,'label':'빨간 카드와 별 표시 예제로 확률 계산하기','evidence':'빨간 카드 네 장 중 별 표시는 두 장이다.','done':False},{'id':'d'*16,'label':'독립 사건일 때 조건이 확률을 바꾸는지 비교하기','evidence':'독립이면 확률이 바뀌지 않는다.','done':False}]},'loading':False,'saving':False,'stale':False,'error':'','visible':True}
 page.evaluate('s=>window.setPlan(s)',state);assert page.locator('#progress-label').inner_text()=='1 / 3 완료';assert page.locator('input:checked').count()==1
 page.locator('input').nth(1).check();assert page.evaluate("window.actions.at(-1).name==='toggle'&&window.actions.at(-1).value.done")
 page.evaluate('s=>window.setPlan(s)',state);page.screenshot(path=str(root/'docs/qa/checklist-overlay.png'),omit_background=True)
 page.locator('#fold').click();assert page.locator('#items').is_hidden();page.locator('#fold').click();assert page.locator('#items').is_visible()
 state['stale']=True;page.evaluate('s=>window.setPlan(s)',state);assert page.locator('input:disabled').count()==3
 state['stale']=False;state['plan']['items'][0]['label']='<img src=x onerror=alert(1)>';page.evaluate('s=>window.setPlan(s)',state);assert page.locator('img').count()==0;assert '<img' in page.locator('label span').first.inner_text()
 assert page.evaluate('document.documentElement.scrollWidth')==330;assert not errors
 page.locator('#settings').click();assert page.evaluate("window.actions.at(-1).name")=='settings';page.locator('#dismiss').click();assert page.evaluate("window.actions.at(-1).name")=='dismiss'
 (root/'docs/qa/checklist-ui.json').write_text(json.dumps({'passed':['progress','manual toggle','fold/unfold','stale data disabled','untrusted text stays text','330px no overflow','settings action','dismiss action'],'page_errors':errors},indent=2)+'\n');browser.close()
server.shutdown();server.server_close();print('Checklist UI: 8 scenarios passed')
