const $=id=>document.getElementById(id),bridge=window.scratchpadBridge;
let state={entries:[],draft:'',expanded:false,busy:false},lastEntries='',draftTimer,editing=null,sending=false;
function error(text=''){$('error').textContent=text;$('error').hidden=!text;if(text&&!state.expanded)bridge.action('expand').catch(()=>{});}
async function act(name,value){try{error();return await bridge.action(name,value);}catch(e){error(e.message);}}
function render(value){
 state=value;const phase=value.voice?.phase||'idle';$('voice-question').textContent=phase==='recording'?'보내기':phase==='preparing'?'준비 중':phase==='processing'?'답변 중':'말하기';$('voice-question').disabled=['preparing','processing'].includes(phase)||(value.busy&&phase!=='recording');$('voice-question').setAttribute('aria-label',phase==='recording'?'녹음 끝내고 보내기':'음성으로 질문');if(value.warning)error(value.warning);document.body.dataset.expanded=String(Boolean(value.expanded));$('conversation').hidden=!value.expanded;
 const entries=value.entries.filter(e=>e.kind!=='file');$('toggle').hidden=!entries.length&&!value.expanded;$('toggle').textContent=value.expanded?'접기':'대화';$('toggle').setAttribute('aria-expanded',String(Boolean(value.expanded)));
 const context=value.context||{};$('study-context').textContent=(context.materials||[]).join(' · ')||'질문할 때의 화면을 함께 참고해요.';$('study-context').title=context.goal||'';
 $('add').disabled=Boolean(value.busy||sending||phase!=='idle');$('add').textContent=editing?'수정 저장':value.busy?'답변 중…':'채팅하기';
 if(document.activeElement!==$('draft')&&!editing)$('draft').value=value.draft||'';
 const signature=JSON.stringify(entries);if(signature===lastEntries)return;lastEntries=signature;$('empty').hidden=Boolean(entries.length);$('entries').hidden=!entries.length;
 const nodes=entries.map(entry=>{
  const row=document.createElement('article');row.className='entry '+entry.status;
  if(entry.question){const question=document.createElement('p');question.className='question';question.textContent=entry.question;row.append(question);}
  const head=document.createElement('div');head.className='entry-head';const tag=document.createElement('span');tag.className='tag';tag.textContent=({note:'메모',request:'답변 준비 중',translation:'번역',summary:'요약',answer:'Study Signal'})[entry.kind]||'Study Signal';const time=document.createElement('time');time.textContent=new Intl.DateTimeFormat('ko',{hour:'numeric',minute:'2-digit'}).format(new Date(entry.created_at));head.append(tag,time);
  function button(label,callback){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=callback;head.append(b);}
  if(entry.status!=='pending'){button('복사',()=>act('copy',entry.id));if(entry.kind==='note')button('수정',()=>{editing=entry.id;$('draft').maxLength=60000;$('draft').value=entry.body;$('draft').focus();$('add').disabled=false;$('add').textContent='수정 저장';});button('삭제',()=>act('remove',entry.id));}
  row.append(head);if(['translation','summary'].includes(entry.kind)){const title=document.createElement('h2');title.textContent=entry.title;row.append(title);}const body=document.createElement('div');body.className='body';body.textContent=entry.body;row.append(body);
  if(entry.summary){const summary=document.createElement('div');summary.className='summary';const label=document.createElement('span');label.className='summary-label';label.textContent='핵심 요약';summary.append(label,document.createTextNode(entry.summary));row.append(summary);}
  if(entry.source){const source=document.createElement('p');source.className='source';source.textContent=entry.source;row.append(source);}return row;
 });$('entries').replaceChildren(...nodes);$('entries').scrollTop=$('entries').scrollHeight;
}
async function send(){
 const body=$('draft').value.trim();if(!body||sending||state.busy||state.voice?.phase&&state.voice.phase!=='idle')return;clearTimeout(draftTimer);sending=true;$('add').disabled=true;
 try{error();if(editing)await bridge.action('edit',{id:editing,body});else await bridge.action('query',{message:body});editing=null;$('draft').maxLength=4000;if($('draft').value.trim()===body)$('draft').value='';await bridge.action('draft',$('draft').value);}
 catch(e){error(e.message);}finally{sending=false;$('add').disabled=Boolean(state.busy||state.voice?.phase&&state.voice.phase!=='idle');$('add').textContent=state.busy?'답변 중…':'채팅하기';}
}
$('voice-question').onclick=()=>act('voice');
$('composer').onsubmit=e=>{e.preventDefault();send();};$('draft').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
$('draft').oninput=()=>{if(editing)return;clearTimeout(draftTimer);const text=$('draft').value;draftTimer=setTimeout(()=>act('draft',text),400);};
$('toggle').onclick=()=>act(state.expanded?'collapse':'expand');$('close').onclick=()=>act('hide');
document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files.length)return;const text=e.dataTransfer.getData('text/plain');if(text){$('draft').value=($('draft').value+text).slice(0,4000);$('draft').dispatchEvent(new Event('input'));$('draft').focus();}});
function opacity(){document.documentElement.style.setProperty('--overlay-alpha',Math.min(98,Math.max(72,Number(localStorage.getItem('study-opacity'))||90))/100);}opacity();window.addEventListener('storage',e=>{if(e.key==='study-opacity')opacity();});
bridge.onState(render);bridge.action('ready').then(render).catch(e=>error(e.message));
