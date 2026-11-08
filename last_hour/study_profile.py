"""Explicit local learning preferences; never infers personal traits from gaze."""
import json
import os
from pathlib import Path

FIELDS={'language','learning_context','explanation_style','grounding','tone'}

def read_profile():
 path=Path(os.getenv('STUDY_PROFILE_FILE','') or Path(os.getenv('LAST_HOUR_DATA','./data'))/'study-profile.json')
 if not path.is_file():return {}
 if path.stat().st_size>6000:raise ValueError('학습 선호 설정 파일이 너무 커요.')
 try:value=json.loads(path.read_text())
 except (ValueError,OSError):raise ValueError('학습 선호 설정 파일을 확인해주세요.') from None
 if not isinstance(value,dict) or set(value)-FIELDS or any(not isinstance(v,str) or len(v)>500 for v in value.values()):raise ValueError('학습 선호에는 짧은 설명 방식·언어만 설정해주세요.')
 return value
