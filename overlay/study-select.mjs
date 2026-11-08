// One accessible select control for every study setting; the native select remains the data model.
const controls=new WeakMap();let active=null,serial=0;
export class StudySelect{
 constructor(select){
  this.select=select;this.current=-1;this.opened=false;this.search='';this.timer=null;
  const name=select.getAttribute('aria-label')||[...(select.labels||[])].map(label=>[...label.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join(' ').trim()).join(' ')||'선택';
  select.closest('label')?.classList.add('study-select-label');
  this.wrap=document.createElement('span');this.wrap.className='study-select';select.before(this.wrap);this.wrap.append(select);select.hidden=true;select.setAttribute('aria-hidden','true');select.tabIndex=-1;
  this.button=document.createElement('button');this.button.type='button';this.button.className='study-select-trigger';this.button.setAttribute('role','combobox');this.button.setAttribute('aria-label',name);this.button.setAttribute('aria-haspopup','listbox');this.button.setAttribute('aria-expanded','false');this.button.dataset.selectId=select.id;
  this.value=document.createElement('span');this.value.className='study-select-value';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','m4 6 4 4 4-4');svg.append(path);this.button.append(this.value,svg);this.wrap.append(this.button);
  this.menu=document.createElement('div');this.menu.className='study-select-list';this.menu.id='study-options-'+(++serial);this.menu.setAttribute('role','listbox');this.menu.setAttribute('aria-label',name);this.menu.hidden=true;document.body.append(this.menu);this.button.setAttribute('aria-controls',this.menu.id);
  this.button.onclick=()=>this.opened?this.close():this.open();this.button.onkeydown=e=>this.key(e);select.addEventListener('change',()=>this.sync());select.addEventListener('input',()=>this.sync());
  const valueProperty=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');Object.defineProperty(select,'value',{configurable:true,get:()=>valueProperty.get.call(select),set:value=>{valueProperty.set.call(select,value);this.sync();}});
  new MutationObserver(()=>this.sync()).observe(select,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected','label','value']});
  document.addEventListener('pointerdown',e=>{if(this.opened&&!this.wrap.contains(e.target)&&!this.menu.contains(e.target))this.close();});document.addEventListener('scroll',e=>{if(this.opened&&!this.menu.contains(e.target))this.close();},true);window.addEventListener('resize',()=>this.close());
  this.sync();
 }
 sync(){
  this.value.textContent=this.select.selectedOptions[0]?.label||'선택하세요';this.button.title=this.value.textContent;this.button.disabled=this.select.disabled;
  this.menu.replaceChildren(...[...this.select.options].map((option,index)=>{const row=document.createElement('div');row.id=this.menu.id+'-'+index;row.className='study-select-option';row.setAttribute('role','option');row.setAttribute('aria-selected',String(option.selected));row.setAttribute('aria-disabled',String(option.disabled||option.parentElement?.disabled===true));const check=document.createElement('span');check.className='study-select-check';check.textContent=option.selected?'✓':'';check.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=option.label;row.append(check,label);row.onpointerdown=e=>e.preventDefault();row.onclick=()=>this.choose(index);row.onpointermove=()=>this.highlight(index);return row;}));
  if(this.select.disabled)this.close();else if(this.opened){this.highlight(this.select.selectedIndex);this.position();}
 }
 enabled(index){const item=this.menu.children[index];return item&&item.getAttribute('aria-disabled')!=='true';}
 highlight(index){if(!this.enabled(index))return;this.current=index;for(const [i,item] of [...this.menu.children].entries())item.classList.toggle('active',i===index);this.button.setAttribute('aria-activedescendant',this.menu.children[index].id);if(this.opened)this.menu.children[index].scrollIntoView({block:'nearest'});}
 position(){const r=this.button.getBoundingClientRect(),width=Math.min(Math.max(r.width,180),innerWidth-16);this.menu.style.width=width+'px';this.menu.style.maxHeight=Math.max(80,Math.min(240,innerHeight-24))+'px';const height=Math.min(this.menu.scrollHeight,240,innerHeight-24);this.menu.style.left=Math.max(8,Math.min(r.left,innerWidth-width-8))+'px';this.menu.style.top=Math.max(8,Math.min(innerHeight-height-8,innerHeight-r.bottom<height+6&&r.top>height+6?r.top-height-6:r.bottom+6))+'px';}
 open(){if(this.select.disabled)return;if(active&&active!==this)active.close();active=this;this.opened=true;this.menu.hidden=false;this.button.setAttribute('aria-expanded','true');this.position();this.highlight(this.select.selectedIndex>=0?this.select.selectedIndex:[...this.select.options].findIndex((_,i)=>this.enabled(i)));this.button.focus();}
 close(){this.opened=false;this.menu.hidden=true;this.button.setAttribute('aria-expanded','false');this.button.removeAttribute('aria-activedescendant');if(active===this)active=null;}
 choose(index){if(!this.enabled(index)||this.select.disabled)return;const changed=this.select.selectedIndex!==index;this.select.selectedIndex=index;if(changed){this.select.dispatchEvent(new Event('input',{bubbles:true}));this.select.dispatchEvent(new Event('change',{bubbles:true}));}this.sync();this.close();this.button.focus();}
 key(e){
  if(e.metaKey||e.ctrlKey){this.close();return;}
  if(e.key==='Escape'){this.close();return;}if(e.key==='Tab'){this.close();return;}
  if(['Enter',' '].includes(e.key)){e.preventDefault();this.opened?this.choose(this.current):this.open();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!this.opened){this.open();return;}const enabled=[...this.select.options].map((_,i)=>i).filter(i=>this.enabled(i));if(!enabled.length)return;let at=enabled.indexOf(this.current);this.highlight(e.key==='Home'?enabled[0]:e.key==='End'?enabled.at(-1):enabled[Math.max(0,Math.min(enabled.length-1,at+(e.key==='ArrowDown'?1:-1)))]);return;}
  if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();if(!this.opened)this.open();clearTimeout(this.timer);this.search+=e.key.toLocaleLowerCase();const index=[...this.select.options].findIndex((o,i)=>this.enabled(i)&&o.label.trim().toLocaleLowerCase().startsWith(this.search));if(index>=0)this.highlight(index);this.timer=setTimeout(()=>this.search='',600);}
 }
}
export function enhanceSelects(root=document){for(const select of root.querySelectorAll('select'))if(!controls.has(select))controls.set(select,new StudySelect(select));}
