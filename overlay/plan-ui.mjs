const $=id=>document.getElementById(id);
export function setupPlan({bridge,material,goal}){
 let plan=null,loading=false,stale=false,message='',saving=false,generation=0,requestKey=null,currentKey=null,gaze={label:'시선 측정 꺼짐',state:'off',running:false,loading:false};
 const visible=$('checklist-visible'),automatic=$('checklist-ai');visible.checked=localStorage.getItem('study-plan-visible')!=='false';automatic.checked=localStorage.getItem('study-plan-ai')==='true';
 function publish(){
  bridge.window('checklist-update',{plan,gaze,loading,stale,error:message,saving,visible:visible.checked&&Boolean(plan||loading||gaze.running||gaze.loading)}).catch(()=>{});
  $('checklist-status').textContent=message||(loading?'자료에서 학습 순서를 정리하고 있어요…':plan?`${plan.items.filter(v=>v.done).length}/${plan.items.length} 완료 · ${plan.source==='ai'?'AI 학습 계획':'자료 초안'} · 직접 체크하면 저장돼요.`:'자료를 추가하면 좌상단에 학습 순서를 띄워요.');
  $('checklist-regenerate').disabled=loading||!material().trim();$('checklist-regenerate').textContent=plan?.items.some(v=>v.done)?'목록 다시 만들기 · 완료 표시 초기화':'자료로 목록 다시 만들기';
  $('checklist-editor').replaceChildren(...(plan?.items||[]).map(item=>{const li=document.createElement('li'),row=document.createElement('div'),check=document.createElement('input'),input=document.createElement('input'),details=document.createElement('details'),summary=document.createElement('summary');check.type='checkbox';check.checked=item.done;check.disabled=loading||saving||stale;check.setAttribute('aria-label',item.label+' 완료');check.onchange=()=>update(item.id,{done:check.checked});input.type='text';input.value=item.label;input.maxLength=120;input.disabled=loading||saving||stale;input.setAttribute('aria-label','학습 항목 수정');input.onchange=()=>update(item.id,{label:input.value});row.append(check,input);summary.textContent='자료 근거';details.append(summary,document.createTextNode(item.evidence));li.append(row,details);return li;}));
 }
 async function update(id,value){
  if(!plan||loading||saving||stale)return;const current=plan.id;saving=true;message='';publish();
  try{const result=await bridge.request('POST',`/study/plans/${current}/items/${id}`,value);if(plan?.id===current)plan=result;}
  catch(e){message=e.message;}finally{saving=false;publish();}
 }
 async function generate(regenerate=false){
  const text=material().trim(),key=JSON.stringify([goal().trim(),text,automatic.checked]);if(!regenerate&&loading&&requestKey===key)return;if(!regenerate&&plan&&!stale&&currentKey===key){publish();return;}const version=++generation;requestKey=key;if(!text){plan=null;loading=false;stale=false;message='공부할 자료를 먼저 추가해주세요.';localStorage.removeItem('study-active-plan');publish();return;}
  loading=true;stale=Boolean(plan);message='';publish();
  try{const result=await bridge.request('POST','/study/plans',{goal:goal().trim(),material:text,ai_enabled:automatic.checked,consent:automatic.checked,regenerate});if(version!==generation)return;plan=result;currentKey=key;stale=false;localStorage.setItem('study-active-plan',plan.id);}
  catch(e){if(version===generation)message=e.message;}
  finally{if(version===generation){loading=false;requestKey=null;publish();}}
 }
 async function restore(){const current=generation,id=localStorage.getItem('study-active-plan');if(!id)return;try{const result=await bridge.request('GET',`/study/plans/${id}`);if(current===generation){plan=result;if(!$('goal').value&&result.goal)$('goal').value=result.goal;currentKey=JSON.stringify([goal().trim(),material().trim(),automatic.checked]);publish();}}catch{localStorage.removeItem('study-active-plan');}}
 visible.onchange=()=>{localStorage.setItem('study-plan-visible',String(visible.checked));publish();};
 automatic.onchange=()=>{localStorage.setItem('study-plan-ai',String(automatic.checked));if(material().trim()&&!plan?.items.some(v=>v.done))generate();else if(automatic.checked){message='다음 자료부터 AI로 정리해요. 현재 목록을 바꾸려면 다시 만들기를 눌러주세요.';publish();}};
 $('checklist-regenerate').onclick=()=>generate(true);publish();
 return {measurement:value=>{gaze=value;bridge.window('checklist-update',{gaze,visible:visible.checked&&Boolean(plan||loading||gaze.running||gaze.loading)}).catch(()=>{});},restore,materialChanged:()=>generate(),show:()=>{visible.checked=true;localStorage.setItem('study-plan-visible','true');if(!plan&&!loading)bridge.window('show-main',{section:'plan-settings'});publish();},action:(name,value)=>{if(name==='dismiss'){visible.checked=false;visible.onchange();}if(name==='toggle'&&value?.plan_id===plan?.id)update(value.id,{done:value.done});}};
}
