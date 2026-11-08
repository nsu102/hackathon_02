"""Bounded, transient OpenRouter speech synthesis. No audio or input logging."""
import base64
from collections import OrderedDict, deque
import io
import json
import os
import re
import threading
import time
import wave
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener

from .config import ModelSettings
from .openrouter import NoRedirect, ProviderError

DEFAULT_MODEL = 'google/gemini-3.8-flash-tts'
VOICES = {'Aoede', 'Kore', 'Charon'}
MAX_AUDIO = 6_000_000


def synthesize(text, voice, kind):
    settings = ModelSettings.read()
    if settings.provider != 'openrouter':
        raise ValueError('AI 음성은 OpenRouter 연결이 필요해요.')
    settings.require_key()
    model = os.getenv('STUDY_TTS_MODEL', DEFAULT_MODEL).strip() or DEFAULT_MODEL
    if len(model) > 255 or any(c.isspace() for c in model):
        raise ValueError('TTS 모델 설정을 확인해주세요.')
    delivery = ('따뜻하고 차분한 학습 친구처럼 옆에서 대화하듯 설명하세요.' if kind != 'nag'
                else '친근한 친구처럼 장난스럽지만 부드럽게, 다그치거나 소리치지 말고 말하세요.')
    payload = {'model': model, 'input': text, 'voice': voice, 'response_format': 'pcm',
               'instructions': '자연스러운 한국어로 말하세요. ' + delivery + ' 과장된 방송 말투나 기계적인 끊어 읽기를 피하고 문장 사이에 짧게 쉬세요. 입력 내용만 읽고 말을 덧붙이지 마세요.'}
    request = Request(settings.base_url + '/audio/speech', data=json.dumps(payload, ensure_ascii=False).encode(),
                      headers={'Authorization': 'Bearer ' + settings.api_key, 'Content-Type': 'application/json'}, method='POST')
    try:
        with build_opener(NoRedirect()).open(request, timeout=45) as response:
            content_type = response.headers.get('Content-Type', '')
            raw = response.read(MAX_AUDIO + 1)
    except HTTPError as exc:
        code = exc.code
        exc.close()
        raise ProviderError(f'AI 음성 HTTP {code}: 연결·모델 설정을 확인해주세요. 답변은 글로 볼 수 있어요.') from None
    except (TimeoutError, URLError, OSError):
        raise ProviderError('AI 음성 연결이 늦어졌어요. 답변은 글로 볼 수 있어요.') from None
    rate = re.search(r'(?:^|;)\s*rate=(\d+)', content_type)
    channels = re.search(r'(?:^|;)\s*channels=(\d+)', content_type)
    if (not content_type.startswith('audio/pcm') or not rate or not channels
            or not 8000 <= int(rate[1]) <= 48000 or int(channels[1]) != 1
            or not raw or len(raw) > MAX_AUDIO or len(raw) % 2):
        raise ProviderError('AI 음성 형식을 확인하지 못했어요. 답변은 글로 볼 수 있어요.')
    output = io.BytesIO()
    with wave.open(output, 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(int(rate[1]))
        audio.writeframes(raw)
    return {'audio': base64.b64encode(output.getvalue()).decode(), 'mime': 'audio/wav', 'model': model, 'voice': voice}


class SpeechService:
    def __init__(self):
        self.lock = threading.Lock()
        self.busy = False
        self.calls = deque()
        self.cache = OrderedDict()

    def create(self, value):
        if (set(value) != {'text', 'voice', 'kind', 'consent'} or value.get('consent') is not True
                or not isinstance(value.get('text'), str) or not 1 <= len(value['text'].strip()) <= 1800
                or not isinstance(value.get('voice'), str) or value.get('voice') not in VOICES
                or not isinstance(value.get('kind'), str) or value.get('kind') not in {'answer', 'nag', 'preview'}):
            raise ValueError('동의한 짧은 답변·알림 문장만 음성으로 읽을 수 있어요.')
        key = (value['text'].strip(), value['voice'], value['kind'])
        now = time.monotonic()
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
                return self.cache[key]
            while self.calls and now - self.calls[0] > 600:
                self.calls.popleft()
            if self.busy or len(self.calls) >= 30:
                raise ValueError('AI 음성을 잠시 뒤 다시 사용해주세요.')
            self.busy = True
            self.calls.append(now)
        try:
            result = synthesize(*key)
            with self.lock:
                self.cache[key] = result
                while len(self.cache) > 8 or sum(len(v['audio']) for v in self.cache.values()) > 16_000_000:
                    self.cache.popitem(last=False)
            return result
        finally:
            with self.lock:
                self.busy = False
