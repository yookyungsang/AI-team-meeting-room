import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,now,transaction} from './control.mjs';
import {TeamSetup,TEAM_ROLES} from './team-setup.mjs';

const empty=()=>({version:1,requests:[]});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fingerprint=context=>hash(JSON.stringify(context));
export const MENU_MODEL_CHOICES=TEAM_ROLES.map(role=>({slotId:role.id,...(role.id.startsWith('programmer')?{model:'gpt-6.1-sol',thinking:'high'}:role.id==='qa'?{model:'gpt-6-luna',thinking:'medium'}:{model:'default'})}));
const defaultChoices=()=>TEAM_ROLES.map(r=>({slotId:r.id,model:'default'}));
function roleModels(choices){return TEAM_ROLES.map(role=>{const choice=choices.find(c=>c.slotId===role.id)||{model:'default'},model=choice.model==='gpt-6.1-sol'?'GPT-6.1 Sol':choice.model==='gpt-6-luna'?'GPT-6 Luna':choice.model;return {id:role.id,name:role.name,modelLabel:choice.model==='default'?'Codex 기본 설정':model+' · '+({xhigh:'Extra High',high:'High',medium:'Medium'}[choice.thinking]||choice.thinking||'기본 추론')};});}
function displayRoles(row,choices){return roleModels(choices).map(role=>row.directorMode==='opening-chat'&&role.id==='director'?{...role,modelLabel:'현재 대화창 사용 · 현재 모델·추론 유지'}:role);}
function directRequest(row,choices){return (row.directorMode==='opening-chat'?`프로젝트 ${JSON.stringify(row.context.name)}에 기본 팀을 구성해 주세요. 이 설정을 처음 요청한 기존 대화창을 총괄로 사용하고, 이름을 프로젝트명 · 총괄 디렉터로 바꿔 주세요. 총괄의 대화 내용과 현재 모델·추론은 유지하세요. 기획자·디자이너·프로그래머 2명·QA의 새 대화창 5개만 만들고 역할을 설정한 뒤 같은 회의실에 연결해 주세요. 연결 후에는 다른 총괄방으로 이동하지 않고 이 대화에서 바로 작업을 이어갈 수 있게 해 주세요. 총괄의 역할 지침은 이 설정 턴에 적용하고 별도 초기화 메시지를 보내지 마세요.`:`프로젝트 ${JSON.stringify(row.context.name)}에 총괄·기획자·디자이너·프로그래머 2명·QA의 새 대화창 6개를 만들고 역할을 설정한 뒤 회의실에 연결해 주세요.`)+` 아래 역할별 모델·추론 설정으로 생성과 최초 역할 초기화를 요청합니다.\n${displayRoles(row,choices).map(r=>r.name+': '+r.modelLabel).join('\n')}\n\n[TEAM-ROOM-SETUP ${row.projectId} ${row.setupId}]\n위 기존 설정을 이어서 진행해 주세요. 이미 생성되거나 예약된 대화를 먼저 확인하고 중복 생성하지 마세요. claim이 반환한 nativeTool을 그대로 사용하세요. set_thread_title이면 기존 총괄의 이름만 바꾸고 create_thread로 대체하지 마세요. 불확실한 시도는 실제 결과와 직접 사용자 승인을 확인한 뒤 원래 계획의 절차를 따르세요. native 지원 목록과 저장된 선택을 확인하며 미지원 조합은 대체하지 말고 알려 주세요. 지금은 팀 설정까지만 진행합니다.`;}

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
  const opening=this.registry.opening(threadId);check(opening.status!=='deleted','삭제된 회의실이 있습니다. 메뉴의 삭제된 회의실에서 복구해 주세요.');
  check(opening.status==='unregistered','이미 연결된 회의실이 있거나 소속을 확인할 수 없습니다. 기존 회의실의 구성원 편집을 이용해 주세요.');
 }
 otherSetup(context,setupId){return this.team.read().setups.find(s=>s.id!==setupId&&context.nativeProjectIds.includes(s.codexProjectId)&&s.hostId==='local');}
 view(row){const choices=row.choices||defaultChoices(),setup=this.team.read().setups.find(s=>s.id===row.setupId&&s.projectId===row.projectId);return {previewId:row.id,projectId:row.projectId,setupId:row.setupId,projectName:row.context.name,status:row.status,directorMode:row.directorMode||'new-chat',roles:displayRoles(row,choices),modelMode:choices.some(c=>c.model!=='default')?'role-preset':'default',...(row.status!=='preview'?{setupStatus:setup?.status||'planned',readyCount:setup?.slots.filter(s=>s.identity).length||0,continuationPrompt:directRequest(row,choices)}:{})};}
 preview({threadId}){
  const context=this.context(threadId);this.unconnected(threadId);
  return transaction(this.file,empty,state=>{
   const prior=state.requests.find(r=>r.context.scopeId===context.scopeId&&r.openerThreadId===threadId&&fingerprint(r.context)===fingerprint(context));
   const other=this.otherSetup(context,prior?.setupId);
   if(other)return this.view({context,projectId:other.projectId,setupId:other.id,status:'existing',...(other.openingScopeId?{directorMode:'opening-chat'}:{}),choices:other.requestedChoices||other.slots.map(s=>({slotId:s.id,...(s.choice||{model:'default'})}))});
   if(prior)return this.view(prior);
   check(!state.requests.some(r=>r.context.scopeId===context.scopeId&&r.status==='requested'),'이 프로젝트의 팀 생성 요청이 이미 있습니다. 처음 요청한 대화창에서 진행 상황을 확인해 주세요.');
   const row={id:randomUUID(),projectId:'project_'+hash(context.scopeId).slice(0,24),setupId:randomUUID(),context,openerThreadId:threadId,directorMode:'opening-chat',choices:MENU_MODEL_CHOICES.map(c=>({...c})),status:'preview',createdAt:now()};
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
   const plan=this.team.plan({projectId:row.projectId,setupId:row.setupId,name:context.name,codexProjectId:context.nativeProjectIds[0],hostId:'local',models:[],...(row.directorMode==='opening-chat'?{directorThreadId:row.openerThreadId}:{}),...(row.choices?{requestedChoices:choices}:{})});
   if(choices.every(c=>c.model==='default'))this.team.approve({projectId:row.projectId,setupId:row.setupId,confirmed:true,choices:plan.roles.map(r=>({slotId:r.slotId,model:'default'}))});
   row.requestId=requestId;row.status='requested';row.requestedAt=now();
   return {...this.view(row),dispatch:true,handoff:'editable-draft',prompt:directRequest(row,choices)};
  });
 }
}
