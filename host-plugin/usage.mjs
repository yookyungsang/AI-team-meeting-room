import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {transaction, check, hash, now} from './control.mjs';

const empty=()=>({version:1,sources:{}});
const fields=['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
const zero=()=>Object.fromEntries(fields.map(k=>[k,0]));
export function normalizeUsage(input){
 if(!input||!Number.isSafeInteger(input.input_tokens)||!Number.isSafeInteger(input.output_tokens))return null;
 const usage={input_tokens:input.input_tokens,cached_input_tokens:input.cached_input_tokens??0,output_tokens:input.output_tokens,reasoning_output_tokens:input.reasoning_output_tokens??0,total_tokens:input.total_tokens??(input.input_tokens+input.output_tokens)};
 if(fields.some(k=>!Number.isSafeInteger(usage[k])||usage[k]<0)||usage.cached_input_tokens>usage.input_tokens||usage.reasoning_output_tokens>usage.output_tokens||usage.total_tokens!==usage.input_tokens+usage.output_tokens)return null;
 return usage;
}
const category=name=>/wait_threads|wait_agent/.test(name)?'waiting':/room_(post|reply|get|claim)/.test(name)?'meeting':/unity|validation|run_tests|test_runner/.test(name)?'validation':'work';
const group=tags=>tags.length===1?tags[0]:tags.length>1?'mixed':'unclassified';
const refreshed=new Map();
export function normalizeLimits(input){
 const result=[];
 if(Array.isArray(input)){
  for(const value of input){if(!value||typeof value.bucket!=='string'||value.bucket.length>80||!['primary','secondary'].includes(value.window)||!Number.isFinite(value.usedPercent)||value.usedPercent<0||value.usedPercent>100)continue;
   result.push({bucket:value.bucket,window:value.window,usedPercent:value.usedPercent,windowDurationMins:Number.isInteger(value.windowDurationMins)&&value.windowDurationMins>0?value.windowDurationMins:null,resetsAt:Number.isInteger(value.resetsAt)&&value.resetsAt>0?value.resetsAt:null});}
 }else if(input&&typeof input==='object'){
  const buckets=input.rateLimitsByLimitId||{[input.limit_id||input.limitId||'codex']:input.rateLimits||input};
  for(const [bucket,limits] of Object.entries(buckets))for(const window of ['primary','secondary']){const v=limits?.[window];if(!v)continue;result.push(...normalizeLimits([{bucket,window,usedPercent:v.usedPercent??v.used_percent,windowDurationMins:v.windowDurationMins??v.window_minutes,resetsAt:v.resetsAt??v.resets_at}]));}
 }
 return result;
}
export class UsageLedger{
 constructor(control){this.control=control;this.file=path.join(control.home,'usage-ledger.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();}
 recordLimits(args){
  this.control.actor(args,{director:true,active:false});const observedAt=args.observedAt||now();check(Number.isFinite(Date.parse(observedAt)),'호스트에서 실제 조회한 시각이 필요합니다.');const windows=normalizeLimits(args.limits);check(windows.length>0,'실제로 조회한 한도 사용률이 필요합니다.');
  return transaction(this.file,empty,state=>{state.hostLimits??=[];const snapshot={at:observedAt,windows,source:'host-reported'};if(!state.hostLimits.some(s=>JSON.stringify(s)===JSON.stringify(snapshot)))state.hostLimits.push(snapshot);return {saved:true,windows:windows.length};});
 }
 discover(args){
  this.control.actor(args,{director:true,active:false});const root=args.file||path.join(os.homedir(),'.codex','sessions');check(path.isAbsolute(root),'세션 폴더의 절대 경로를 지정해 주세요.');
  const members=this.control.project.members,found=[],pending=[{dir:root,depth:0}];let visited=0;
  while(pending.length&&visited<20000){const {dir,depth}=pending.pop();let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
   for(const entry of entries){visited++;if(entry.isSymbolicLink())continue;const file=path.join(dir,entry.name);if(entry.isDirectory()&&depth<5)pending.push({dir:file,depth:depth+1});else if(entry.isFile()&&entry.name.endsWith('.jsonl')){const member=members.find(m=>entry.name.endsWith(m.threadId+'.jsonl'));if(member){try{this.attach({...args,file,sourceMemberId:member.id});found.push(member.id);}catch{}}}}
  }
  return {attachedMembers:[...new Set(found)],missingMembers:members.filter(m=>!found.includes(m.id)).map(m=>m.id),limited:visited>=20000};
 }
 attach(args){
  this.control.actor(args,{director:true,active:false});check(typeof args.file==='string'&&path.isAbsolute(args.file),'명시적으로 허용한 로컬 JSONL 파일의 절대 경로가 필요합니다.');
  const member=this.control.project.members.find(m=>m.id===args.sourceMemberId);check(member,'현재 연결된 담당자의 사용량만 새로 연결합니다.');
  const file=fs.realpathSync(args.file);check(path.extname(file)==='.jsonl'&&fs.statSync(file).isFile(),'기존 Codex JSONL 사용량 기록을 지정해 주세요.');
  // Read only a bounded header to establish scope. Transcripts are never stored.
  const fd=fs.openSync(file,'r'),buffer=Buffer.alloc(65536);let text;
  try{text=buffer.subarray(0,fs.readSync(fd,buffer,0,buffer.length,0)).toString('utf8');}finally{fs.closeSync(fd);}
  const events=text.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const identity=events.find(e=>e.type==='session_meta')?.payload?.id||events.find(e=>e.type==='thread.started')?.thread_id;
  check(identity===member.threadId,'JSONL의 실제 대화 ID가 이 담당자의 연결과 일치하지 않습니다.');
  return transaction(this.file,empty,state=>{
   const id=hash(file),existing=Object.values(state.sources).find(s=>s.threadId===identity);
   check(!existing||existing.id===id,'같은 대화를 여러 기록 파일에서 중복 집계하지 않습니다.');
   if(!state.sources[id])state.sources[id]={id,file,threadId:identity,offset:0,total:zero(),previous:null,turn:'unknown',turnTags:{},samples:[],invalid:0,resets:0,attachedAt:now()};
   return {attached:true,sourceId:id,memberId:member.id};
  });
 }
 sync(){
  if(!fs.existsSync(this.file))return this.summary();
  const ids=new Set(this.control.project.members.map(m=>m.threadId));
  transaction(this.file,empty,state=>{
   for(const source of Object.values(state.sources).filter(s=>ids.has(s.threadId))){
    try{
     const size=fs.statSync(source.file).size;
     if(size<source.offset){source.problem='로그가 교체되거나 잘렸습니다. 중복 집계를 피하려고 가져오기를 중단했습니다.';continue;}
     const length=Math.min(size-source.offset,8*1024*1024);if(length===0)continue;
     const fd=fs.openSync(source.file,'r'),buffer=Buffer.alloc(length);let bytes;
     try{bytes=buffer.subarray(0,fs.readSync(fd,buffer,0,length,source.offset));}finally{fs.closeSync(fd);}
     const end=bytes.lastIndexOf(10);if(end<0){source.problem='완성된 JSONL 줄을 기다리는 중입니다.';continue;}
     let position=source.offset;
     for(const raw of bytes.subarray(0,end+1).toString('utf8').split('\n').slice(0,-1)){
      const eventOffset=position;position+=Buffer.byteLength(raw)+1;let event;try{event=JSON.parse(raw);}catch{source.invalid++;continue;}
      const payload=event.payload||{};
      if(event.type==='event_msg'&&payload.type==='token_count'&&payload.rate_limits){const windows=normalizeLimits(payload.rate_limits);if(windows.length&&Number.isFinite(Date.parse(event.timestamp))){source.limits??=[];source.limits.push({at:event.timestamp,windows,source:'local-log'});}}
      source.turnTimes??={};
      if(event.type==='event_msg'&&payload.type==='task_started'){source.turn=payload.turn_id||'unknown';source.turnTimes[source.turn]={start:event.timestamp||null};}
      if(event.type==='turn.started'){source.turn=event.turn_id||'event-'+eventOffset;source.turnTimes[source.turn]={start:event.timestamp||null};}
      if(event.type==='response_item'&&payload.type==='function_call'){
       const tags=source.turnTags[source.turn]??=[];const tag=category(payload.name||'');if(!tags.includes(tag))tags.push(tag);
      }
      if(event.type==='turn.completed'||event.type==='event_msg'&&['task_complete','turn_aborted'].includes(payload.type))Object.assign(source.turnTimes[source.turn]??={start:null},{closed:true,end:event.timestamp||null});
      let usage,ambiguousBaseline=false;
      if(event.type==='event_msg'&&payload.type==='token_count'){
       if(payload.info==null)continue;
       const total=normalizeUsage(payload.info?.total_token_usage);if(!total){source.invalid++;continue;}
       if(source.previous&&fields.some(k=>total[k]<source.previous[k])){source.resets++;source.previous=total;continue;}
       if(!source.previous){const last=normalizeUsage(payload.info?.last_token_usage);usage=last||total;ambiguousBaseline=!last;}
       else usage=Object.fromEntries(fields.map(k=>[k,total[k]-source.previous[k]]));
       source.previous=total;
      }else if(event.type==='turn.completed')usage=normalizeUsage(event.usage);
      if(!usage||usage.total_tokens===0)continue;
      for(const field of fields)source.total[field]+=usage[field];
      source.samples.push({offset:eventOffset,turnId:source.turn,at:event.timestamp||null,usage,...(ambiguousBaseline?{ambiguousBaseline:true}:{})});
     }
     source.offset+=end+1;source.updatedAt=now();delete source.problem;
    }catch{source.problem='사용량 기록 파일에 접근할 수 없습니다.';}
   }
  });return this.summary();
 }
 label(args){
  this.control.actor(args,{director:true,active:false});check(['meeting','waiting','validation','work','mixed','unclassified'].includes(args.activity)&&typeof args.turnId==='string'&&args.turnId.length<=160,'관찰한 턴 ID와 활동 분류를 지정해 주세요.');
  return transaction(this.file,empty,state=>{const source=state.sources[args.sourceId];check(source&&this.control.store.members.some(m=>m.threadId===source.threadId),'이 프로젝트에 연결한 사용량 자료가 필요합니다.');check(source.samples.some(s=>s.turnId===args.turnId),'실제로 관찰한 턴만 분류할 수 있습니다.');source.labels??={};source.labels[args.turnId]=args.activity;return {saved:true};});
 }
 summary(){
  const ids=new Map(this.control.store.members.map(m=>[m.threadId,m.id])),sources=Object.values(this.read().sources).filter(s=>ids.has(s.threadId)),total=zero(),byActivity={};
  for(const source of sources){for(const field of fields)total[field]+=source.total[field];for(const sample of source.samples){const activity=source.labels?.[sample.turnId]||group(source.turnTags[sample.turnId]||[]);byActivity[activity]??={...zero(),events:0};for(const field of fields)byActivity[activity][field]+=sample.usage[field];byActivity[activity].events++;}}
  return {available:sources.some(s=>s.samples.length>0),total:sources.some(s=>s.samples.length>0)?total:null,byActivity,sources:sources.map(s=>({sourceId:s.id,memberId:ids.get(s.threadId),events:s.samples.length,updatedAt:s.updatedAt||null,problem:s.problem||null,invalid:s.invalid,resets:s.resets})),scope:'Imported local chat usage; includes history in attached files. Activity groups describe whole turns, not exact per-action billing. Mixed/unknown turns are not guessed. Cached input is part of input; reasoning is part of output.'};
 }
 report(requestId){
  const room=this.control.store.read(),request=room.requests.find(r=>r.id===requestId);check(request&&!request.followUpTo&&['completed','failed'].includes(request.status),'완료된 원래 요청의 사용량만 보고합니다.');
  const sources=Object.values(this.read().sources),rows=[],total=zero();let measured=0;
  for(const job of request.jobs){
   const member=this.control.store.members.find(m=>m.id===job.memberId),source=sources.find(s=>s.threadId===member?.threadId),start=Date.parse(job.memberId==='director'?request.createdAt:job.claimedAt||request.createdAt),end=Date.parse(job.completedAt||job.failedAt||job.supersededAt||room.messages.find(m=>m.requestId===request.id&&m.authorId===job.memberId&&m.kind==='final')?.createdAt||'');
   let usage=null,status='unavailable',events=0;
   if(source&&Number.isFinite(start)&&Number.isFinite(end)){
    const selected=source.samples.filter(sample=>{const time=Date.parse(sample.at),turnStart=Date.parse(source.turnTimes?.[sample.turnId]?.start);return Number.isFinite(turnStart)?turnStart>=start&&turnStart<=end:time>=start&&time<=end;});
    const overlapping=room.requests.filter(r=>r.id!==request.id&&r.followUpTo!==request.id&&request.followUpTo!==r.id).some(r=>{const other=r.jobs.find(j=>j.memberId===job.memberId);if(!other)return false;const a=Date.parse(other.claimedAt||r.createdAt),b=Date.parse(other.completedAt||other.failedAt||other.supersededAt||now());return selected.some(s=>{const t=Date.parse(s.at);return t>=a&&t<=b;});});
    if(overlapping)status='overlap';
    else if(selected.some(s=>!s.ambiguousBaseline)){usage=zero();for(const sample of selected.filter(s=>!s.ambiguousBaseline))for(const field of fields)usage[field]+=sample.usage[field];events=selected.length;status=source.resets||source.invalid||source.problem||selected.some(s=>s.ambiguousBaseline||!source.turnTimes?.[s.turnId]?.closed)?'partial':'measured';measured++;for(const field of fields)total[field]+=usage[field];}
   }
   rows.push({memberId:job.memberId,name:member?.name||job.memberId,role:member?.role||'',usage,status,events});
  }
  const end=Math.max(...request.jobs.map(j=>Date.parse(j.completedAt||j.failedAt||j.supersededAt||'')).filter(Number.isFinite));
  return {requestId:request.id,rows,total:measured?total:null,complete:rows.every(r=>r.status==='measured'),quota:this.quota(Date.parse(request.createdAt),end),scope:'Observed whole-turn tokens within this task. Concurrent tasks are not split or guessed; unavailable rows are excluded from the measured subtotal.'};
 }
 quota(start,end){
  const ledger=this.read(),ids=new Set(this.control.store.members.map(m=>m.threadId));
  const snapshots=[...(ledger.hostLimits||[]),...Object.values(ledger.sources).filter(s=>ids.has(s.threadId)).flatMap(s=>s.limits||[])].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const before=snapshots.filter(s=>Date.parse(s.at)<=start&&Date.parse(s.at)>=start-300000).at(-1);
  let after=snapshots.find(s=>Date.parse(s.at)>=end&&Date.parse(s.at)<=end+600000),provisional=false;
  if(!after){after=snapshots.filter(s=>Date.parse(s.at)<=end&&Date.parse(s.at)>=end-300000).at(-1);provisional=!!after;}
  if(!after)return {available:false,rows:[],scope:'Account-wide quota; no near-completion observation.'};
  const rows=after.windows.map(window=>{const prior=before?.windows.find(w=>w.bucket===window.bucket&&w.window===window.window&&w.resetsAt!==null&&w.resetsAt===window.resetsAt&&w.windowDurationMins===window.windowDurationMins),delta=prior&&window.usedPercent>=prior.usedPercent?Math.round((window.usedPercent-prior.usedPercent)*100)/100:null;return {...window,remainingPercent:Math.max(0,Math.round((100-window.usedPercent)*100)/100),changePercentagePoints:delta};});
  return {available:true,rows,observedAt:after.at,beforeAt:before?.at||null,provisional,source:after.source,scope:'Account-wide observed quota, not per-participant attribution. Other chats may contribute. Different reset windows are not subtracted.'};
 }
 reports(){
  if(fs.existsSync(this.file)&&Date.now()-(refreshed.get(this.file)||0)>10000){refreshed.set(this.file,Date.now());this.sync();}
  return this.control.store.read().requests.filter(r=>r.usageRequested===true&&!r.followUpTo&&['completed','failed'].includes(r.status)).slice(-3).map(r=>this.report(r.id));
 }
}
