import {setupGazeAddon} from './gaze-addon-ui.mjs';
import {GazeTracker} from './gaze.mjs';
const $=id=>document.getElementById(id),bridge=window.studyBridge;
export function setupGaze(aggregate,error){
 let addon=null;
 const tracker=new GazeTracker($('camera'),v=>{
  $('gaze-label').textContent=v.label;$('camera-dot').classList.toggle('on',tracker.running);
  $('camera-preview').hidden=v.status==='off';$('camera-instruction').textContent=v.label;
  $('camera-toggle').textContent=tracker.running||v.status==='loading'?'감지 끄기':'감지 켜기';
  if(v.status==='off'&&addon&&!addon.available()){$('gaze-label').textContent='시선 기능 미설치';$('camera-toggle').textContent=addon.busy()?'설치 중…':'시선 설치';}
  if(v.error)error(v.error);
 },aggregate,()=>{});
 addon=setupGazeAddon({bridge,error,onChange:state=>{if(!tracker.running&&!tracker.loading){$('camera-toggle').textContent=state.installed?'감지 켜기':state.busy?'설치 중…':'시선 설치';$('camera-toggle').disabled=state.busy;$('gaze-label').textContent=state.installed?'카메라 꺼짐':state.busy?'시선 기능 설치 중':'시선 기능 미설치';}}});
 tracker.optionalReady=async()=>{await addon.ready;return addon.available();};tracker.gazeAvailable=()=>addon.available();
 // Always use screen direction. Legacy pixel calibration is not part of the app workflow.
 localStorage.removeItem('study-setting-focus-mode');
 tracker.regions={study:null,notes:null};
 async function displays(){const list=await bridge.window('displays'),previous=$('monitor').value||localStorage.getItem('study-monitor');$('monitor').replaceChildren(...list.map(d=>{const o=document.createElement('option');o.value=d.id;o.textContent=`${d.label} · ${d.width}×${d.height}`;return o;}));if(list.some(d=>String(d.id)===previous))$('monitor').value=previous;}
 displays().catch(e=>error(e.message));
 navigator.mediaDevices.addEventListener('devicechange',async()=>{
  if(!tracker.running||!tracker.cameraId)return;
  try{const devices=await navigator.mediaDevices.enumerateDevices();if(tracker.running&&!devices.some(d=>d.kind==='videoinput'&&d.deviceId===tracker.cameraId)){tracker.stop();error('사용하던 카메라 연결이 끊겼어요. 다시 연결한 뒤 감지를 켜주세요.');}}
  catch{/* The active video track's ended handler remains authoritative. */}
 });
 const selected=()=>({display_id:$('monitor').value});
 $('monitor').onchange=()=>{localStorage.setItem('study-monitor',$('monitor').value);bridge.window('voice-cancel').catch(()=>{});bridge.window('gaze-display',selected()).catch(e=>error(e.message));tracker.stop();tracker.display=null;};
 tracker.startMonitoring=async()=>{await addon.ready;if(!addon.available())throw new Error('설정에서 시선 감지를 설치해주세요. 음성 질문은 바로 사용할 수 있어요.');if(tracker.running||tracker.loading)return;tracker.setDisplay(await bridge.window('gaze-display',selected()));await tracker.start();};
 $('camera-toggle').onclick=async()=>{try{error();await addon.ready;if(!addon.available()){await bridge.window('show-main',{section:'focus-settings'});await addon.install();return;}if(tracker.running||tracker.loading){tracker.stop();return;}await tracker.startMonitoring();}catch(e){error(e.message);}};
 bridge.onDisplayChanged(async()=>{const running=tracker.running||tracker.loading;tracker.stop();tracker.display=null;bridge.window('voice-cancel').catch(()=>{});try{await displays();if(running)await tracker.startMonitoring();}catch(e){error(e.message);}});
 const opacity=Math.min(98,Math.max(72,Number(localStorage.getItem('study-opacity'))||90));
 function setOpacity(n){document.documentElement.style.setProperty('--overlay-alpha',n/100);$('opacity-value').textContent=n+'%';localStorage.setItem('study-opacity',String(n));}
 $('opacity').value=opacity;setOpacity(opacity);$('opacity').oninput=()=>setOpacity(Number($('opacity').value));
 return tracker;
}
