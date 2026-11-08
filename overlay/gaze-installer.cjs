const fs=require('node:fs'),path=require('node:path');const {spawn}=require('node:child_process');const {createInterface}=require('node:readline');
function createGazeInstaller({root,core,manifest,development=null,onState=()=>{},spawnImpl=spawn}){
 let child=null,phase='not_installed',percent=0,message='',cancelled=false;
 const descriptor=manifest?JSON.parse(fs.readFileSync(manifest,'utf8')):null;
 if(descriptor&&(!/^[a-f0-9]{64}$/.test(descriptor.sha256)||descriptor.id!=='study-signal-gaze-arm64-v1'))throw new Error('시선 추가 패키지 정보를 확인해주세요.');
 function installed(){if(development)return fs.existsSync(development.python)&&fs.existsSync(development.weights);try{const marker=JSON.parse(fs.readFileSync(path.join(root,'installed.json'),'utf8'));return marker.id===descriptor.id&&marker.sha256===descriptor.sha256&&fs.existsSync(path.join(root,'service/study-service'))&&fs.existsSync(path.join(root,'models/unigaze_l16_joint.safetensors'));}catch{return false;}}
 function status(){const ready=installed();return {installed:ready,busy:Boolean(child),phase:child?phase:ready?'installed':message?'error':'not_installed',percent:ready&&!child?100:percent,message,package:descriptor?{name:descriptor.filename,bytes:descriptor.bytes}:null,development:Boolean(development)};}
 const publish=()=>onState(status());
 async function install(file){
  if(child)throw new Error('시선 패키지를 설치하고 있어요.');if(development)throw new Error('개발 실행에서는 신경망 시선 설치.command를 사용해주세요.');
  if(!core||!descriptor||fs.statSync(file).size!==descriptor.bytes)throw new Error('이 앱과 함께 배포된 시선 추가 패키지 ZIP을 선택해주세요.');
  cancelled=false;message='';phase='verifying';percent=0;
  return new Promise((resolve,reject)=>{
   child=spawnImpl(core,['install-gaze','--archive',file,'--destination',root,'--sha256',descriptor.sha256],{stdio:['ignore','pipe','pipe'],env:{...process.env,HF_HUB_OFFLINE:'1'}});const active=child;publish();const lines=createInterface({input:active.stdout});let done=false;
   lines.on('line',line=>{if(line.length>1000)return;try{const value=JSON.parse(line);if(['verifying','extracting','checking','installed','error'].includes(value.phase)&&Number.isFinite(value.percent)){phase=value.phase;percent=Math.max(0,Math.min(100,value.percent));if(value.phase==='error')message=String(value.message||'설치를 완료하지 못했어요.').slice(0,200);publish();}}catch{}});active.stderr.on('data',()=>{});
   const finish=(code)=>{if(done)return;done=true;lines.close();child=null;if(code===0&&installed()){phase='installed';percent=100;message='';publish();resolve(status());}else{phase='not_installed';percent=0;message=cancelled?'':message||'시선 설치에 실패했어요. 패키지와 남은 공간을 확인해주세요.';publish();reject(new Error(cancelled?'시선 설치를 취소했어요.':message));}};
   active.once('error',()=>finish(-1));active.once('close',finish);
  });
 }
 return {status,installed,install,cancel:()=>{if(child){cancelled=true;child.kill('SIGTERM');}}};
}
module.exports={createGazeInstaller};
