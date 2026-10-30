import {createHash} from 'node:crypto';

// Response compaction only: no timers, disk writes, caller authentication or AI.
// Without reader identity, preserve legacy reads rather than hide another
// participant's first read. Entries contain fingerprints, never transcripts.
export class ReadGate {
 constructor({clock=Date.now,windowMs=30000,maxEntries=256}={}){this.clock=clock;this.windowMs=windowMs;this.maxEntries=maxEntries;this.entries=new Map();}
 read(data,{projectId,requestId,readerId,statusOnly=false,includePrevious=false,refreshReason}={},members=[]){
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  check(readerId===undefined||typeof readerId==='string'&&members.some(m=>m.id===readerId),'조회 담당자는 이 프로젝트의 기존 담당자로 지정해 주세요.');
  check(refreshReason===undefined||['decision','recovery','evidence','user_request'].includes(refreshReason),'전체 재조회 이유는 decision, recovery, evidence, user_request 중 하나로 지정해 주세요.');
  if(readerId===undefined||statusOnly)return data;
  const key=JSON.stringify([projectId,requestId,readerId,statusOnly,includePrevious]);
  const revision=createHash('sha256').update(JSON.stringify(data)).digest('hex'),now=this.clock(),old=this.entries.get(key);
  if(!refreshReason&&old?.revision===revision&&now>=old.at&&now-old.at<this.windowMs){
   const r=data.request;
   return {unchanged:true,retryAfterMs:this.windowMs-(now-old.at),request:{id:r.id,status:r.status,openQuestionCount:r.openQuestionCount||0,openFollowUpCount:r.openFollowUpCount||0,jobs:r.jobs.map(({memberId,state,error,requireFinalImage,requireFinalAudio})=>({memberId,state,...(error?{error}:{}),...(requireFinalImage?{requireFinalImage:true}:{}),...(requireFinalAudio?{requireFinalAudio:true}:{})}))}};
  }
  this.entries.delete(key);this.entries.set(key,{revision,at:now});
  while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value);
  return data;
 }
}
