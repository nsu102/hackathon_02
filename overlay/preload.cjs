const { contextBridge, ipcRenderer } = require('electron');
async function invoke(...args){try{return await ipcRenderer.invoke(...args);}catch(e){throw new Error(String(e.message||e).replace(/^(?:Error invoking remote method '[^']+': (?:Error: )?)+/,''));}}
contextBridge.exposeInMainWorld('studyBridge', {
  ready: () => invoke('backend:ready'),
  request: (method, route, body) => invoke('backend:request', method, route, body),
  window: (action, data) => invoke('window:action', action, data),
  onGazeInstall:callback=>ipcRenderer.on('gaze-install:state',(_,state)=>callback(state)),onDisplayChanged: callback => ipcRenderer.on('display:changed', () => callback()),
  onVoice: callback => { const listener=(_,event)=>callback(event);ipcRenderer.on('voice:event',listener);return ()=>ipcRenderer.removeListener('voice:event',listener); },
  onLost: callback => ipcRenderer.on('backend:lost', () => callback()),
  onAppAction: callback => {const listener=(_,event)=>callback(event);ipcRenderer.on('app:action',listener);return ()=>ipcRenderer.removeListener('app:action',listener);},
});
