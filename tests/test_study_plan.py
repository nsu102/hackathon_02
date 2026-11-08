import json,tempfile,unittest
from pathlib import Path
from unittest.mock import AsyncMock,patch
from last_hour.study_plan import StudyPlans
from last_hour.openrouter import ProviderError

class StudyPlanTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.plans=StudyPlans(self.root);self.material='[첨부 자료: notes.pdf]\n1. 조건부 확률의 기준\n조건부 확률은 조건에 해당하는 경우만 새로운 전체로 삼는다.\n2. 독립 사건 비교하기\n독립이면 조건을 주어도 사건의 확률은 변하지 않는다.'
 def tearDown(self):self.tmp.cleanup()
 def value(self,**changes):return dict(goal='조건부 확률 이해',material=self.material,ai_enabled=False,consent=False,**changes)
 def reply(self,items):return {'choices':[{'finish_reason':'stop','message':{'role':'assistant','content':json.dumps({'title':'조건부 확률 익히기','items':items},ensure_ascii=False)}}]}
 def test_outline_requires_no_model_and_checked_progress_survives_restart_and_same_upload(self):
  with patch('last_hour.study_plan.TutorModel.read') as model:plan=self.plans.create(self.value());model.assert_not_called()
  item=plan['items'][0];saved=self.plans.update(plan['id'],item['id'],{'done':True,'label':'기준 집합을 말로 설명하기'})
  restored=StudyPlans(self.root).create(self.value());self.assertEqual(restored,saved);self.assertEqual(restored['sources'],['notes.pdf']);self.assertTrue(restored['items'][0]['done'])
 def test_new_material_gets_new_plan_and_preserves_original_progress(self):
  original=self.plans.create(self.value());self.plans.update(original['id'],original['items'][0]['id'],{'done':True})
  data=self.value();data['material']+='\n3. 새로운 실험 결과 정리하기';other=self.plans.create(data)
  self.assertNotEqual(other['id'],original['id']);self.assertTrue(self.plans.get(original['id'])['items'][0]['done']);self.assertFalse(any(i['done'] for i in other['items']))
 def test_remote_generation_requires_explicit_consent_and_valid_source_evidence(self):
  data=self.value();data.update(ai_enabled=True)
  with patch('last_hour.study_plan.TutorModel.read') as model:
   with self.assertRaises(ValueError):self.plans.create(data)
   model.assert_not_called()
  data['consent']=True;items=[{'label':'조건의 기준 집합 설명하기','evidence':'조건에 해당하는 경우만 새로운 전체로 삼는다.'},{'label':'독립 사건과 비교하기','evidence':'독립이면 조건을 주어도 사건의 확률은 변하지 않는다.'}]
  with patch('last_hour.study_plan.TutorModel.complete',new_callable=AsyncMock,return_value=self.reply(items)):
   plan=self.plans.create(data)
  self.assertEqual(plan['source'],'ai');self.assertEqual(len(plan['items']),2)
 def test_hallucinated_grounding_never_overwrites_a_checked_plan(self):
  original=self.plans.create(self.value());saved=self.plans.update(original['id'],original['items'][0]['id'],{'done':True})
  data=self.value();data.update(ai_enabled=True,consent=True)
  with patch('last_hour.study_plan.TutorModel.read') as model:self.assertEqual(self.plans.create(data),saved);model.assert_not_called()
  data['regenerate']=True;items=[{'label':'자료에 없는 행렬 풀기','evidence':'자료에 전혀 존재하지 않는 새로운 수학 문제'}, {'label':'항목 둘','evidence':'역시 이 자료에는 존재하지 않는 근거입니다'}]
  with patch('last_hour.study_plan.TutorModel.complete',new_callable=AsyncMock,return_value=self.reply(items)):
   with self.assertRaises(ProviderError):self.plans.create(data)
  self.assertEqual(self.plans.get(original['id']),saved)
 def test_foreign_items_and_invalid_completion_do_not_mutate_the_plan(self):
  plan=self.plans.create(self.value())
  for item,value in [('f'*16,{'done':True}),(plan['items'][0]['id'],{'done':'yes'})]:
   with self.assertRaises(ValueError):self.plans.update(plan['id'],item,value)
  self.assertEqual(self.plans.get(plan['id']),plan)
