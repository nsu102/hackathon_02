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
 window.pressOrReleaseShortcut=()=>{if(document.getElementById('voice-status').textContent.startsWith('녹음 중'))return window.voiceEvent({type:'release',data:window.recordId});window.recordId++;return window.voiceEvent({type:'start',data:{id:window.recordId,control:'hotkey',attachment:{display_id:1,width:2880,height:1800}}});};
 window.studyBridge={ready:async()=>({ok:true,health:{study_model:{configured:true}}}),onDisplayChanged:()=>{},onLost:()=>{},onVoice:cb=>{window.voiceEvent=cb;},onAppAction:cb=>{window.appAction=cb;},
 window:async(action,data)=>{window.actions.push({action,data});
 if(action==='collapse'){window.collapsed=!window.collapsed;return window.collapsed;}
 if(action==='displays')return [{id:1,label:'모의 모니터',x:-1440,y:0,width:1440,height:900,scale:2}];
 if(action==='gaze-display')return {x:-1440,y:0,width:1440,height:900,display_id:1};
 if(action==='overlay-bounds')return null;
 if(action==='calibration-open')return {x:-1440,y:0,width:440,height:820,display_id:1};
 if(action==='scratchpad-begin'){const id='pad-'+window.padEntries.length;window.padEntries.push({id,status:'pending'});return id;}if(action==='scratchpad-complete'){const entry=window.padEntries.find(e=>e.id===data.id);if(entry)Object.assign(entry,{status:'ready',message:data.message});}if(action==='scratchpad-fail'){const entry=window.padEntries.find(e=>e.id===data.id);if(entry)entry.status='error';}if(action==='materials-import'||action==='materials-example')return [{name:'notes.pdf',text:'고유 확인 코드 37. CENT는 CXL과 PIM을 결합한 LLM 추론 시스템입니다.',pages:1,truncated:false}];if(action==='voice-configure'){window.pendingTarget=data.target;return {enabled:data.enabled};}if(action==='connection-settings')return {key_configured:true,model:'anthropic/claude-sonnet-5.5'};
 if(action==='voice-cancel')return;
 if(action==='voice-submit'){if(window.pendingTarget==='manual')window.voiceEvent({type:'select',data:{png:fixturePNG,display:{display_id:1}}});else{await window.voiceEvent({type:'processing'});await reply();}}
 if(action==='voice-select'){await window.voiceEvent({type:'processing'});await reply();}return null;},
 request:async(method,route,body)=>{const heart={reading:false,bpm:null,message:'미연결',age_seconds:null,connected:false,source:null};
 if(route.startsWith('/study/plans')){window.planBodies=window.planBodies||[];window.planStore=window.planStore||{};const parts=route.split('/');if(method==='POST'&&route==='/study/plans'){window.planBodies.push(body);const key=body.goal+'|'+body.material;let plan=Object.values(window.planStore).find(p=>p.key===key);if(!plan||body.regenerate){const id=plan?.id||String(Object.keys(window.planStore).length+1).padStart(64,'a');plan={id,key,title:'PIM Is All You Need 학습',goal:body.goal,source:body.ai_enabled?'ai':'outline',sources:['notes.pdf'],version:(plan?.version||0)+1,items:[{id:'b'.repeat(15)+'1',label:'CENT의 CXL 연결 설명하기',evidence:'CXL로 메모리 장치들을 연결한다.',done:false},{id:'b'.repeat(15)+'2',label:'PIM과 PNM의 역할 비교하기',evidence:'PIM과 PNM이 추론 연산을 나누어 처리한다.',done:false}]};window.planStore[id]=plan;}return JSON.parse(JSON.stringify(plan));}const plan=window.planStore[parts[3]];if(method==='POST'){Object.assign(plan.items.find(i=>i.id===parts[5]),body);plan.version++;}return JSON.parse(JSON.stringify(plan));}
 if(route==='/study/speech'){window.speechRequests.push(body);return {audio:window.speechAudio,mime:'audio/wav'};}if(route==='/study/heart')return heart;
 if(route==='/study/sessions')window.testSession={id:'12345678123456781234567812345678',goal:body.goal,status:'running',elapsed_seconds:0,ai_enabled:body.ai_enabled,minutes:20,messages:[],heart,summary:null,busy:false,personalization:{dismissals:0,helpful:0}};
 if(route.includes('/materials'))window.materialContext=body.material;
 if(route.includes('/pause'))window.testSession.status=body.paused?'paused':'running';
 if(route.includes('/end')){window.testSession.status='ended';window.testSession.summary={studied_seconds:2,help_requests:window.recordId,helpful_feedback:0,note:'테스트'};}
 if(route.includes('focus-events'))return {recorded:true};return window.testSession;}};
 ''')
 audio=io.BytesIO()
 with wave.open(audio,'wb') as wav:wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(24000);wav.writeframes(b'\0\0'*72000)
 page.add_init_script("window.speechRequests=[];window.speechAudio="+json.dumps(base64.b64encode(audio.getvalue()).decode()))
 def start_voice():
  page.wait_for_function("() => document.getElementById('voice-enable').textContent.includes('끄기')")
  page.evaluate("async()=>{window.pendingTarget=document.getElementById('voice-target').value;window.recordId++;await window.voiceEvent({type:'start',data:{id:window.recordId,control:'hotkey',attachment:{display_id:1,width:2880,height:1800}}});}")
 def release_voice():
  page.evaluate("window.voiceEvent({type:'release',data:window.recordId})")
 page.goto(f'http://127.0.0.1:{server.server_port}/overlay/index.html')
 page.evaluate('''async()=>{const {GazeTracker}=await import('/overlay/gaze.mjs');GazeTracker.prototype.start=async function(){this.running=true;this.update({status:'tracking',label:'모의 카메라'});window.injectGaze=sample=>this.sample(sample);};}''')
 page.locator('#sample').click();page.locator('#start').click();page.locator('#learning').wait_for(state='visible')
 assert page.locator('#hint,#explain,#quiz,#message,#chat-form').count()==0
 assert page.locator('#calibration').is_hidden()
 assert page.locator('#voice-talk').count()==0
 page.locator('#settings-toggle').click();page.wait_for_function("() => document.querySelectorAll('#checklist-editor li').length===2")
 assert page.evaluate("window.planBodies[0].ai_enabled===false&&window.planBodies[0].consent===false")
 page.locator('#checklist-editor input[type=checkbox]').first.check();page.wait_for_function("() => document.getElementById('checklist-status').textContent.startsWith('1/2')")
 item=page.locator('#checklist-editor input[type=text]').first;item.fill('CENT 구조를 내 말로 설명');item.press('Tab');page.wait_for_function("() => Object.values(window.planStore)[0].items[0].label==='CENT 구조를 내 말로 설명'")
 calls=page.evaluate('window.planBodies.length');page.locator('#checklist-ai').check();assert page.evaluate('window.planBodies.length')==calls
 page.locator('#checklist-regenerate').click();page.wait_for_function("() => document.getElementById('checklist-status').textContent.includes('0/2 완료 · AI')")
 assert page.evaluate('window.planBodies.at(-1).consent&&window.planBodies.at(-1).regenerate')
 page.locator('#checklist-visible').uncheck();assert page.evaluate("window.actions.filter(a=>a.action==='checklist-update').at(-1).data.visible") is False
 page.locator('#checklist-visible').check()
 page.locator('#settings-toggle').click()
 page.locator('#settings-toggle').click();page.locator('#read-answer').uncheck();page.locator('#nag-mute').check();page.locator('#settings-toggle').click()
 page.evaluate('''()=>{const at=performance.now()+22000;for(let t=at-21000;t<=at;t+=100)window.injectGaze({at_ms:t,validated:false,validity:'unknown',pose_ok:false,presence:{ready:true,state:'away',reason:'direction_away'}});}''')
 assert page.locator('#focus-notice').is_visible();assert '화면 이탈' in page.locator('#focus-state').inner_text()
 assert page.evaluate("window.actions.some(a=>a.action==='bubble-update'&&a.data.kind==='nag'&&a.data.show)")
 page.locator('#focus-correction').click();assert page.locator('#focus-notice').is_hidden()
 page.evaluate("window.appAction({action:'settings'})");page.locator('#settings').wait_for(state='visible')
 page.locator('#precise-settings>summary').click();page.locator('#study-region').click();page.locator('#region-editor').wait_for(state='visible')
 page.mouse.move(30,250);page.mouse.down();page.mouse.move(380,620);page.mouse.up();page.locator('#region-save').click();page.locator('#region-editor').wait_for(state='hidden')
 assert '학습 영역 설정됨' in page.locator('#region-status').inner_text()
 page.evaluate("window.appAction({action:'voice-settings'})");page.locator('#voice-consent').check();page.locator('#voice-enable').click();page.wait_for_function("() => document.getElementById('voice-enable').textContent.includes('끄기')");page.locator('#settings-toggle').click();page.evaluate("window.appAction({action:'bubble-add-material'})");page.wait_for_function("() => document.getElementById('material-list').textContent.includes('notes.pdf')");assert '37' in page.evaluate('window.materialContext');start_voice()
 page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')")
 assert '단축키를 놓으면' in page.locator('#voice-status').inner_text()
 assert page.locator('#voice-attachment').is_visible()
 assert page.evaluate("window.actions.filter(a=>a.action==='voice-submit').length")==0
 page.wait_for_timeout(1200);release_voice()
 page.wait_for_function("() => document.getElementById('chat').textContent.includes('CENT는 CXL')")
 assert page.evaluate("window.actions.some(a=>a.action==='bubble-update'&&a.data.kind==='answer'&&a.data.attachment&&a.data.materials===1)")
 audio=page.evaluate("window.actions.find(a=>a.action==='voice-submit').data")
 assert audio['id']==1 and audio['speech_detected'] and audio['audio'].startswith('GkXf')
 assert page.evaluate("window.actions.some(a=>a.action==='voice-configure'&&a.data.enabled)")
 start_voice();page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')")
 page.locator('#voice-cancel').click();page.wait_for_timeout(150)
 assert page.evaluate("window.actions.filter(a=>a.action==='voice-submit').length")==1
 assert page.evaluate("window.padEntries[0].status==='ready'"),'voice reply must be saved in the pad'
 page.evaluate('window.replyDocument=true')
 page.locator('#settings-toggle').click();page.locator('#voice-target').select_option('manual');page.evaluate("window.appAction({action:'voice-settings'})");page.locator('#voice-enable').click();page.wait_for_function("() => document.getElementById('voice-enable').textContent.includes('끄기')");page.locator('#settings-toggle').click()
 start_voice();page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')")
 page.wait_for_timeout(1200);release_voice();page.locator('#region-editor').wait_for(state='visible')
 page.mouse.move(30,250);page.mouse.down();page.mouse.move(380,620);page.mouse.up();page.locator('#region-save').click();page.locator('#region-editor').wait_for(state='hidden')
 page.wait_for_function("() => document.querySelectorAll('#chat .assistant').length===2")
 assert page.evaluate("window.padEntries.at(-1).message.artifact.summary==='메모리 가까이에서 추론 연산을 처리해요.'")
 assert page.evaluate("window.actions.some(a=>a.action==='bubble-update'&&a.data.phase==='processing'&&a.data.text.includes('알겠습니다'))")
 page.evaluate("async()=>{await window.voiceEvent({type:'processing'});await window.voiceEvent({type:'cancel',data:'시험 취소'});}");page.wait_for_timeout(100)
 assert page.evaluate("window.padEntries.at(-1).status==='error'")
 page.locator('#settings-toggle').click();page.locator('#voice-target').select_option('screen');page.evaluate("window.appAction({action:'voice-settings'})");page.locator('#voice-enable').click();page.wait_for_function("() => document.getElementById('voice-enable').textContent.includes('끄기')")
 page.locator('#tts-mode').select_option('natural');page.locator('#tts-voice').select_option('Kore');page.locator('#tts-preview').click();page.locator('#tts-stop').wait_for(state='visible')
 page.wait_for_function("() => window.speechRequests.length===1")
 assert page.evaluate("window.speechRequests[0].voice==='Kore'&&window.speechRequests[0].kind==='preview'&&window.speechRequests[0].consent")
 page.wait_for_function("() => document.getElementById('tts-status').textContent.includes('읽고 있어요')")
 page.evaluate("window.appAction({action:'bubble-tts-stop'})");page.locator('#tts-stop').wait_for(state='hidden')
 assert page.evaluate("localStorage.getItem('study-tts-voice')")=='Kore'
 page.locator('#tts-preview').click();page.wait_for_function("() => document.getElementById('tts-status').textContent.includes('읽고 있어요')")
 page.locator('#settings-toggle').click()
 start_voice();page.wait_for_function("() => document.getElementById('voice-status').textContent.startsWith('녹음 중')")
 assert page.locator('#tts-stop').is_hidden(),'recording must interrupt generated speech'
 page.locator('#collapse').click();page.set_viewport_size(dict(width=320,height=64))
 assert page.locator('#voice-indicator').is_visible();assert page.evaluate('document.documentElement.scrollWidth')<=320
 page.evaluate("window.voiceEvent({type:'cancel',data:'시험 취소'})");page.locator('#collapse').click();page.set_viewport_size(dict(width=440,height=820))
 page.evaluate("window.appAction({action:'pause'})");page.wait_for_function("() => document.getElementById('pause').textContent==='다시 공부하기'")
 page.locator('#end').click();page.locator('#summary').wait_for(state='visible');page.locator('#new-session').click();assert page.locator('#setup').is_visible()
 page.evaluate("window.appAction({action:'settings'})");page.locator('#settings').wait_for(state='visible')
 page.locator('#connection-key').fill('fixture-api-key-for-ui-only');page.locator('#connection-model').fill('anthropic/claude-sonnet-5.5');page.locator('#connection-save').click()
 page.wait_for_function("() => document.getElementById('connection-key').value===''")
 assert page.evaluate("window.actions.some(a=>a.action==='connection-save'&&a.data.api_key==='fixture-api-key-for-ui-only')")
 assert not page.evaluate("JSON.stringify(localStorage).includes('fixture-api-key-for-ui-only')")
 assert not errors,errors
 out=root/'docs/qa';out.mkdir(exist_ok=True)
 passed=['session lifecycle','voice-only controls and removed text presets','coarse away state visible without pixel calibration','false-alarm grace','menu action opens settings','negative-origin manual region','shortcut event starts actual WebM/Opus recording','shortcut release receives answer','shortcut enabled through settings','cancel discards recording','manual voice crop and answer','collapsed recording indicator','menu pause and end cleanup','connection settings clears API key after save','file attachment enters session context','screenshot attachment shown while recording','answer and focus bubble IPC','natural TTS preview plays audio','voice choice persisted','bubble stops speech','recording interrupts TTS','local checklist created on material','checklist progress and edit','AI regeneration requires explicit consent','completed checklist resists auto reset','checklist visibility','voice acknowledgement before completion','voice reply saved to scratchpad','translation summary saved to scratchpad','cancelled pad request marked interrupted']
 (out/'browser-qa.json').write_text(json.dumps(dict(passed=passed,page_errors=errors,environment='headless system Chrome; synthetic microphone; mock native capture/menu/camera. No human accuracy claims.'),ensure_ascii=False,indent=2))
 page.screenshot(path=str(out/'overlay-v0.6-mocked.png'))
 print(f'Browser UI: {len(passed)} workflows passed; 0 page errors (mock native bridge)')
 browser.close()
server.shutdown();server.server_close()
