const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scratchpadBridge',{action:(name,value)=>ipcRenderer.invoke('scratchpad:action',name,value),onState:callback=>ipcRenderer.on('scratchpad:state',(_,value)=>callback(value))});
