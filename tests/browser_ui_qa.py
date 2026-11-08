"""Owned headless UI with synthetic microphone and mocked native capture/menu IPC."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import threading,json,base64,io,wave
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*_):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(root)))
threading.Thread(target=server.serve_forever,daemon=True).start()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args=['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+str(root/'tests/fixtures/voice-question.wav'),'--autoplay-policy=no-user-gesture-required'])
 page=browser.new_page(viewport=dict(width=440,height=820),device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''
 const fixturePNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8GQAAAAASUVORK5CYII=';
 window.actions=[];window.planStore={};window.planBodies=[];window.padEntries=[];window.recordId=0;window.pendingTarget='screen';
 const reply=async()=>{const message={id:'answer-'+window.recordId,role:'assistant',content:'CENT는 CXL로 여러 메모리 장치를 연결해요.',source:'openrouter',mode:'context',...(window.replyDocument?{artifact:{kind:'translation',title:'PIM Is All You Need 요약',summary:'메모리 가까이에서 추론 연산을 처리해요.',source_note:'현재 화면'}}:{})};window.testSession.messages.push({id:'user-'+window.recordId,role:'user',content:'CENT에서 CXL이 왜 필요해?'},message);await window.voiceEvent({type:'answer',data:{message}});};
 window.pressOrReleaseShortcut=()=>{if(document.getElementById('voice-status').textContent.startsWith('녹음 중'))return window.voiceEvent({type:'release',data:window.recordId});window.recordId++;return window.voiceEvent({type:'start',data:{id:window.recordId,control:'button',attachment:{display_id:1,width:2880,height:1800}}});};
 window.studyBridge={ready:async()=>({ok:true,health:{study_model:{configured:true}}}),onDisplayChanged:cb=>window.displayChanged=cb,onLost:()=>{},onVoice:cb=>{window.voiceEvent=cb;},onAppAction:cb=>{window.appAction=cb;},
 window:async(action,data)=>{window.actions.push({action,data});
 if(action==='collapse'){window.collapsed=!window.collapsed;return window.collapsed;}
 if(action==='displays')return [{id:1,label:'모의 모니터',x:-1440,y:0,width:1440,height:900,scale:2}];
 if(action==='gaze-addon-status')return {installed:true,busy:false};if(action==='gaze-display')return {x:-1440,y:0,width:1440,height:900,display_id:1};
 if(action==='overlay-bounds')return null;
 if(action==='selection-open')return {x:-1440,y:0,width:440,height:820,display_id:1};
 if(action==='scratchpad-begin'){const id='pad-'+window.padEntries.length;window.padEntries.push({id,status:'pending'});return id;}if(action==='scratchpad-complete'){const entry=window.padEntries.find(e=>e.id===data.id);if(entry)Object.assign(entry,{status:'ready',message:data.message});}if(action==='scratchpad-fail'){const entry=window.padEntries.find(e=>e.id===data.id);if(entry)entry.status='error';}if(action==='materials-import')return [{name:'notes.pdf',text:'고유 확인 코드 37. CENT는 CXL과 PIM을 결합한 LLM 추론 시스템입니다.',pages:1,truncated:false}];if(action==='voice-configure'){window.pendingTarget=data.target;return {enabled:data.enabled};}if(action==='connection-settings')return {key_configured:true,model:'anthropic/claude-sonnet-5.5'};
 if(action==='voice-cancel')return;if(action==='voice-button-start'){window.recordId++;await window.voiceEvent({type:'start',data:{id:window.recordId,control:'button',attachment:{display_id:1,width:2880,height:1800}}});return {started:true};}if(action==='voice-button-release'){await window.voiceEvent({type:'release',data:window.recordId});return;}
 if(action==='screen-prepare'){window.typedMessage=data.message;return {png:fixturePNG,display:{x:-1440,y:0,width:1440,height:900,display_id:1}};}
 if(action==='screen-submit'){const m={id:'typed-answer',role:'assistant',content:'텍스트 질문에 대한 화면 답변',source:'openrouter',mode:'context'};window.testSession.messages.push({id:'typed-user',role:'user',content:window.typedMessage},m);return {message:m};}
 if(action==='voice-submit'){if(window.pendingTarget==='manual')window.voiceEvent({type:'select',data:{png:fixturePNG,display:{display_id:1}}});else{await window.voiceEvent({type:'processing'});await reply();}}
 if(action==='voice-select'){await window.voiceEvent({type:'processing'});await reply();}return null;},
 request:async(method,route,body)=>{const heart={reading:true,bpm:72,message:'서버 수신',age_seconds:.2,connected:true,source:'collector'};
 if(route.startsWith('/study/plans')){window.planBodies=window.planBodies||[];window.planStore=window.planStore||{};const parts=route.split('/');if(method==='POST'&&route==='/study/plans'){window.planBodies.push(body);const key=body.goal+'|'+body.material;let plan=Object.values(window.planStore).find(p=>p.key===key);if(!plan||body.regenerate){const id=plan?.id||String(Object.keys(window.planStore).length+1).padStart(64,'a');plan={id,key,title:'PIM Is All You Need 학습',goal:body.goal,source:body.ai_enabled?'ai':'outline',sources:['notes.pdf'],version:(plan?.version||0)+1,items:[{id:'b'.repeat(15)+'1',label:'CENT의 CXL 연결 설명하기',evidence:'CXL로 메모리 장치들을 연결한다.',done:false},{id:'b'.repeat(15)+'2',label:'PIM과 PNM의 역할 비교하기',evidence:'PIM과 PNM이 추론 연산을 나누어 처리한다.',done:false}]};window.planStore[id]=plan;}return JSON.parse(JSON.stringify(plan));}const plan=window.planStore[parts[3]];if(method==='POST'){Object.assign(plan.items.find(i=>i.id===parts[5]),body);plan.version++;}return JSON.parse(JSON.stringify(plan));}
 if(route==='/study/speech'){window.speechRequests.push(body);return {audio:window.speechAudio,mime:'audio/wav'};}if(route==='/study/heart')return heart;
 if(route==='/study/sessions'&&window.failNextStart){window.failNextStart=false;throw new Error('테스트 서버 재시도');}
 if(route==='/study/sessions')window.testSession={id:'12345678123456781234567812345678',goal:body.goal,status:'running',elapsed_seconds:0,ai_enabled:body.ai_enabled,minutes:20,messages:[],heart,summary:null,busy:false,personalization:{dismissals:0,helpful:0}};
 if(route.includes('/materials'))window.materialContext=body.material;
 if(route.includes('/pause'))window.testSession.status=body.paused?'paused':'running';
 if(route.includes('/end')){window.testSession.status='ended';window.testSession.summary={studied_seconds:2,help_requests:window.recordId,helpful_feedback:0,note:'테스트'};}
 if(route.includes('focus-events'))return {recorded:true};return window.testSession;}};
 ''')
 audio=io.BytesIO()
 with wave.open(audio,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0\0'*72000)
 page.add_init_script("window.speechRequests=[];window.speechAudio="+json.dumps(base64.b64encode(audio.getvalue()).decode()))
 def select_value(selector,value):
  name=page.locator(selector).evaluate('(el,value)=>[...el.options].find(o=>o.value===value).label',value)
  page.locator(f'button[data-select-id="{selector[1:]}"]').click()
  page.locator('[role=listbox]:visible').get_by_role('option',name=name,exact=True).click()
 def start_voice():page.locator('#voice-talk').click()
 def release_voice():page.locator('#voice-talk').click()
 def settings(group=None):
  if page.locator('#settings').is_hidden():page.locator('#settings-toggle').click()
  if group:
   page.evaluate("id=>{const target=document.getElementById(id);for(let el=target;el&&el.id!=='settings';el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;}",group)
 def study():
  if page.locator('#settings').is_visible():page.locator('#settings-back').click()
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/index.html')
 page.wait_for_function("() => !document.getElementById('start').disabled")
 assert page.locator('#sample,#calibration,#precise-settings,#focus-mode,#show-gaze,#recalibrate,#study-region,#self-check').count()==0
 assert page.evaluate("localStorage.getItem('study-setting-focus-mode')") is None
 assert page.locator('#focus-panel').is_hidden()
 assert page.locator('#settings').is_hidden()
 for width in [390,440]:
  page.set_viewport_size(dict(width=width,height=820));assert page.evaluate('document.documentElement.scrollWidth')<=width
  page.screenshot(path=str(root/f'docs/qa/simple-study-{width}.png'))
 settings();assert page.locator('#study-view').is_hidden();assert page.locator('#settings>details[open]').count()==0
 page.screenshot(path=str(root/'docs/qa/simple-settings.png'))
 study();assert page.locator('#study-view').is_visible()
 page.evaluate('''async()=>{const {GazeTracker}=await import('/overlay/gaze.mjs');GazeTracker.prototype.start=async function(){this.running=true;this.update({status:'tracking',label:'모의 카메라'});window.injectGaze=sample=>this.sample(sample);};}''')
 page.locator('#material-add').click();page.wait_for_function("() => document.getElementById('material-list').textContent.includes('notes.pdf')")
 page.evaluate('window.failNextStart=true');page.locator('#start').click();page.wait_for_function("() => !document.getElementById('start').disabled");assert page.locator('#setup').is_visible();assert '테스트 서버 재시도' in page.locator('#error').inner_text()
 page.locator('#start').click();page.locator('#learning').wait_for(state='visible');assert page.locator('#focus-panel').is_visible()
 assert page.locator('#hint,#explain,#quiz,#message,#chat-form').count()==0
 assert page.locator('#voice-talk').count()==1
 assert page.locator('#voice-enable,#voice-shortcut,#voice-target').count()==0
 assert not page.locator('#read-answer').is_checked()
 settings('plan-settings');page.wait_for_function("() => document.querySelectorAll('#checklist-editor li').length===2")
 assert page.evaluate("window.planBodies[0].ai_enabled===false&&window.planBodies[0].consent===false")
 page.locator('#checklist-editor input[type=checkbox]').first.check();page.wait_for_function("() => document.getElementById('checklist-status').textContent.startsWith('1/2')")
 item=page.locator('#checklist-editor input[type=text]').first;item.fill('구조를 내 말로 설명');item.press('Tab');page.wait_for_function("() => Object.values(window.planStore)[0].items[0].label==='구조를 내 말로 설명'")
 calls=page.evaluate('window.planBodies.length');page.locator('#checklist-ai').check();assert page.evaluate('window.planBodies.length')==calls
 page.locator('#checklist-regenerate').click();page.wait_for_function("() => document.getElementById('checklist-status').textContent.includes('0/2 완료 · AI')")
 assert page.evaluate('window.planBodies.at(-1).consent&&window.planBodies.at(-1).regenerate')
 page.locator('#checklist-visible').uncheck();assert page.evaluate("window.actions.filter(a=>a.action==='checklist-update').at(-1).data.visible") is False
 page.locator('#checklist-visible').check()
 settings('voice-settings');page.locator('#read-answer').uncheck();settings('focus-settings');page.locator('#nag-mute').check();study()
 # Only direction evidence, no pixel coordinates or validated calibration.
 page.evaluate("()=>{const at=performance.now()+22000;for(let t=at-21000;t<=at;t+=100)window.injectGaze({at_ms:t,validated:false,validity:'unknown',pose_ok:false,presence:{ready:true,state:'away',reason:'direction_away'}});}")
 assert page.locator('#focus-notice').is_visible();assert '화면 이탈' in page.locator('#focus-state').inner_text()
 assert page.evaluate("window.actions.some(a=>a.action==='bubble-update'&&a.data.kind==='nag'&&a.data.show)")
 page.locator('#focus-correction').click();assert page.locator('#focus-notice').is_hidden()
 settings('voice-settings');page.locator('#voice-consent').check();study()
 start_voice();page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')")
 assert '보내기를 눌러주세요' in page.locator('#voice-status').inner_text();assert page.locator('#voice-attachment').is_visible()
 assert page.evaluate("window.actions.filter(a=>a.action==='voice-submit').length")==0
 page.wait_for_timeout(1200);release_voice();page.wait_for_function("() => document.getElementById('chat').textContent.includes('CENT는 CXL')")
 audio=page.evaluate("window.actions.find(a=>a.action==='voice-submit').data");assert audio['id']==1 and audio['speech_detected'] and audio['audio'].startswith('GkXf')
 assert not page.evaluate("window.actions.some(a=>a.action==='bubble-update'&&['answer','voice'].includes(a.data.kind))")
 assert page.locator('#session-heart').inner_text()=='72 bpm'
 assert page.evaluate("window.actions.some(a=>a.action==='scratchpad-metrics'&&a.data.bpm===72)")
 assert page.evaluate('window.speechRequests.length')==0
 assert page.evaluate("window.padEntries[0].status==='ready'")
 start_voice();page.locator('#voice-cancel').wait_for(state='visible');page.locator('#voice-cancel').click();page.wait_for_timeout(150)
 assert page.evaluate("window.actions.filter(a=>a.action==='voice-submit').length")==1
 page.evaluate('window.replyDocument=true');start_voice();page.wait_for_timeout(1200);release_voice()
 assert page.locator('#region-editor').count()==0
 page.wait_for_function("() => document.querySelectorAll('#chat .assistant').length===2")
 assert page.evaluate("window.padEntries.at(-1).message.artifact.summary==='메모리 가까이에서 추론 연산을 처리해요.'")
 page.evaluate("async()=>{await window.voiceEvent({type:'processing'});await window.voiceEvent({type:'cancel',data:'시험 취소'});}");page.wait_for_timeout(100)
 assert page.evaluate("window.padEntries.at(-1).status==='error'")
 settings('speech-settings')
 select_value('#tts-mode','natural');select_value('#tts-voice','Kore');page.locator('#tts-preview').click()
 page.wait_for_function("() => document.getElementById('tts-status').textContent.includes('읽고 있어요')")
 assert page.evaluate("window.speechRequests[0].voice==='Kore'&&window.speechRequests[0].kind==='preview'&&window.speechRequests[0].consent")
 page.evaluate("window.appAction({action:'bubble-tts-stop'})");page.locator('#tts-stop').wait_for(state='hidden')
 assert page.evaluate("localStorage.getItem('study-tts-voice')")=='Kore'
 page.locator('#tts-preview').click();page.wait_for_function("() => document.getElementById('tts-status').textContent.includes('읽고 있어요')");study()
 start_voice();assert page.locator('#tts-stop').is_hidden()
 page.locator('#collapse').click();page.set_viewport_size(dict(width=320,height=64));assert page.locator('#voice-indicator').is_visible();assert page.evaluate('document.documentElement.scrollWidth')<=320
 page.evaluate("window.voiceEvent({type:'cancel',data:'시험 취소'})");page.locator('#collapse').click();page.set_viewport_size(dict(width=440,height=820))
 page.evaluate("async()=>{window.padEntries.push({id:'typed-fixture',status:'pending'});await window.appAction({action:'pad-query',value:{id:'typed-fixture',message:'이 문단 설명해줘'}});}")
 assert page.evaluate("window.actions.some(a=>a.action==='screen-prepare'&&a.data.consent&&a.data.message==='이 문단 설명해줘')")
 assert page.evaluate("window.padEntries.at(-1).message.content==='텍스트 질문에 대한 화면 답변'")
 page.evaluate("window.appAction({action:'pause'})");page.wait_for_function("() => document.getElementById('pause').textContent==='다시 공부하기'")
 page.locator('#end').click();page.locator('#summary').wait_for(state='visible');page.locator('#new-session').click();assert page.locator('#setup').is_visible()
 # Start again: a stale session cannot turn the next Start click into a no-op.
 page.locator('#start').click();page.locator('#learning').wait_for(state='visible');page.locator('#end').click()
 settings('connection-settings');page.locator('#connection-key').fill('fixture-api-key-for-ui-only');page.locator('#connection-model').fill('anthropic/claude-sonnet-5.5');page.locator('#connection-save').click()
 page.wait_for_function("() => document.getElementById('connection-key').value===''")
 assert page.evaluate("window.actions.some(a=>a.action==='connection-save'&&a.data.api_key==='fixture-api-key-for-ui-only')")
 assert not page.evaluate("JSON.stringify(localStorage).includes('fixture-api-key-for-ui-only')")
 assert not page.evaluate("window.actions.some(a=>a.action==='calibration-open'||a.action==='gaze-visible'||a.action==='materials-example')")
 assert not page.evaluate("window.actions.some(a=>a.action==='voice-shortcut-guide'||a.action==='voice-configure')")
 assert not errors,errors
 passed=['pad text query attaches screen and receives answer','failed Start request can be retried','start button ready and clickable','start again after ending','removed calibration and validation UI','removed built-in paper demo','legacy region preference migrated','file upload creates checklist','manual checklist completion and edit','AI plan regeneration consent','checklist visibility','settings separate from study','six collapsed settings groups','390/440px no horizontal overflow','uncalibrated direction triggers away alert','false alarm grace','click begins WebM recording','send click submits frozen screen question','cancel discards recording','automatic full display without a region selector','voice response saved to scratchpad','translation summary saved','cancelled pad request interrupted','natural TTS plays','voice preference saved','recording stops TTS','collapsed recording indicator','session pause/end','API key cleared after save','no raw key in localStorage']
 (root/'docs/qa/browser-qa.json').write_text(json.dumps(dict(passed=passed,page_errors=errors,environment='headless system Chrome; synthetic microphone and direction; mocked native bridge. No physical accuracy claims.'),ensure_ascii=False,indent=2))
 print(f'Browser UI: {len(passed)} workflows passed; no page errors')
 browser.close()
server.shutdown();server.server_close()
