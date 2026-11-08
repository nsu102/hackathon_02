"""Small standalone study backend. Deliberately has no vision/ML imports."""
import argparse,json,multiprocessing,os,sys

def main():
 multiprocessing.freeze_support()
 if getattr(sys,'frozen',False):
  import certifi
  os.environ.setdefault('SSL_CERT_FILE',certifi.where())
 from last_hour.config import load_env,DEFAULT_MODEL
 load_env()
 if sys.argv[1:]==['--startup-config']:
  print(json.dumps({'token':os.getenv('LAST_HOUR_TOKEN',''),'gaze_model':os.getenv('STUDY_GAZE_MODEL','unigaze_l16_joint'),'key_configured':bool(os.getenv('OPENROUTER_API_KEY','').strip()),'model':os.getenv('STUDY_MODEL_ID','').strip() or os.getenv('OPENROUTER_MODEL',DEFAULT_MODEL)}));return 0
 parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
 serve=sub.add_parser('serve');serve.add_argument('--port',type=int,required=True)
 material=sub.add_parser('extract-material');material.add_argument('path')
 install=sub.add_parser('install-gaze');install.add_argument('--archive',required=True);install.add_argument('--destination',required=True);install.add_argument('--sha256',required=True)
 sub.add_parser('self-check');args=parser.parse_args()
 if args.command=='serve':
  from last_hour.api import serve
  serve(os.getenv('LAST_HOUR_DATA','./data'),args.port)
 elif args.command=='extract-material':
  from last_hour.materials import main
  sys.argv=[sys.argv[0],args.path];return main()
 elif args.command=='install-gaze':
  from last_hour.gaze_install import install_archive
  try:install_archive(args.archive,args.destination,args.sha256)
  except InterruptedError:return 130
  except Exception as error:
   message=str(error) if isinstance(error,ValueError) else '시선 설치에 실패했어요. 남은 공간과 파일 접근 권한을 확인해주세요.'
   print(json.dumps({'phase':'error','percent':0,'message':message}),flush=True);return 1
 else:
  import pypdf
  from last_hour.study import StudyService
  forbidden={'torch','timm','cv2','numpy'}
  assert not forbidden.intersection(sys.modules)
  print(json.dumps({'ok':True,'frozen':bool(getattr(sys,'frozen',False)),'python':sys.version.split()[0],'gaze_bundled':False,'pypdf':pypdf.__version__}))
 return 0
if __name__=='__main__':raise SystemExit(main())
