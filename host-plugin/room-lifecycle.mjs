import path from 'node:path';
import {check,hash,now,transaction} from './control.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const revision=p=>p.revision||1;
export class RoomLifecycle{
 constructor(registry){this.registry=registry;}
 deleted(){return {rooms:this.registry.read().projects.filter(p=>p.archivedAt).map(p=>({id:p.id,name:p.name,archivedAt:p.archivedAt,revision:revision(p)})).sort((a,b)=>b.archivedAt.localeCompare(a.archivedAt))};}
 locked(projectId,action,{write=false}={}){
  this.registry.get(projectId);
  // Same order as team connect: setup journal, room, controls, then registry.
  // History/leases/attempts are inspected under locks, never moved or erased.
  return transaction(path.join(this.registry.home,'team-setups.json'),()=>({setups:[]}),setups=>
   transaction(this.registry.roomPath(projectId),()=>({requests:[],messages:[]}),room=>
    transaction(path.join(this.registry.home,'work-control.json'),()=>({projects:{},leases:[]}),controls=>
     transaction(this.registry.file,()=>({version:1,projects:[]}),state=>{
      const project=state.projects.find(p=>p.id===projectId);check(project,'연결되지 않은 회의실입니다.');
      return action(project,{room,controls,setups});
     },{readOnly:!write}),{readOnly:true}),{readOnly:true}),{readOnly:true});
 }
 blockers(projectId,{room,controls,setups}){
  const reasons=[],requests=room.requests.filter(r=>!['completed','failed'].includes(r.status)).length,jobs=room.requests.flatMap(r=>r.jobs||[]).filter(j=>['pending','reserved'].includes(j.state)).length;
  const questions=room.messages.filter(m=>m.kind==='question'&&!room.messages.some(a=>a.kind==='answer'&&a.requestId===m.requestId&&a.replyTo===m.id)).length;
  const leases=controls.leases.filter(l=>l.projectId===projectId&&!l.releasedAt).length,runs=Object.values(controls.projects[projectId]?.cases||{}).flatMap(c=>c.attempts||[]).filter(a=>a.status==='running').length,teams=setups.setups.filter(s=>s.projectId===projectId&&s.status!=='connected').length;
  for(const [count,label] of [[requests,'진행 중인 요청'],[jobs,'미완료 담당자 배정'],[questions,'답변이 남은 질문'],[leases,'파일·Editor 점유'],[runs,'실행 중인 검증'],[teams,'진행 중인 팀 설정']])if(count)reasons.push(label+' '+count+'건');
  return reasons;
 }
 preview({projectId}){return this.locked(projectId,(p,state)=>{
  const reasons=this.blockers(projectId,state),messages=state.room.messages;
  return {projectId,name:p.name,revision:revision(p),archived:!!p.archivedAt,canDelete:!p.archivedAt&&!reasons.length,reasons,counts:{members:p.members.length,requests:state.room.requests.length,messages:messages.length,images:messages.reduce((n,m)=>n+(m.images?.length||0),0),audio:messages.reduce((n,m)=>n+(m.audio?.length||0),0)}};
 });}
 change({operation,projectId,expectedRevision,changeId,confirmName,confirmed}){
  check(['delete','restore'].includes(operation)&&confirmed===true,'설명을 확인하고 삭제 또는 복구를 직접 선택해 주세요.');
  check(Number.isSafeInteger(expectedRevision)&&expectedRevision>=1&&uuid(changeId),'현재 회의실 버전과 고정된 변경 ID가 필요합니다.');
  return this.locked(projectId,(p,state)=>{
   const input=hash(JSON.stringify([operation,expectedRevision,confirmName])),previous=p.lifecycleChanges?.find(c=>c.id===changeId);
   const receipt=(change,replayed)=>({projectId,name:p.name,archived:!!p.archivedAt,revision:revision(p),appliedRevision:change.revision,replayed});
   if(previous){check(previous.input===input,'같은 변경 ID로 다른 삭제·복구를 요청할 수 없습니다.');return receipt(previous,true);}
   check(confirmName===p.name,'확인한 회의실 이름이 다릅니다. 설명을 다시 열어 주세요.');
   check(revision(p)===expectedRevision,'회의실 구성이 변경되었습니다. 현재 상태를 다시 확인해 주세요.');
   if(operation==='delete'){
    check(!p.archivedAt,'이미 삭제된 회의실입니다. 삭제된 회의실 목록을 확인해 주세요.');
    const reasons=this.blockers(projectId,state);check(!reasons.length,'작업을 완료하거나 명시적으로 인계·정리한 뒤 삭제해 주세요: '+reasons.join(', '));p.archivedAt=now();
   }else{check(p.archivedAt,'이미 복구된 회의실입니다. 현재 목록을 확인해 주세요.');delete p.archivedAt;}
   p.revision=revision(p)+1;const change={id:changeId,input,operation,revision:p.revision,at:now()};(p.lifecycleChanges??=[]).push(change);return receipt(change,false);
  },{write:true});
 }
}
