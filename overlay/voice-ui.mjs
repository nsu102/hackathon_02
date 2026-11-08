const $=id=>document.getElementById(id),bridge=window.studyBridge;
export function setupVoice({getSession,onAnswer,error,onStatus=()=>{},speaker,onActivate=async()=>{}}){
 let recorder=null,stream=null,chunks=[],audioContext=null,analyser=null,raf=null,startAt=0,voicedMs=0,lastAt=0,id=null,discard=true,helping=false,generation=0,phase='idle',control='button',padRequest=null;
 function status(text,next=phase){
  phase=next;$('voice-status').textContent=text;$('voice-indicator').hidden=phase!=='recording';
  $('voice-cancel').hidden=!['preparing','recording'].includes(phase);
  $('voice-talk').textContent=phase==='recording'?'보내기':phase==='preparing'?'준비 중…':phase==='processing'?'답변 준비 중…':'말하기';$('voice-talk').disabled=['preparing','processing'].includes(phase);
  onStatus({text,phase,attachment:!$('voice-attachment').hidden});
 }
 function cleanup(){cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});stream=null;audioContext?.close().catch(()=>{});audioContext=null;analyser=null;}
 function cancel(text='음성 질문을 취소했어요.'){
  if(padRequest){padRequest.then(id=>bridge.window('scratchpad-fail',{id,reason:text})).catch(()=>{});padRequest=null;}
  speaker.stop();generation++;discard=true;chunks=[];if(recorder?.state==='recording')recorder.stop();cleanup();helping=false;$('voice-attachment').hidden=true;status(text,'idle');
 }
 async function fail(text){permissions();await bridge.window('voice-cancel').catch(()=>{});cancel(text);error(text);}
 async function start(data){
  if(data.control!=='button'||getSession()?.status!=='running'||getSession()?.busy){await bridge.window('voice-cancel');cancel('AI 학습을 시작한 뒤 말해주세요.');return;}
  speaker.stop();const current=++generation;helping=true;discard=false;id=data.id;control='button';chunks=[];voicedMs=0;$('voice-attachment').hidden=!data.attachment;status('마이크를 준비하고 있어요…','preparing');
  try{
   const acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(discard||current!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;
   if(!MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))throw new Error('WebM/Opus 녹음을 지원하지 않아요.');
   const context=new AudioContext();audioContext=context;await context.resume();if(discard||current!==generation){context.close().catch(()=>{});acquired.getTracks().forEach(t=>t.stop());return;}
   analyser=context.createAnalyser();analyser.fftSize=1024;audioContext.createMediaStreamSource(stream).connect(analyser);
   const bytes=new Float32Array(analyser.fftSize);lastAt=startAt=performance.now();
   function meter(){if(!analyser||current!==generation)return;const at=performance.now();analyser.getFloatTimeDomainData(bytes);const rms=Math.sqrt(bytes.reduce((sum,v)=>sum+v*v,0)/bytes.length);if(rms>.012)voicedMs+=Math.min(100,at-lastAt);lastAt=at;raf=requestAnimationFrame(meter);}meter();
   stream.getAudioTracks()[0].onended=()=>fail('마이크 연결이 끊겨 녹음을 폐기했어요.');
   recorder=new MediaRecorder(stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:64000});
   recorder.ondataavailable=e=>{if(current===generation&&!discard&&e.data.size)chunks.push(e.data);};
   recorder.onerror=()=>{if(current===generation)fail('녹음 오류로 폐기했어요.');};
   recorder.onstop=async()=>{
    if(discard||current!==generation)return;cleanup();
    const duration=Math.round(performance.now()-startAt);
    if(voicedMs<180){await fail('질문 음성이 들리지 않았어요. 다시 말해주세요.');return;}
    const blob=new Blob(chunks,{type:'audio/webm'});chunks=[];
    if(blob.size>2000000){await fail('녹음이 너무 커서 폐기했어요.');return;}
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    if(discard||current!==generation)return;status('질문을 받아 적고, 고정한 화면을 읽고 있어요…','processing');
    try{await bridge.window('voice-submit',{id,audio:btoa(binary),duration_ms:duration,speech_detected:true});}catch(e){await fail(e.message);}
   };
   recorder.start();status('녹음 중 · 다 말하면 보내기를 눌러주세요 · 최대 20초','recording');if(!padRequest)padRequest=bridge.window('scratchpad-begin',{listening:true}).catch(()=>null);
  }catch(e){if(current===generation)await fail(e.message);}
 }
 async function permissions(){try{const p=await bridge.window('permission-status');if(!p)return;const names={granted:'허용',denied:'거절',restricted:'제한',unknown:'확인 필요','not-determined':'아직 요청 전'};$('permission-status').textContent=`${p.runtime} · 마이크 ${names[p.microphone]||p.microphone} · 화면 ${names[p.screen]||p.screen}`;$('permission-app').textContent=[p.runtime,p.version,p.app_path].filter(Boolean).join(' · ');$('permission-screen-reset').disabled=p.packaged===false;}catch(e){$('permission-status').textContent=e.message;}}
 $('permission-screen-test').onclick=async()=>{const button=$('permission-screen-test');button.disabled=true;$('permission-status').textContent='화면 권한과 실제 캡처를 확인하고 있어요…';try{await bridge.window('gaze-display',{display_id:$('monitor').value});const result=await bridge.window('permission-screen-test');await permissions();if(result?.ok)$('permission-status').textContent+=' · 캡처 테스트 성공 (전송 없음)';}catch(e){await permissions();error(e.message);}finally{button.disabled=false;}};
 $('permission-screen-reset').onclick=async()=>{const button=$('permission-screen-reset');button.disabled=true;try{await bridge.window('permission-screen-reset');$('permission-status').textContent='화면 권한을 초기화했어요. 다시 열린 앱을 macOS에서 허용해주세요.';}catch(e){error(e.message);button.disabled=false;}};
 $('permission-check').onclick=permissions;$('permission-mic').onclick=()=>bridge.window('permission-settings',{type:'microphone'});$('permission-screen').onclick=()=>bridge.window('permission-settings',{type:'screen'});$('app-restart').onclick=async()=>{await bridge.window('app-restart');};
 async function talk(){
  if(phase==='recording'){status('녹음을 보내고 있어요.','processing');try{await bridge.window('voice-button-release');}catch(e){await fail(e.message);}return;}
  if(phase!=='idle')return;
  if(!$('voice-consent').checked){await bridge.window('show-main',{section:'voice-settings'});throw new Error('설정에서 음성·현재 화면 전송에 동의한 뒤 말하기를 눌러주세요.');}
  speaker.stop();helping=true;status('학습과 화면을 준비하고 있어요.','preparing');
  try{await onActivate();await bridge.window('gaze-display',{display_id:$('monitor').value});await bridge.window('voice-button-start',{consent:true,target:'screen'});}
  catch(e){cancel(e.message);throw e;}
 }
 $('voice-talk').onclick=()=>talk().catch(e=>error(e.message));
 $('voice-consent').onchange=()=>{if(!$('voice-consent').checked){bridge.window('voice-cancel').catch(()=>{});cancel('전송 동의를 해제했어요.');}};
 const consentSaved=localStorage.getItem('study-voice-consent');if(consentSaved!==null)$('voice-consent').checked=consentSaved==='true';
 $('voice-consent').addEventListener('change',()=>{localStorage.setItem('study-voice-consent',String($('voice-consent').checked));onStatus({phase,text:$('voice-status').textContent,attachment:!$('voice-attachment').hidden});});
 $('voice-cancel').onclick=()=>{bridge.window('voice-cancel').catch(()=>{});cancel();};
 $('read-answer').onchange=()=>{if(!$('read-answer').checked){speaker.stop();if(phase==='idle')helping=false;}localStorage.setItem('study-read-answer',String($('read-answer').checked));};
 if(localStorage.getItem('study-read-default-v2')!=='1'){localStorage.setItem('study-read-answer','false');localStorage.setItem('study-setting-nag-mute','true');localStorage.setItem('study-read-default-v2','1');}
 const readSaved=localStorage.getItem('study-read-answer');if(readSaved!==null)$('read-answer').checked=readSaved==='true';
 bridge.onVoice(async event=>{
  if(event.type==='failure'){error(event.data);return;}
  if(event.type==='start')return start(event.data);
  if(event.type==='release'){if(recorder?.state==='recording'&&!discard&&event.data===id)recorder.stop();else await fail('준비 전에 녹음이 끝나 질문을 폐기했어요.');}
  if(event.type==='cancel')cancel(event.data);
  if(event.type==='processing'){
   helping=true;status('알겠습니다. 현재 화면을 확인하고 스크래치패드에 정리할게요.','processing');
   if(!padRequest)padRequest=bridge.window('scratchpad-begin').catch(()=>null);
   if($('read-answer').checked)speaker.speak('알겠습니다. 화면을 확인할게요.','answer');
  }
  if(event.type==='answer'){
   const current=generation,pending=padRequest;padRequest=null;
   try{const padId=pending?await pending:null;if(current!==generation){await bridge.window('scratchpad-fail',{id:padId,reason:'요청이 취소됐어요.'});return;}await bridge.window('scratchpad-complete',{id:padId,message:event.data.message,question:event.data.transcript});}catch(e){error('답변은 받았지만 패드에 저장하지 못했어요. '+e.message);}
   if(current!==generation)return;
   helping=false;status('답변했어요. 이어서 궁금한 걸 말해주세요.','idle');await onAnswer(event.data);
   if($('read-answer').checked)speaker.speak(event.data.message.artifact?'스크래치패드에서 확인해 주세요.':event.data.message.content,'answer');
  }
 });
 function initialize(){localStorage.removeItem('study-shortcut-enabled');localStorage.removeItem('study-setting-voice-target');permissions();}
 return {initialize,talk,showShortcut:()=>talk().catch(e=>error(e.message)),state:()=>({phase,attachment:!$('voice-attachment').hidden}),isHelping:()=>helping||(speaker.isActive()&&speaker.kind()!=='nag'),stop:()=>{bridge.window('voice-cancel').catch(()=>{});cancel();speaker.stop();}};
}
