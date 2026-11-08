import test from 'node:test';import assert from 'node:assert/strict';
import {createSpeaker,spokenText} from '../speech.mjs';
function fixture(request){let played=0,paused=0,revoked=0,audio;const states=[];const speaker=createSpeaker({request,makeAudio:()=>audio={play:()=>{played++;return Promise.resolve();},pause:()=>paused++},makeURL:()=> 'blob:test',revokeURL:()=>revoked++,systemSpeak:async()=>{},onState:value=>states.push(value)});return {speaker,states,counts:()=>({played,paused,revoked}),audio:()=>audio};}
const wav={mime:'audio/wav',audio:btoa('RIFF-test')};
test('cancel while generating prevents late speech and returns to idle',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>resolve=r));const pending=f.speaker.speak('설명',{consent:true});assert.ok(f.speaker.isActive());f.speaker.stop();resolve(wav);await pending;assert.equal(f.counts().played,0);assert.equal(f.speaker.isActive(),false);
});
test('playing audio can be stopped and its memory URL is released',async()=>{
 const f=fixture(async()=>wav);const pending=f.speaker.speak('설명',{consent:true});await Promise.resolve();assert.equal(f.counts().played,1);f.speaker.stop();await pending;assert.deepEqual(f.counts(),{played:1,paused:1,revoked:1});assert.equal(f.speaker.isActive(),false);
});
test('provider errors preserve text flow; no consent makes no paid request',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;throw new Error('연결 실패');});await f.speaker.speak('설명',{consent:false});assert.equal(calls,0);await f.speaker.speak('설명',{consent:true});assert.equal(calls,1);assert.equal(f.states.at(-1).error,'연결 실패');assert.equal(f.speaker.isActive(),false);
});
test('new speech supersedes older results and markdown is not read aloud',async()=>{
 let resolve;let calls=0;const f=fixture(()=>++calls===1?new Promise(r=>resolve=r):Promise.resolve(wav));const old=f.speaker.speak('이전',{consent:true});const next=f.speaker.speak('현재',{consent:true});await Promise.resolve();resolve(wav);await old;assert.equal(f.counts().played,1);f.audio().onended();await next;assert.equal(f.counts().revoked,1);assert.equal(spokenText('## **핵심** [자료](https://example.com)'),'핵심 자료');
});
