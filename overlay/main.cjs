const { app, BrowserWindow, ipcMain, screen, globalShortcut, protocol, net: electronNet, systemPreferences, desktopCapturer, powerMonitor,Tray,Menu,nativeImage,dialog,shell,clipboard } = require('electron');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { pathToFileURL } = require('node:url');
const {invalidatesCalibration}=require('./display-events.cjs');
const {NeuralWorker}=require('./neural-worker.cjs');
const runtimeTools=require('./runtime.cjs');
app.setName('Study Signal');
const runtime=runtimeTools.paths({packaged:app.isPackaged,resourcesPath:process.resourcesPath,appData:app.getPath('appData'),sourceRoot:path.resolve(__dirname,'..')});
const root=runtime.root,runFile=promisify(execFile);
runtimeTools.initialize(runtime);
const neuralWorker=new NeuralWorker(root,{executable:runtime.gazeService,weightsDir:runtime.models});
const gazeInstaller=require('./gaze-installer.cjs').createGazeInstaller({root:runtime.gazeRoot,core:runtime.service,manifest:runtime.gazeManifest,development:app.isPackaged?null:{python:path.join(root,'.gaze-venv/bin/python'),weights:path.join(root,'data/models/unigaze/unigaze_l16_joint.safetensors')},onState:state=>win?.webContents.send('gaze-install:state',state)});
let connectionSettings={key_configured:false,model:'anthropic/claude-sonnet-5.5'};
let win, child, endpoint, token, activeId, readiness, collapsed = false, bounds, quitting = false, cameraIntent = 0, calibrationBounds = null, gazeDisplay = null, pointerWin = null, voice = null, micIntent = 0,studyTray=null,bubbles=null,checklist=null,scratchpad=null,captureSuppressed=false;
fs.mkdirSync(path.join(root, 'data', 'electron-study'), { recursive: true });
const qaData=process.argv.includes('--study-qa')&&process.env.STUDY_QA_DATA?path.resolve(process.env.STUDY_QA_DATA):null;
app.setPath('userData',qaData?path.join(qaData,'electron-study'):path.join(root,'data','electron-study'));
protocol.registerSchemesAsPrivileged([{ scheme: 'study', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
function validSender(e) { if (e.sender !== win?.webContents || !e.senderFrame.url.startsWith('study://app/')) throw new Error('허용되지 않은 창입니다.'); }
function showMain(section){win?.show();win?.focus();if(section)win?.webContents.send('app:action',{action:section});}
ipcMain.handle('bubble:action',(event,action,value)=>{if(!bubbles?.valid(event))throw new Error('허용되지 않은 버블입니다.');return bubbles.handle(action,value);});
ipcMain.handle('checklist:action',(event,name,value)=>{if(!checklist?.valid(event))throw new Error('허용되지 않은 체크리스트 창이에요.');return checklist.handle(name,value);});
ipcMain.on('checklist:resize',(event,height)=>{if(checklist?.valid(event))checklist.resize(height);});
ipcMain.on('bubble:resize',(event,height)=>{if(bubbles?.valid(event))bubbles.resize(height);});
ipcMain.handle('scratchpad:action',(event,name,value)=>{if(!scratchpad?.valid(event))throw new Error('허용되지 않은 패드 창이에요.');return scratchpad.handle(name,value);});
async function api(method, route, body) {
  if (!endpoint || !token) throw new Error('학습 서버를 연결하고 있어요.');
  const r = await fetch(endpoint + route, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(110000) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || '서버 응답을 확인해주세요.'); return data;
}
async function startBackend() {
  let python=runtime.service;
  if(!python)for (const c of [process.env.LAST_HOUR_PYTHON, path.join(root, '.venv/bin/python'), '/opt/homebrew/bin/python3', 'python3'].filter(Boolean)) {
    try { await runFile(c, ['-c', 'import last_hour.study'], { cwd: root, timeout: 5000 }); python = c; break; } catch {}
  }
  if (!python) throw new Error('Python 3.11 이상이 필요해요.');
  const configArgs=runtime.service?['--startup-config']:['-c','import os,json; from last_hour.config import load_env,DEFAULT_MODEL; load_env(); print(json.dumps({"token":os.getenv("LAST_HOUR_TOKEN", ""),"heart_autoconnect":os.getenv("STUDY_HEART_AUTOCONNECT", "").lower() in {"1","true"},"gaze_model":os.getenv("STUDY_GAZE_MODEL", "unigaze_l16_joint"),"key_configured":bool(os.getenv("OPENROUTER_API_KEY", "").strip()),"model":os.getenv("STUDY_MODEL_ID", "").strip() or os.getenv("OPENROUTER_MODEL",DEFAULT_MODEL)}))'];
  const {stdout}=await runFile(python,configArgs,{cwd:root,timeout:15000});
  const startupConfig=JSON.parse(stdout);connectionSettings={key_configured:startupConfig.key_configured,model:startupConfig.model};token=startupConfig.token;neuralWorker.setModel(startupConfig.gaze_model); if (token.length < 24) throw new Error('.env의 로컬 연결 토큰을 확인해주세요.');
  const port = await new Promise((resolve, reject) => { const s = net.createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
  endpoint = `http://127.0.0.1:${port}`;
  child = spawn(python, [...(runtime.service?[]:['-m','last_hour']),'serve','--port',String(port)], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, ...(qaData?{LAST_HOUR_DATA:path.join(qaData,'data')}:{}), PYTHONUNBUFFERED: '1' } });
  child.stderr.on('data', () => {}); child.on('exit', () => { child = null; if (!quitting) win?.webContents.send('backend:lost'); });
  for (let i = 0; i < 60; i++) { try { const health=await api('GET','/health');if(startupConfig.heart_autoconnect)await api('POST','/study/heart/connect',{}).catch(()=>{});return health; } catch {} if (!child) break; await new Promise(r => setTimeout(r, 150)); }
  throw new Error('학습 서버를 시작하지 못했어요.');
}
ipcMain.handle('backend:ready', async e => { validSender(e); return readiness; });
ipcMain.handle('backend:request', async (e, method, route, body) => {
  validSender(e);
  const id = '[0-9a-f]{32}';
  const get = new RegExp(`^/(health|study/heart|study/sessions/${id}|study/plans/[0-9a-f]{64})$`);
  const post = new RegExp(`^/study/(plans(?:/[0-9a-f]{64}/items/[0-9a-f]{16})?|speech|sessions(?:/${id}/(?:observations|checkins|assist|feedback|pause|end|focus-events|materials))?|heart/(?:connect|disconnect))$`);
  if (!(method === 'GET' && get.test(route) || method === 'POST' && post.test(route))) throw new Error('허용되지 않은 학습 요청입니다.');
  const value = await api(method, route, body); if (method === 'POST' && route === '/study/sessions') activeId = value.id;
  if(value.status)voice?.setSession(value.status==='running'&&value.ai_enabled?value.id:null); return value;
});
ipcMain.handle('window:action', async (e, action, data) => {
  validSender(e);
  if (action === 'displays') return screen.getAllDisplays().map(d=>({id:d.id,label:d.label||'모니터 '+d.id,...d.bounds,scale:d.scaleFactor}));
  if (action === 'overlay-bounds') return [win,...(bubbles?.windows()||[]),...(checklist?.windows()||[]),...(scratchpad?.windows()||[])].filter(w=>w&&!w.isDestroyed()&&w.isVisible()).map(w=>w.getBounds());
  if (action === 'scratchpad-context') {scratchpad.context(data);return;}
  if (action === 'scratchpad-voice') {scratchpad.voice(data);return;}
  if (action === 'scratchpad-metrics') {scratchpad.metrics(data);return;}
  if (action === 'scratchpad-show') {scratchpad.show();return;}
  if (action === 'scratchpad-begin') return scratchpad.begin(data);
  if (action === 'scratchpad-complete') {scratchpad.complete(data?.id,data?.message,data?.question);return;}
  if (action === 'scratchpad-fail') {scratchpad.fail(data?.id,data?.reason);return;}
  if (action === 'show-main') {showMain(data?.section||'settings');return;}
  if (action === 'checklist-update') {checklist?.update(data);return;}
  if (action === 'bubble-update') {bubbles?.update(data);return;}
  if (action === 'bubble-clear-nag') {bubbles?.clearNag();return;}
  if (action === 'materials-import') {
    const chosen=await dialog.showOpenDialog({title:'학습 자료 선택',properties:['openFile','multiSelections'],filters:[{name:'학습 자료',extensions:['pdf','txt','md','docx']}]});
    if(chosen.canceled)return [];if(chosen.filePaths.length>5)throw new Error('자료는 한 번에 5개까지 선택해주세요.');
    const python=runtime.service||path.join(root,'.gaze-venv/bin/python'),result=[];
    for(const file of chosen.filePaths){
      const args=runtime.service?['extract-material',file]:['-m','last_hour.materials',file];
      let stdout;try{({stdout}=await runFile(python,args,{cwd:root,timeout:15000,maxBuffer:200000}));}catch(e){let message='파일을 읽지 못했어요. 파일 형식과 크기를 확인해주세요.';try{message=JSON.parse(e.stdout).error||message;}catch{}throw new Error(message);}
      const value=JSON.parse(stdout);if(!value.ok)throw new Error(value.error);result.push(value);
    }
    return result;
  }
  if (action === 'permission-status') return {microphone:systemPreferences.getMediaAccessStatus('microphone'),screen:systemPreferences.getMediaAccessStatus('screen'),camera:systemPreferences.getMediaAccessStatus('camera'),accessibility:systemPreferences.isTrustedAccessibilityClient(false),runtime:app.isPackaged?'Study Signal':'Electron',version:app.getVersion()};
  if (action === 'permission-settings') {const pane={microphone:'Privacy_Microphone',screen:'Privacy_ScreenCapture',accessibility:'Privacy_Accessibility',input:'Privacy_ListenEvent'}[data?.type];if(!pane)throw new Error('허용되지 않은 권한 설정이에요.');await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?'+pane);return;}
  if (action === 'app-restart') {setTimeout(()=>{app.relaunch();app.quit();},150);return {restarting:true};}
  if (action === 'connection-settings') {await readiness;return {...connectionSettings};}
  if (action === 'connection-save') {
    const values=runtimeTools.connectionValues(data);
    if(activeId){const current=await api('GET',`/study/sessions/${activeId}`);if(current.status!=='ended')throw new Error('학습을 종료한 뒤 연결 설정을 저장해주세요.');}
    runtimeTools.writeEnv(path.join(root,'.env'),values);
    setTimeout(()=>{app.relaunch();app.quit();},350);return {restarting:true};
  }
  if (action === 'voice-shortcut-guide') return {registered:false};
  if (action === 'voice-shortcut-start') throw new Error('음성 질문은 말하기 버튼을 사용해주세요.');
  if (action === 'voice-configure') {if(data?.enabled)throw new Error('음성 단축키는 제거됐어요. 말하기 버튼을 사용해주세요.');return voice.configure({enabled:false});}
  if (action === 'voice-submit') return voice.submit(data);
  if (action === 'voice-button-start') {micIntent=Date.now()+15000;return voice.buttonStart({consent:data?.consent,target:'screen'});}
  if (action === 'voice-button-release') return voice.buttonRelease();
  if (action === 'voice-select') return voice.select(data);
  if (action === 'voice-cancel') {voice.cancel();return;}
  if (action === 'screen-prepare') return voice.screenPrepare(data);
  if (action === 'screen-submit') return voice.screenSubmit(data);
  if (action === 'screen-cancel') {voice.cancel('화면 질문을 취소했어요.');return;}
  if (action === 'tray-state') {
    if(!data||!['running','paused','camera','focus_enabled','muted'].every(k=>typeof data[k]==='boolean')||!['대기 중','감지 꺼짐','화면 응시 중','이탈 확인 중','화면 이탈','측정 불가','질문 중','휴식 중','기준 확인 중'].includes(data.focus))throw new Error('허용되지 않은 상태 정보예요.');
    studyTray?.update({running:data.running,paused:data.paused,camera:data.camera,focus_enabled:data.focus_enabled,muted:data.muted,focus:data.focus});return;
  }
  if (action === 'gaze-sample') {if(data&&Number.isFinite(data.at_ms)){voice.sample(data);}return;}
  if (action === 'gaze-addon-status') return gazeInstaller.status();
  if (action === 'gaze-addon-cancel') {gazeInstaller.cancel();return;}
  if (action === 'gaze-addon-install') {
    if(gazeInstaller.status().busy)throw new Error('시선 패키지를 설치하고 있어요.');
    const result=await dialog.showOpenDialog(win,{title:'시선 추가 패키지 설치',buttonLabel:'설치',properties:['openFile'],filters:[{name:'Study Signal 시선 패키지',extensions:['zip']}]});
    if(result.canceled||!result.filePaths.length)return gazeInstaller.status();
    neuralWorker.stop();return gazeInstaller.install(result.filePaths[0]);
  }
  if (action === 'neural-start') {if(!gazeInstaller.installed())throw new Error('설정에서 시선 감지 추가 패키지를 먼저 설치해주세요.');return neuralWorker.start();}
  if (action === 'neural-predict') return neuralWorker.predict(data);
  if (action === 'neural-stop') {neuralWorker.stop();return;}
  if (action === 'close') { win.close(); return; }
  if (action === 'camera-permission') { cameraIntent = Date.now() + 15000; return { granted: process.platform !== 'darwin' || await systemPreferences.askForMediaAccess('camera') }; }
  if (action === 'gaze-display') { gazeDisplay = screen.getAllDisplays().find(d=>String(d.id)===String(data?.display_id))||screen.getDisplayMatching(win.getBounds()); checklist?.position();bubbles?.position();scratchpad?.position();return { ...gazeDisplay.bounds, display_id: gazeDisplay.id, scale_factor:gazeDisplay.scaleFactor,rotation:gazeDisplay.rotation }; }
  if (action === 'selection-open') {
    if (collapsed || calibrationBounds) throw new Error('창을 펼친 후 다시 시도해주세요.');
    calibrationBounds = win.getBounds(); gazeDisplay = screen.getAllDisplays().find(d=>String(d.id)===String(data?.display_id))||gazeDisplay||screen.getDisplayMatching(calibrationBounds);
    pointerWin?.hide(); win.setResizable(false); win.setBounds(gazeDisplay.workArea); win.focus();
    return { ...gazeDisplay.bounds, display_id: gazeDisplay.id, scale_factor:gazeDisplay.scaleFactor,rotation:gazeDisplay.rotation, viewport: win.getContentBounds() };
  }
  if (action === 'selection-close') {
    if (calibrationBounds) { win.setBounds(calibrationBounds); calibrationBounds = null; win.setResizable(true); }
    return;
  }
  if (action === 'gaze-visible') {
    if (data !== true) { pointerWin?.close(); pointerWin = null; return; }
    if (!gazeDisplay || calibrationBounds) return;
    if (!pointerWin) {
      pointerWin = new BrowserWindow({ ...gazeDisplay.workArea, transparent: true, backgroundColor: '#00000000', frame: false, focusable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false, webPreferences: { preload: path.join(__dirname, 'pointer-preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false } });
      pointerWin.setIgnoreMouseEvents(true); pointerWin.setAlwaysOnTop(true, 'floating');
      pointerWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      pointerWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      pointerWin.webContents.on('will-navigate', event => event.preventDefault());
      const createdPointer = pointerWin;
      pointerWin.on('closed', () => { if (pointerWin === createdPointer) pointerWin = null; });
      pointerWin.loadURL('study://app/pointer.html');
    }
    pointerWin.showInactive(); return;
  }
  if (action === 'gaze-point') {
    if (!pointerWin || !gazeDisplay || calibrationBounds) return;
    const b = pointerWin.getContentBounds();
    const valid = data && ['x','y'].every(k => Number.isFinite(data[k])) && (data.error_px === null || Number.isFinite(data.error_px)) && data.x >= b.x && data.x <= b.x+b.width && data.y >= b.y && data.y <= b.y+b.height;
    pointerWin.webContents.send('gaze:point', valid ? { x: data.x-b.x, y: data.y-b.y, radius: Math.min(100, Math.max(16, data.error_px === null ? 40 : data.error_px)) } : null); return;
  }
  if (action === 'collapse') {
    if (calibrationBounds) throw new Error('화면 선택을 먼저 마쳐주세요.');
    collapsed = !collapsed;
    if (collapsed) { bounds = win.getBounds(); win.setMinimumSize(320, 64); win.setBounds({ ...bounds, width: 320, height: 64, x: bounds.x + bounds.width - 320 }); win.setResizable(false); }
    else { win.setResizable(true); win.setBounds(bounds); win.setMinimumSize(380, 620); } return collapsed;
  }
  throw new Error('지원하지 않는 창 동작이에요.');
});
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(async () => {
  protocol.handle('study', async request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Forbidden', { status: 403 });
    let file; try { file = path.resolve(__dirname, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)); } catch { return new Response('Bad path', { status: 400 }); }
    if (!file.startsWith(__dirname + path.sep) || !/\.(html|js|mjs|css|wasm|task|onnx|woff2|svg|png|json)$/.test(file)) return new Response('Forbidden', { status: 403 });
    const r = await electronNet.fetch(pathToFileURL(file).toString()), headers = new Headers(r.headers);
    const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)];
    if (mime) headers.set('Content-Type', mime); return new Response(r.body, { status: r.status, headers });
  });
  const a = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({ title: 'Study Signal', width: 440, height: Math.min(820, a.height - 40), minWidth: 380, minHeight: 620, x: a.x + a.width - 464, y: a.y + Math.max(20, a.height - 844), frame: false, alwaysOnTop: true, transparent: true, backgroundColor: '#00000000', show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required' } });
  win.setAlwaysOnTop(true, 'floating'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionCheckHandler((contents, permission, origin) => contents === win.webContents && permission === 'media' && typeof origin === 'string' && origin.startsWith('study://app'));
  win.webContents.session.setPermissionRequestHandler((contents, permission, callback, details) => callback(contents === win.webContents && permission === 'media' && (details.mediaTypes?.includes('audio') ? micIntent > Date.now() : cameraIntent > Date.now())));
  bubbles=require('./bubbles.cjs')({BrowserWindow,display:()=>gazeDisplay||screen.getPrimaryDisplay(),avoid:()=>[...(scratchpad?.windows()||[]),...(checklist?.windows()||[])].filter(w=>w&&!w.isDestroyed()&&w.isVisible()).map(w=>w.getBounds()),action:(action,value)=>{if(['settings','history','materials'].includes(action))showMain(action);else win?.webContents.send('app:action',{action:'bubble-'+action,value});}});
  checklist=require('./checklist.cjs')({BrowserWindow,display:()=>gazeDisplay||screen.getPrimaryDisplay(),action:(name,value)=>{if(name==='settings')showMain('plan-settings');else win?.webContents.send('app:action',{action:'plan-'+name,value});}});
  scratchpad=require('./scratchpad.cjs')({BrowserWindow,display:()=>gazeDisplay||screen.getPrimaryDisplay(),folder:path.join(qaData||path.join(root,'data'),'scratchpad'),copyText:text=>clipboard.writeText(text),onBounds:()=>bubbles?.position(),onVoice:async()=>{const ready=await readiness;if(!ready?.ok)throw new Error('학습 서버를 다시 연결해주세요.');win?.webContents.send('app:action',{action:'pad-voice'});},onQuery:async value=>{const ready=await readiness;if(!ready?.ok)throw new Error('학습 서버를 다시 연결해주세요.');if(!win||win.isDestroyed())throw new Error('앱을 다시 열어주세요.');win.webContents.send('app:action',{action:'pad-query',value});},onVisibility:shown=>{checklist.suppress(captureSuppressed||shown);if(shown)checklist.hide();else if(!captureSuppressed)checklist.update({});}});
  voice=await require('./native-voice.cjs')({win:()=>win,display:()=>gazeDisplay,api,systemPreferences,globalShortcut,desktopCapturer,pointer:()=>pointerWin,onStart:()=>{micIntent=Date.now()+15000;},extraWindows:()=>[...bubbles.windows(),...checklist.windows(),...scratchpad.windows()],onCapture:active=>{captureSuppressed=active;bubbles.suppress(active);scratchpad.suppress(active);checklist.suppress(active||scratchpad.isShown());},screen});
  powerMonitor.on('suspend',()=>voice.cancel('잠자기 전환으로 녹음을 폐기했어요.'));
  powerMonitor.on('lock-screen',()=>voice.cancel('화면 잠금으로 녹음을 폐기했어요.'));
  win.webContents.on('render-process-gone',()=>{voice.disable();neuralWorker.stop();});
  function invalidateDisplay(){voice?.cancel('모니터가 변경되어 녹음을 폐기했어요.');gazeDisplay=null;pointerWin?.close();win?.webContents.send('display:changed');}
  screen.on('display-metrics-changed', (_, display, metrics) => {
    if(invalidatesCalibration(display,metrics,gazeDisplay))invalidateDisplay();
    else if(gazeDisplay&&display.id===gazeDisplay.id)gazeDisplay=display;
    checklist?.position();bubbles?.position();scratchpad?.position();
  });
  screen.on('display-removed', (_, display) => {if(gazeDisplay&&display.id===gazeDisplay.id)invalidateDisplay();});
  if(process.env.STUDY_NATIVE_QA==='1')console.info(JSON.stringify({component:'voice-input',mode:'click',hotkey:globalShortcut.isRegistered('CommandOrControl+Shift+Enter')}));
  readiness = startBackend().then(health => ({ ok: true, health }), () => ({ ok: false, message: '학습 서버를 시작하지 못했어요. Python과 .env를 확인해주세요.' }));
  const show=(section)=>showMain(section||'history');
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Study Signal',submenu:[{label:'채팅 열기',accelerator:'CommandOrControl+Shift+P',click:()=>scratchpad.show()},{label:'설정…',accelerator:'CommandOrControl+,',click:()=>show('settings')},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{label:'Study Signal 종료',accelerator:'CommandOrControl+Q',click:()=>app.quit()}]},{role:'editMenu'},{role:'windowMenu'}]));
  studyTray=require('./tray.cjs')({Tray,Menu,nativeImage,iconPath:path.join(__dirname,'assets/StudySignalTemplate.png'),show,action:(action,value)=>{if(action==='scratchpad'){scratchpad.show();return;}if(action==='plan-show')scratchpad.hide();show();win?.webContents.send('app:action',{action,value});},quit:()=>app.quit()});
  win.loadURL('study://app/index.html'); win.once('ready-to-show', () => {if(process.env.STUDY_NATIVE_QA==='1')setTimeout(()=>console.info(JSON.stringify({component:'study-menu-bar',...studyTray.inspect()})),1500);});
  win.on('close',event=>{if(!quitting){event.preventDefault();voice?.cancel('창을 숨겨 녹음을 취소했어요.');win.hide();pointerWin?.hide();}});
  win.on('closed', () => { win = null; });
  app.on('second-instance', () => scratchpad.show());app.on('activate',()=>scratchpad.show());
  globalShortcut.register('CommandOrControl+Shift+Space', () => {if(win?.isVisible()||bubbles.windows().some(w=>w.isVisible())){win.hide();bubbles.hide();}else show();});
});
app.on('before-quit', e => {
  if (quitting) return; quitting = true; e.preventDefault(); gazeInstaller.cancel();voice?.disable(); neuralWorker.stop(); globalShortcut.unregisterAll(); pointerWin?.close();studyTray?.destroy();bubbles?.destroy();checklist?.destroy();scratchpad?.destroy();
  Promise.race([activeId ? api('POST', `/study/sessions/${activeId}/end`, {}) : Promise.resolve(), new Promise(r => setTimeout(r, 500))]).catch(() => {}).finally(() => { child?.kill('SIGINT'); app.exit(0); });
});
