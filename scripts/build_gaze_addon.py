"""Create an optional offline gaze component, kept OUTSIDE the default DMG."""
from pathlib import Path
import argparse,hashlib,json,os,stat,zipfile,subprocess
ROOT=Path(__file__).resolve().parents[1]
def freeze_service():
 build=ROOT/'.build';build.mkdir(exist_ok=True)
 command=[ROOT/'.gaze-venv/bin/python','-m','PyInstaller','--noconfirm','--clean','--onedir','--target-arch','arm64','--name','study-service','--distpath',build/'service-dist','--workpath',build/'gaze-pyinstaller','--specpath',build,'--paths',ROOT,'--additional-hooks-dir',ROOT/'scripts/pyinstaller_hooks','--add-data',str(ROOT/'last_hour/prompts.md')+':last_hour','--collect-data','timm','--collect-data','torch','--copy-metadata','timm','--copy-metadata','torch','--collect-submodules','timm.models','--hidden-import','torchvision','--hidden-import','certifi']
 for module in ['matplotlib','scipy','pandas','tensorflow','tkinter','IPython','pytest','openai','playwright','onnx','onnxruntime']:command+=['--exclude-module',module]
 command+=[ROOT/'scripts/bundled_service.py']
 with (build/'gaze-service-build.log').open('w') as log:subprocess.run([str(v) for v in command],check=True,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PYINSTALLER_CONFIG_DIR':str(build/'pyinstaller-cache'),'HF_HUB_OFFLINE':'1'})

def build():
 source=ROOT/'.build/service-dist/study-service'
 if not (source/'study-service').is_file():freeze_service()
 target=ROOT.parent/'Study-Signal-Gaze-arm64-v1.zip'
 component={'id':'study-signal-gaze-arm64-v1','version':'1.0.0','model':'unigaze_l16_joint','architecture':'arm64'}
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as archive:
  archive.writestr('component.json',json.dumps(component))
  for folder,prefix in [(source,'service'),(ROOT/'last_hour/neural_assets','notices')]:
   for directory,dirs,files in os.walk(folder,followlinks=False):
    base=Path(directory)
    for name in list(dirs):
     if (base/name).is_symlink():files.append(name);dirs.remove(name)
    for name in sorted(files):
     file=base/name;relative=(Path(prefix)/file.relative_to(folder)).as_posix()
     if file.is_symlink():
      entry=zipfile.ZipInfo(relative);entry.create_system=3;entry.external_attr=(stat.S_IFLNK|0o777)<<16;archive.writestr(entry,os.readlink(file))
     else:archive.write(file,relative)
  archive.write(ROOT/'data/models/unigaze/unigaze_l16_joint.safetensors','models/unigaze_l16_joint.safetensors')
 descriptor={**component,'filename':target.name,'bytes':target.stat().st_size,'sha256':hashlib.file_digest(target.open('rb'),'sha256').hexdigest()}
 (ROOT/'.build/gaze-addon.json').write_text(json.dumps(descriptor,indent=2)+'\n');print(json.dumps(descriptor),flush=True)
 return descriptor
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--freeze-service',action='store_true');args=parser.parse_args()
 if args.freeze_service:freeze_service()
 build()
