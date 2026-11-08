import json,tempfile,unittest
from unittest.mock import patch,AsyncMock
from last_hour.study import StudyService
from last_hour.document_help import document_intent,parse_document
from last_hour.openrouter import ProviderError
from tests.test_context_help import request

class DocumentHelpTests(unittest.TestCase):
 def test_voice_intents_and_negated_requests(self):
  self.assertEqual(document_intent('이거 번역해줘. 요약도 해줘.'),'translation')
  self.assertEqual(document_intent('이 논문의 핵심만 정리해줘'),'summary')
  self.assertIsNone(document_intent('번역하지 말고 설명해줘'))
  self.assertIsNone(document_intent('요약 말고 수식 설명해줘'))
 def test_translation_is_grounded_to_screen_and_returns_a_saved_pad_artifact(self):
  with tempfile.TemporaryDirectory() as folder:
   service=StudyService(folder);session=service.create({'goal':'논문 읽기','material':'학습 시작 때 추가한 노트: 확인 코드 37','ai_enabled':True})
   target={'content':'캐시는 메모리 접근을 줄입니다.','question':'','answer':'','title':'캐시의 역할','summary':'• 접근 횟수 감소\n• 지연 시간 개선','source_note':'현재 화면 문단 기준'}
   response={'choices':[{'finish_reason':'stop','message':{'role':'assistant','content':json.dumps(target)}}]}
   with patch('last_hour.context_help.transcribe',return_value='이거 번역해줘'),patch('last_hour.context_help.TutorModel.complete',new_callable=AsyncMock,return_value=response) as model:
    value=service.context_help(session['id'],request())
   self.assertEqual(value['message']['artifact']['kind'],'translation');self.assertEqual(value['message']['artifact']['summary'],target['summary']);self.assertEqual(model.call_args.kwargs['max_tokens'],8192);self.assertIn('전체 논문을 읽었다고 주장하지',model.call_args.args[0][0]['content']);self.assertFalse(value['message']['training_eligible'])
   self.assertIn('학습 시작 때 추가한 노트: 확인 코드 37',model.call_args.args[0][1]['content'][0]['text'])
   self.assertEqual(service.snapshot(session['id'])['messages'][-1]['artifact']['title'],'캐시의 역할')
 def test_missing_translation_or_summary_is_rejected_instead_of_claiming_completion(self):
  with self.assertRaises(ValueError):parse_document({'content':'완료했어요'},'translation')
  with tempfile.TemporaryDirectory() as folder:
   service=StudyService(folder);session=service.create({'goal':'논문 읽기','material':'','ai_enabled':True})
   response={'choices':[{'finish_reason':'stop','message':{'role':'assistant','content':'{"content":"완료","question":"","answer":""}'}}]}
   with patch('last_hour.context_help.transcribe',return_value='요약해줘'),patch('last_hour.context_help.TutorModel.complete',new_callable=AsyncMock,return_value=response):
    with self.assertRaises(ProviderError):service.context_help(session['id'],request())
   self.assertFalse(service.snapshot(session['id'])['busy'])
