export function spokenText(text){
 return String(text||'').replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+/g,'').replace(/[*#`]/g,'').trim().slice(0,1800);
}

export function createSpeaker({request,makeAudio=()=>new Audio(),makeURL=blob=>URL.createObjectURL(blob),revokeURL=url=>URL.revokeObjectURL(url),systemSpeak,systemCancel=()=>{},onState=()=>{}}){
 let generation=0,audio=null,url=null,finish=null,active=false,kind=null;
 function state(phase,error=''){active=phase!=='idle';onState({phase,active,kind,error});}
 function stop(){generation++;if(audio){audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute?.('src');audio=null;}if(url){revokeURL(url);url=null;}const done=finish;finish=null;done?.();systemCancel();state('idle');}
 async function speak(text,options={}){
  stop();const current=generation;kind=options.kind||'answer';text=spokenText(text);if(!text)return;
  try{
   if(options.mode==='system'){
    state('playing');await systemSpeak(text);return;
   }
   if(!options.consent)throw new Error('AI 음성은 문장 전송 동의 후 사용할 수 있어요.');
   state('loading');const result=await request({text,voice:options.voice||'Aoede',kind,consent:true});
   if(current!==generation)return;
   if(result?.mime!=='audio/wav'||typeof result.audio!=='string'||result.audio.length>8_000_100)throw new Error('음성 응답 형식을 확인하지 못했어요.');
   const binary=atob(result.audio);url=makeURL(new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:result.mime}));audio=makeAudio();audio.src=url;state('playing');
   await new Promise((resolve,reject)=>{finish=resolve;audio.onended=resolve;audio.onerror=()=>reject(new Error('음성을 재생하지 못했어요.'));Promise.resolve(audio.play()).catch(()=>reject(new Error('음성 재생을 허용한 뒤 다시 시도해주세요.')));});
  }catch(error){if(current===generation){stop();state('idle',error.message);}return;}
  finally{if(current===generation)stop();}
 }
 return {speak,stop,isActive:()=>active,kind:()=>kind};
}

export function setupSpeech({bridge,onState=()=>{}}){
 const $=id=>document.getElementById(id);let systemDone=null;
 const speaker=createSpeaker({request:body=>bridge.request('POST','/study/speech',body),
  systemSpeak:text=>new Promise(resolve=>{systemDone=resolve;const voice=new SpeechSynthesisUtterance(text);voice.lang='ko-KR';voice.onend=voice.onerror=resolve;speechSynthesis.speak(voice);}),
  systemCancel:()=>{speechSynthesis.cancel();systemDone?.();systemDone=null;},
  onState:value=>{$('tts-stop').hidden=!value.active;$('tts-status').textContent=value.error||(value.phase==='loading'?'자연스러운 음성을 만들고 있어요…':value.phase==='playing'?'음성으로 읽고 있어요.':'AI 음성은 답변·알림 문장을 OpenRouter로 보내며, 생성 음성은 저장하지 않아요.');onState(value);}});
 for(const id of ['tts-mode','tts-voice']){const element=$(id),saved=localStorage.getItem('study-'+id);if([...element.options].some(o=>o.value===saved))element.value=saved;element.onchange=()=>{speaker.stop();localStorage.setItem('study-'+id,element.value);};}
 const speak=(text,kind='answer')=>speaker.speak(text,{kind,mode:$('tts-mode').value,voice:$('tts-voice').value,consent:$('voice-consent').checked});
 $('tts-preview').onclick=()=>speak('어려운 부분은 같이 천천히 풀어봐요. 지금 보고 있는 화면을 바탕으로 설명해 줄게요.','preview');$('tts-stop').onclick=speaker.stop;
 return {...speaker,speak};
}
