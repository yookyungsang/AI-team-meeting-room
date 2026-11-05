// Read-only presentation of saved records. No native liveness inference,
// file hashing, recovery, lease release, approval or message dispatch occurs.
const terminal=new Set(['completed','failed']);
const indexes=new WeakMap();
const clip=(value,max=2000)=>String(value||'').slice(0,max);
function index(room){
 if(indexes.has(room))return indexes.get(room);
 const active=room.requests.filter(r=>!terminal.has(r.status)),activeIds=new Set(active.map(r=>r.id));
 const answered=new Set(room.messages.filter(m=>m.kind==='answer').map(m=>m.requestId+':'+m.replyTo));
 const questions=room.messages.filter(m=>m.kind==='question'&&!answered.has(m.requestId+':'+m.id));
 const jobs=active.flatMap(r=>r.jobs||[]);
 const candidates=room.requests.filter(r=>!r.followUpTo&&r.status!=='completed').slice().reverse();
 const data={questions,candidates,summary:{activeRequests:active.filter(r=>!r.followUpTo).length,
  awaitingMembers:new Set(jobs.filter(j=>j.state==='reserved').map(j=>j.memberId)).size,
  pendingJobs:jobs.filter(j=>j.state==='pending').length,
  openQuestions:questions.filter(q=>activeIds.has(q.requestId)).length,
  failedRequests:room.requests.filter(r=>!r.followUpTo&&r.status==='failed').length}};
 indexes.set(room,data);return data;
}
export const activitySummary=room=>({...index(room).summary});

export function recoveryGuide(control,{requestId}={}){
 const {store}=control,room=store.read(),{candidates,questions}=index(room);
 if(store.project.archivedAt)throw new Error('삭제된 회의실은 복구한 뒤 작업 안내를 확인해 주세요.');
 if(requestId!==undefined&&(typeof requestId!=='string'||requestId.length>200))throw new Error('작업 안내의 요청을 확인해 주세요.');
 const request=requestId===undefined?candidates.find(r=>!terminal.has(r.status))||candidates[0]:room.requests.find(r=>r.id===requestId&&!r.followUpTo);
 if(requestId!==undefined&&!request)throw new Error('이 회의실의 원래 요청을 선택해 주세요.');
 const choices=candidates.slice(0,20);
 if(request&&!choices.includes(request))choices.push(request);
 const result={projectId:store.project.id,requestId:request?.id||null,readOnly:true,
  recordTrust:'reference_not_authorization',summary:activitySummary(room),choiceTotal:candidates.length,
  choices:choices.map(r=>({id:r.id,label:clip(r.text,120),status:r.status}))};
 if(!request)return {...result,jobs:[],checks:[],questions:[]};
 const document=control.read(),state=control.state(document),scope=new Set([request.id,...room.requests.filter(r=>r.followUpTo===request.id).map(r=>r.id)]);
 const members=[...store.project.members,...(store.project.retiredMembers||[])];
 const jobs=request.jobs.map(job=>{
  const member=members.find(m=>m.id===job.memberId),checkpoint=state.checkpoints[request.id+':'+job.memberId];
  const locks=document.leases.filter(l=>l.projectId===store.project.id&&l.requestId===request.id&&l.memberId===job.memberId&&!l.releasedAt).flatMap(l=>l.targets.map(t=>t.relative));
  return {memberId:job.memberId,name:member?.name||job.memberId,role:member?.role||'',state:job.state,
   error:clip(job.error),locks:locks.slice(0,30),lockTotal:locks.length,
   checkpoint:checkpoint?{summary:clip(checkpoint.summary),nextSteps:checkpoint.nextSteps.map(s=>clip(s,1000)),updatedAt:checkpoint.updatedAt}:null};
 });
 const checks=Object.values(state.cases).filter(c=>scope.has(c.attempts.at(-1)?.requestId)||scope.has(c.retest?.requestId)).map(c=>{
  const last=c.attempts.at(-1),current=last?.generation===c.generation;
  return {label:c.label,status:current?last.status:'pending',blocked:!!c.blocked,waived:!!c.waived,required:c.required!==false,
   summary:current?clip(last.summary):'',running:current&&last.status==='running'};
 });
 const open=questions.filter(q=>scope.has(q.requestId));
 return {...result,status:request.status,jobs,checks:checks.slice(0,30),checkTotal:checks.length,
  questions:open.slice(-10).map(q=>({author:members.find(m=>m.id===q.authorId)?.name||q.authorId,text:clip(q.text,1000)})),questionTotal:open.length};
}
