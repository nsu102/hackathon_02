import { setupGaze } from './gaze-ui.mjs';
import {FocusController} from './focus.mjs';
import {setupVoice} from './voice-ui.mjs';
import {setupConnection} from './connection-ui.mjs';
import {setupMaterials} from './materials-ui.mjs';
import {setupSpeech} from './speech.mjs';
import {setupPlan} from './plan-ui.mjs';
import {selectRegion} from './regions.mjs';
const $=id=>document.getElementById(id),bridge=window.studyBridge;
let voice=null,session=null,ready=false,busy=false,anchor=null,heartReading=false,lastMessageIds=new Set(),materials=null,bubbleConfigured=false,lastUserText='',nagBubbleVisible=false,planner=null;
function syncPad(){if(materials)bridge.window('scratchpad-context',{goal:$('goal').value.trim(),materials:materials.names(),has_material:Boolean(materials.text().trim())}).catch(()=>{});}
function showBubble(value){bridge.window('bubble-update',{...value,configured:bubbleConfigured,consent:$('voice-consent').checked,materials:materials?.count()||0}).catch(()=>{});}
function error(text=''){$('error').textContent=text;$('error').hidden=!text;if(text)showBubble({kind:'error',text,...(voice?.state()||{phase:'idle'}),show:true});}
setupConnection(error);
const speech=setupSpeech({bridge,onState:value=>showBubble({speaking:value.active,speechStatus:value.error||(value.phase==='loading'?'자연스러운 음성 준비 중…':value.phase==='playing'?'음성으로 읽고 있어요.':''),show:false})});
function clock(){const elapsed=anchor?anchor.seconds+(anchor.running?(performance.now()-anchor.at)/1000:0):0;const n=Math.floor(elapsed),text=String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');$('timer').textContent=text;$('mini-clock').textContent=text;}
function heart(value){heartReading=value.reading;$('heart-bpm').replaceChildren(document.createTextNode(value.bpm===null?'— ':`${value.bpm} `));const unit=document.createElement('small');unit.textContent='bpm';$('heart-bpm').append(unit);$('heart-status').textContent=value.message+(value.age_seconds===null?'':` · ${Math.round(value.age_seconds)}초 전`);$('heart-toggle').textContent=heartReading?'연결 끊기':'서버 연결';$('signal-note').textContent=value.source==='demo'&&value.connected?'현재 심박은 데모 서버 데이터예요. 실제 워치 측정값이 아니에요.':'시선과 심박은 상태를 확인하는 참고 신호예요.';}
function addMessage(m){if(lastMessageIds.has(m.id))return;lastMessageIds.add(m.id);if(m.role==='user')lastUserText=m.content;else if(m.role==='assistant')showBubble({kind:'answer',text:m.artifact?'정리했어요. 좌상단 스크래치패드에서 '+(m.artifact.kind==='translation'?'번역과 요약':'요약')+'을 확인해주세요.':[m.content,m.question].filter(Boolean).join('\n\n'),question:lastUserText,phase:'idle',attachment:m.mode==='context',show:true});const row=document.createElement('div');row.className=`message ${m.role}`;const label=document.createElement('span');label.className='author';label.textContent=m.role==='user'?'나':m.source==='demo'?'Study Signal · 데모':'Study Signal';row.append(label,document.createTextNode(m.content));if(m.question){const p=document.createElement('p');p.textContent=m.question;row.append(p);}if(m.answer){const d=document.createElement('details');d.className='answer';const title=document.createElement('summary');title.textContent='답 확인하기';const a=document.createElement('p');a.textContent=m.answer;d.append(title,a);row.append(d);}if(m.role==='assistant'){const f=document.createElement('div');f.className='feedback';for(const [name,helpful]of[['도움됐어요',true],['다르게 도와줘',false]]){const b=document.createElement('button');b.textContent=name;b.onclick=async()=>{try{const v=await bridge.request('POST',`/study/sessions/${session.id}/feedback`,{response_id:m.id,helpful,consent_for_training:$('training-consent').checked});f.replaceChildren(document.createTextNode(helpful?'피드백을 기록했어요':'다음 도움 방식을 바꿔볼게요'));render(v);}catch(e){error(e.message);}};f.append(b);}row.append(f);}$('chat').append(row);$('chat').scrollTop=$('chat').scrollHeight;}
function render(v){session=v;syncPad();anchor={seconds:v.elapsed_seconds,at:performance.now(),running:v.status==='running'};$('goal-display').textContent=v.goal;$('setup').hidden=true;$('learning').hidden=v.status==='ended';$('summary').hidden=v.status!=='ended';$('timer-label').textContent=v.status==='paused'?'쉬는 중':v.status==='ended'?'학습 기록':'함께 공부한 시간';$('minutes').disabled=true;$('pause').textContent=v.status==='paused'?'다시 공부하기':'잠깐 쉬기';$('focus-panel').hidden=v.status==='ended';for(const m of v.messages)addMessage(m);heart(v.heart);$('personalization').textContent=`불필요한 알림 ${v.personalization.dismissals}회 조정 · 도움이 된 답변 ${v.personalization.helpful}개`;
if(v.summary)$('summary-text').textContent=`공부한 시간 ${Math.floor(v.summary.studied_seconds/60)}분 ${v.summary.studied_seconds%60}초\n도움 요청 ${v.summary.help_requests}회 · 도움이 된 답변 ${v.summary.helpful_feedback}개\n\n${v.summary.note}`;clock();}
const focus=new FocusController(event=>{if(session&&session.status!=='ended')bridge.request('POST',`/study/sessions/${session.id}/focus-events`,event).catch(e=>error(e.message));});
async function ensureAIStudy(){if(!session||session.status==='ended')await startStudy();if(!session.ai_enabled)throw new Error('설정에서 AI 도움을 켠 뒤 새 학습을 시작해주세요.');if(session.status==='paused')render(await bridge.request('POST',`/study/sessions/${session.id}/pause`,{paused:false}));}
voice=setupVoice({speaker:speech,onActivate:ensureAIStudy,onStatus:state=>showBubble({kind:'voice',...state,question:'',show:true}),getSession:()=>session?{...session,busy:busy||session.busy}:null,error,onAnswer:async()=>{try{render(await bridge.request('GET',`/study/sessions/${session.id}`));}catch(e){error(e.message);}}});
materials=setupMaterials({error,busy:()=>Boolean(busy||session?.busy||voice.isHelping()),onChange:async(text,count)=>{if(session&&session.status!=='ended')render(await bridge.request('POST',`/study/sessions/${session.id}/materials`,{material:text}));showBubble({kind:'info',text:`자료 ${count}개를 준비했어요. 질문할 때 현재 화면과 함께 참고할게요.`,phase:'idle',show:true});planner?.materialChanged();syncPad();}});
planner=setupPlan({bridge,material:()=>materials.text(),goal:()=>$('goal').value});
$('goal').addEventListener('change',()=>{syncPad();if(materials.text().trim())planner.materialChanged();});
let overlayBounds=null,lastSampleAt=-Infinity;
const tracker=setupGaze(async value=>{if(!session||session.status!=='running')return;try{render(await bridge.request('POST',`/study/sessions/${session.id}/observations`,value));}catch(e){error(e.message);}},error);
function grace(correction){const at=performance.now();focus.grace(at);speech.stop();$('focus-notice').hidden=true;if(session)bridge.request('POST',`/study/sessions/${session.id}/focus-events`,{from:focus.state,to:'paused',reason:'user_correction',at_ms:Math.round(at),duration_ms:60000,correction}).catch(e=>error(e.message));}
$('focus-grace').onclick=()=>grace('notes');$('focus-correction').onclick=()=>grace('false_alarm');
const names={attending:'화면 응시 중',away_pending:'이탈 확인 중',away:'화면 이탈 감지',unknown:'측정 불가',paused:'휴식·유예 중',helping:'질문·답변 중'};
const reasons={reference:'화면 가운데를 2초 바라봐 주세요.',unstable_reference:'화면 가운데를 편하게 바라봐 주세요. 기준을 다시 확인 중이에요.',missing_eyes:'눈이나 얼굴이 잘 보이지 않아요. 조명과 카메라를 확인해주세요.',model_quality:'얼굴은 감지했지만 시선 모델이 유효한 방향을 추정하지 못했어요. 자세·조명을 확인해주세요.',position_changed:'자리나 거리가 바뀌었어요. 화면 기준을 다시 잡아주세요.',stale:'새 카메라 신호를 기다리고 있어요.'};
let latestPresence=null,lastTray='';
function applyFocus(sample){
 const editing=!$('region-editor').hidden;
 if(editing)sample={...sample,validity:'unknown',validated:false,presence:{ready:false,state:'unknown'}};
 focus.enabled=$('focus-enabled').checked;
 const mode='screen';
 const result=focus.update(sample,{mode,running:session?.status==='running',helping:busy||session?.busy||voice.isHelping(),study:tracker.regions.study,notes:tracker.regions.notes,overlay:overlayBounds});
 let title=names[result.state],detail='화면을 향하는지 확인해요.';
 if(result.state==='unknown'){
  if(!tracker.running){title=tracker.loading?'카메라 준비 중':'감지 꺼짐';detail=tracker.loading?'로컬 시선 모델을 준비하고 있어요.':'감지 켜기를 눌러 화면 응시·이탈을 확인해요.';}
  else if(editing){title='질문할 화면 선택 중';detail='학습 화면으로 돌아오면 감지를 이어가요.';}
  else{title=sample.presence?.reason==='reference'||sample.presence?.reason==='unstable_reference'?'화면 기준 확인 중':'측정 불가';detail=reasons[sample.presence?.reason]||'측정이 불확실해서 알림을 유예해요.';}
 }else if(result.state==='paused'){
  title=!session||session.status==='ended'?'학습 시작 대기':!focus.enabled?'이탈 알림 꺼짐':'휴식·생각 유예 중';detail=!session?'학습을 시작하면 화면 방향 감지를 켜요.':!focus.enabled?'설정이나 메뉴 막대에서 이탈 알림을 켤 수 있어요.':'복귀하면 감지를 이어가요.';
 }else if(result.state==='helping')detail='질문을 듣거나 답변하는 동안은 잔소리하지 않아요.';
 else if(result.state==='away_pending')detail=`화면 밖 방향 ${Math.max(0,Math.floor((sample.at_ms-focus.awayAt)/1000))} / 8초 · 잠깐 움직임은 기다려요.`;
 else if(result.state==='away')detail='8초 이상 화면 밖 방향이 이어졌어요. 필기·생각 중이면 유예해주세요.';
 const presence=sample.presence,gazeLabel=!tracker.running?(tracker.loading?'시선 모델 준비 중':'시선 측정 꺼짐'):presence?.state==='on_screen'?'화면 응시 중':presence?.state==='away'?'화면 밖 방향':presence?.reason==='reference'?'화면 가운데를 2초 봐주세요':'시선 측정 불가';
 planner?.measurement({label:gazeLabel,state:!tracker.running?(tracker.loading?'preparing':'off'):presence?.state||'unknown',running:tracker.running,loading:tracker.loading,horizontal_deg:presence?.horizontal_deg??null,vertical_deg:presence?.vertical_deg??null,latency_ms:sample.latency_ms??null,precise:Boolean(sample.validated&&sample.pose_ok),hint:reasons[presence?.reason]||'카메라로 화면 응시·이탈 방향을 확인해요.'});
 $('focus-state').textContent=title;$('focus-evidence').textContent=detail;$('focus-state').closest('.focus-panel').dataset.state=result.state;$('focus-reference').disabled=!tracker.running;
 $('focus-notice').hidden=!result.notice;
 if(!result.notice&&nagBubbleVisible){nagBubbleVisible=false;bridge.window('bubble-clear-nag').catch(()=>{});}
 if(!result.notice&&speech.isActive()&&speech.kind()==='nag')speech.stop();
 if(result.notice){const line=$('nag-tone').value==='firm'?'화면 밖을 향한 지 꽤 됐어요. 자료로 돌아와 다음 한 줄을 읽어봐요.':'눈동자 출장이 길어졌네. 화면으로 돌아와서 한 줄만 더 읽자.';$('nag-text').textContent=line;if(!nagBubbleVisible){nagBubbleVisible=true;showBubble({kind:'nag',text:line,question:'',phase:'idle',show:true});}
  if(result.nag&&!$('nag-mute').checked&&$('nag-tone').value!=='notice'){speech.speak(line,'nag');}}
 const trayFocus=!tracker.running?'감지 꺼짐':title==='화면 기준 확인 중'?'기준 확인 중':({attending:'화면 응시 중',away_pending:'이탈 확인 중',away:'화면 이탈',unknown:'측정 불가',paused:'휴식 중',helping:'질문 중'})[result.state];
 const tray={running:Boolean(session&&session.status!=='ended'),paused:session?.status==='paused',camera:tracker.running,focus_enabled:focus.enabled,muted:$('nag-mute').checked,focus:trayFocus};
 const signature=JSON.stringify(tray);if(signature!==lastTray){lastTray=signature;bridge.window('tray-state',tray).catch(()=>{});}
}
tracker.sample=sample=>{lastSampleAt=sample.at_ms;latestPresence=sample.presence;applyFocus(sample);bridge.window('gaze-sample',sample).catch(()=>{});};
setInterval(()=>{bridge.window('overlay-bounds').then(b=>{overlayBounds=b;}).catch(()=>{});if(performance.now()-lastSampleAt>650)applyFocus({at_ms:performance.now(),validity:'unknown',validated:false,pose_ok:false,presence:{ready:Boolean(latestPresence?.ready),state:'unknown',reason:'stale'}});},250);
$('focus-reference').onclick=()=>{focus.reset();tracker.presence.reset();speech.stop();};
for(const id of ['focus-enabled','focus-sensitivity','nag-tone','nag-mute','voice-target']){
 const element=$(id),key='study-setting-'+id,saved=localStorage.getItem(key);
 if(saved!==null){if(element.type==='checkbox')element.checked=saved==='true';else if([...element.options].some(o=>o.value===saved))element.value=saved;}
 element.addEventListener('change',()=>{localStorage.setItem(key,element.type==='checkbox'?String(element.checked):element.value);if(id==='focus-enabled')focus.reset();if(id==='focus-sensitivity')tracker.presence.sensitivity=element.value;speech.stop();});
}
tracker.presence.sensitivity=$('focus-sensitivity').value;
function openSettings(id='settings'){
 if(!$('region-editor').hidden)$('region-cancel').click();
 $('settings').hidden=false;syncView();const target=$(id)||$('settings');
 for(let node=target;node&&node!==$('settings');node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
 target.scrollIntoView({block:'start'});
}
function syncView(){const settings=!$('settings').hidden;$('study-view').hidden=settings;$('settings-toggle').textContent=settings?'학습으로 돌아가기':'설정';$('settings-back').hidden=!settings;}
new MutationObserver(syncView).observe($('settings'),{attributes:true,attributeFilter:['hidden']});syncView();
$('settings-back').onclick=()=>{$('settings').hidden=true;};
async function askFromPad(value){
 if(busy||voice.isHelping()){await bridge.window('scratchpad-fail',{id:value.id,reason:'진행 중인 질문이 끝난 뒤 다시 물어봐주세요.'});return;}
 busy=true;speech.stop();
 try{
  if(!$('voice-consent').checked){openSettings('voice-settings');await bridge.window('show-main',{section:'voice-settings'});throw new Error('설정에서 현재 화면·자료 전송에 동의한 뒤 질문해주세요.');}
  await ensureAIStudy();await bridge.window('gaze-display',{display_id:$('monitor').value});
  const frame=await bridge.window('screen-prepare',{message:value.message,consent:true});
  const rect=$('voice-target').value==='manual'?await selectRegion('질문할 부분 선택',{display_id:frame.display.display_id,preview:frame.png}):frame.display;
  const result=await bridge.window('screen-submit',rect);
  await bridge.window('scratchpad-complete',{id:value.id,message:result.message,question:value.message});
  render(await bridge.request('GET',`/study/sessions/${session.id}`));
  if($('read-answer').checked)speech.speak(result.message.artifact?'정리한 내용을 확인해 주세요.':result.message.content,'answer');
 }catch(e){await bridge.window('screen-cancel').catch(()=>{});await bridge.window('scratchpad-fail',{id:value.id,reason:e.message}).catch(()=>{});error(e.message);}
 finally{busy=false;}
}
bridge.onAppAction?.(async event=>{
 if(event.action==='pad-query'){await askFromPad(event.value);return;}
 if(['voice-settings','focus-settings'].includes(event.action))openSettings(event.action);
 if(event.action==='plan-settings')openSettings('plan-settings');
 if(event.action==='plan-show')planner.show();
 if(event.action==='plan-camera')$('camera-toggle').click();
 if(event.action==='plan-toggle'||event.action==='plan-dismiss')planner.action(event.action.slice(5),event.value);
 if(event.action==='settings'||event.action==='materials'){
  if(!$('region-editor').hidden)$('region-cancel').click();
  if(document.body.classList.contains('collapsed'))document.body.classList.toggle('collapsed',await bridge.window('collapse'));
  openSettings(event.action==='materials'?'materials-manage':'settings');
 }
 if(event.action==='history'){$('settings').hidden=true;if(session&&session.status!=='ended')$('learning').hidden=false;$('chat').scrollIntoView({block:'center'});}
 if(event.action==='bubble-start'){try{await startStudy();}catch(e){error(e.message);}}
 if(event.action==='bubble-add-material')await materials.add();
 if(event.action==='bubble-cancel')voice.stop();
 if(event.action==='bubble-tts-stop')speech.stop();
 if(event.action==='bubble-scratchpad')bridge.window('scratchpad-show');
 if(event.action==='bubble-consent'){$('voice-consent').checked=Boolean(event.value);$('voice-consent').dispatchEvent(new Event('change'));}
 if(event.action==='bubble-grace'){grace('notes');showBubble({kind:'info',text:'필기·생각할 동안 1분은 조용히 있을게요.',phase:'idle',show:true});}
 if(event.action==='bubble-false-alarm'){grace('false_alarm');showBubble({kind:'info',text:'오탐으로 기록했어요. 필요하면 감도를 여유롭게 바꿔주세요.',phase:'idle',show:true});}
 if(event.action==='monitor')$('camera-toggle').click();
 if(event.action==='pause')$('pause').click();
 if(event.action==='focus-enabled'||event.action==='nag-mute'){$(event.action).checked=Boolean(event.value);$(event.action).dispatchEvent(new Event('change'));}
});
$('heart-toggle').onclick=async()=>{try{error();heart(await bridge.request('POST',`/study/heart/${heartReading?'disconnect':'connect'}`,{}));}catch(e){error(e.message);}};
let starting=null;
async function startStudy(){
 if(session&&session.status!=='ended'){render(session);$('settings').hidden=true;return;}
 if(starting)return starting;
 $('start').disabled=true;$('start').textContent='학습 시작 중…';
 starting=(async()=>{
  error();render(await bridge.request('POST','/study/sessions',{goal:$('goal').value.trim()||'화면과 첨부 자료 이해하기',material:materials.text(),minutes:Number($('minutes').value),ai_enabled:$('ai').checked}));
  $('settings').hidden=true;
  if(materials.text().trim())planner.materialChanged();
  if($('focus-enabled').checked)tracker.optionalReady().then(available=>{if(available&&session?.status==='running')return tracker.startMonitoring();}).catch(e=>error(e.message));
 })();
 try{await starting;}finally{starting=null;$('start').disabled=!ready;$('start').textContent='학습 시작';}
}
$('start').onclick=()=>startStudy().catch(e=>error(e.message));
$('pause').onclick=async()=>{try{voice.stop();render(await bridge.request('POST',`/study/sessions/${session.id}/pause`,{paused:session.status==='running'}));}catch(e){error(e.message);}};
$('end').onclick=async()=>{try{voice.stop();tracker.stop();focus.reset();render(await bridge.request('POST',`/study/sessions/${session.id}/end`,{}));}catch(e){error(e.message);}};
$('new-session').onclick=()=>{voice.stop();focus.reset();session=null;anchor=null;lastMessageIds.clear();$('chat').replaceChildren();$('setup').hidden=false;$('summary').hidden=true;$('minutes').disabled=false;$('goal-display').textContent='작은 목표부터 시작해요';$('timer-label').textContent='오늘의 학습';clock();};
$('settings-toggle').onclick=()=>{$('settings').hidden=!$('settings').hidden;};$('close').onclick=()=>bridge.window('close');$('collapse').onclick=async()=>document.body.classList.toggle('collapsed',await bridge.window('collapse'));
bridge.onLost(()=>{voice.stop();ready=false;$('start').disabled=true;$('start').textContent='연결 끊김';tracker.stop();error('학습 서버 연결이 끊겼어요. 앱을 다시 실행해주세요.');});
(async()=>{try{const v=await bridge.ready();if(!v?.ok)throw new Error(v?.message||'연결 실패');ready=true;syncPad();planner.restore();$('start').disabled=false;$('start').textContent='학습 시작';$('connection').textContent=v.health.study_model.configured?'AI 연결됨':'AI 연결 설정 필요';bubbleConfigured=Boolean(v.health.study_model.configured);bridge.window('scratchpad-show').catch(()=>{});if(!bubbleConfigured)$('ai').checked=false;else voice.initializeShortcut();}catch(e){$('start').textContent='연결 확인 필요';error(e.message);}})();
setInterval(async()=>{clock();if(!ready)return;try{if(session&&session.status!=='ended')render(await bridge.request('GET',`/study/sessions/${session.id}`));else heart(await bridge.request('GET','/study/heart'));}catch{}},2000);
window.addEventListener('beforeunload',()=>{voice.stop();tracker.stop();});
