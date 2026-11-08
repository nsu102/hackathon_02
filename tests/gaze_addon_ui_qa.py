"""Optional gaze settings UI with owned fixture install progress; no camera/network."""
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
 page=browser.new_page(viewport={'width':440,'height':820});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 window.gazeState={installed:false,busy:false};window.actions=[];
 window.studyBridge={ready:async()=>({ok:true,health:{study_model:{configured:false}}}),onLost:()=>{},onDisplayChanged:()=>{},onVoice:()=>{},onAppAction:()=>{},onGazeInstall:cb=>window.installEvent=cb,
 request:async(method,route,body)=>{const heart={reading:false,bpm:null,message:'미연결',age_seconds:null,source:null};if(route==='/study/sessions')window.session={id:'12345678123456781234567812345678',goal:body.goal,status:'running',elapsed_seconds:0,ai_enabled:false,minutes:20,messages:[],heart,summary:null,busy:false,personalization:{dismissals:0,helpful:0}};return route==='/study/heart'?heart:window.session;},window:async(name,data)=>{window.actions.push(name);
 if(name==='gaze-addon-status')return window.gazeState;
 if(name==='gaze-addon-install'){window.gazeState={installed:false,busy:true,phase:'extracting',percent:35};window.installEvent(window.gazeState);return new Promise((resolve,reject)=>{window.installDone=()=>{window.gazeState={installed:true,busy:false,percent:100};window.installEvent(window.gazeState);resolve(window.gazeState);};window.installFail=reject;});}
 if(name==='gaze-addon-cancel'){window.gazeState={installed:false,busy:false};window.installEvent(window.gazeState);window.installFail(new Error('시선 설치를 취소했어요.'));}
 if(name==='displays')return [{id:1,label:'모의 모니터',width:1440,height:900,scale:2}];if(name==='connection-settings')return {key_configured:false,model:'anthropic/test'};return null;}};
 ''')
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/index.html');page.locator('#settings-toggle').click();page.locator('#focus-settings>summary').click()
 page.wait_for_function("() => document.getElementById('gaze-addon-status').textContent.includes('미설치')")
 assert page.locator('#camera-toggle').inner_text()=='시선 설치'
 page.locator('#gaze-addon-install').click();page.wait_for_function("() => document.getElementById('gaze-addon-install').disabled")
 assert page.locator('#gaze-addon-progress').is_visible();assert page.locator('#gaze-addon-progress').get_attribute('value')=='35'
 assert page.locator('#camera-toggle').is_disabled()
 page.locator('#gaze-addon-cancel').click();page.wait_for_function("() => !document.getElementById('gaze-addon-install').disabled")
 assert page.locator('#gaze-addon-progress').is_hidden()
 page.locator('#gaze-addon-install').click();page.evaluate('window.installDone()');page.wait_for_function("() => document.getElementById('gaze-addon-status').textContent.includes('설치됨')")
 assert page.locator('#gaze-addon-install').is_hidden();assert page.locator('#camera-toggle').inner_text()=='감지 켜기'
 assert page.evaluate("!window.actions.includes('camera-permission')&&!window.actions.includes('neural-start')")
 page.evaluate('''async()=>{const {GazeTracker}=await import('/overlay/gaze.mjs');GazeTracker.prototype.start=async function(){this.running=true;window.gazeStarted=true;this.update({status:'tracking',label:'모의 시선 감지'});};}''')
 page.locator('#settings-back').click();page.locator('#start').click();page.wait_for_function('() => window.gazeStarted===true')
 assert not errors,errors
 report={'passed':['missing-component label','single install action','progress percentage','install and camera controls locked while busy','cancel and retry','installed state','no automatic camera or model start','new study can enable gaze after installing during this app run'],'page_errors':errors,'environment':'headless Chrome; owned installer fixture'}
 (root/'docs/qa/gaze-addon-ui.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print('Optional gaze UI: 8 scenarios passed')
 browser.close()
server.shutdown();server.server_close()
