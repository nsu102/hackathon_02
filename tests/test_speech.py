import base64
import io
import unittest
import wave
from unittest.mock import patch
from last_hour.speech import SpeechService, synthesize
from last_hour.config import ModelSettings
from last_hour.openrouter import ProviderError


class Response:
    headers = {'Content-Type': 'audio/pcm;rate=24000;channels=1'}
    def __enter__(self):return self
    def __exit__(self,*_):pass
    def read(self,_):return b'\0\0' * 2400


class SpeechTests(unittest.TestCase):
    def body(self,**changes):return {'text':'천천히 같이 풀어봐요.','voice':'Aoede','kind':'answer','consent':True,**changes}

    def test_openrouter_pcm_is_wrapped_as_playable_wave_with_delivery_instructions(self):
        settings=ModelSettings('openrouter','test-only','m','m','https://openrouter.ai/api/v1')
        with patch('last_hour.speech.ModelSettings.read',return_value=settings),patch('last_hour.speech.build_opener') as opener:
            opener.return_value.open.return_value=Response()
            result=synthesize('같이 풀어봐요.','Aoede','answer')
            request=opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url,'https://openrouter.ai/api/v1/audio/speech')
            self.assertIn('instructions',request.data.decode())
        with wave.open(io.BytesIO(base64.b64decode(result['audio']))) as audio:
            self.assertEqual((audio.getframerate(),audio.getnchannels(),audio.getsampwidth(),audio.getnframes()),(24000,1,2,2400))

    def test_missing_consent_oversize_and_invalid_voice_never_call_provider(self):
        service=SpeechService()
        with patch('last_hour.speech.synthesize') as provider:
            for changes in [{'consent':False},{'text':'x'*1801},{'voice':[]},{'kind':[]},{'voice':'unknown'}]:
                with self.assertRaises(ValueError):service.create(self.body(**changes))
            provider.assert_not_called()

    def test_transient_cache_avoids_repeat_nag_charges_and_does_not_call_provider(self):
        service=SpeechService()
        with patch('last_hour.speech.synthesize',return_value={'audio':'fixture','mime':'audio/wav'}) as provider:
            service.create(self.body(kind='nag'));service.create(self.body(kind='nag'))
            self.assertEqual(provider.call_count,1)
            service.create(self.body(voice='Kore',kind='nag'));self.assertEqual(provider.call_count,2)

    def test_failure_releases_single_flight_gate_and_invalid_audio_is_rejected(self):
        service=SpeechService()
        with patch('last_hour.speech.synthesize',side_effect=ProviderError('safe error')):
            with self.assertRaises(ProviderError):service.create(self.body())
        self.assertFalse(service.busy)
        settings=ModelSettings('openrouter','test-only','m','m','https://openrouter.ai/api/v1')
        response=Response();response.headers={'Content-Type':'application/json'}
        with patch('last_hour.speech.ModelSettings.read',return_value=settings),patch('last_hour.speech.build_opener') as opener:
            opener.return_value.open.return_value=response
            with self.assertRaises(ProviderError):synthesize('짧은 문장','Kore','answer')
