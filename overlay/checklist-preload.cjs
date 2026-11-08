const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('checklistBridge',{onState:callback=>ipcRenderer.on('checklist:state',(_,value)=>callback(value)),action:(name,value)=>ipcRenderer.invoke('checklist:action',name,value),resize:height=>ipcRenderer.send('checklist:resize',height)});
