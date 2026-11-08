"""Download public model artifacts using a supplied trusted verification time.

For a server with a broken wall clock: OpenSSL still verifies the CA chain and
hostname, using the trusted Mac time instead. TLS verification is never disabled.
Every artifact must additionally match its locally prepared SHA-256 manifest.
"""
from pathlib import Path
import argparse,concurrent.futures,hashlib,http.client,json,subprocess,time
from urllib.parse import urlsplit,urljoin

def digest(path):
 value=hashlib.sha256()
 with path.open('rb') as source:
  while chunk:=source.read(4*1024*1024):value.update(chunk)
 return value.hexdigest()

def fetch(url,destination,epoch,started,headers=None):
 headers=dict(headers or {})
 for _ in range(6):
  u=urlsplit(url)
  if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443):raise ValueError('HTTPS artifact URL required')
  process=subprocess.Popen(['openssl','s_client','-quiet','-verify_return_error','-verify_hostname',u.hostname,'-CApath','/etc/ssl/certs','-attime',str(int(epoch+time.monotonic()-started)),'-connect',u.hostname+':443','-servername',u.hostname],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  try:
   path=u.path or '/'
   if u.query:path+='?'+u.query
   extra=''.join(f'{k}: {v}\r\n' for k,v in headers.items())
   process.stdin.write(f'GET {path} HTTP/1.1\r\nHost: {u.hostname}\r\nUser-Agent: StudySignal-VerifiedArtifact/1\r\n{extra}Connection: close\r\n\r\n'.encode('ascii'));process.stdin.close()
   class Socket:
    def makefile(self,*_):return process.stdout
   response=http.client.HTTPResponse(Socket());response.begin()
   if response.status in (301,302,303,307,308):
    next_url=urljoin(url,response.getheader('Location'))
    if urlsplit(next_url).hostname!=u.hostname:headers.pop('Authorization',None)
    url=next_url;continue
   if response.status!=200:raise RuntimeError(f'Artifact HTTP {response.status}')
   with destination.open('wb') as out:
    while chunk:=response.read(4*1024*1024):out.write(chunk)
   return
  finally:
   process.kill();process.wait()
 raise RuntimeError('Too many artifact redirects')

def main():
 p=argparse.ArgumentParser();p.add_argument('manifest',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args();manifest=json.loads(args.manifest.read_text());started=time.monotonic();epoch=manifest['verification_time_unix'];args.output.mkdir(parents=True,exist_ok=True)
 def download(item):
  if Path(item['name']).name!=item['name']:raise ValueError('Artifact basename required')
  destination=args.output/item['name']
  if destination.is_file() and digest(destination)==item['sha256']:return
  partial=destination.with_suffix(destination.suffix+'.verified-part')
  fetch(item['url'],partial,epoch,started)
  if digest(partial)!=item['sha256']:raise RuntimeError('Artifact digest mismatch: '+item['name'])
  partial.replace(destination);print('Verified',item['name'],flush=True)
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(download,manifest['files']))
if __name__=='__main__':main()
