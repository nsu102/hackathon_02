"""One-GPU vision LoRA pilot; never silently truncates image tokens."""
from pathlib import Path
import argparse,json,subprocess,time
from vision_data import check_splits,prompt

def main():
 p=argparse.ArgumentParser();p.add_argument('--data',required=True);p.add_argument('--model',required=True);p.add_argument('--output',required=True);p.add_argument('--max-steps',type=int,default=16);p.add_argument('--run',action='store_true');args=p.parse_args()
 groups=check_splits(args.data);print(json.dumps({'rows':{k:len(v) for k,v in groups.items()},'will_train':args.run}),flush=True)
 if not args.run:return
 out=Path(args.output)
 if out.exists() and any(out.iterdir()):raise ValueError('Refusing to overwrite an existing adapter')
 import torch
 from datasets import Dataset
 from PIL import Image
 from transformers import AutoModelForImageTextToText,AutoProcessor
 from peft import LoraConfig
 from trl import SFTConfig,SFTTrainer
 if not torch.cuda.is_available():raise RuntimeError('CUDA GPU required')
 processor=AutoProcessor.from_pretrained(args.model,local_files_only=True,min_pixels=256*28*28,max_pixels=1280*28*28)
 model=AutoModelForImageTextToText.from_pretrained(args.model,local_files_only=True,dtype=torch.bfloat16,attn_implementation='sdpa',device_map={'':0});model.config.use_cache=False
 targets=[name for name,_ in model.named_modules() if 'language_model.layers.' in name and name.endswith(('.q_proj','.v_proj'))]
 if not targets:raise RuntimeError('No language attention adapters matched; refusing vision/all-linear fallback')
 def dataset(rows):
  values=[{'prompt':prompt(r),'completion':[{'role':'assistant','content':json.dumps(r['target'],ensure_ascii=False)}],'image':Image.open(r['image_path']).convert('RGB')} for r in rows]
  return Dataset.from_list(values)
 config=SFTConfig(output_dir=str(out),max_length=None,packing=False,completion_only_loss=True,max_steps=args.max_steps,per_device_train_batch_size=1,per_device_eval_batch_size=1,gradient_accumulation_steps=4,learning_rate=5e-5,bf16=True,gradient_checkpointing=True,gradient_checkpointing_kwargs={'use_reentrant':False},eval_strategy='steps',eval_steps=args.max_steps,save_strategy='no',logging_steps=1,report_to='none',seed=42,dataloader_num_workers=0,remove_unused_columns=False)
 trainer=SFTTrainer(model=model,processing_class=processor,train_dataset=dataset(groups['train']),eval_dataset=dataset(groups['validation']),peft_config=LoraConfig(r=16,lora_alpha=32,lora_dropout=.05,bias='none',task_type='CAUSAL_LM',target_modules=targets),args=config)
 # Confirm the image/user prompt is masked out before any optimizer step.
 batch=trainer.data_collator([trainer.train_dataset[0]])
 labels=batch['labels'];assert (labels==-100).any() and (labels!=-100).any()
 started=time.monotonic();result=trainer.train();trainer.save_model(str(out));processor.save_pretrained(out)
 summary={'weights_trained':True,'base_model':Path(args.model).name,'steps':trainer.state.global_step,'seconds':round(time.monotonic()-started,2),'metrics':result.metrics,'vision_encoder_frozen':True,'lora_targets':len(targets),'rows':{k:len(v) for k,v in groups.items()},'not_promoted':True}
 (out/'training-summary.json').write_text(json.dumps(summary,indent=2)+'\n');(out/'environment.txt').write_text(subprocess.check_output(['python','-m','pip','freeze'],text=True));print(json.dumps(summary),flush=True)
if __name__=='__main__':main()
