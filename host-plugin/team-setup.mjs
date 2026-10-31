import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,now,transaction} from './control.mjs';
import {knownMembers,validId,validateProject} from './projects.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const efforts=new Set(['none','minimal','low','medium','high','xhigh','max','ultra']);
const empty=()=>({version:1,setups:[]});
const sameRoute=(a,b)=>a.threadId===b.threadId&&a.hostId===b.hostId;
const phase=setup=>setup.slots.every(s=>s.state==='ready')?'ready':setup.slots.some(s=>s.state==='uncertain')?'attention':'creating';
export const TEAM_ROLES=[
 {id:'director',name:'총괄 디렉터',family:'balanced',effort:'high',duty:'전체 설계·우선순위·배정·통합·최종 승인. 필요한 판단·장애·완료 시에만 개입하며 담당자의 보고를 중복 수집하지 않습니다. UI 배치·조작·가독성 판단이 남으면 기존 디자이너를 포함하고 승인 디자인의 단순 수정은 개발자에게 바로 배정합니다. 같은 배정에서 음원·재생·음량 판단이 필요하면 기존 효과음/음향 담당자를 포함합니다. 정해진 음원 연결·명확한 오류는 개발자가 처리하고 소리 영향 없는 작업은 음향 호출을 생략합니다. 대기는 대상과 cursor를 묶고 호스트 제한 안에서 기본 이벤트 대기를 활용합니다. 변화 없는 시간초과에는 추가 조회·진행 요약을 하지 않으며, 중단까지 전달하는 호스트 재개 기능이 확인되지 않으면 조정 턴을 유지합니다.'},
 {id:'planner',name:'기획자',family:'balanced',effort:'medium',duty:'시스템·밸런스·레벨 및 작업 기획, 사양·완료 기준을 담당합니다. 프로젝트 종류와 사용자의 역할 지정을 우선합니다.'},
 {id:'designer',name:'디자이너',family:'visual',effort:'medium',duty:'캐릭터·UI·배경·3D 등 시각 결과의 기획·제작을 담당합니다. 중간 이미지는 필요할 때, 최종 이미지는 자신의 완료 보고에 첨부합니다.'},
 {id:'programmer1',name:'프로그래머 1',family:'balanced',effort:'high',duty:'핵심 로직·데이터 구현을 우선 담당합니다. 실제 분담은 총괄이 정하며 단독 배정이면 순차 수행, 동료가 있으면 독립 파일·의존성에 따라 협업합니다. 자체 점검 후 QA에 인계합니다.'},
 {id:'programmer2',name:'프로그래머 2',family:'balanced',effort:'high',duty:'화면·상호작용 구현을 우선 담당합니다. 실제 분담은 총괄이 정하며 단독 배정이면 순차 수행, 동료가 있으면 독립 파일·의존성에 따라 협업합니다. 자체 점검 후 QA에 인계합니다.'},
 {id:'qa',name:'QA 담당자',family:'balanced',effort:'high',duty:'독립 테스트 설계·오류 재현·실제 동작·회귀 검증을 담당합니다. 같은 오류의 분석 후 재시도는 한 번까지이며 반복 실패는 총괄에게 보고합니다. 임의 코드 수정은 하지 않습니다.'}
];
function catalog(input=[]){
 check(Array.isArray(input)&&input.length<=32,'현재 호스트에서 확인한 모델 목록이 필요합니다.');
 const models=input.map(m=>{
  check(text(m.id,120)&&/^[a-z0-9][a-z0-9._/-]*$/.test(m.id)&&m.id!=='default'&&text(m.label,100),'확인한 모델 ID와 표시 이름이 필요합니다.');
  check(['balanced','visual','deep','light','other'].includes(m.family),'모델의 용도를 확인해 주세요.');
  check(Array.isArray(m.efforts)&&m.efforts.length<=8&&m.efforts.every(e=>efforts.has(e))&&new Set(m.efforts).size===m.efforts.length,'실제 지원하는 추론 수준만 등록해 주세요.');
  return {id:m.id,label:m.label,family:m.family,efforts:m.efforts};
 });
 check(new Set(models.map(m=>m.id)).size===models.length,'모델 목록에 중복이 있습니다.');return models;
}
function suggestion(role,models){
 const model=models.find(m=>m.family===role.family)||models.find(m=>m.family==='balanced');
 return model?{model:model.id,...(model.efforts.includes(role.effort)?{thinking:role.effort}:{}),reason:role.family==='visual'?'화면·시각 자료를 다루는 역할 기준의 추천':'역할의 판단·구현·검증 난이도에 따른 추천'}:{model:'default',reason:'호스트 기본 모델 유지'};
}
function selectedModel(setup,slot,choice){
 check(choice&&text(choice.model,120),'각 역할의 모델 또는 default를 선택해 주세요.');
 if(choice.model==='default'){check(choice.thinking===undefined,'기본 모델은 추론 설정도 그대로 유지합니다.');return {model:'default'};}
 check(!slot.existing&&!slot.openingThreadId,'기존 채팅 모델은 이 팀 생성 과정에서 바꾸지 않습니다.');
 const model=setup.models.find(m=>m.id===choice.model);check(model&&(!choice.thinking||model.efforts.includes(choice.thinking)),'이 호스트에서 확인한 모델·추론 조합만 선택해 주세요.');
 return {model:model.id,...(choice.thinking?{thinking:choice.thinking}:{})};
}
function requestedChoices(input){
 check(Array.isArray(input)&&input.length===6&&new Set(input.map(c=>c.slotId)).size===6&&TEAM_ROLES.every(r=>input.some(c=>c.slotId===r.id)),'설명에서 확인한 여섯 역할의 모델 선택이 필요합니다.');
 return TEAM_ROLES.map(role=>{const choice=input.find(c=>c.slotId===role.id);check(text(choice.model,120)&&/^[a-z0-9][a-z0-9._/-]*$/.test(choice.model)&&(choice.thinking===undefined||efforts.has(choice.thinking))&&(choice.model!=='default'||choice.thinking===undefined),'요청한 모델·추론 설정을 확인해 주세요.');return {slotId:role.id,model:choice.model,...(choice.thinking?{thinking:choice.thinking}:{})};});
}
function prompt(setup,slot){
 return `[TEAM-ROOM-SETUP ${setup.projectId} ${setup.id} ${slot.id}]\n프로젝트: ${setup.name}\n당신의 역할: ${slot.name}\n회의실 참여자 ID: ${slot.memberId}\n${TEAM_ROLES.find(r=>r.id===slot.id).duty}\n\n공통 운영: 설치된 team-room 스킬과 그 안의 협업 지침을 실제 배정 때 확인하세요. 파일당 편집자 한 명, 공유 Editor 조작자 한 명을 유지하고 인계·검증 실패·원문과 사용자 승인 범위를 보존하세요. 보고는 사용자가 지정했거나 원래 요청에서 계속 사용한 언어와 짧은 문단으로 작성하세요. 게시 전 같은 작성 턴에서 언어 혼입을 한 번 점검하고 코드·인용·사용자 원문은 보존하세요. 별도 번역 호출은 하지 말고 기술 근거는 작업 상세에 남기세요. 필요한 담당자만 협업하며 대기 중 AI 호출·반복 확인·자동 재전송을 만들지 마세요.\n\n이번 메시지는 역할 설정입니다. 아직 구현·파일 수정·이미지 생성·검증·다른 채팅 연락을 시작하지 마세요. 회의실 연결 후 사용자의 요청과 총괄의 실제 배정에 따라 작업합니다.${setup.brief?'\n\n사용자가 제공한 프로젝트 설명:\n'+setup.brief:''}`;
}
export class TeamSetup{
 constructor(registry){this.registry=registry;this.file=path.join(registry.home,'team-setups.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();}
 find(state,{projectId,setupId}){check(validId(projectId)&&uuid(setupId),'프로젝트 ID와 팀 구성 setupId를 확인해 주세요.');const setup=state.setups.find(s=>s.id===setupId&&s.projectId===projectId);check(setup,'이 프로젝트의 팀 구성 계획을 찾을 수 없습니다.');return setup;}
 verifyOpening(setup){
  const slot=setup.slots.find(s=>s.openingThreadId);if(!slot)return;
  const context=this.registry.setupContextReader(slot.openingThreadId);
  check(setup.hostId==='local'&&context?.scopeId===setup.openingScopeId&&context.nativeProjectIds?.includes(setup.codexProjectId),'처음 요청한 총괄 대화의 프로젝트 소속이 바뀌었거나 확인되지 않습니다. 원래 연결을 확인해 주세요.');
 }
 view(setup,{includeCatalog=false}={}){
  return {projectId:setup.projectId,setupId:setup.id,name:setup.name,status:setup.status,codexProjectId:setup.codexProjectId,hostId:setup.hostId,...(setup.openingScopeId?{directorMode:'opening-chat',directorThreadId:setup.slots.find(s=>s.openingThreadId).openingThreadId}:{}),...(setup.requestedChoices?{requestedChoices:setup.requestedChoices}:{}),roles:setup.slots.map(s=>({slotId:s.id,memberId:s.memberId,name:s.name,role:s.role,title:s.title,state:s.state,reused:!!(s.existing||s.openingThreadId),...(s.openingThreadId?{reuseSource:'opening-chat'}:{}),...(s.existing||s.openingThreadId?{model:{model:'default',reason:'기존 채팅 설정 유지'}}:{suggested:s.suggested,...(s.choice?{model:s.choice}:{})}),...(s.attemptId?{attemptId:s.attemptId}:{}),...(s.identity?{threadId:s.identity.threadId,hostId:s.identity.hostId}:{}),...(s.reason?{reason:s.reason}:{})})),...(includeCatalog?{modelOptions:[{id:'default',label:'호스트 기본 모델',efforts:[]},...setup.models]}:{})};
 }
 status(args){return this.view(this.find(this.read(),args));}
 plan(args){
  const {projectId,setupId,name,codexProjectId,hostId,brief='',roles=[],directorThreadId}=args;
  check(validId(projectId)&&uuid(setupId)&&text(name,120)&&text(codexProjectId,200)&&text(hostId,160),'회의실·계획 ID와 확인한 Codex 프로젝트·호스트가 필요합니다.');
  check(typeof brief==='string'&&brief.length<=4000,'프로젝트 설명은 4000자까지입니다.');
  check(Array.isArray(roles)&&roles.length<=6&&roles.every(r=>TEAM_ROLES.some(t=>t.id===r.slotId))&&new Set(roles.map(r=>r.slotId)).size===roles.length,'역할 설정은 기본 여섯 역할별로 한 번만 지정해 주세요.');
  let opening;
  if(directorThreadId!==undefined){
   check(text(directorThreadId,160)&&hostId==='local','처음 요청한 로컬 대화창만 총괄로 사용할 수 있습니다.');
   opening=this.registry.setupContextReader(directorThreadId);
   check(text(opening?.scopeId,200)&&opening.nativeProjectIds?.includes(codexProjectId),'처음 요청한 대화창과 팀을 만들 프로젝트가 다릅니다.');
  }
  const models=catalog(args.models),requested=args.requestedChoices===undefined?null:requestedChoices(args.requestedChoices),input=hash(JSON.stringify([projectId,name,codexProjectId,hostId,brief,roles,models,...(requested?[requested]:[]),...(opening?[directorThreadId,opening.scopeId]:[])]));
  return transaction(this.file,empty,state=>{
   const old=state.setups.find(s=>s.id===setupId);if(old){check(old.projectId===projectId&&old.input===input,'같은 setupId로 구성 계획을 바꿀 수 없습니다.');return this.view(old,{includeCatalog:true});}
   check(!state.setups.some(s=>s.projectId===projectId&&s.status!=='connected'),'이 회의실의 진행 중인 구성 계획을 먼저 확인해 주세요. 새 계획으로 중복 생성하지 않습니다.');
   const existing=this.registry.read().projects.find(p=>p.id===projectId),base=existing?.members||[];
   check(!existing?.archivedAt,'삭제된 회의실은 복구한 뒤 팀 설정을 진행해 주세요.');
   check(!opening||!existing,'이미 연결된 회의실의 총괄 대화를 바꾸지 않습니다.');
   const slots=TEAM_ROLES.map(role=>{
    const override=roles.find(r=>r.slotId===role.id)||{},memberId=override.memberId||role.id;
    check(validId(memberId)&&memberId!=='user'&&(role.id==='director'?memberId==='director':memberId!=='director'),'역할의 담당자 ID를 확인해 주세요.');
    check(override.name===undefined||text(override.name,80),'담당자 이름은 80자까지입니다.');
    const binding=override.reuseMemberId||(existing&&base.some(m=>m.id===memberId)?memberId:undefined);
    const reused=binding&&base.find(m=>m.id===binding);check(!binding||reused,'이 회의실의 현재 담당자만 재사용할 수 있습니다.');
    if(role.id==='director'&&existing)check(reused?.id==='director','기존 회의실의 총괄 채팅을 유지해야 합니다.');
    if(role.id!=='director')check(reused?.id!=='director','총괄 채팅을 작업자로 중복 사용하지 않습니다.');
    if(!reused)check(!existing||!knownMembers(existing).some(m=>m.id===memberId),'새 채팅에는 기존·제외된 담당자와 다른 ID를 사용해 주세요.');
    const label=reused?.name||override.name||role.name;
    return {id:role.id,memberId:reused?.id||memberId,name:label,role:reused?.role||role.name,title:name.slice(0,60)+' · '+label.slice(0,50),state:reused?'ready':'planned',...(reused?{existing:reused,identity:{threadId:reused.threadId,hostId:reused.hostId}}:opening&&role.id==='director'?{openingThreadId:directorThreadId}:{suggested:suggestion(role,models)})};
   });
   check(new Set(slots.map(s=>s.memberId)).size===6,'한 담당자를 여러 역할에 중복 연결하지 않습니다.');
   check(!requested||slots.every(s=>!(s.existing||s.openingThreadId)||requested.find(c=>c.slotId===s.id).model==='default'),'기존 채팅의 모델을 새 팀 설정으로 바꾸지 않습니다.');
   check(base.length+slots.filter(s=>!s.existing).length<=20,'기존 담당자를 포함해 최대 20명까지 연결할 수 있습니다.');
   const setup={id:setupId,projectId,name,codexProjectId,hostId,brief,models,input,slots,...(opening?{openingScopeId:opening.scopeId}:{}),...(requested?{requestedChoices:requested}:{}),baseMembers:base,baseRevision:existing?.revision||1,existingRoom:!!existing,...(existing?.workspacePath?{workspacePath:existing.workspacePath}:{}),status:'planned',createdAt:now()};
   state.setups.push(setup);return this.view(setup,{includeCatalog:true});
  });
 }
 catalog(args){
  const models=catalog(args.models),key=hash(JSON.stringify(models));
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args);check(setup.requestedChoices,'역할별 모델이 명시된 메뉴 계획에서만 지원 목록을 연결합니다.');
   if(setup.catalogKey){check(setup.catalogKey===key,'확인한 모델 목록은 덮어쓰지 않습니다. 지원 변경은 원래 설정의 장애로 보고해 주세요.');return this.view(setup,{includeCatalog:true});}
   check(!setup.approval&&setup.status==='planned'&&setup.slots.every(s=>s.state==='planned'||s.existing),'모델 승인·생성 전에 실제 호스트 지원 목록을 확인해 주세요.');
   for(const choice of setup.requestedChoices.filter(c=>c.model!=='default')){const model=models.find(m=>m.id===choice.model);check(model&&(!choice.thinking||model.efforts.includes(choice.thinking)),'요청한 모델·추론을 이 호스트가 지원하지 않습니다: '+choice.model+(choice.thinking?' / '+choice.thinking:'')+'. 다른 모델로 자동 변경하지 않습니다.');}
   setup.models=models;setup.catalogKey=key;return this.view(setup,{includeCatalog:true});
  });
 }
 approve(args){
  check(args.confirmed===true,'실제 사용자의 팀 생성·모델 선택 요청을 먼저 확인해 주세요.');
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args),choices=args.choices;
   check(Array.isArray(choices)&&choices.length===6&&new Set(choices.map(c=>c.slotId)).size===6,'기본 여섯 역할의 모델 선택이 필요합니다.');
   const normalized=setup.slots.map(slot=>{
    return {slotId:slot.id,...selectedModel(setup,slot,choices.find(c=>c.slotId===slot.id))};
   });
   check(!setup.requestedChoices||JSON.stringify(normalized)===JSON.stringify(setup.requestedChoices),'설명에서 승인한 역할별 모델·추론을 그대로 사용해 주세요. 다른 모델로 대체하지 않습니다.');
   const approval=hash(JSON.stringify(normalized));
   if(setup.approval){check(setup.approval===approval,'승인 후 모델 선택을 몰래 바꾸지 않습니다.');return this.view(setup);}
   setup.approval=approval;setup.approvedAt=now();setup.status='approved';for(const slot of setup.slots){const {slotId,...choice}=normalized.find(c=>c.slotId===slot.id);slot.choice=choice;}
   return this.view(setup);
  });
 }
 claim(args){
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args),slot=setup.slots.find(s=>s.id===args.slotId);check(setup.approval&&slot,'승인한 계획의 실제 역할을 지정해 주세요.');
   if(slot.state!=='planned')return {dispatch:false,slotId:slot.id,state:slot.state,...(slot.attemptId?{attemptId:slot.attemptId}:{}),...(slot.identity?{identity:slot.identity}:{})};
   this.verifyOpening(setup);
   slot.state='creating';slot.attemptId=randomUUID();slot.startedAt=now();setup.status=phase(setup);
   if(slot.openingThreadId)return {dispatch:true,slotId:slot.id,attemptId:slot.attemptId,nativeTool:'set_thread_title',action:{threadId:slot.openingThreadId,title:slot.title},guidance:TEAM_ROLES.find(r=>r.id==='director').duty};
   const choice=slot.choice,action={title:slot.title,prompt:prompt(setup,slot),target:{type:'project',projectId:setup.codexProjectId,environment:{type:'local'}},...(choice.model==='default'?{}:{model:choice.model,...(choice.thinking?{thinking:choice.thinking}:{})})};
   return {dispatch:true,slotId:slot.id,attemptId:slot.attemptId,marker:`TEAM-ROOM-SETUP ${setup.projectId} ${setup.id} ${slot.id}`,nativeTool:'create_thread',action};
  });
 }
 record(args){
  check(uuid(args.attemptId)&&args.verified===true&&args.titleVerified===true&&text(args.threadId,160)&&text(args.hostId,160),'예약과 native 결과의 실제 대화 ID·호스트·제목을 확인한 뒤 기록해 주세요.');
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args),slot=setup.slots.find(s=>s.id===args.slotId);
   check(slot&&!slot.existing&&slot.attemptId===args.attemptId,'먼저 예약한 생성 시도의 실제 결과가 필요합니다.');
   check(args.codexProjectId===setup.codexProjectId&&args.hostId===setup.hostId,'계획한 Codex 프로젝트와 호스트의 대화만 연결합니다.');
   check(!slot.openingThreadId||args.threadId===slot.openingThreadId,'총괄은 처음 요청한 대화창으로 고정됩니다. 새 대화로 대체하지 않습니다.');
   const identity={threadId:args.threadId,hostId:args.hostId};
   if(slot.identity){check(sameRoute(slot.identity,identity),'기록한 대화 ID는 덮어쓰지 않습니다.');return this.view(setup);}
   this.verifyOpening(setup);
   check(!setup.slots.some(s=>s!==slot&&(s.identity&&sameRoute(s.identity,identity)||s.openingThreadId===identity.threadId&&identity.hostId===setup.hostId))&&!setup.baseMembers.some(m=>sameRoute(m,identity)),'같은 대화창을 여러 담당자로 연결하지 않습니다.');
   slot.identity=identity;slot.state='ready';delete slot.reason;setup.status=phase(setup);return this.view(setup);
  });
 }
 block(args){
  check(uuid(args.attemptId)&&text(args.reason,1000),'예약과 중단·실패 또는 전달 불확실의 이유가 필요합니다.');
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args),slot=setup.slots.find(s=>s.id===args.slotId);
   check(slot&&slot.attemptId===args.attemptId&&!slot.identity,'예약한 미확인 생성 시도만 중단할 수 있습니다.');
   if(slot.reason)check(slot.reason===args.reason,'기존 장애 기록을 덮어쓰지 않습니다.');
   slot.state='uncertain';slot.reason=args.reason;setup.status='attention';return this.view(setup);
  });
 }
 retry(args){
  check(args.confirmed===true&&args.confirmedAbsent===true&&uuid(args.attemptId)&&uuid(args.retryId)&&text(args.reason,1000),'생성되지 않았다는 native 확인과 사용자의 명시적 재시도 요청이 필요합니다.');
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args),slot=setup.slots.find(s=>s.id===args.slotId);check(slot&&!slot.existing&&!slot.openingThreadId,'새로 생성하는 역할만 재시도할 수 있습니다. 기존 총괄의 제목은 원래 시도로 확인해 주세요.');
   const input=hash(JSON.stringify([args.attemptId,args.reason,args.choice||null])),old=slot.attemptHistory?.find(a=>a.retryId===args.retryId);
   if(old){check(old.input===input,'같은 retryId로 확인 내용이나 모델을 바꿀 수 없습니다.');return this.view(setup);}
   check(slot.state==='uncertain'&&slot.attemptId===args.attemptId&&!slot.identity,'불확실 상태의 원래 시도만 확인 후 재시도할 수 있습니다.');
   const choice=args.choice?selectedModel(setup,slot,args.choice):slot.choice;
   (slot.attemptHistory??=[]).push({attemptId:slot.attemptId,retryId:args.retryId,input,reason:args.reason,previousReason:slot.reason,previousChoice:slot.choice,choice,at:now()});
   slot.choice=choice;slot.state='planned';delete slot.attemptId;delete slot.reason;setup.status=setup.slots.some(s=>s.state==='uncertain')?'attention':'approved';return this.view(setup);
  });
 }
 connect(args){
  return transaction(this.file,empty,state=>{
   const setup=this.find(state,args);check(setup.approval&&setup.slots.every(s=>s.state==='ready'),'모든 역할의 실제 채팅을 확인한 뒤 연결해 주세요.');
   const added=setup.slots.filter(s=>!s.existing).map(s=>({id:s.memberId,name:s.name,role:s.role,roleType:s.id.startsWith('programmer')?'programmer':s.id,...s.identity}));
   const members=[...setup.baseMembers,...added],config=validateProject({id:setup.projectId,name:setup.name,members,...(setup.workspacePath?{workspacePath:setup.workspacePath}:{})});
   const current=this.registry.read().projects.find(p=>p.id===setup.projectId);
   const allPresent=current&&setup.slots.every(slot=>current.members.some(m=>m.id===slot.memberId&&sameRoute(m,slot.identity)));
   if(setup.status==='connected')return {...this.view(setup),revision:current?.revision||1,currentRosterMatches:!!allPresent};
   this.verifyOpening(setup);
   let result;
   if(allPresent)result={revision:current.revision||1};
   else if(setup.existingRoom)result=this.registry.updateMembers({projectId:setup.projectId,memberId:'director',expectedRevision:setup.baseRevision,changeId:setup.id,members:config.members});
   else result=this.registry.configure(config);
   const connected=this.registry.get(setup.projectId);
   check(setup.slots.every(slot=>connected.members.some(m=>m.id===slot.memberId&&sameRoute(m,slot.identity))),'이전 연결 후 구성이 변경되었습니다. 현재 명단을 확인하고 명시적으로 조정해 주세요.');
   setup.status='connected';setup.connectedAt??=now();return {...this.view(setup),revision:result.revision,currentRosterMatches:true};
  });
 }
}
