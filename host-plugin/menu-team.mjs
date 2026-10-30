import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,now,transaction} from './control.mjs';
import {TeamSetup,TEAM_ROLES} from './team-setup.mjs';

const empty=()=>({version:1,requests:[]});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fingerprint=context=>hash(JSON.stringify(context));
export const MENU_MODEL_CHOICES=TEAM_ROLES.map(role=>({slotId:role.id,...(role.id==='director'?{model:'gpt-6.1-sol',thinking:'xhigh'}:role.id.startsWith('programmer')?{model:'gpt-6.1-sol',thinking:'high'}:role.id==='qa'?{model:'gpt-6-luna',thinking:'medium'}:{model:'default'})}));
const defaultChoices=()=>TEAM_ROLES.map(r=>({slotId:r.id,model:'default'}));
function roleModels(choices){return TEAM_ROLES.map(role=>{const choice=choices.find(c=>c.slotId===role.id)||{model:'default'},model=choice.model==='gpt-6.1-sol'?'GPT-6.1 Sol':choice.model==='gpt-6-luna'?'GPT-6 Luna':choice.model;return {id:role.id,name:role.name,modelLabel:choice.model==='default'?'Codex 기본 설정':model+' · '+({xhigh:'Extra High',high:'High',medium:'Medium'}[choice.thinking]||choice.thinking||'기본 추론')};});}

// Menu confirmation journals intent only. Native chats are created by the
// authorized current chat, using the existing guarded TeamSetup workflow.
export class MenuTeam{
 constructor(registry){this.registry=registry;this.file=path.join(registry.home,'team-menu.json');this.team=new TeamSetup(registry);}
 context(threadId){
  check(typeof threadId==='string'&&threadId.length>0,'현재 대화창을 확인할 수 없습니다. 프로젝트 안의 기존 채팅에서 회의실을 열어 주세요.');
  const context=this.registry.setupContextReader(threadId);
  check(context&&typeof context.scopeId==='string'&&typeof context.name==='string'&&context.name.trim()&&context.name.length<=120&&Array.isArray(context.nativeProjectIds)&&context.nativeProjectIds.length&&context.nativeProjectIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=200),'현재 프로젝트의 연결 정보를 확인할 수 없습니다.');
  return context;
 }
 unconnected(threadId){
  check(this.registry.opening(threadId).status==='unregistered','이미 연결된 회의실이 있거나 소속을 확인할 수 없습니다. 기존 회의실의 구성원 편집을 이용해 주세요.');
 }
 otherSetup(context,setupId){return this.team.read().setups.find(s=>s.id!==setupId&&context.nativeProjectIds.includes(s.codexProjectId)&&s.hostId==='local');}
 view(row){return {previewId:row.id,projectId:row.projectId,setupId:row.setupId,projectName:row.context.name,status:row.status,roles:roleModels(row.choices||defaultChoices()),modelMode:row.choices?'role-preset':'default'};}
 preview({threadId}){
  const context=this.context(threadId);this.unconnected(threadId);
  return transaction(this.file,empty,state=>{
   const prior=state.requests.find(r=>r.context.scopeId===context.scopeId&&r.openerThreadId===threadId&&fingerprint(r.context)===fingerprint(context)&&(r.requestId||JSON.stringify(r.choices)===JSON.stringify(MENU_MODEL_CHOICES)));
   const other=this.otherSetup(context,prior?.setupId);
   if(other)return {projectName:context.name,projectId:other.projectId,setupId:other.id,status:'existing',roles:roleModels(other.requestedChoices||other.slots.map(s=>({slotId:s.id,...(s.choice||{model:'default'})}))),modelMode:other.requestedChoices?'role-preset':'default'};
   if(prior)return this.view(prior);
   check(!state.requests.some(r=>r.context.scopeId===context.scopeId&&r.status==='requested'),'이 프로젝트의 팀 생성 요청이 이미 있습니다. 처음 요청한 대화창에서 진행 상황을 확인해 주세요.');
   const row={id:randomUUID(),projectId:'project_'+hash(context.scopeId).slice(0,24),setupId:randomUUID(),context,openerThreadId:threadId,choices:MENU_MODEL_CHOICES.map(c=>({...c})),status:'preview',createdAt:now()};
   check(!this.registry.read().projects.some(p=>p.id===row.projectId),'이 프로젝트의 회의실 기록을 먼저 확인해 주세요.');
   state.requests.push(row);return this.view(row);
  });
 }
 apply({threadId,previewId,requestId,confirmed}){
  check(confirmed===true&&uuid(previewId)&&uuid(requestId),'설명 확인 후 적용한 요청과 원래 확인 ID가 필요합니다.');
  const context=this.context(threadId);
  return transaction(this.file,empty,state=>{
   const row=state.requests.find(r=>r.id===previewId);
   check(row&&row.openerThreadId===threadId&&fingerprint(row.context)===fingerprint(context),'설명한 프로젝트와 현재 대화창이 다릅니다. 설명을 다시 열어 확인해 주세요.');
   if(row.requestId){check(row.requestId===requestId,'팀 생성 요청이 이미 적용됐습니다. 처음 요청의 진행 상황을 확인해 주세요.');return {...this.view(row),dispatch:false};}
   this.unconnected(threadId);
   check(!state.requests.some(r=>r.id!==row.id&&r.context.scopeId===context.scopeId&&r.status==='requested')&&!this.otherSetup(context,row.setupId),'진행 중인 팀 설정이 있습니다. 기존 설정을 이어서 확인해 주세요.');
   const choices=row.choices||defaultChoices();
   const plan=this.team.plan({projectId:row.projectId,setupId:row.setupId,name:context.name,codexProjectId:context.nativeProjectIds[0],hostId:'local',models:[],...(row.choices?{requestedChoices:choices}:{})});
   if(choices.every(c=>c.model==='default'))this.team.approve({projectId:row.projectId,setupId:row.setupId,confirmed:true,choices:plan.roles.map(r=>({slotId:r.slotId,model:'default'}))});
   row.requestId=requestId;row.status='requested';row.requestedAt=now();
   const prompt=`[TEAM-ROOM-SETUP ${row.projectId} ${row.setupId}]\n이 프로젝트에 총괄·기획자·디자이너·프로그래머 2명·QA를 새 대화창으로 만들고 역할을 설정한 뒤 회의실에 연결해 주세요. ${row.choices?'설명에 표시된 역할별 모델·추론을 그대로 사용합니다.':'모든 새 채팅은 Codex 기본 모델·추론 설정을 유지합니다.'} 메뉴 설명을 확인하고 적용한 사용자 요청입니다.\nroom_team(status)로 위 계획을 확인하고 team-room의 references/menu-team-setup.md와 team-creation.md를 따르세요. requestedChoices가 있으면 실제 native 지원 목록을 catalog로 확인한 후 같은 선택을 approve하세요. 지원하지 않는 조합은 대체하지 말고 보고하세요. 실제 native 프로젝트와 기존 예약·생성 결과를 확인해 중복 생성하지 마세요. 추가 모델 선택 확인은 필요 없습니다. 지금은 팀 설정까지만 진행합니다.`;
   return {...this.view(row),dispatch:true,prompt};
  });
 }
}
