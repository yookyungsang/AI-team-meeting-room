import fs from 'node:fs';
import path from 'node:path';
import {transaction,hash,now} from './control.mjs';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
export const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
const label=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export const knownMembers=project=>[...project.members,...(project.retiredMembers||[]).map(m=>({...m,retired:true}))];
const revision=project=>project.revision||1;
const sameRoute=(a,b)=>a.threadId===b.threadId&&a.hostId===b.hostId;
export function validateProject(input){
 check(validId(input?.id),'프로젝트 ID는 영문 소문자로 시작하는 64자 이내 식별자여야 합니다.');
 check(label(input.name,120),'프로젝트 이름을 확인해 주세요.');
 check(input.workspacePath===undefined||label(input.workspacePath,1000),'작업 폴더를 확인해 주세요.');
 check(Array.isArray(input.members)&&input.members.length>=1&&input.members.length<=20,'참여자는 총괄을 포함해 1~20명이어야 합니다.');
 const members=input.members.map(m=>{
  check(validId(m.id)&&m.id!=='user','참여자 ID를 확인해 주세요.');
  check(label(m.name,80)&&label(m.role,80),'참여자 이름과 역할을 확인해 주세요.');
  check(label(m.threadId,160)&&label(m.hostId,160),'실제 기존 대화 ID와 호스트가 필요합니다.');
  return {id:m.id,name:m.name.trim(),role:m.role.trim(),threadId:m.threadId,hostId:m.hostId};
 });
 check(members.filter(m=>m.id==='director').length===1,'director 역할의 총괄이 한 명 필요합니다.');
 check(new Set(members.map(m=>m.id)).size===members.length,'참여자 ID는 중복될 수 없습니다.');
 check(new Set(members.map(m=>m.hostId+'\0'+m.threadId)).size===members.length,'한 대화를 여러 담당자로 중복 연결하지 않습니다.');
 return {id:input.id,name:input.name.trim(),...(input.workspacePath?{workspacePath:input.workspacePath}:{}),members};
}
export class Projects {
 constructor(home){this.home=path.resolve(home);this.file=path.join(this.home,'projects.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,projects:[]};}
 list(){return this.read().projects.map(p=>({id:p.id,name:p.name,directorName:p.members.find(m=>m.id==='director').name}));}
 get(id){check(validId(id),'명시적인 프로젝트 ID가 필요합니다.');const p=this.read().projects.find(p=>p.id===id);check(p,'연결되지 않은 프로젝트입니다.');return p;}
 roomPath(id){check(validId(id),'잘못된 프로젝트 ID입니다.');return path.join(this.home,'rooms',id+'.json');}
 configure(input){
  const project=validateProject(input);fs.mkdirSync(this.home,{recursive:true});
  return transaction(this.file,()=>({version:1,projects:[]}),state=>{
   const old=state.projects.find(p=>p.id===project.id);
   // A room's routing never changes under an in-flight or historical request.
   if(old){check(JSON.stringify(validateProject(old))===JSON.stringify(project),'기존 등록은 덮어쓰지 않습니다. 구성원 변경은 room_members로 요청해 주세요.');return {created:false,project,revision:revision(old)};}
   state.projects.push({...project,revision:1});
   return {created:true,project,revision:1};
  });
 }
 updateMembers({projectId,memberId,expectedRevision,changeId,members}){
  check(validId(projectId),'명시적인 프로젝트 ID가 필요합니다.');
  check(memberId==='director','총괄만 사용자 승인 범위 안에서 구성원을 변경할 수 있습니다.');
  check(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1,'현재 구성의 revision이 필요합니다.');
  check(typeof changeId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(changeId),'변경마다 고정된 UUID changeId가 필요합니다.');
  this.get(projectId);
  // Keep assignment/ownership locks through the registry commit. Inspecting the
  // room and work controls must not create data files or rewrite their history.
  return transaction(this.roomPath(projectId),()=>({requests:[],messages:[]}),room=>
   transaction(path.join(this.home,'work-control.json'),()=>({projects:{},leases:[]}),controls=>
    transaction(this.file,()=>({version:1,projects:[]}),state=>{
     const old=state.projects.find(p=>p.id===projectId);check(old,'연결되지 않은 프로젝트입니다.');
     const desired=validateProject({...old,members}).members,input=hash(JSON.stringify([expectedRevision,desired]));
     const previous=old.memberChanges?.find(c=>c.id===changeId);
     const receipt=(change,replayed)=>({updated:change.changed,replayed,appliedRevision:change.revision,revision:revision(old),members:old.members,retiredCount:old.retiredMembers?.length||0});
     if(previous){check(previous.input===input,'같은 changeId로 변경 내용을 바꿀 수 없습니다.');return receipt(previous,true);}
     check(revision(old)===expectedRevision,'구성이 변경되었습니다. room_state로 최신 revision과 구성원을 확인해 주세요.');
     const known=knownMembers(old);
     for(const member of desired){
      const prior=known.find(m=>m.id===member.id);
      check(!prior||sameRoute(prior,member),'기존 담당자 ID의 대화·호스트는 바꾸지 않습니다. 교체할 담당자는 새 ID로 연결해 주세요.');
      check(!known.some(m=>m.id!==member.id&&sameRoute(m,member)),'기존 또는 제외된 담당자의 대화를 다른 ID로 중복 연결하지 않습니다.');
     }
     const removed=new Set(old.members.filter(m=>!desired.some(next=>next.id===m.id)).map(m=>m.id));
     check(!room.requests.some(r=>r.jobs.some(j=>removed.has(j.memberId)&&['pending','reserved'].includes(j.state))),'진행 중인 담당자는 작업을 완료하거나 명시적으로 인계한 뒤 제외해 주세요.');
     check(!room.messages.some(m=>m.kind==='question'&&(removed.has(m.authorId)||removed.has(m.toMemberId))&&!room.messages.some(a=>a.kind==='answer'&&a.requestId===m.requestId&&a.replyTo===m.id)),'답변이 남은 질문을 해결한 뒤 담당자를 제외해 주세요.');
     check(!controls.leases.some(l=>l.projectId===projectId&&removed.has(l.memberId)&&!l.releasedAt),'파일·Editor 소유권을 반환한 뒤 담당자를 제외해 주세요.');
     check(!Object.values(controls.projects[projectId]?.cases||{}).some(c=>c.attempts.some(a=>removed.has(a.memberId)&&a.status==='running')),'실행 중인 검증을 정리한 뒤 담당자를 제외해 주세요.');
     const changed=JSON.stringify(old.members)!==JSON.stringify(desired);
     if(changed){
      old.legacyMembers??=known.map(({id,name,role})=>({id,name,role}));
      old.retiredMembers=[...(old.retiredMembers||[]),...old.members.filter(m=>removed.has(m.id))].filter(m=>!desired.some(next=>next.id===m.id));
      old.members=desired;old.revision=revision(old)+1;
     }
     const change={id:changeId,input,revision:revision(old),changed,at:now()};(old.memberChanges??=[]).push(change);
     return receipt(change,false);
    }),{readOnly:true}),{readOnly:true});
 }
}
