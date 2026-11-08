"""Owned scratchpad UI; local fake persistence/IPC, never a user's desktop."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
import threading,json
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 context=browser.new_context(viewport={'width':420,'height':560},device_scale_factor=2);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 window.padActions=[];window.padState=JSON.parse(localStorage.getItem('pad-fixture')||'null')||{entries:[],draft:'',pinned:true,context:{materials:['reading-notes.pdf'],has_material:true}};
 window.emitPad=()=>{localStorage.setItem('pad-fixture',JSON.stringify(window.padState));window.receivePad(window.padState);};
 window.scratchpadBridge={onState:cb=>window.receivePad=cb,action:async(name,value)=>{window.padActions.push({name,value});let s=window.padState;
 if(name==='ready')return s;
 if(name==='add'){s.entries.push({id:crypto.randomUUID(),kind:'note',title:'메모',body:value.body,summary:'',status:'ready',created_at:new Date().toISOString()});s.draft='';}
 if(name==='draft')s.draft=value;
 if(name==='edit')s.entries.find(e=>e.id===value.id).body=value.body;
 if(name==='remove')s.entries=s.entries.filter(e=>e.id!==value);
 if(name==='pin')s.pinned=value;

 window.emitPad();}};
 ''')
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/scratchpad.html');page.locator('#empty').wait_for()
 page.locator('#draft').fill('나중에 표 1의 메모리 대역폭 다시 확인하기');page.locator('#add').click();page.locator('.entry').wait_for();assert '대역폭' in page.locator('.body').inner_text()
 page.locator('#draft').fill('저장하지 않은 초안도 유지');page.wait_for_timeout(500);page.reload();page.wait_for_function("() => document.getElementById('draft').value==='저장하지 않은 초안도 유지'")
 assert page.locator('input[type=file],.file-button').count()==0
 assert 'reading-notes.pdf' in page.locator('#study-context').inner_text()
 page.evaluate("() => {const data=new DataTransfer();data.items.add(new File(['file contents'], 'duplicate.pdf', {type:'application/pdf'}));document.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));}")
 assert not page.evaluate("window.padActions.some(a=>a.name==='attach')")
 page.evaluate("() => {window.padState.context.materials=['updated-notes.pdf'];window.emitPad();}")
 assert 'updated-notes.pdf' in page.locator('#study-context').inner_text()
 page.locator('#pin').click();assert page.locator('#pin').get_attribute('aria-pressed')=='false'
 page.evaluate('''()=>{window.padState.entries.push({id:'request-fixture',kind:'request',title:'화면 요청',body:'알겠습니다. 화면을 확인하고 있어요.',status:'pending',created_at:new Date().toISOString()});window.emitPad();}''')
 assert '알겠습니다' in page.locator('.entry.pending').inner_text()
 page.evaluate('(value)=>{Object.assign(window.padState.entries.at(-1),value);window.emitPad();}',{'kind':'translation','title':'캐시와 메모리 접근','body':'캐시는 반복되는 메모리 접근을 줄입니다.\n\n이 실험에서 평균 접근 지연은 120 ns에서 80 ns로 줄었습니다.','summary':'• 반복 접근을 줄임\n• 평균 지연 40 ns 감소\n• 현재 화면의 실험 조건에 한정','source':'현재 화면에 보이는 문단 기준','status':'ready'})
 assert page.locator('.summary').is_visible();assert '40 ns' in page.locator('.summary').inner_text();assert '120 ns' in page.locator('.entry').last.inner_text()
 page.locator('.entry').last.get_by_role('button',name='복사',exact=True).click();assert page.evaluate("window.padActions.at(-1).name")=='copy'
 page.locator('#draft').fill('');page.locator('#draft').blur();page.wait_for_timeout(450)
 page.screenshot(path=str(root/'docs/qa/scratchpad-desktop.png'),omit_background=True)
 for width,height in [(360,480),(720,800)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('''()=>{window.padState.entries.at(-1).body='<img src=x onerror=alert(1)>';window.emitPad();}''');assert page.locator('img').count()==0;assert '<img' in page.locator('.body').last.inner_text()
 page.locator('.entry').last.get_by_role('button',name='삭제',exact=True).click();assert page.locator('.entry').count()==1
 # Compare real computed styles against the main study window's stylesheets.
 reference=page.context.new_page();reference.set_viewport_size({'width':440,'height':820})
 reference.route('**/overlay/index.html',lambda route:route.fulfill(content_type='text/html',body='<link rel="stylesheet" href="study-theme.css"><link rel="stylesheet" href="study.css"><header class="drag"><div class="brand"><svg></svg>Study Signal</div><div class="window-controls"><button>×</button></div></header><main><h1>오늘은 무엇을 이해할까요?</h1><button class="primary">학습 시작</button></main>'))
 reference.goto(f'http://127.0.0.1:{server.server_port}/overlay/index.html')
 script="""() => {const root=getComputedStyle(document.documentElement),body=getComputedStyle(document.body),header=getComputedStyle(document.querySelector('.drag')),brand=getComputedStyle(document.querySelector('.brand')),button=getComputedStyle(document.querySelector('.primary'));return {font:root.fontFamily,ink:root.getPropertyValue('--ink'),surface:root.getPropertyValue('--surface'),background:body.backgroundColor,radius:body.borderRadius,header:header.height,brand:brand.fontSize,button:button.backgroundColor,buttonRadius:button.borderRadius};}"""
 assert page.evaluate(script)==reference.evaluate(script)
 reference.evaluate("() => {localStorage.setItem('study-opacity','80');document.documentElement.style.setProperty('--overlay-alpha','.8');}")
 page.wait_for_function("() => getComputedStyle(document.documentElement).getPropertyValue('--overlay-alpha').trim()==='0.8'")
 assert page.evaluate(script)==reference.evaluate(script)
 reference.close()
 assert not errors,errors
 (root/'docs/qa/scratchpad-ui.json').write_text(json.dumps({'passed':['free text note','draft survives reload','no duplicate file input or file-drop upload','study material names shared and refreshed','same computed theme as main study window','pin setting','acknowledgement placeholder','translation and summary together','copy action','safe text rendering','delete entry','360/420/720px no overflow'],'page_errors':errors,'environment':'headless Chrome; owned local IPC fixture'},ensure_ascii=False,indent=2)+'\n')
 browser.close()
server.shutdown();server.server_close();print('Scratchpad UI: 12 scenarios passed')
