import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,now,transaction} from './control.mjs';
import {TeamSetup,TEAM_ROLES} from './team-setup.mjs';
import {UI_LANGUAGES,translate} from './i18n.mjs';
import {localizedRequest,continuationCopy} from './team-copy.mjs';

const empty=()=>({version:1,requests:[]});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const fingerprint=context=>hash(JSON.stringify(context));
export const MENU_MODEL_CHOICES=TEAM_ROLES.map(role=>({slotId:role.id,...(role.id.startsWith('programmer')?{model:'gpt-6.1-sol',thinking:'high'}:role.id==='qa'?{model:'gpt-6-luna',thinking:'medium'}:{model:'default'})}));
const EN_ROLE_NAMES={director:'Director',planner:'Planner',designer:'Designer',programmer1:'Programmer 1',programmer2:'Programmer 2',qa:'QA'};
const defaultChoices=()=>TEAM_ROLES.map(r=>({slotId:r.id,model:'default'}));
function englishRequest(row,choices){
 const names=EN_ROLE_NAMES,settings=choices.map(c=>names[c.slotId]+': '+(c.slotId==='director'&&row.directorMode==='opening-chat'?'use original chat; preserve its current model/effort':c.model==='default'?'Codex defaults':c.model+' / '+c.thinking));
 return `Set up the basic team for project ${JSON.stringify(row.context.name)}. `+(row.directorMode==='opening-chat'?'Use the original opening chat as director and rename it to Project name · Director, retaining its history and current model/effort. Create only five chats: planner, designer, TWO programmers and QA. Continue work in this original chat after connection. Apply director guidance in this turn without a second initialization message.':'Continue the original six-new-chat plan: director, planner, designer, TWO programmers and QA.')+`\nUse these exact model/effort choices for new chats:\n${settings.join('\n')}\n\n[TEAM-ROOM-SETUP ${row.projectId} ${row.setupId}]\nContinue this original plan. Preserve ready chats, model choices and reservations. Follow each claim.nativeTool exactly; set_thread_title renames the original director, never creates a replacement. Reconcile real native results and any running work before an authorized retry. Unsupported choices must not be substituted. This request is for team setup only; do not begin implementation.`;
}
const directRequest=(row,choices)=>row.language==='en'?englishRequest(row,choices):continuationCopy(row.language)?localizedRequest(row,choices):koreanRequest(row,choices);
function roleModels(choices){return TEAM_ROLES.map(role=>{const choice=choices.find(c=>c.slotId===role.id)||{model:'default'},model=choice.model==='gpt-6.1-sol'?'GPT-6.1 Sol':choice.model==='gpt-6-luna'?'GPT-6 Luna':choice.model;return {id:role.id,name:role.name,modelLabel:choice.model==='default'?'Codex 기본 설정':model+' · '+({xhigh:'Extra High',high:'High',medium:'Medium'}[choice.thinking]||choice.thinking||'기본 추론')};});}
function displayRoles(row,choices){return roleModels(choices).map(role=>row.directorMode==='opening-chat'&&role.id==='director'?{...role,modelLabel:'현재 대화창 사용 · 현재 모델·추론 유지'}:role);}
function koreanRequest(row,choices){return (row.directorMode==='opening-chat'?`프로젝트 ${JSON.stringify(row.context.name)}에 기본 팀을 구성해 주세요. 이 설정을 처음 요청한 기존 대화창을 총괄로 사용하고, 이름을 프로젝트명 · 총괄 디렉터로 바꿔 주세요. 총괄의 대화 내용과 현재 모델·추론은 유지하세요. 기획자·디자이너·프로그래머 2명·QA의 새 대화창 5개만 만들고 역할을 설정한 뒤 같은 회의실에 연결해 주세요. 연결 후에는 다른 총괄방으로 이동하지 않고 이 대화에서 바로 작업을 이어갈 수 있게 해 주세요. 총괄의 역할 지침은 이 설정 턴에 적용하고 별도 초기화 메시지를 보내지 마세요.`:`프로젝트 ${JSON.stringify(row.context.name)}에 총괄·기획자·디자이너·프로그래머 2명·QA의 새 대화창 6개를 만들고 역할을 설정한 뒤 회의실에 연결해 주세요.`)+` 아래 역할별 모델·추론 설정으로 생성과 최초 역할 초기화를 요청합니다.\n${displayRoles(row,choices).map(r=>r.name+': '+r.modelLabel).join('\n')}\n\n[TEAM-ROOM-SETUP ${row.projectId} ${row.setupId}]\n위 기존 설정을 이어서 진행해 주세요. 이미 생성되거나 예약된 대화를 먼저 확인하고 중복 생성하지 마세요. claim이 반환한 nativeTool을 그대로 사용하세요. set_thread_title이면 기존 총괄의 이름만 바꾸고 create_thread로 대체하지 마세요. 불확실한 시도는 실제 결과와 직접 사용자 승인을 확인한 뒤 원래 계획의 절차를 따르세요. native 지원 목록과 저장된 선택을 확인하며 미지원 조합은 대체하지 말고 알려 주세요. 지금은 팀 설정까지만 진행합니다.`;}

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
 scopedSetup({threadId,projectId,setupId}){
  const setups=this.team.read().setups;
  if(projectId){
   if(this.registry.read().projects.some(p=>p.id===projectId&&p.archivedAt))return null;
   const setup=setups.findLast(s=>s.projectId===projectId&&(!setupId||s.id===setupId));
   if(!setup)return null;
   if(!this.registry.read().projects.some(p=>p.id===projectId)){const context=this.context(threadId);check(setup.hostId==='local'&&context.nativeProjectIds.includes(setup.codexProjectId),'현재 프로젝트의 팀 구성 기록만 확인할 수 있습니다.');}
   return setup;
  }
  if(!threadId)return null;
  const context=this.context(threadId);
  return setups.findLast(s=>s.hostId==='local'&&context.nativeProjectIds.includes(s.codexProjectId)&&!this.registry.read().projects.some(p=>p.id===s.projectId&&p.archivedAt))||null;
 }
 progress(args){
  const setup=this.scopedSetup(args);if(!setup)return null;
  const workers=setup.slots.filter(s=>!s.existing&&!s.openingThreadId),origin=setup.slots.find(s=>s.openingThreadId)?.openingThreadId||this.menuOrigin(setup);
  return {projectId:setup.projectId,setupId:setup.id,projectName:setup.name,status:setup.status==='connected'?'connected':setup.failure||setup.slots.some(s=>s.state==='uncertain')?'attention':setup.status,blocksWork:!setup.existingRoom&&setup.status!=='connected',readyCount:workers.filter(s=>s.state==='ready').length,totalCount:workers.length,canContinue:!!args.threadId&&(!origin||origin===args.threadId),roles:setup.slots.map(s=>({id:s.id,name:s.name,state:s.state,existing:!!(s.existing||s.openingThreadId),...(s.reason?{reason:s.reason}:{})})),...(setup.failure?{failure:{operation:setup.failure.operation,reason:setup.failure.reason}}:{})};
 }
 menuOrigin(setup){return this.menuRows().find(r=>r.projectId===setup.projectId&&r.setupId===setup.id)?.openerThreadId;}
 menuRows(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')).requests:[];}
 resume(args){
  check(uuid(args.setupId)&&typeof args.projectId==='string','이어갈 프로젝트와 원래 설정 ID가 필요합니다.');
  const setup=this.scopedSetup(args);check(setup&&setup.status!=='connected','진행 중인 원래 팀 설정을 확인해 주세요.');
  const progress=this.progress(args);check(progress.canContinue,'처음 팀 만들기를 요청한 총괄 대화창에서 이어가 주세요.');
  const context=this.context(args.threadId);check(setup.hostId==='local'&&context.nativeProjectIds.includes(setup.codexProjectId),'원래 프로젝트의 총괄 대화창에서 이어가 주세요.');
  const language=this.menuRows().find(r=>r.setupId===setup.id&&r.projectId===setup.projectId)?.language||'ko';
  const row={context,language,projectId:setup.projectId,setupId:setup.id,status:'existing',...(setup.openingScopeId?{directorMode:'opening-chat'}:{}),choices:setup.requestedChoices||setup.slots.map(s=>({slotId:s.id,...(s.choice||{model:'default'})}))};
  return {...this.view(row),progress,continuationPrompt:directRequest(row,row.choices)+'\n\n'+(continuationCopy(language)||(language==='en'?'Continue after interruption or error. If earlier setup is still running, do not duplicate it. Verify the actual saved attempts and native results before retrying.':'중단·오류 후 이어가기 요청입니다. 현재 진행 중인 설정 작업이 있으면 중복 실행하지 마세요. 원래 시도별 실제 생성 결과를 먼저 확인하고 이미 준비된 담당자는 유지하세요. 생성 여부가 불확실하면 새로 만들지 말고 원래 시도로 확인하세요. 실제 미생성이 확인된 실패만 이 직접 재개 요청 범위에서 원래 retry 절차를 따르세요.'))};
 }
 view(row){const choices=row.choices||defaultChoices(),setup=this.team.read().setups.find(s=>s.id===row.setupId&&s.projectId===row.projectId);return {previewId:row.id,projectId:row.projectId,setupId:row.setupId,projectName:row.context.name,status:row.status,directorMode:row.directorMode||'new-chat',roles:displayRoles(row,choices),modelMode:choices.some(c=>c.model!=='default')?'role-preset':'default',...(row.status!=='preview'?{setupStatus:setup?.status||'planned',readyCount:setup?.slots.filter(s=>s.identity).length||0,continuationPrompt:directRequest(row,choices)}:{})};}
 preview({threadId,language='ko'}){
  check(UI_LANGUAGES.includes(language),'Choose a supported UI language.');
  const context=this.context(threadId);this.unconnected(threadId);
  return transaction(this.file,empty,state=>{
   const prior=state.requests.find(r=>r.context.scopeId===context.scopeId&&r.openerThreadId===threadId&&fingerprint(r.context)===fingerprint(context));
   const other=this.otherSetup(context,prior?.setupId);
   if(other)return this.view({context,projectId:other.projectId,setupId:other.id,status:'existing',...(other.openingScopeId?{directorMode:'opening-chat'}:{}),choices:other.requestedChoices||other.slots.map(s=>({slotId:s.id,...(s.choice||{model:'default'})}))});
   if(prior)return this.view(prior);
   check(!state.requests.some(r=>r.context.scopeId===context.scopeId&&r.status==='requested'),'이 프로젝트의 팀 생성 요청이 이미 있습니다. 처음 요청한 대화창에서 진행 상황을 확인해 주세요.');
   const row={id:randomUUID(),projectId:'project_'+hash(context.scopeId).slice(0,24),setupId:randomUUID(),context,openerThreadId:threadId,language,directorMode:'opening-chat',choices:MENU_MODEL_CHOICES.map(c=>({...c})),status:'preview',createdAt:now()};
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
   const plan=this.team.plan({projectId:row.projectId,setupId:row.setupId,name:context.name,codexProjectId:context.nativeProjectIds[0],hostId:'local',models:[],...(row.language&&row.language!=='ko'?{roles:TEAM_ROLES.map(r=>({slotId:r.id,name:row.language==='en'?EN_ROLE_NAMES[r.id]:translate(row.language,r.name),roleLabel:row.language==='en'?EN_ROLE_NAMES[r.id]:translate(row.language,r.name)}))}:{}),...(row.directorMode==='opening-chat'?{directorThreadId:row.openerThreadId}:{}),...(row.choices?{requestedChoices:choices}:{})});
   if(choices.every(c=>c.model==='default'))this.team.approve({projectId:row.projectId,setupId:row.setupId,confirmed:true,choices:plan.roles.map(r=>({slotId:r.slotId,model:'default'}))});
   row.requestId=requestId;row.status='requested';row.requestedAt=now();
   return {...this.view(row),progress:this.progress({threadId,projectId:row.projectId,setupId:row.setupId}),dispatch:true,handoff:'editable-draft',prompt:directRequest(row,choices)};
  });
 }
}
