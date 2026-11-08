const $=id=>document.getElementById(id),bridge=window.bubbleBridge;
let state={configured:false,phase:'idle',consent:false};
function act(name,value){bridge.action(name,value).catch(()=>{});}
bridge.onState(value=>{state=value;$('cancel').hidden=!['preparing','recording','selecting'].includes(value.phase);$('speech-stop').hidden=!value.speaking;$('speech-status').textContent=value.speechStatus||'';$('speech-status').hidden=!value.speechStatus;$('bubble').dataset.kind=value.kind;$('body').textContent=value.text;$('question').hidden=!value.question;$('question').textContent=value.question||'';$('attachment').hidden=!value.attachment;$('attachment').textContent='질문 시작 화면 첨부됨'+(value.materials?` · 자료 ${value.materials}개 함께 참고`:'');$('nag-actions').hidden=value.kind!=='nag';$('history').hidden=value.kind!=='answer';});
$('settings').onclick=()=>act('settings');$('history').onclick=()=>act('history');$('dismiss').onclick=()=>act('dismiss');
for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>act(button.dataset.action);
new ResizeObserver(()=>bridge.resize(document.body.scrollHeight)).observe($('bubble'));

$('speech-stop').onclick=()=>act('tts-stop');

$('cancel').onclick=()=>act('cancel');
