"""Compact chat UI with owned IPC fixture; no user screen or network."""
from pathlib import Path
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright
import threading,json
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
 page=browser.new_page(viewport={'width':340,'height':148},device_scale_factor=2);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 window.padActions=[];window.padState=JSON.parse(localStorage.getItem('pad-fixture')||'null')||{entries:[],draft:'',pinned:true,expanded:false,busy:false,voice:{phase:'idle'},metrics:{clock:'03:45',bpm:72},context:{materials:['reading-notes.pdf'],has_material:true}};
 window.padState.expanded=false;window.padState.busy=false;
 window.emitPad=()=>{localStorage.setItem('pad-fixture',JSON.stringify(window.padState));window.receivePad(window.padState);};
 window.scratchpadBridge={onState:cb=>window.receivePad=cb,action:async(name,value)=>{window.padActions.push({name,value});let s=window.padState;
 if(name==='ready')return s;
 if(name==='voice'){s.voice={phase:s.voice?.phase==='recording'?'processing':'recording'};}
 if(name==='query'&&window.failQuery)throw new Error('연결을 다시 확인해주세요.');
 if(name==='query'){s.entries.push({id:'query-'+s.entries.length,kind:'request',title:'질문',question:value.message,body:'화면을 확인하고 있어요…',status:'pending',created_at:new Date().toISOString()});s.busy=true;s.expanded=true;s.draft='';}
 if(name==='draft')s.draft=value;if(name==='collapse')s.expanded=false;if(name==='expand')s.expanded=true;
 if(name==='remove')s.entries=s.entries.filter(e=>e.id!==value);
 window.emitPad();return name==='query'?{id:s.entries.at(-1).id}:undefined;}};
 ''')
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/scratchpad.html')
 page.locator('#draft').wait_for();assert page.locator('#conversation').is_hidden();assert page.locator('#toggle').is_hidden();assert page.locator('#add').inner_text()=='채팅하기'
 assert page.locator('#pin,input[type=file]').count()==0
 assert page.locator('#chat-clock').inner_text()=='03:45' and page.locator('#chat-heart').inner_text()=='72 bpm'
 page.locator('#voice-question').click();assert page.locator('#voice-question').inner_text()=='보내기';page.locator('#voice-question').click();assert page.locator('#voice-question').is_disabled()
 page.evaluate("()=>{window.padState.voice={phase:'idle'};window.emitPad();}")
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight')
 page.screenshot(path=str(root/'docs/qa/chat-compact.png'),omit_background=True)
 page.locator('#draft').fill('이 문단을 설명해줘');page.locator('#add').click();page.set_viewport_size({'width':400,'height':520})
 page.locator('.entry.pending').wait_for();assert page.locator('#conversation').is_visible();assert '이 문단을' in page.locator('.question').inner_text();assert page.locator('#add').is_disabled()
 assert page.evaluate("window.padActions.filter(a=>a.name==='query').length")==1
 page.evaluate("()=>{Object.assign(window.padState.entries.at(-1),{kind:'answer',body:'현재 문단의 핵심은 메모리 가까이에서 연산을 처리하는 것입니다.',status:'ready'});window.padState.busy=false;window.emitPad();}")
 page.locator('#add').wait_for(state='visible');assert not page.locator('#add').is_disabled()
 assert 'reading-notes.pdf' in page.locator('#study-context').inner_text()
 page.locator('#toggle').click();page.set_viewport_size({'width':340,'height':148});assert page.locator('#conversation').is_hidden();assert page.locator('#toggle').inner_text()=='대화'
 page.locator('#toggle').click();page.set_viewport_size({'width':400,'height':520});assert page.locator('.entry').count()==1
 page.locator('.entry').get_by_role('button',name='복사').click();assert page.evaluate("window.padActions.at(-1).name")=='copy'
 page.locator('#draft').fill('다음 질문 초안');page.wait_for_timeout(500);page.reload();assert page.locator('#conversation').is_hidden();assert page.locator('#draft').input_value()=='다음 질문 초안'
 page.locator('#draft').fill('번역해줘');page.locator('#draft').press('Enter');page.set_viewport_size({'width':400,'height':520});assert page.locator('.entry.pending').count()==1
 page.evaluate("()=>{Object.assign(window.padState.entries.at(-1),{kind:'translation',title:'번역',body:'측정 지연은 120 ns에서 80 ns로 줄었습니다.',summary:'40 ns 감소',status:'ready'});window.padState.busy=false;window.emitPad();}")
 assert '40 ns' in page.locator('.summary').inner_text()
 page.screenshot(path=str(root/'docs/qa/chat-expanded.png'),omit_background=True)
 page.locator('#toggle').click();page.set_viewport_size({'width':340,'height':148})
 page.evaluate("()=>{window.padState.entries.push({id:'voice',kind:'request',body:'듣고 있어요…',status:'pending',created_at:new Date().toISOString()});window.padState.expanded=true;window.padState.busy=true;window.emitPad();}")
 page.set_viewport_size({'width':400,'height':520});assert page.locator('.entry.pending').is_visible();assert page.locator('#conversation').is_visible()
 page.evaluate("()=>{Object.assign(window.padState.entries.at(-1),{kind:'answer',question:'음성 질문',body:'<img src=x onerror=alert(1)>',status:'ready'});window.padState.busy=false;window.emitPad();}");assert page.locator('img').count()==0;assert '<img' in page.locator('.body').last.inner_text()
 page.locator('.entry').last.get_by_role('button',name='삭제').click();assert page.locator('.entry').count()==2
 page.locator('#toggle').click();page.evaluate('window.failQuery=true');page.locator('#draft').fill('실패 재시도 질문');page.locator('#add').click();page.locator('#error').wait_for(state='visible');assert page.locator('#conversation').is_visible();assert not page.locator('#add').is_disabled()
 for width,height in [(300,148),(340,148),(400,520)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 assert not errors,errors
 passed=['failed query expands error and permits retry','340x148 compact chat with clock and heart rate','no empty heading or pin/upload controls','typed query expands','question displayed with pending reply','pending disables duplicate submit','answer preserves material context','collapse retains conversation','history reopens','copy action','draft survives restart in compact mode','Enter sends question','translation and summary together','voice request expands','untrusted response stays text','delete completed answer','300/340/400px no horizontal overflow']
 (root/'docs/qa/scratchpad-ui.json').write_text(json.dumps({'passed':passed,'page_errors':errors,'environment':'headless Chrome; owned IPC fixture; no external model'},ensure_ascii=False,indent=2)+'\n');print(f'Compact chat UI: {len(passed)} scenarios passed')
 browser.close()
server.shutdown();server.server_close()
