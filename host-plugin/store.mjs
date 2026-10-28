import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const stamp=()=>new Date().toISOString();
const empty=()=>({version:1,paused:false,requests:[],messages:[]});
const kinds=new Set(['assignment','question','answer','progress','decision','blocker']);
function source(members,{memberId,text,sourceThreadId,sourceTurnId,sourceMessageId}){
 const member=members.find(m=>m.id===memberId);
 assert(member,'기존 담당자가 필요합니다.');
 assert(typeof text==='string'&&text.trim()&&text.length<=20000,'발언 길이를 확인해 주세요.');
 if(sourceThreadId!==undefined||sourceTurnId!==undefined||sourceMessageId!==undefined){
  assert(sourceThreadId===member.threadId,'담당자의 원본 대화창 ID가 일치하지 않습니다.');
  assert(typeof sourceTurnId==='string'&&sourceTurnId.length>0&&sourceTurnId.length<=120,'실제 원본 turn ID가 필요합니다.');
  assert(typeof sourceMessageId==='string'&&sourceMessageId.length>0&&sourceMessageId.length<=120,'실제 원본 메시지 ID가 필요합니다.');
 }
 return member;
}

// No model, network, runtime-control or scheduling code belongs in this store.
export class RoomStore {
 constructor(file,project){this.file=path.resolve(file);this.lock=this.file+'.lock';this.project=project;this.members=project.members;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();}
 snapshot(){return {...this.read(),members:this.members,project:{id:this.project.id,name:this.project.name,workspacePath:this.project.workspacePath},mode:'host-relay'};}
 change(action){
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  let descriptor;
  try{descriptor=fs.openSync(this.lock,'wx');}catch{throw new Error('회의 기록을 저장 중입니다. 잠시 뒤 다시 확인해 주세요.');}
  const temp=this.file+'.'+randomUUID()+'.next';
  try{
   const state=this.read(), result=action(state);
   fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,this.file);
   return result;
  }finally{fs.closeSync(descriptor);fs.unlinkSync(this.lock);if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
 find(state,requestId,memberId){
  const request=state.requests.find(r=>r.id===requestId);assert(request,'회의 요청을 찾을 수 없습니다.');
  const member=this.members.find(m=>m.id===memberId),job=request.jobs.find(j=>j.memberId===memberId);
  assert(member&&job,'이 요청의 받는 사람이 아닙니다.');return {request,member,job};
 }
 submit({id,text,recipients}){
  assert(uuid.test(id||''),'올바른 요청 ID가 필요합니다.');
  assert(typeof text==='string'&&text.trim()&&text.length<=6000,'메시지는 1~6000자여야 합니다.');
  assert(Array.isArray(recipients)&&recipients.length>0&&recipients.length<=20&&recipients.every(id=>this.members.some(m=>m.id===id)),'이 프로젝트에 연결한 담당자만 선택할 수 있습니다.');
  const selected=[...new Set(recipients)].sort();text=text.trim();
  const request=this.change(state=>{
   const old=state.requests.find(r=>r.id===id);
   if(old){assert(old.text===text&&JSON.stringify(old.recipients)===JSON.stringify(selected),'같은 ID로 다른 요청을 보낼 수 없습니다.');return old;}
   assert(selected.length===1&&selected[0]==='director','사용자 요청은 총괄 디렉터에게 전달합니다.');
   assert(!state.paused,'새 요청 접수가 일시정지되어 있습니다.');
   assert(state.requests.filter(r=>!['completed','failed'].includes(r.status)).length<20,'진행 중인 요청을 먼저 확인해 주세요.');
   const request={id,projectId:this.project.id,text,recipients:selected,status:'pending',createdAt:stamp(),jobs:selected.map(memberId=>({memberId,state:'pending'}))};
   state.requests.push(request);state.messages.push({id:'user:'+id,requestId:id,authorId:'user',authorName:'사용자',text,createdAt:request.createdAt});return request;
  });
  return {request,state:this.snapshot(),wakePrompt:`[TEAM-ROOM ${this.project.id} ${id}]\n프로젝트: ${this.project.name}\n연결된 총괄: ${this.members.find(m=>m.id==='director').threadId} (host: ${this.members.find(m=>m.id==='director').hostId})\n팀 회의실 절차에 따라 해당 프로젝트 총괄에게만 요청을 처리하거나 한 번 전달해 주세요. 현재 대화가 총괄이면 직접 처리하세요. 새 대화창/에이전트를 만들거나 반복 자동 호출하지 마세요.\n받는 사람: ${selected.join(', ')}\n사용자 메시지:\n${text}`};
 }
 get(requestId,{statusOnly=false,includePrevious=false}={}){
  assert(typeof statusOnly==='boolean'&&typeof includePrevious==='boolean','조회 옵션을 확인해 주세요.');
  const state=this.read(),request=state.requests.find(r=>r.id===requestId);assert(request,'회의 요청을 찾을 수 없습니다.');
  if(statusOnly)return {request:{id:request.id,status:request.status,openQuestionCount:request.openQuestionCount||0,jobs:request.jobs.map(({memberId,state,error})=>({memberId,state,...(error?{error}:{})}))}};
  return {request,members:this.members,messages:state.messages.filter(m=>m.requestId===requestId),...(includePrevious?{previousMessages:state.messages.filter(m=>m.requestId!==requestId).slice(-20)}:{})};
 }
 claim({requestId,memberId}){
  return this.change(state=>{
   const existing=state.requests.find(r=>r.id===requestId);
   assert(existing&&this.members.some(m=>m.id===memberId),'기존 회의 요청과 담당자가 필요합니다.');
   if(!existing.jobs.some(j=>j.memberId===memberId)){
    assert(!['completed','failed'].includes(existing.status),'끝난 요청에 새 작업을 배정하지 않습니다.');
    assert(!state.paused,'새 전달이 일시정지되어 있습니다.');
    existing.jobs.push({memberId,state:'pending',delegated:true});
   }
   const {request,member,job}=this.find(state,requestId,memberId);
   if(job.state!=='pending')return {dispatch:false,request,member,job};
   assert(!state.paused,'새 전달이 일시정지되어 있습니다.');
   job.state='reserved';job.claimedAt=stamp();job.marker=`TEAM-ROOM ${this.project.id}/${requestId}/${memberId}`;request.status='processing';
   return {dispatch:true,request,member,job};
  });
 }
 post(args){
  const {requestId,memberId,text,sourceTurnId,sourceMessageId,kind,toMemberId,replyTo,messageKey}=args;
  const member=source(this.members,args);
  if(sourceMessageId===undefined)assert(typeof messageKey==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(messageKey),'직접 발언에는 재시도에도 동일한 messageKey가 필요합니다.');
  else assert(messageKey===undefined,'원본 ID와 직접 발언 키를 함께 사용하지 않습니다.');
  assert(kinds.has(kind),'발언 종류가 올바르지 않습니다.');
  assert(toMemberId===undefined||this.members.some(m=>m.id===toMemberId),'대상은 이 프로젝트에 연결한 담당자여야 합니다.');
  assert(kind!=='question'||(toMemberId&&toMemberId!==memberId),'질문에는 다른 담당자를 지정해 주세요.');
  return this.change(state=>{
   const request=state.requests.find(r=>r.id===requestId);assert(request,'회의 요청을 찾을 수 없습니다.');
   const parent=replyTo===undefined?null:state.messages.find(m=>m.id===replyTo&&m.requestId===requestId);
   assert(replyTo===undefined||parent,'같은 요청의 실제 발언에만 답변할 수 있습니다.');
   if(kind==='answer')assert(parent&&parent.kind==='question'&&parent.toMemberId===memberId&&toMemberId===parent.authorId,'질문 대상이 원래 질문자에게 답해야 합니다.');
   assert(request.jobs.some(j=>j.memberId===memberId)||parent?.toMemberId===memberId,'배정받거나 질문받은 담당자만 기록할 수 있습니다.');
   const old=state.messages.find(m=>m.requestId===requestId&&m.authorId===memberId&&(sourceMessageId===undefined?m.messageKey===messageKey:m.sourceMessageId===sourceMessageId&&m.sourceTurnId===sourceTurnId));
   if(old){assert(old.text===text&&old.kind===kind&&old.toMemberId===toMemberId&&old.replyTo===replyTo,'원본 발언은 덮어쓰지 않습니다.');return {created:false,message:old};}
   assert(!['completed','failed'].includes(request.status),'끝난 회의 요청에 발언을 추가하지 않습니다.');
   if(kind==='question')assert(!state.paused,'새 질문 전달이 일시정지되어 있습니다.');
   const message={id:randomUUID(),requestId,authorId:memberId,authorName:member.name,kind,text,sourceThreadId:member.threadId,...(sourceMessageId?{sourceTurnId,sourceMessageId,sourceType:'native-reference'}:{messageKey,sourceType:'tool-authored'}),createdAt:stamp(),provenance:'participant-posted',...(toMemberId?{toMemberId}:{}),...(replyTo?{replyTo}:{})};
   state.messages.push(message);this.update(request,state);return {created:true,message};
  });
 }
 reply({requestId,memberId,text,sourceThreadId,sourceTurnId,sourceMessageId}){
  source(this.members,{memberId,text,sourceThreadId,sourceTurnId,sourceMessageId});
  return this.change(state=>{
   const {request,member,job}=this.find(state,requestId,memberId);
   const old=state.messages.find(m=>m.requestId===requestId&&m.authorId===memberId&&(!m.kind||m.kind==='final'));
   if(old){assert(old.text===text&&old.sourceTurnId===sourceTurnId&&old.sourceMessageId===sourceMessageId,'이미 기록한 답변은 덮어쓰지 않습니다.');return old;}
   assert(job.state==='reserved','먼저 요청을 확인하고 전달을 예약해야 합니다.');
   assert(!state.messages.some(m=>m.requestId===requestId&&m.authorId===memberId&&m.kind==='question'&&!state.messages.some(a=>a.requestId===requestId&&a.kind==='answer'&&a.replyTo===m.id)),'답변이 필요한 질문을 해결한 뒤 완료해 주세요.');
   const message={id:randomUUID(),requestId,authorId:memberId,authorName:member.name,kind:'final',text,sourceThreadId:member.threadId,...(sourceMessageId?{sourceTurnId,sourceMessageId,sourceType:'native-reference'}:{sourceType:'tool-authored'}),createdAt:stamp(),provenance:'participant-posted'};
   state.messages.push(message);job.state='completed';job.completedAt=stamp();
   this.update(request,state);return message;
  });
 }
 fail({requestId,memberId,reason}){
  assert(typeof reason==='string'&&reason.trim()&&reason.length<=1000,'실패 이유가 필요합니다.');
  return this.change(state=>{const {request,job}=this.find(state,requestId,memberId);assert(job.state!=='completed','완료한 답변은 변경하지 않습니다.');job.state='failed';job.error=reason;this.update(request,state);return request;});
 }
 update(request,state){
  const openQuestions=state.messages.filter(m=>m.requestId===request.id&&m.kind==='question'&&!state.messages.some(a=>a.requestId===request.id&&a.kind==='answer'&&a.replyTo===m.id));
  request.openQuestionCount=openQuestions.length;
  request.status=openQuestions.length?'processing':request.jobs.every(j=>j.state==='completed')?'completed':request.jobs.every(j=>['completed','failed'].includes(j.state))?'failed':'processing';
 }
 pause(paused){assert(typeof paused==='boolean','일시정지 값이 올바르지 않습니다.');this.change(state=>{state.paused=paused;});return this.snapshot();}
}
