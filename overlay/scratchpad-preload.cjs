const {contextBridge,ipcRenderer}=require('electron');
async function invoke(...args){try{return await ipcRenderer.invoke(...args);}catch(e){throw new Error(String(e.message||e).replace(/^(?:Error invoking remote method '[^']+': (?:Error: )?)+/,''));}}
contextBridge.exposeInMainWorld('scratchpadBridge',{action:(name,value)=>invoke('scratchpad:action',name,value),onState:callback=>ipcRenderer.on('scratchpad:state',(_,value)=>callback(value))});
