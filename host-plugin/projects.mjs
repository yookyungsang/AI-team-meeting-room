import fs from 'node:fs';
import path from 'node:path';
import {transaction,hash,now} from './control.mjs';
import {roleTypeOf,validateRoleType,roleCatalog} from './roles.mjs';
import {readNativeProjectChats,findNativeMeetingProject} from './native-chats.mjs';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
export const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
const label=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export const knownMembers=project=>[...project.members,...(project.retiredMembers||[]).map(m=>({...m,retired:true}))];
export function selectableMembers(project){
 const rows=new Map();for(const m of [...project.members,...(project.retiredMembers||[]),...(project.memberOptions||[])])if(!rows.has(m.id))rows.set(m.id,m);
 return [...rows.values()];
}
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
  validateRoleType(m);return {id:m.id,name:m.name.trim(),role:m.role.trim(),...(m.roleType===undefined?{}:{roleType:m.roleType}),threadId:m.threadId,hostId:m.hostId};
 });
 check(members.filter(m=>m.id==='director').length===1,'director 역할의 총괄이 한 명 필요합니다.');
 check(new Set(members.map(m=>m.id)).size===members.length,'참여자 ID는 중복될 수 없습니다.');
 check(new Set(members.map(m=>m.hostId+'\0'+m.threadId)).size===members.length,'한 대화를 여러 담당자로 중복 연결하지 않습니다.');
 return {id:input.id,name:input.name.trim(),...(input.workspacePath?{workspacePath:input.workspacePath}:{}),members};
}
export class Projects {
 constructor(home,{catalogReader=readNativeProjectChats,openingReader=findNativeMeetingProject}={}){this.home=path.resolve(home);this.file=path.join(this.home,'projects.json');this.catalogReader=catalogReader;this.openingReader=openingReader;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,projects:[]};}
 list(){return this.read().projects.map(p=>({id:p.id,name:p.name,directorName:p.members.find(m=>m.id==='director').name}));}
 opening(threadId){
  if(!threadId)return {status:'unavailable'};
  try{return this.openingReader(this.read().projects,threadId);}catch{return {status:'unavailable'};}
 }
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
 roster(projectId){
  const p=this.get(projectId),view=m=>({id:m.id,name:m.name,role:m.role,roleType:roleTypeOf(m),...(m.chatTitle?{chatTitle:m.chatTitle}:{})});
  const eligible=new Set((p.memberOptions||[]).map(m=>m.hostId+'\0'+m.threadId));
  const choices=selectableMembers(p).filter(m=>!p.localCatalog||p.members.some(a=>a.id===m.id)||eligible.has(m.hostId+'\0'+m.threadId));
  const titles=new Map((p.memberOptions||[]).filter(m=>m.chatTitle).map(m=>[m.id,m.chatTitle]));
  return {projectId,revision:revision(p),optionsRevision:p.optionsRevision||1,roles:roleCatalog(),members:p.members.map(view),choices:choices.map(m=>view({...m,...(titles.has(m.id)?{chatTitle:titles.get(m.id)}:{})}))};
 }
 discover(projectId){
  const project=this.get(projectId);let catalog;
  try{catalog=this.catalogReader(project);}catch{
   const view=this.roster(projectId);return {...view,choices:view.choices.filter(m=>view.members.some(a=>a.id===m.id)),catalog:{available:false,message:'프로젝트 대화 목록을 읽을 수 없습니다. 기존 구성은 편집할 수 있으며 추가 목록은 새로고침 후 확인해 주세요.'}};
  }
  transaction(this.file,()=>({version:1,projects:[]}),state=>{
   const p=state.projects.find(p=>p.id===projectId);check(p&&JSON.stringify(validateProject(p))===JSON.stringify(validateProject(project)),'구성이 변경되었습니다. 목록을 새로고침해 주세요.');
   const known=selectableMembers(p),options=catalog.candidates.map(c=>{
    const old=known.find(m=>sameRoute(m,c));return {id:old?.id||'member_'+hash(JSON.stringify([c.hostId,c.threadId])).slice(0,24),name:old?.name||Array.from(c.chatTitle).slice(0,80).join(''),role:old?.role||'담당자',roleType:old?roleTypeOf(old):'custom',threadId:c.threadId,hostId:c.hostId,chatTitle:c.chatTitle};
   });
   check(new Set(options.map(m=>m.id)).size===options.length,'프로젝트 대화 목록에 중복된 연결이 있습니다.');
   if(JSON.stringify(p.memberOptions||[])!==JSON.stringify(options)||p.localCatalog?.scopeId!==catalog.scopeId){p.memberOptions=options;p.localCatalog={scopeId:catalog.scopeId};p.optionsRevision=(p.optionsRevision||1)+1;}
  });
  return {...this.roster(projectId),catalog:{available:true,label:catalog.label,count:catalog.candidates.length,truncated:catalog.truncated}};
 }
 registerOptions({projectId,memberId,requestId,verified,candidates}){
  check(memberId==='director'&&verified===true,'총괄이 native 도구로 확인한 기존 채팅만 선택 후보로 저장합니다.');
  check(typeof requestId==='string'&&requestId.length>0,'목록 준비를 요청한 실제 회의 요청이 필요합니다.');
  check(Array.isArray(candidates)&&candidates.length<=100,'기존 채팅 후보는 100개 이내로 준비해 주세요.');
  const normalized=candidates.map(m=>{check(label(m.name,80)&&label(m.role,80)&&label(m.threadId,160)&&label(m.hostId,160),'후보의 이름·역할·실제 기존 채팅과 호스트가 필요합니다.');if(m.roleType!==undefined)validateRoleType({...m,id:m.roleType==='director'?'director':'candidate'});return {name:m.name.trim(),role:m.role.trim(),...(m.roleType===undefined?{}:{roleType:m.roleType}),threadId:m.threadId,hostId:m.hostId};});
  check(new Set(normalized.map(m=>m.hostId+'\0'+m.threadId)).size===normalized.length,'같은 채팅 후보를 중복 등록하지 않습니다.');
  return transaction(this.file,()=>({version:1,projects:[]}),state=>{
   const p=state.projects.find(p=>p.id===projectId);check(p,'연결되지 않은 프로젝트입니다.');const input=hash(JSON.stringify(normalized)),prior=p.optionChanges?.find(c=>c.requestId===requestId);
   if(prior){check(prior.input===input,'같은 목록 준비 요청의 후보를 바꾸지 않습니다. 새 명시적 요청을 사용하세요.');return {projectId,saved:true,replayed:true,optionsRevision:p.optionsRevision||1,count:p.memberOptions?.length||0};}
   const known=selectableMembers(p),options=normalized.map(m=>({...m,id:known.find(k=>sameRoute(k,m))?.id||'member_'+hash(JSON.stringify([m.hostId,m.threadId])).slice(0,24)}));
   options.forEach(validateRoleType);check(new Set(options.map(m=>m.id)).size===options.length&&!options.some(m=>known.some(k=>k.id===m.id&&!sameRoute(k,m))),'후보 식별자가 기존 채팅과 충돌합니다.');
   if(JSON.stringify(p.memberOptions||[])!==JSON.stringify(options)){p.memberOptions=options;p.optionsRevision=(p.optionsRevision||1)+1;}
   (p.optionChanges??=[]).push({requestId,input,at:now()});return {projectId,saved:true,optionsRevision:p.optionsRevision||1,count:options.length};
  });
 }
 updateMembers({projectId,memberId,expectedRevision,changeId,members,selection,optionsRevision}){
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
     check(selection===undefined||members===undefined,'선택 목록과 직접 구성원 입력을 함께 사용하지 않습니다.');
     if(selection!==undefined){check(Array.isArray(selection)&&selection.length>=1&&selection.length<=20,'총괄을 포함해 1~20명을 선택하세요.');const choices=selectableMembers(old);members=selection.map(row=>{const found=choices.find(m=>m.id===row?.id);check(found,'현재 프로젝트의 확인된 후보 중에서 선택해 주세요.');return {id:found.id,name:row.name,role:row.role,threadId:found.threadId,hostId:found.hostId,...(row.roleType===undefined?{}:{roleType:row.roleType})};});}
     // Fingerprint submitted fields before carrying forward new metadata. Old
     // save receipts must remain replayable after a later role-kind edit.
     const submitted=validateProject({...old,members}).members,input=hash(JSON.stringify([expectedRevision,submitted]));
     const previous=old.memberChanges?.find(c=>c.id===changeId);
     const receipt=(change,replayed)=>({updated:change.changed,replayed,appliedRevision:change.revision,revision:revision(old),members:old.members,retiredCount:old.retiredMembers?.length||0});
     if(previous){check(previous.input===input,'같은 changeId로 변경 내용을 바꿀 수 없습니다.');return receipt(previous,true);}
     if(selection!==undefined)check(optionsRevision===(old.optionsRevision||1),'선택 후보가 변경되었습니다. 목록을 새로고침한 뒤 다시 선택해 주세요.');
     check(revision(old)===expectedRevision,'구성이 변경되었습니다. room_state로 최신 revision과 구성원을 확인해 주세요.');
     const desired=validateProject({...old,members:submitted.map(m=>{const prior=selectableMembers(old).find(p=>p.id===m.id);return m.roleType===undefined&&prior?.roleType!==undefined?{...m,roleType:prior.roleType}:m;})}).members;
     const known=knownMembers(old);
     if(selection!==undefined&&old.localCatalog){
      const added=desired.filter(m=>!old.members.some(a=>a.id===m.id));
      if(added.length){let catalog;try{catalog=this.catalogReader(old);}catch{throw new Error('현재 프로젝트 대화 목록을 다시 확인할 수 없습니다. 목록 새로고침 후 추가해 주세요.');}
       check(catalog.scopeId===old.localCatalog.scopeId&&added.every(m=>catalog.candidates.some(c=>sameRoute(c,m))),'선택한 대화가 현재 프로젝트에서 이동·보관되었거나 목록이 바뀌었습니다. 새로고침 후 선택해 주세요.');
      }
     }
     for(const member of desired){
      const prior=known.find(m=>m.id===member.id);
      check(!prior||sameRoute(prior,member),'기존 담당자 ID의 대화·호스트는 바꾸지 않습니다. 교체할 담당자는 새 ID로 연결해 주세요.');
      check(!known.some(m=>m.id!==member.id&&sameRoute(m,member)),'기존 또는 제외된 담당자의 대화를 다른 ID로 중복 연결하지 않습니다.');
     }
     const removed=new Set(old.members.filter(m=>!desired.some(next=>next.id===m.id)).map(m=>m.id));
     const changedRoles=new Set(old.members.filter(m=>{const next=desired.find(n=>n.id===m.id);return next&&roleTypeOf(next)!==roleTypeOf(m);}).map(m=>m.id));
     check(!room.requests.some(r=>r.jobs.some(j=>changedRoles.has(j.memberId)&&['pending','reserved'].includes(j.state)))&&!room.messages.some(m=>m.kind==='question'&&(changedRoles.has(m.authorId)||changedRoles.has(m.toMemberId))&&!room.messages.some(a=>a.kind==='answer'&&a.requestId===m.requestId&&a.replyTo===m.id))&&!controls.leases.some(l=>l.projectId===projectId&&changedRoles.has(l.memberId)&&!l.releasedAt)&&!Object.values(controls.projects[projectId]?.cases||{}).some(c=>c.attempts.some(a=>changedRoles.has(a.memberId)&&a.status==='running')),'진행 중인 담당자의 역할 종류는 작업·질문·소유권·검증을 완료하거나 명시적으로 인계한 뒤 변경해 주세요.');
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
