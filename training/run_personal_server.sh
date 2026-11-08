#!/usr/bin/env bash
set -euo pipefail
umask 077
root="$(cd "$(dirname "$0")/.." && pwd)"
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/study-signal-docker.sock}"
adapter="${STUDY_ADAPTER_NAME:-personal-v1}"
if [[ ! "$adapter" =~ ^[a-zA-Z0-9_-]+$ ]] || [[ ! -f "$root/adapters/$adapter/adapter_model.safetensors" ]]; then
 echo 'A completed vision adapter is required. Run and review the GPU pilot first.' >&2; exit 1
fi
mkdir -p "$root/data"
if [[ ! -s "$root/data/personal-model.key" ]]; then openssl rand -hex 32 > "$root/data/personal-model.key"; fi
{ printf 'STUDY_SERVING_KEY='; cat "$root/data/personal-model.key"; } > "$root/data/serving.private.env"
docker run -d --name study-signal-personal --runtime=nvidia --gpus device=0 -e CUDA_VISIBLE_DEVICES=0 -e HF_HUB_OFFLINE=1 -e HF_HUB_DISABLE_TELEMETRY=1 -e TOKENIZERS_PARALLELISM=false -e OMP_NUM_THREADS=4 --env-file "$root/data/serving.private.env" --shm-size=2g -p 127.0.0.1:8001:8001 \
 -v "$root/training:/work/training:ro" -v "$root/models/qwen3-vl-8b:/models/qwen3-vl-8b:ro" -v "$root/adapters:/work/adapters:ro" -w /work \
 study-signal-vision:pilot python -u training/serve_vision.py --model /models/qwen3-vl-8b --adapter "/work/adapters/$adapter" --host 0.0.0.0 --port 8001
echo 'Private server starting on host loopback 8001. Use your SSH tunnel; the key stays in data/personal-model.key.'
