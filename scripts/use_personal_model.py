"""Switch explanation inference to a checked local SSH tunnel; STT/TTS stay configured.

Does not upload data, start training or overwrite a running app's session.
Restart the app after changing its environment file.
"""
from pathlib import Path
import argparse,json,os,re,shlex,tempfile
from urllib.request import Request,build_opener
from urllib.parse import urlsplit
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from last_hour.config import load_env
from last_hour.openrouter import NoRedirect

def write_env(path,values):
 text=path.read_text() if path.exists() else '';seen=set();lines=[]
 for line in text.splitlines():
  match=re.match(r'\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=',line)
  key=match[1] if match else None
  if key in values:
   if key not in seen:lines.append(key+'='+shlex.quote(values[key]));seen.add(key)
  else:lines.append(line)
 lines.extend(k+'='+shlex.quote(v) for k,v in values.items() if k not in seen)
 fd,name=tempfile.mkstemp(dir=path.parent,prefix='.study-model-')
 try:
  os.fchmod(fd,0o600)
  with os.fdopen(fd,'w') as out:out.write('\n'.join(lines)+'\n')
  os.replace(name,path)
 finally:
  if Path(name).exists():Path(name).unlink()

def main():
 root=Path(__file__).resolve().parents[1];p=argparse.ArgumentParser();p.add_argument('--env',type=Path,default=root/'.env');p.add_argument('--key-file',type=Path,default=root/'data/personal-model.key');p.add_argument('--endpoint',default='http://127.0.0.1:18001/v1');p.add_argument('--disable',action='store_true');args=p.parse_args()
 previous=root/'data/personal-model-previous.json';fields=['STUDY_MODEL_PROVIDER','STUDY_MODEL_ID','STUDY_MODEL_ENDPOINT','STUDY_MODEL_API_KEY'];load_env(args.env)
 if args.disable:
  if not previous.exists():raise ValueError('No previous model selection to restore')
  write_env(args.env,json.loads(previous.read_text()));print('Previous explanation model restored. Restart the app.');return
 url=urlsplit(args.endpoint)
 if url.scheme!='http' or url.hostname not in {'127.0.0.1','localhost'} or url.username or url.password or url.query or url.fragment:raise ValueError('Use a loopback SSH tunnel URL')
 key=args.key_file.read_text().strip()
 if len(key)<24:raise ValueError('Private serving key missing')
 request=Request(args.endpoint+'/models',headers={'Authorization':'Bearer '+key})
 with build_opener(NoRedirect()).open(request,timeout=5) as response:value=json.loads(response.read(10000))
 if not any(v.get('id')=='study-signal-personal' for v in value.get('data',[])):raise ValueError('Expected personal vision endpoint was not found')
 if not previous.exists():
  previous.parent.mkdir(parents=True,exist_ok=True);previous.write_text(json.dumps({k:(os.getenv(k,'') or ('openrouter' if k=='STUDY_MODEL_PROVIDER' else '')) for k in fields}));previous.chmod(0o600)
 write_env(args.env,{'STUDY_MODEL_PROVIDER':'compatible','STUDY_MODEL_ID':'study-signal-personal','STUDY_MODEL_ENDPOINT':args.endpoint,'STUDY_MODEL_API_KEY':key})
 print('Personal vision endpoint selected. Restart the app. OpenRouter STT/TTS settings were preserved.')
if __name__=='__main__':main()
