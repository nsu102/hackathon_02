#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/study-signal-docker.sock}"
adapter="${STUDY_ADAPTER_NAME:-personal-v1}"
if [[ ! "$adapter" =~ ^[a-zA-Z0-9_-]+$ ]]; then exit 2; fi
mkdir -p "$root/adapters" "$root/data/vision-pilot/reports"
common=(--rm --runtime=nvidia --gpus device=0 -e CUDA_VISIBLE_DEVICES=0 -e HF_HUB_OFFLINE=1 -e HF_HUB_DISABLE_TELEMETRY=1 -e TOKENIZERS_PARALLELISM=false -e OMP_NUM_THREADS=4 --network none --shm-size=2g
 -v "$root/training:/work/training:ro" -v "$root/models/qwen3-vl-8b:/models/qwen3-vl-8b:ro"
 -v "$root/data/vision-pilot:/work/data/vision-pilot:ro" -v "$root/data/vision-pilot/reports:/work/reports"
 -v "$root/adapters:/work/adapters" -w /work)
# Do not reset GPUs or reboot the host. Stop here if driver health is not ready.
timeout -k 2 15 nvidia-smi --query-gpu=index,name,memory.free --format=csv
docker run "${common[@]}" --name study-signal-gpu-check study-signal-vision:pilot python -u -c 'import torch; assert torch.cuda.is_available(); assert torch.cuda.device_count()==1; print(torch.cuda.get_device_name(0))'
docker run "${common[@]}" --name study-signal-vision-check study-signal-vision:pilot python training/smoke_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot
docker run "${common[@]}" --name study-signal-vision-train study-signal-vision:pilot python -u training/train_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot --output "/work/adapters/$adapter" --max-steps 16 --run | tee "$root/data/vision-pilot/reports/train.log"
docker run "${common[@]}" --name study-signal-vision-eval study-signal-vision:pilot python -u training/evaluate_vision.py --model /models/qwen3-vl-8b --data /work/data/vision-pilot --adapter "/work/adapters/$adapter" --output "/work/reports/$adapter-evaluation.json"
printf 'Private evaluation: %s\n' "$root/data/vision-pilot/reports/$adapter-evaluation.json"
