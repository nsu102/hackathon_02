const path=require('node:path');
const ACTIONS=new Set(['cancel','settings','history','grace','false-alarm','dismiss','tts-stop','scratchpad']);
function bounded(value,max){return typeof value==='string'?value.slice(0,max):'';}
module.exports=function createBubbles({BrowserWindow,display,action,avoid=()=>[]}){
 let win=null,loaded=false,suspended=false,requested=false,state={kind:'welcome',text:'궁금한 부분이 생기면 말로 물어봐요.',question:'',phase:'idle',consent:false,configured:false,attachment:false,materials:0},height=210;
 function position(){if(!win||win.isDestroyed())return false;const area=display().workArea,width=Math.min(370,area.width-32),gap=12,blocks=avoid();const right=area.x+area.width-width-20,bottom=area.y+area.height-height-20,left=area.x+20,top=area.y+20;
  const choices=[{x:right,y:bottom},{x:left,y:bottom},{x:right,y:top},{x:left,y:top}];
  for(const block of blocks)choices.push({x:block.x-width-gap,y:bottom},{x:block.x+block.width+gap,y:bottom},{x:right,y:block.y-height-gap});
  const place=choices.find(p=>p.x>=area.x+8&&p.x+width<=area.x+area.width-8&&p.y>=area.y+8&&p.y+height<=area.y+area.height-8&&!blocks.some(b=>p.x<b.x+b.width+gap&&p.x+width+gap>b.x&&p.y<b.y+b.height+gap&&p.y+height+gap>b.y));
  if(!place){win.hide();return false;}win.setBounds({...place,width,height});if(requested&&loaded&&!suspended&&relevant())win.showInactive();return true;
 }
 function relevant(){return ['nag','error'].includes(state.kind);}
 function ensure(){
  if(win&&!win.isDestroyed())return;
  win=new BrowserWindow({width:370,height,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,show:false,focusable:false,acceptFirstMouse:true,skipTaskbar:true,resizable:false,hasShadow:false,webPreferences:{preload:path.join(__dirname,'bubble-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  win.setAlwaysOnTop(true,'floating');win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.once('did-finish-load',()=>{loaded=true;win.webContents.send('bubble:state',state);position();if(requested&&relevant()&&!suspended&&position())win.showInactive();if(process.env.STUDY_NATIVE_QA==='1')console.info(JSON.stringify({component:'study-bubble',bounds:win.getBounds(),focusable:win.isFocusable(),visible:win.isVisible()}));});
  win.on('closed',()=>{win=null;loaded=false;});win.loadURL('study://app/bubble.html');
 }
 function update(value={}){
  const {show,...next}=value;
  if(next.kind&&!['welcome','answer','nag','voice','error','info'].includes(next.kind))throw new Error('잘못된 버블 상태예요.');
  if(next.phase&&!['idle','preparing','recording','processing','selecting'].includes(next.phase))throw new Error('잘못된 녹음 상태예요.');
  state={...state,...next,text:next.text===undefined?state.text:bounded(next.text,2400),question:next.question===undefined?state.question:bounded(next.question,400),consent:next.consent===undefined?state.consent:next.consent===true,configured:next.configured===undefined?state.configured:next.configured===true,attachment:next.attachment===undefined?state.attachment:next.attachment===true,materials:Number.isInteger(next.materials)?Math.max(0,Math.min(5,next.materials)):state.materials};
  if(!relevant()){requested=false;win?.hide();return;}
  if(show===true)requested=true;
  ensure();if(loaded)win.webContents.send('bubble:state',state);if(requested&&!suspended&&position())win.showInactive();
 }
 function valid(event){return event.sender===win?.webContents&&event.senderFrame.url==='study://app/bubble.html';}
 return {update,valid,position,suppress:value=>{suspended=value===true;},hide:()=>{requested=false;win?.hide();},resize:h=>{if(Number.isFinite(h)){height=Math.min(Math.max(150,Math.ceil(h)),Math.min(510,display().workArea.height-40));position();}},clearNag:()=>{if(state.kind==='nag'){state={...state,kind:'info',text:''};requested=false;win?.hide();}},handle:(name,value)=>{if(!ACTIONS.has(name))throw new Error('허용되지 않은 버블 동작이에요.');if(name==='dismiss'){requested=false;win?.hide();return;}action(name);},windows:()=>win&&!win.isDestroyed()?[win]:[],destroy:()=>win?.destroy()};
};
