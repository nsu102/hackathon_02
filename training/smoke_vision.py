"""Validate actual processor/collator and completion masking without loading weights."""
import argparse,json
from PIL import Image
from transformers import AutoProcessor
from trl.trainer.sft_trainer import DataCollatorForVisionLanguageModeling
from vision_data import check_splits,prompt

p=argparse.ArgumentParser();p.add_argument('--model',required=True);p.add_argument('--data',required=True);args=p.parse_args()
row=check_splits(args.data)['train'][0]
processor=AutoProcessor.from_pretrained(args.model,local_files_only=True,min_pixels=256*28*28,max_pixels=1280*28*28)
collator=DataCollatorForVisionLanguageModeling(processor,completion_only_loss=True,max_length=None)
batch=collator([{'prompt':prompt(row),'completion':[{'role':'assistant','content':json.dumps(row['target'],ensure_ascii=False)}],'image':Image.open(row['image_path']).convert('RGB')}])
labels=batch['labels'];image_id=processor.tokenizer.convert_tokens_to_ids('<|image_pad|>')
assert 'pixel_values' in batch and (labels!=-100).any() and (labels==-100).any()
assert (labels[batch['input_ids']==image_id]==-100).all()
target=processor.tokenizer.decode(labels[labels!=-100].tolist())
assert row['target']['content'] in target and 'personal_preferences' not in target
print(json.dumps({'processor_loaded':True,'pixel_values':True,'image_tokens_masked':True,'only_completion_trained':True,'tokens':labels.shape[-1]}))
