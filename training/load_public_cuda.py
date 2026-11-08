"""Load a pinned public CUDA image with full TLS/digest checks on a bad-clock host."""
from pathlib import Path
import argparse,concurrent.futures,gzip,io,json,os,shutil,subprocess,tarfile,time
from download_verified import fetch,digest

def main():
 p=argparse.ArgumentParser();p.add_argument('--verification-time',type=int,required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--digest',required=True);args=p.parse_args();folder=args.cache;folder.mkdir(parents=True,exist_ok=True);started=time.monotonic();epoch=args.verification_time
 def get(url,name,headers=None,expected=None):
  path=folder/name
  if expected and path.is_file() and digest(path)==expected:return path
  fetch(url,path,epoch,started,headers)
  if expected and digest(path)!=expected:raise RuntimeError('Public artifact digest mismatch')
  return path
 auth=get('https://auth.docker.io/token?service=registry.docker.io&scope=repository%3Apytorch%2Fpytorch%3Apull','public-auth.json');token=json.loads(auth.read_text())['token'];auth.unlink()
 headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json'}
 base='https://registry-1.docker.io/v2/pytorch/pytorch/'
 manifest=json.loads(get(base+'manifests/sha256:'+args.digest,'manifest-index.json',headers,args.digest).read_text())
 if 'manifests' in manifest:
  selected=next(v for v in manifest['manifests'] if v['platform']['os']=='linux' and v['platform']['architecture']=='amd64');sha=selected['digest'].split(':',1)[1];manifest=json.loads(get(base+'manifests/'+selected['digest'],'manifest-amd64.json',headers,sha).read_text())
 config_hash=manifest['config']['digest'].split(':',1)[1];config=get(base+'blobs/'+manifest['config']['digest'],config_hash+'.json',headers,config_hash)
 def layer(item):
  sha=item['digest'].split(':',1)[1];blob=get(base+'blobs/'+item['digest'],sha+'.blob',headers,sha);plain=folder/(sha+'.tar')
  if not plain.exists():
   with gzip.open(blob,'rb') as source,plain.open('wb') as out:shutil.copyfileobj(source,out,4*1024*1024)
  print('Verified public CUDA layer',sha[:12],flush=True);return sha,plain
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:layers=list(pool.map(layer,manifest['layers']))
 record=[{'Config':config.name,'RepoTags':['study-signal-base:cuda'],'Layers':[sha+'/layer.tar' for sha,_ in layers]}]
 process=subprocess.Popen(['docker','load'],stdin=subprocess.PIPE)
 with tarfile.open(fileobj=process.stdin,mode='w|') as archive:
  archive.add(config,arcname=config.name);raw=json.dumps(record).encode();info=tarfile.TarInfo('manifest.json');info.size=len(raw);archive.addfile(info,io.BytesIO(raw))
  for sha,path in layers:archive.add(path,arcname=sha+'/layer.tar')
 process.stdin.close()
 if process.wait():raise RuntimeError('Docker image load failed')
 print('Pinned public CUDA image ready',flush=True)
if __name__=='__main__':main()
