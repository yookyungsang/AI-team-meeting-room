import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RoomImages} from './images.mjs';
import {RoomAudio} from './audio.mjs';
import {transaction} from './control.mjs';
import {knownMembers} from './projects.mjs';

const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const stamp=()=>new Date().toISOString();
const empty=()=>({version:1,paused:false,requests:[],messages:[]});
const kinds=new Set(['assignment','question','answer','progress','decision','blocker']);
const publicMessage=({imageInputKey,audioInputKey,...message},legacyMembers=[])=>{
 const legacy=legacyMembers.find(m=>m.id===message.authorId);
 return message.authorRole||!legacy?message:{...message,authorRole:legacy.role};
};
function validateDetails(details){assert(details===undefined||(typeof details==='string'&&details.trim()&&details.length<=20000),'작업 상세는 생략하거나 1~20000자로 작성해 주세요.');}
function wakePrompt(project,request){
 // Preserve the original legacy envelope on explicit storage retries. New IDs
 // use the compact envelope; neither path changes the saved human message.
 if(!request.textVerbatim){
  const director=project.members.find(m=>m.id==='director');
  return `[TEAM-ROOM ${project.id} ${request.id}]\n프로젝트: ${project.name}\n연결된 총괄: ${director.threadId} (host: ${director.hostId})\n팀 회의실 절차에 따라 해당 프로젝트 총괄에게만 요청을 처리하거나 한 번 전달해 주세요. 현재 대화가 총괄이면 직접 처리하세요. 새 대화창/에이전트를 만들거나 반복 자동 호출하지 마세요.\n${request.followUpTo?`진행 중인 원래 요청: ${request.followUpTo}\n이번 메시지는 작업 중 추가된 사용자 지시입니다. 원래 작업을 다시 시작하거나 담당자에게 중복 배정하지 말고 현재 작업에 반영하세요. 추가 요청 자체의 처리 결과도 기록하세요.\n`:''}받는 사람: ${request.recipients.join(', ')}\n사용자 메시지:\n${request.text}`;
 }
 const lines=[`[TEAM-ROOM ${project.id} ${request.id}]`,'room_get으로 총괄을 확인하세요. 연결된 총괄만 처리하고, 다른 채팅이면 해당 총괄에게 한 번만 전달하세요.'];
 if(request.followUpTo)lines.push(`추가 지시: ${request.followUpTo} · 기존 작업에 반영하고 중복 배정하지 마세요.`);
 return lines.join('\n')+'\n\n사용자 메시지:\n'+request.text;
}
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
 constructor(file,project,resolveProject=()=>project){this.file=path.resolve(file);this.lock=this.file+'.lock';this.resolveProject=resolveProject;this.images=new RoomImages(this.file+'.images');this.audio=new RoomAudio(this.file+'.audio');}
 get project(){return this.resolveProject();}
 get members(){return knownMembers(this.project);}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();}
 snapshot(){const state=this.read(),project=this.project;return {...state,messages:state.messages.map(m=>publicMessage(m,project.legacyMembers)),members:project.members,...(project.retiredMembers?.length?{formerMembers:project.retiredMembers.map(({id,name,role})=>({id,name,role}))}:{}),project:{id:project.id,name:project.name,workspacePath:project.workspacePath,revision:project.revision||1},mode:'host-relay'};}
 change(action){
  return transaction(this.file,empty,action);
 }
 find(state,requestId,memberId){
  const request=state.requests.find(r=>r.id===requestId);assert(request,'회의 요청을 찾을 수 없습니다.');
  const member=this.members.find(m=>m.id===memberId),job=request.jobs.find(j=>j.memberId===memberId);
  assert(member&&job,'이 요청의 받는 사람이 아닙니다.');return {request,member,job};
 }
 submit({id,text,recipients,followUpTo}){
  assert(uuid.test(id||''),'올바른 요청 ID가 필요합니다.');
  assert(typeof text==='string'&&text.trim()&&text.length<=6000,'메시지는 1~6000자여야 합니다.');
  assert(Array.isArray(recipients)&&recipients.length>0&&recipients.length<=20&&recipients.every(id=>this.members.some(m=>m.id===id)),'이 프로젝트에 연결한 담당자만 선택할 수 있습니다.');
  const selected=[...new Set(recipients)].sort();
  assert(followUpTo===undefined||uuid.test(followUpTo),'추가 전달할 원래 요청 ID를 확인해 주세요.');
  const request=this.change(state=>{
   const old=state.requests.find(r=>r.id===id);
   if(old){const sameText=old.text===text||(!old.textVerbatim&&old.text===text.trim());assert(sameText&&old.followUpTo===followUpTo&&JSON.stringify(old.recipients)===JSON.stringify(selected),'같은 ID로 다른 요청을 보낼 수 없습니다.');return old;}
   assert(selected.length===1&&selected[0]==='director','사용자 요청은 총괄 디렉터에게 전달합니다.');
   assert(!state.paused,'새 요청 접수가 일시정지되어 있습니다.');
   const parent=followUpTo===undefined?null:state.requests.find(r=>r.id===followUpTo);
   if(followUpTo!==undefined){
    assert(parent&&!parent.followUpTo,'이 프로젝트의 원래 요청에만 추가 내용을 전달할 수 있습니다.');
    assert(!['completed','failed'].includes(parent.status),'이미 끝난 요청입니다. 새 요청으로 보내 주세요.');
   }
   assert(state.requests.filter(r=>!['completed','failed'].includes(r.status)).length<20,'진행 중인 요청을 먼저 확인해 주세요.');
   const request={id,projectId:this.project.id,text,textVerbatim:true,recipients:selected,...(parent?{followUpTo}:{}),status:'pending',usageRequested:true,createdAt:stamp(),jobs:selected.map(memberId=>({memberId,state:'pending'}))};
   state.requests.push(request);state.messages.push({id:'user:'+id,requestId:id,authorId:'user',authorName:'사용자',text,...(parent?{kind:'follow-up',followUpTo}:{}),createdAt:request.createdAt});
   if(parent)this.update(parent,state);
   return request;
  });
  return {request,state:this.snapshot(),wakePrompt:wakePrompt(this.project,request)};
 }
 get(requestId,{statusOnly=false,includePrevious=false}={}){
  assert(typeof statusOnly==='boolean'&&typeof includePrevious==='boolean','조회 옵션을 확인해 주세요.');
  const state=this.read(),request=state.requests.find(r=>r.id===requestId);assert(request,'회의 요청을 찾을 수 없습니다.');
  if(statusOnly)return {request:{id:request.id,status:request.status,openQuestionCount:request.openQuestionCount||0,openFollowUpCount:request.openFollowUpCount||0,jobs:request.jobs.map(({memberId,state,error,requireFinalImage,requireFinalAudio})=>({memberId,state,...(error?{error}:{}),...(requireFinalImage?{requireFinalImage:true}:{}),...(requireFinalAudio?{requireFinalAudio:true}:{})}))}};
  const parent=request.followUpTo&&state.requests.find(r=>r.id===request.followUpTo);
  const summary=({id,text,status,createdAt})=>({id,text,status,createdAt});
  const message=m=>publicMessage(m,this.project.legacyMembers);
  const messages=state.messages.filter(m=>m.requestId===requestId).map(message),previousMessages=includePrevious?state.messages.filter(m=>m.requestId!==requestId).slice(-20).map(message):[];
  const relevant=new Set([...request.jobs.map(j=>j.memberId),...[...messages,...previousMessages].flatMap(m=>[m.authorId,m.toMemberId])]);
  return {request,members:this.members.filter(m=>!m.retired||relevant.has(m.id)),messages,followUps:state.requests.filter(r=>r.followUpTo===requestId).map(summary),...(parent?{parentRequest:summary(parent)}:{}),...(includePrevious?{previousMessages}:{})};
 }
 image({requestId,messageId,imageId}){
  const message=this.read().messages.find(m=>m.requestId===requestId&&m.id===messageId);
  const image=message?.images?.find(item=>item.id===imageId);assert(image,'이 프로젝트의 발언에 첨부된 이미지를 찾을 수 없습니다.');
  return {image,dataUrl:this.images.read(image)};
 }
 audioFile({requestId,messageId,audioId}){
  const message=this.read().messages.find(m=>m.requestId===requestId&&m.id===messageId),audio=message?.audio?.find(a=>a.id===audioId);
  assert(audio,'이 요청의 발언에 첨부된 음원을 찾을 수 없습니다.');return {audio,dataUrl:this.audio.read(audio)};
 }
 claim({requestId,memberId,requireFinalImage,requireFinalAudio}){
  assert(requireFinalImage===undefined||typeof requireFinalImage==='boolean','완료 이미지 필수 여부는 참 또는 거짓이어야 합니다.');
  assert(requireFinalAudio===undefined||typeof requireFinalAudio==='boolean','완료 음원 필수 여부는 참 또는 거짓이어야 합니다.');
  return this.change(state=>{
   const existing=state.requests.find(r=>r.id===requestId);
   assert(existing&&this.members.some(m=>m.id===memberId),'기존 회의 요청과 담당자가 필요합니다.');
   if(!existing.jobs.some(j=>j.memberId===memberId)){
    assert(this.project.members.some(m=>m.id===memberId),'현재 회의실에 연결된 담당자에게만 새 작업을 배정합니다.');
    assert(!['completed','failed'].includes(existing.status),'끝난 요청에 새 작업을 배정하지 않습니다.');
    assert(!state.paused,'새 전달이 일시정지되어 있습니다.');
    existing.jobs.push({memberId,state:'pending',delegated:true});
   }
   const {request,member,job}=this.find(state,requestId,memberId);
   assert(!(job.requireFinalImage&&requireFinalImage===false),'이미 지정한 완료 이미지 조건을 해제하지 않습니다.');
   if(requireFinalImage&&!job.requireFinalImage){
    assert(['pending','reserved'].includes(job.state),'이미 끝나거나 인계된 작업의 완료 조건은 바꾸지 않습니다.');
    job.requireFinalImage=true;
   }
   assert(!(job.requireFinalAudio&&requireFinalAudio===false),'이미 지정한 완료 음원 조건을 해제하지 않습니다.');
   if(requireFinalAudio&&!job.requireFinalAudio){assert(['pending','reserved'].includes(job.state),'끝난 작업의 완료 조건은 바꾸지 않습니다.');job.requireFinalAudio=true;}
   if(job.state!=='pending')return {dispatch:false,request,member,job};
   assert(this.project.members.some(m=>m.id===memberId),'제외된 담당자에게 새 작업을 전달하지 않습니다.');
   assert(!state.paused,'새 전달이 일시정지되어 있습니다.');
   job.state='reserved';job.claimedAt=stamp();job.marker=`TEAM-ROOM ${this.project.id}/${requestId}/${memberId}`;request.status='processing';
   return {dispatch:true,request,member,job};
  });
 }
 post(args){
  const {requestId,memberId,text,details,sourceTurnId,sourceMessageId,kind,toMemberId,replyTo,messageKey}=args;
  const member=source(this.members,args);
  validateDetails(details);
  const imageInput=this.images.input(args.images);
  const audioInput=this.audio.input(args.audio);
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
   if(old){assert(old.text===text&&old.details===details&&old.kind===kind&&old.toMemberId===toMemberId&&old.replyTo===replyTo&&old.imageInputKey===imageInput.key&&old.audioInputKey===audioInput.key,'원본 발언은 덮어쓰지 않습니다.');return {created:false,message:old};}
   assert(!['completed','failed'].includes(request.status),'끝난 회의 요청에 발언을 추가하지 않습니다.');
   assert(this.project.members.some(m=>m.id===memberId),'제외된 담당자는 새 발언을 기록하지 않습니다.');
   if(toMemberId)assert(this.project.members.some(m=>m.id===toMemberId),'제외된 담당자에게 새 발언을 전달하지 않습니다.');
   if(kind==='question')assert(!state.paused,'새 질문 전달이 일시정지되어 있습니다.');
   const message={id:randomUUID(),requestId,authorId:memberId,authorName:member.name,authorRole:member.role,kind,text,...(details===undefined?{}:{details}),sourceThreadId:member.threadId,...(sourceMessageId?{sourceTurnId,sourceMessageId,sourceType:'native-reference'}:{messageKey,sourceType:'tool-authored'}),createdAt:stamp(),provenance:'participant-posted',...(toMemberId?{toMemberId}:{}),...(replyTo?{replyTo}:{})};
   const stagedAudio=this.audio.stage(audioInput.items);
   if(imageInput.items.length){message.images=this.images.capture(imageInput.items);message.imageInputKey=imageInput.key;}
   if(stagedAudio.length){message.audio=this.audio.save(stagedAudio);message.audioInputKey=audioInput.key;}
   state.messages.push(message);this.update(request,state);return {created:true,message};
  });
 }
 reply({requestId,memberId,text,details,sourceThreadId,sourceTurnId,sourceMessageId,images,audio}){
  source(this.members,{memberId,text,sourceThreadId,sourceTurnId,sourceMessageId});
  validateDetails(details);
  const imageInput=this.images.input(images);
  const audioInput=this.audio.input(audio);
  return this.change(state=>{
   const {request,member,job}=this.find(state,requestId,memberId);
   const old=state.messages.find(m=>m.requestId===requestId&&m.authorId===memberId&&(!m.kind||m.kind==='final'));
   if(old){assert(old.text===text&&old.details===details&&old.sourceTurnId===sourceTurnId&&old.sourceMessageId===sourceMessageId&&old.imageInputKey===imageInput.key&&old.audioInputKey===audioInput.key,'이미 기록한 답변은 덮어쓰지 않습니다.');return old;}
   assert(job.state==='reserved','먼저 요청을 확인하고 전달을 예약해야 합니다.');
   assert(!job.requireFinalImage||imageInput.items.length>0,'이미지 작업 담당자가 자신의 완료 보고에 실제 최종 이미지를 첨부해야 합니다. 중간 이미지만으로 완료 처리하지 않습니다.');
   assert(!job.requireFinalAudio||audioInput.items.length>0,'음원 제작 담당자가 자신의 완료 보고에 실제 최종 음원을 첨부해야 합니다.');
   if(memberId==='director')assert(!request.jobs.some(j=>j.memberId!=='director'&&j.requireFinalAudio&&!['completed','superseded'].includes(j.state)),'음원 제작자의 최종 첨부 또는 미완료 사유를 먼저 확인해 주세요.');
   if(memberId==='director')assert(!request.jobs.some(j=>j.memberId!=='director'&&j.requireFinalImage&&!['completed','superseded'].includes(j.state)),'완료 이미지 담당자의 최종 첨부 또는 미완료 사유를 먼저 확인해 주세요. 이미지가 누락되거나 차단된 작업을 성공으로 완료하지 않습니다.');
   if(memberId==='director')assert(!state.requests.some(r=>r.followUpTo===requestId&&r.status!=='completed'),'사용자가 추가로 보낸 요청을 확인하고 처리한 뒤 원래 요청을 완료해 주세요.');
   assert(!state.messages.some(m=>m.requestId===requestId&&m.authorId===memberId&&m.kind==='question'&&!state.messages.some(a=>a.requestId===requestId&&a.kind==='answer'&&a.replyTo===m.id)),'답변이 필요한 질문을 해결한 뒤 완료해 주세요.');
   const message={id:randomUUID(),requestId,authorId:memberId,authorName:member.name,authorRole:member.role,kind:'final',text,...(details===undefined?{}:{details}),sourceThreadId:member.threadId,...(sourceMessageId?{sourceTurnId,sourceMessageId,sourceType:'native-reference'}:{sourceType:'tool-authored'}),createdAt:stamp(),provenance:'participant-posted'};
   const stagedAudio=this.audio.stage(audioInput.items);
   if(imageInput.items.length){message.images=this.images.capture(imageInput.items);message.imageInputKey=imageInput.key;}
   if(stagedAudio.length){message.audio=this.audio.save(stagedAudio);message.audioInputKey=audioInput.key;}
   state.messages.push(message);job.state='completed';job.completedAt=stamp();
   this.update(request,state);return message;
  });
 }
 fail({requestId,memberId,reason}){
  assert(typeof reason==='string'&&reason.trim()&&reason.length<=1000,'실패 이유가 필요합니다.');
  return this.change(state=>{const {request,job}=this.find(state,requestId,memberId);assert(!['completed','superseded'].includes(job.state),'완료하거나 인계한 답변은 변경하지 않습니다.');if(job.state==='failed'){assert(job.error===reason,'기존 실패 기록은 덮어쓰지 않습니다.');return request;}job.state='failed';job.failedAt=stamp();job.error=reason;this.update(request,state);return request;});
 }
 update(request,state){
  const openQuestions=state.messages.filter(m=>m.requestId===request.id&&m.kind==='question'&&!state.messages.some(a=>a.requestId===request.id&&a.kind==='answer'&&a.replyTo===m.id));
  request.openQuestionCount=openQuestions.length;
  const followUps=state.requests.filter(r=>r.followUpTo===request.id);
  request.openFollowUpCount=followUps.filter(r=>!['completed','failed'].includes(r.status)).length;
  request.status=openQuestions.length||request.openFollowUpCount?'processing':request.jobs.every(j=>['completed','superseded'].includes(j.state))&&followUps.every(r=>r.status==='completed')?'completed':request.jobs.every(j=>['completed','failed','superseded'].includes(j.state))?'failed':'processing';
  if(request.followUpTo){const parent=state.requests.find(r=>r.id===request.followUpTo);if(parent)this.update(parent,state);}
 }
 pause(paused){assert(typeof paused==='boolean','일시정지 값이 올바르지 않습니다.');this.change(state=>{state.paused=paused;});return this.snapshot();}
}
