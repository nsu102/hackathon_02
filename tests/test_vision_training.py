import json,os,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'training'))
from vision_data import check_splits,prompt,read_rows
from last_hour.study_profile import read_profile

class VisionDataTests(unittest.TestCase):
 def test_page_disjointness_and_local_path_boundary_are_enforced(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'view.png').touch()
   base={'document_id':'doc','page':1,'image':'view.png','question':'이 표는?','target':{'content':'답','question':'','answer':''}}
   for split,page in [('train',1),('validation',2),('test',3)]:
    (root/f'{split}.jsonl').write_text(json.dumps({**base,'page':page})+'\n')
   self.assertEqual(len(check_splits(root)['test']),1)
   (root/'test.jsonl').write_text(json.dumps(base)+'\n')
   with self.assertRaises(ValueError):check_splits(root)
   (root/'test.jsonl').write_text(json.dumps({**base,'image':'../outside.png'})+'\n')
   with self.assertRaises(ValueError):read_rows(root,'test')

 def test_model_input_contains_no_gold_answer_or_evidence(self):
  row={'question':'이 수치는?','profile':{'language':'ko-KR'},'target':{'content':'secret-target'},'evidence':'private-reference'}
  value=json.dumps(prompt(row),ensure_ascii=False)
  self.assertIn('이 수치는?',value);self.assertNotIn('secret-target',value);self.assertNotIn('private-reference',value)

 def test_explicit_profile_accepts_preferences_but_rejects_arbitrary_fields(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'profile.json';path.write_text(json.dumps({'language':'ko-KR','tone':'차분하게'}))
   with patch.dict(os.environ,{'STUDY_PROFILE_FILE':str(path)}):
    self.assertEqual(read_profile()['tone'],'차분하게')
    path.write_text(json.dumps({'api_key':'not-a-preference'}))
    with self.assertRaises(ValueError):read_profile()
