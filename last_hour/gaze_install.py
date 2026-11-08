"""Install only an exact pinned optional package, without touching personal study data."""
from pathlib import Path,PurePosixPath
import hashlib,json,os,re,shutil,signal,stat,subprocess,tempfile,zipfile
MAX_TOTAL=3_500_000_000

def emit(phase,percent):print(json.dumps({'phase':phase,'percent':percent}),flush=True)
def safe_name(name):
 p=PurePosixPath(name)
 if not name or p.is_absolute() or '..' in p.parts or '\\' in name or '\x00' in name:raise ValueError('추가 패키지의 경로가 올바르지 않아요.')
 return p

def install_archive(archive,destination,expected,check_runtime=True):
 if not re.fullmatch('[0-9a-f]{64}',expected):raise ValueError('신뢰할 수 있는 패키지 정보가 없어요.')
 archive=Path(archive);destination=Path(destination);destination.parent.mkdir(parents=True,exist_ok=True)
 if not archive.is_file() or archive.stat().st_size>2_500_000_000:raise ValueError('시선 추가 패키지 파일을 확인해주세요.')
 stage=Path(tempfile.mkdtemp(prefix='.gaze-install-',dir=destination.parent));backup=None
 previous=signal.getsignal(signal.SIGTERM)
 def cancelled(*_):raise InterruptedError('시선 설치를 취소했어요.')
 signal.signal(signal.SIGTERM,cancelled)
 try:
  emit('verifying',0);digest=hashlib.sha256()
  with archive.open('rb') as stream:
   read=0
   while data:=stream.read(8_000_000):
    digest.update(data);read+=len(data);emit('verifying',min(20,read*20//max(1,archive.stat().st_size)))
  if digest.hexdigest()!=expected:raise ValueError('추가 패키지 검증에 실패했어요. 이 앱과 함께 배포된 시선 패키지를 선택해주세요.')
  with zipfile.ZipFile(archive) as bundle:
   entries=bundle.infolist()
   if len(entries)>30000 or sum(v.file_size for v in entries)>MAX_TOTAL:raise ValueError('추가 패키지 크기가 올바르지 않아요.')
   total=sum(v.file_size for v in entries);written=0;links=[];seen=set()
   for item in entries:
    relative=safe_name(item.filename);key=str(relative)
    if key in seen:raise ValueError('추가 패키지에 중복 경로가 있어요.')
    seen.add(key);target=stage/relative;mode=item.external_attr>>16
    if item.is_dir():target.mkdir(parents=True,exist_ok=True);continue
    target.parent.mkdir(parents=True,exist_ok=True)
    if stat.S_ISLNK(mode):
     if item.file_size>4096:raise ValueError('잘못된 패키지 링크예요.')
     links.append((target,bundle.read(item).decode('utf-8')));continue
    if stat.S_IFMT(mode) not in (0,stat.S_IFREG):raise ValueError('지원하지 않는 패키지 파일이에요.')
    with bundle.open(item) as src,target.open('xb') as dst:
     while data:=src.read(8_000_000):dst.write(data);written+=len(data);emit('extracting',20+written*65//max(1,total))
    target.chmod(0o755 if mode&0o111 else 0o644)
   for target,link in links:
    if os.path.isabs(link) or '\\' in link or not (target.parent/link).resolve().is_relative_to(stage.resolve()):raise ValueError('패키지 밖으로 나가는 링크예요.')
    target.symlink_to(link)
   for target,_ in links:
    if not target.resolve().is_relative_to(stage.resolve()):raise ValueError('패키지 링크가 올바르지 않아요.')
  manifest=json.loads((stage/'component.json').read_text())
  if manifest.get('id')!='study-signal-gaze-arm64-v1' or manifest.get('model')!='unigaze_l16_joint':raise ValueError('호환되지 않는 시선 추가 패키지예요.')
  executable=stage/'service/study-service';weights=stage/'models/unigaze_l16_joint.safetensors'
  if not executable.is_file() or not weights.is_file():raise ValueError('시선 실행 파일이나 모델이 없어요.')
  emit('checking',90)
  if check_runtime:
   result=subprocess.run([str(executable),'self-check'],cwd=stage,env={**os.environ,'PATH':'/usr/bin:/bin','HF_HUB_OFFLINE':'1'},capture_output=True,text=True,timeout=60)
   if result.returncode or not json.loads(result.stdout).get('ok'):raise ValueError('시선 실행 환경을 확인하지 못했어요. 기존 설치는 유지해요.')
  (stage/'installed.json').write_text(json.dumps({'id':manifest['id'],'sha256':expected,'version':manifest['version']}))
  if destination.exists():
   backup=destination.with_name(destination.name+'.previous');shutil.rmtree(backup,ignore_errors=True);destination.rename(backup)
  try:stage.rename(destination)
  except BaseException:
   if backup and backup.exists():backup.rename(destination)
   raise
  if backup:shutil.rmtree(backup,ignore_errors=True)
  emit('installed',100)
 finally:
  signal.signal(signal.SIGTERM,previous)
  if stage.exists():shutil.rmtree(stage,ignore_errors=True)
