"""Create private synthetic variants from locally reviewed PDF QA seeds."""
from pathlib import Path
import argparse,hashlib,json,subprocess
from PIL import Image,ImageFilter
from synthetic_vision import normalized

def main():
 p=argparse.ArgumentParser();p.add_argument('pdf',type=Path);p.add_argument('--seeds',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--profile',type=Path,default=Path(__file__).with_name('profile.example.json'));args=p.parse_args()
 from pypdf import PdfReader
 reader=PdfReader(args.pdf);seeds=json.loads(args.seeds.read_text());profile=json.loads(args.profile.read_text());out=args.output;out.mkdir(parents=True,exist_ok=True);(out/'images').mkdir(exist_ok=True)
 doc=hashlib.sha256(args.pdf.read_bytes()).hexdigest();splits={k:[] for k in ['train','validation','test']};pages={};seen={}
 for seed in seeds:
  page=seed['page'];fold=seed['split'];assert fold in splits
  if page in seen and seen[page]!=fold:raise ValueError('Source page leaks across splits')
  seen[page]=fold;text=reader.pages[page-1].extract_text() or ''
  if normalized(seed['evidence']) not in normalized(text):raise ValueError(f'Unverified source evidence on page {page}')
  if page not in pages:
   stem=out/'images'/f'page-{page:03}';subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1400','-png',str(args.pdf),str(stem)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);pages[page]=stem.with_suffix('.png')
  questions=[seed['question']]+(['이 화면을 보고 '+seed['question'].rstrip('?')+'?'] if fold=='train' else [])
  for variant,q in enumerate(questions):
   splits[fold].append({'id':f'{doc[:12]}-p{page}-{len(splits[fold])}-{variant}','document_id':doc,'page':page,'image':str(pages[page].relative_to(out)),'question':q,'profile':profile,'target':{'content':seed['content'],'question':'','answer':''},'evidence':seed['evidence'],'expected_facts':seed['expected_facts'],'answerable':True})
 for page,fold in seen.items():
  unclear=out/'images'/f'page-{page:03}-unclear.png';Image.open(pages[page]).filter(ImageFilter.GaussianBlur(35)).save(unclear)
  splits[fold].append({'id':f'{doc[:12]}-p{page}-unclear','document_id':doc,'page':page,'image':str(unclear.relative_to(out)),'question':'이 화면의 정확한 수치와 표 내용을 알려줘.','profile':profile,'target':{'content':'화면이 흐려서 정확한 수치와 표 내용을 읽기 어려워요. 표를 확대하거나 질문할 부분을 더 선명하게 다시 보내주세요.','question':'','answer':''},'evidence':'','expected_facts':['흐','확대'],'answerable':False})
 for name,rows in splits.items():(out/f'{name}.jsonl').write_text(''.join(json.dumps(row,ensure_ascii=False)+'\n' for row in rows))
 manifest={'document_sha256':doc,'method':'locally source-checked seed answers + deterministic question variants + blurred view negatives','rows':{k:len(v) for k,v in splits.items()},'split_pages':{k:sorted({r['page'] for r in v}) for k,v in splits.items()},'private':True,'remote_teacher_used':False,'human_reviewed':False,'review':'source-evidence strings checked automatically; answers reviewed during implementation, not by the learner','evaluation_scope':'one document; page-disjoint pilot, not cross-document generalization'}
 (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps(manifest['rows']))
if __name__=='__main__':main()
