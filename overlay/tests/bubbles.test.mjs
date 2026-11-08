import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import createBubbles from '../bubbles.cjs';
function fixture(){
 let made;const actions=[];
 class Window extends EventEmitter{
  constructor(options){super();this.options=options;this.visible=false;this.destroyed=false;this.webContents=new EventEmitter();this.webContents.send=(_,state)=>{this.state=state;};this.webContents.setWindowOpenHandler=()=>{};made=this;}
  setAlwaysOnTop(){}setVisibleOnAllWorkspaces(){}loadURL(url){this.url=url;queueMicrotask(()=>this.webContents.emit('did-finish-load'));}isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}setBounds(value){this.bounds=value;}showInactive(){this.visible=true;}hide(){this.visible=false;}destroy(){this.destroyed=true;}
 }
 return {bubbles:createBubbles({BrowserWindow:Window,display:()=>({workArea:{x:-1440,y:24,width:1440,height:840}}),action:(...a)=>actions.push(a)}),window:()=>made,actions};
}
test('separate answer bubble stays bottom-right, inactive and validates sender/actions',async()=>{
 const f=fixture(),b=f.bubbles;
 b.update({kind:'answer',text:'<script>unsafe()</script>',question:'설명해줘',phase:'idle',show:true});await Promise.resolve();const w=f.window();
 assert.equal(w.options.focusable,false);assert.equal(w.options.acceptFirstMouse,true);assert.equal(w.bounds.x,-390);assert.equal(w.bounds.y,634);assert.equal(w.state.text,'<script>unsafe()</script>');
 assert.ok(b.valid({sender:w.webContents,senderFrame:{url:'study://app/bubble.html'}}));assert.equal(b.valid({sender:w.webContents,senderFrame:{url:'https://other.example'}}),false);
 b.handle('history');assert.deepEqual(f.actions[0],['history']);assert.throws(()=>b.handle('talk'));assert.throws(()=>b.handle('consent'));assert.throws(()=>b.handle('arbitrary-command'));
 b.resize(1000);assert.equal(w.bounds.height,510);b.handle('dismiss');assert.equal(w.visible,false);
 b.update({speaking:false,show:false});assert.equal(w.visible,false);b.destroy();
});
test('startup and idle/status messages never create a bubble; recovery hides nag',async()=>{
 const f=fixture(),b=f.bubbles;
 for(const kind of ['welcome','info','voice'])b.update({kind,phase:'idle',show:true});assert.equal(f.window(),undefined);
 b.update({kind:'nag',text:'돌아와요',show:true});await Promise.resolve();assert.equal(f.window().visible,true);
 b.clearNag();assert.equal(f.window().visible,false);b.update({show:true});assert.equal(f.window().visible,false);
 b.update({kind:'voice',phase:'recording',show:true});assert.equal(f.window().visible,true);
 b.update({phase:'idle',show:true});assert.equal(f.window().visible,false);
});
test('cancellation or dismissal before renderer load cannot flash an idle bubble',async()=>{
 const f=fixture(),b=f.bubbles;b.update({kind:'voice',phase:'preparing',show:true});b.update({phase:'idle',show:true});await Promise.resolve();assert.equal(f.window().visible,false);
 const g=fixture();g.bubbles.update({kind:'answer',show:true});g.bubbles.hide();await Promise.resolve();assert.equal(g.window().visible,false);
});
