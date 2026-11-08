const $=id=>document.getElementById(id);
export function setupGazeAddon({bridge,onChange=()=>{},error}){
 let state={installed:false,busy:false},ready;
 function render(value){if(!value)return;state=value;const labels={verifying:'패키지 확인 중',extracting:'시선 기능 설치 중',checking:'실행 환경 확인 중'};$('gaze-addon-status').textContent=state.installed?'시선 감지 설치됨':state.busy?`${labels[state.phase]||'설치 중'} · ${Math.round(state.percent||0)}%`:state.message||'시선 감지 미설치 · 음성 도움은 바로 사용할 수 있어요.';$('gaze-addon-install').hidden=state.installed;$('gaze-addon-install').disabled=state.busy;$('gaze-addon-install').textContent=state.busy?'설치 중…':'시선 감지 설치…';$('gaze-addon-cancel').hidden=!state.busy;$('gaze-addon-progress').hidden=!state.busy;$('gaze-addon-progress').value=state.percent||0;onChange(state);}
 async function refresh(){const value=await bridge.window('gaze-addon-status');render(value);return Boolean(value?.installed);}
 async function install(){try{error();const value=await bridge.window('gaze-addon-install');render(value);return Boolean(value?.installed);}catch(e){error(e.message);await refresh();return false;}}
 $('gaze-addon-install').onclick=install;$('gaze-addon-cancel').onclick=()=>bridge.window('gaze-addon-cancel').catch(e=>error(e.message));bridge.onGazeInstall?.(render);
 ready=refresh().catch(e=>{error(e.message);return false;});
 return {ready,refresh,install,available:()=>state.installed,busy:()=>state.busy};
}
