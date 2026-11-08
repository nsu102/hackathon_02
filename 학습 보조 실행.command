#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null || ! command -v npm >/dev/null; then
  echo 'Python 3.13 이상과 Node.js/npm을 먼저 설치해주세요.'
  exit 1
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path('.env');p.write_text(p.read_text().replace('LAST_HOUR_TOKEN=\n','LAST_HOUR_TOKEN='+secrets.token_urlsafe(32)+'\n'))
PY
  echo '.env를 만들었어요. OPENROUTER_API_KEY를 채우면 실제 AI 도움을 사용할 수 있어요.'
fi
chmod 600 .env
if [[ ! -x .venv/bin/python ]]; then python3 -m venv .venv; fi
if ! .venv/bin/python -c 'import pypdf, last_hour' >/dev/null 2>&1; then
  .venv/bin/python -m pip install -e .
fi

cd overlay
if [[ ! -d node_modules/electron || ! -d node_modules/uiohook-napi ]]; then npm ci; fi
npm start
