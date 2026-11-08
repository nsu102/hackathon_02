import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import createChecklist from '../checklist.cjs';
test('checklist uses inactive top-left display, strict IPC and capture suppression',async()=>{
 let made;const actions=[];
 class Window extends EventEmitter{constructor(options){super();this.options=options;this.visible=false;this.webContents=new EventEmitter();this.webContents.send=(_,s)=>this.state=s;this.webContents.setWindowOpenHandler=()=>{};made=this;}setAlwaysOnTop(){}setVisibleOnAllWorkspaces(){}loadURL(){queueMicrotask(()=>this.webContents.emit('did-finish-load'));}isDestroyed(){return false;}setBounds(b){this.bounds=b;}showInactive(){this.visible=true;}hide(){this.visible=false;}destroy(){}}
 const list=createChecklist({BrowserWindow:Window,display:()=>({workArea:{x:-1440,y:24,width:1440,height:840}}),action:(...a)=>actions.push(a)});
 list.update({plan:{id:'b'.repeat(64),items:[]},visible:true});await Promise.resolve();assert.equal(made.options.focusable,false);assert.equal(made.bounds.x,-1420);assert.equal(made.bounds.y,44);
 assert.ok(list.valid({sender:made.webContents,senderFrame:{url:'study://app/checklist.html'}}));assert.equal(list.valid({sender:made.webContents,senderFrame:{url:'https://foreign.example'}}),false);
 list.handle('toggle',{id:'a'.repeat(16),done:true});assert.equal(actions[0][1].plan_id,'b'.repeat(64));assert.throws(()=>list.handle('toggle',{id:'bad',done:true}));assert.throws(()=>list.handle('arbitrary'));
 list.hide();list.suppress(true);list.update({loading:true,visible:true});assert.equal(made.visible,false);list.suppress(false);list.update({visible:true});assert.equal(made.visible,true);list.resize(900);assert.equal(made.bounds.height,540);list.update({visible:false});assert.equal(made.visible,false);
});
