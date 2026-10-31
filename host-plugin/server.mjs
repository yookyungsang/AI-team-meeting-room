import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {RoomStore} from './store.mjs';
import {Projects} from './projects.mjs';
import {WorkControl} from './control.mjs';
import {Validation} from './validation.mjs';
import {UsageLedger} from './usage.mjs';
import {workTools} from './work-tools.mjs';
import {TeamSetup} from './team-setup.mjs';
import {ROLE_TYPES,roleGuidance} from './roles.mjs';
import {ReadGate} from './read-gate.mjs';
import {openingThread} from './native-chats.mjs';
import {MenuTeam} from './menu-team.mjs';
import {RoomLifecycle} from './room-lifecycle.mjs';
import {diagnose} from './diagnostics.mjs';
import {RoomExport} from './exports.mjs';
import {renderWidget} from './ui.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8')).version;
const projects=new Projects(process.env.TEAM_ROOM_HOME||path.join(os.homedir(),'.codex','team-room'));
const readGates=new WeakMap();
const uri='ui://team-room/meeting.html';
const str={type:'string'},member={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'};
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const tool=(name,description,inputSchema,readonly,visibility=['model'])=>({name,description,inputSchema,annotations:{readOnlyHint:readonly,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{ui:{visibility}}});
const images={type:'array',maxItems:4,items:schema({path:{type:'string',maxLength:2000},caption:{type:'string',maxLength:300}},['path','caption'])};
const roleType={type:'string',enum:ROLE_TYPES,description:'Selected policy kind; custom uses common rules and assignment conditions only. It grants no permissions or model change.'};
const audio={type:'array',maxItems:3,items:schema({path:{type:'string',maxLength:2000},caption:{type:'string',maxLength:300}},['path','caption'])};
export const TOOLS=[
 {...tool('room_open','Open 팀 회의실. Explicit projectId takes precedence. Without it, match the opening chat from host metadata to exactly one configured local project through read-only membership metadata; unavailable, unregistered or ambiguous context shows the chooser. Never guess from cwd/recency or create a room. Idle refresh invokes no AI.',schema({projectId:member}),true,['app','model']),title:'팀 회의실',_meta:{ui:{resourceUri:uri},'openai/ui':{entrypoints:[{type:'thread'}]}}},
 tool('room_state','Read only the selected project. Without projectId return the chooser. The UI may set resolveCurrent:true once on initial mount to resolve the host-provided opening chat to one configured local project. No global selection, registration, AI or runtime calls.',schema({projectId:member,resolveCurrent:{type:'boolean'}}),true,['app','model']),
 tool('room_submit','Store an explicit human message, optionally linked to an active original request by followUpTo; does NOT start AI. The UI sends each wakePrompt once without blocking later messages.',schema({id:str,text:{type:'string',maxLength:6000},recipients:{type:'array',items:member,minItems:1,maxItems:6},followUpTo:str},['id','text','recipients']),false,['app']),
 tool('room_get','Read one request and its linked user follow-ups. Directors check these before decisions and completion, integrate additions without redispatching original jobs, and complete each follow-up. statusOnly:true omits text; unrelated history needs includePrevious:true.',schema({requestId:str,statusOnly:{type:'boolean'},includePrevious:{type:'boolean'}},['requestId']),true),
 tool('room_claim','Reserve one existing participant before native dispatch. For an image/visual deliverable, set requireFinalImage:true on its creator: their own final reply must attach the final image. Can add this requirement to active work without redispatch; cannot remove it. For audio creation set requireFinalAudio:true; their own final reply must attach the audio. Only dispatch:true permits a new assignment.',schema({requestId:str,memberId:member,requireFinalImage:{type:'boolean'},requireFinalAudio:{type:'boolean'}},['requestId','memberId']),false),
 tool('room_post','Write your own substantive message directly. Use a stable messageKey (e.g. question-qa-1) for safe storage retries. Native source IDs are optional only when already known; do not read your chat just to obtain them. No dispatch/AI occurs here. New peer questions require one separate native send only when created:true. No posting acknowledgments.',schema({requestId:str,memberId:member,kind:{type:'string',enum:['assignment','question','answer','progress','decision','blocker']},messageKey:str,toMemberId:member,replyTo:str,text:{type:'string',maxLength:20000},sourceThreadId:str,sourceTurnId:str,sourceMessageId:str},['requestId','memberId','kind','text']),false),
 tool('room_reply','Write your own substantive final answer and complete once. Image creators must attach an actual final image here, even if shown in progress; requireFinalImage jobs reject missing images. Unavailable output needs an honest blocker/failure, never fake success. Directors need not duplicate a creator image already posted. No self-read, acknowledgment or AI call.',schema({requestId:str,memberId:member,text:{type:'string',maxLength:20000},sourceThreadId:str,sourceTurnId:str,sourceMessageId:str},['requestId','memberId','text']),false),
 tool('room_fail','Record a delivery failure without retrying or inventing an answer.',schema({requestId:str,memberId:member,reason:{type:'string',maxLength:1000}},['requestId','memberId','reason']),false),
 tool('room_pause','Pause or resume NEW meeting submissions and dispatches only. Does not stop active Codex turns.',schema({paused:{type:'boolean'}},['paused']),false,['app','model'])
];
TOOLS.push(tool('room_image','Read an image already attached to an explicit project/request/message. UI only; no AI or network calls.',schema({requestId:str,messageId:str,imageId:str},['requestId','messageId','imageId']),true,['app']));
TOOLS.push(tool('room_audio','Read one attached audio snapshot for user-initiated preview. UI only; bytes stay in metadata, with no AI or external network call.',schema({requestId:str,messageId:str,audioId:str},['requestId','messageId','audioId']),true,['app']));
// Keep a stable plugin ID for installed users, but require explicit project scope
// on every request operation. No shared mutable current-project setting exists.
for(const definition of TOOLS){
 if(!['room_open','room_state'].includes(definition.name)){
  definition.inputSchema.properties.projectId=member;
  definition.inputSchema.required.push('projectId');
 }
 if(definition.name==='room_submit')definition.inputSchema.properties.recipients.maxItems=20;
 if(['room_post','room_reply'].includes(definition.name)){
  definition.inputSchema.properties.text.description='Use the user-requested or established conversation language. Check for unintended language mixing once in this same reporting turn; keep exact code/quotes. Explain results, unfinished work, risks and decisions in short plain paragraphs. Technical evidence goes in details. No separate translation call.';
  definition.inputSchema.properties.details={type:'string',minLength:1,maxLength:20000,description:'Optional exact technical context, file paths, settings, logs and evidence. Stored in the same post and fully readable by participants; folded as 작업 상세 in the UI. Never hide blockers or approval needs only here.'};
  definition.inputSchema.properties.images=images;
  definition.inputSchema.properties.audio=audio;
  definition.description+=' Optional audio:[{path,caption}] attaches up to 3 local WAV/MP3/OGG files, 8 MiB each; immutable snapshots, previewed only on user action. No transcription or AI listening occurs.';
  definition.description+=' Optional images:[{path,caption}] attaches up to 4 existing local PNG/JPEG/GIF/WebP files (8 MiB each) from this server host, including work-in-progress previews. Files are copied once; use a new messageKey for a new stage.';
 }
}
TOOLS.push(tool('room_projects','List configured project names and IDs without loading conversations or invoking AI.',schema(),true));
TOOLS.push(tool('room_configure','Register a project with verified existing chat IDs and explicit human authorization. Never create chats or infer permission from this record. Same registration is idempotent; use room_members for explicit roster changes. This changes only meeting configuration, not filesystem access or projects in Codex.',schema({projectId:member,name:{type:'string',maxLength:120},workspacePath:{type:'string',maxLength:1000},members:{type:'array',minItems:1,maxItems:20,items:schema({id:member,name:str,role:str,roleType,threadId:str,hostId:str},['id','name','role','threadId','hostId'])}},['projectId','name','members']),false));
TOOLS.push(tool('room_members','Director applies a human-authorized roster change to this room without deleting history or invoking AI. Read room_state first; send the complete desired active roster, its expectedRevision and a stable UUID changeId. Add, rename, change roles, remove idle members or reactivate them. Busy jobs/questions/leases/validation block removal. Existing IDs keep their thread/host forever; replacement chats use a new member ID. Keep director routing unchanged. Never retry or contact staff automatically.',schema({projectId:member,memberId:{type:'string',enum:['director']},expectedRevision:{type:'integer',minimum:1},changeId:str,members:{type:'array',minItems:1,maxItems:20,items:schema({id:member,name:str,role:str,roleType,threadId:str,hostId:str},['id','name','role','threadId','hostId'])}},['projectId','memberId','expectedRevision','changeId','members']),false));
TOOLS.push(tool('room_roster','Menu roster editor; no AI/native execution. read returns project-scoped labels, choices and revisions. apply resolves selected IDs server-side and preserves membership guards/history. register is director-only after an explicit human request: verify this project’s existing chats with native tools, then save candidate names/roles/routes with verified:true and requestId. Never create/contact chats or change active members just to prepare choices.',schema({projectId:member,operation:{type:'string',enum:['read','register','apply']},memberId:{type:'string',enum:['director']},requestId:str,verified:{type:'boolean'},candidates:{type:'array',maxItems:100,items:schema({name:str,role:str,roleType,threadId:str,hostId:str},['name','role','threadId','hostId'])},expectedRevision:{type:'integer',minimum:1},optionsRevision:{type:'integer',minimum:1},changeId:str,selection:{type:'array',minItems:1,maxItems:20,items:schema({id:member,name:str,role:str,roleType},['id','name','role'])}},['projectId','operation']),false,['app','model']));
TOOLS.push(tool('room_team','Explicit human-requested team setup: director, planner, designer, TWO programmers and QA. Read the team-creation skill reference. Local planning/journal only; never executes chats or AI. Verify the native project/host and available models; show role/model choices for human selection. For a new basic team, set directorThreadId to the verified calling chat: plan → approve → claim → follow nativeTool (set_thread_title for original director; create_thread for workers) once only if dispatch:true → verify title → record → connect. Omit directorThreadId for existing-room extensions or explicitly all-new/legacy plans. Unknown creation results require native reconciliation, never recreate. Stored plans never grant native authorization.',schema({projectId:member,setupId:str,operation:{type:'string',enum:['plan','approve','claim','record','block','retry','connect','status']},name:{type:'string',maxLength:120},codexProjectId:str,hostId:str,brief:{type:'string',maxLength:4000},models:{type:'array',maxItems:32,items:schema({id:str,label:str,family:{type:'string',enum:['balanced','visual','deep','light','other']},efforts:{type:'array',maxItems:8,items:str}},['id','label','family','efforts'])},roles:{type:'array',maxItems:6,items:schema({slotId:member,memberId:member,reuseMemberId:member,name:str,roleLabel:{type:'string',maxLength:80,description:'Display label only; the role slot still determines policy.'}},['slotId'])},choices:{type:'array',minItems:6,maxItems:6,items:schema({slotId:member,model:str,thinking:str},['slotId','model'])},confirmed:{type:'boolean'},confirmedAbsent:{type:'boolean'},retryId:str,choice:schema({model:str,thinking:str},['model']),slotId:member,attemptId:str,threadId:str,verified:{type:'boolean'},titleVerified:{type:'boolean'},reason:{type:'string',maxLength:1000}},['projectId','setupId','operation']),false));
function resource(){return {uri,mimeType:'text/html;profile=mcp-app',text:renderWidget(),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{availableDisplayModes:['inline','fullscreen'],preferredDisplayMode:'fullscreen'}}};}
TOOLS.push(tool('room_team_setup','Human menu onboarding only. preview shows six roles, reuse of the opening chat as director (current settings), and exact requested model/effort settings for five new workers for the verified opening local project; it creates no chats or model work. apply requires confirmed:true and the original preview/request IDs, revalidates scope, journals a guarded requested-choice plan and returns dispatch:true once to prepare an EDITABLE DRAFT with send:false, never to submit it automatically. Requested/existing views include the original continuationPrompt for direct human review/send or manual copy; stored intent is not authenticated human approval. Never create native chats in the server, guess a project, retry delivery or replace an existing room/setup.',schema({operation:{type:'string',enum:['preview','apply']},previewId:str,requestId:str,confirmed:{type:'boolean'}},['operation']),false,['app']));
TOOLS.push(...workTools(tool,schema,member,str));
TOOLS.push(tool('room_manage','Explicit human menu room management only, without AI or native chat changes. preview_delete shows scoped counts/blockers. delete requires name/revision/confirmed/changeId, rejects active work/questions/ownership/runs/setup, and hides the room while retaining all history for restore. list_deleted returns labels only. restore reuses original routes and records. Exact operation retries never undo later changes; never hard-delete files, stop chats or dispatch work.',schema({operation:{type:'string',enum:['preview_delete','delete','list_deleted','restore']},projectId:member,expectedRevision:{type:'integer',minimum:1},changeId:str,confirmName:str,confirmed:{type:'boolean'}},['operation']),false,['app']));
TOOLS.find(t=>t.name==='room_team').inputSchema.properties.operation.enum.push('catalog');
TOOLS.find(t=>t.name==='room_team').inputSchema.properties.requestedChoices={...TOOLS.find(t=>t.name==='room_team').inputSchema.properties.choices,description:'Optional exact human-confirmed menu choices. These are requested settings, not observed availability. Before approval, catalog binds the actual native host model/effort list once; never substitute another choice.'};
TOOLS.find(t=>t.name==='room_team').inputSchema.properties.directorThreadId={...str,description:'For a NEW local room only: use the verified calling chat as director, preserving its current model/history. Must match host opening metadata and native project scope. Director claim returns set_thread_title, not create_thread. Omit to preserve an explicitly requested all-new or legacy plan.'};
TOOLS.find(t=>t.name==='room_team').description+=' A menu role preset is saved as requestedChoices. Verify native create_thread capabilities, call catalog(models) once before approval, then approve those exact choices. Unsupported combinations block without fallback; defaults omit model/thinking. No extra human confirmation is needed for the already confirmed menu choices.';
TOOLS.find(t=>t.name==='room_team').description+=' New basic menu teams reuse the original opening chat as director. Follow each claim nativeTool: set_thread_title renames that exact existing director without AI initialization; create_thread creates a missing worker. Never create a replacement director. Record the actual title receipt before connect; continue in the original director chat.';
const menuSetupTool=TOOLS.find(t=>t.name==='room_team_setup');
TOOLS.push(tool('room_check','Explicit user connection check only. Read project membership, director routing, participant catalog and saved setup. Host observations report capabilities, never authorize native work. No writes, chat creation, model calls or automatic repair; unsupported native permissions remain unverified.',schema({projectId:member,host:schema({message:{type:'boolean'},draft:{type:'boolean'},protocol:str})}),true,['app']));
TOOLS.push(tool('room_export','Explicit selected-room export only. preview counts records and attachments; create(projectId,exportId) writes one scoped verified ZIP under runtime/exports with raw records, offline HTML, Markdown and media. Same ID reuses the original archive. download returns bounded bytes only in UI metadata. Never writes project sources, restores a live room, invokes AI, or exports another project.',schema({projectId:member,operation:{type:'string',enum:['preview','create','download']},exportId:str},['projectId','operation']),false,['app']));
menuSetupTool.inputSchema.properties.operation.enum.push('resume');
menuSetupTool.inputSchema.properties.language={type:'string',enum:['ko','en','ja','zh-Hans','zh-Hant']};
menuSetupTool.inputSchema.properties.projectId=member;menuSetupTool.inputSchema.properties.setupId=str;
menuSetupTool.description+=' resume(projectId,setupId) reads the original journal and prepares continuation text only, never retries a native action. The human reviews and sends an editable draft in the original director chat. Saved progress is exposed in room_state without AI/native polling; an uncertain attempt never means permission to recreate.';
TOOLS.find(t=>t.name==='room_roster').inputSchema.properties.operation.enum.push('discover');
TOOLS.find(t=>t.name==='room_roster').description+=' discover reads only local Codex chat titles and project membership through a read-only metadata compatibility adapter, on explicit editor open/refresh; no AI or messages. It prepares same-project choices without activating them. UI additions are revalidated at save. Unsupported/remote indexes return an unavailable notice, never a global chat list.';
Object.assign(TOOLS.find(t=>t.name==='room_get').inputSchema.properties,{
 readerId:{...member,description:'Your configured member ID, a read-cache scope hint only, not authentication. Include it to compact unchanged rapid repeat reads without affecting another participant.'},
 refreshReason:{type:'string',enum:['decision','recovery','evidence','user_request'],description:'Explicit necessary full reread: a decision, recovery, exact evidence or human request. Bypasses unchanged-response compaction; do not set for routine polling.'}
});
TOOLS.find(t=>t.name==='room_get').description+=' Include readerId. An unchanged repeat within 30 seconds returns a compact unchanged:true receipt, not an error. Reuse your prior content; do not retry it in a loop. Changed data and explicit refreshReason always return current content. Legacy calls without identity remain compatible; UI and native chat tools are unaffected.';
TOOLS.find(t=>t.name==='room_post').inputSchema.properties.notifyDirector={type:'boolean',description:'Only for a participant question/blocker that actually blocks progress. Preserve the original room post and target; return one compact directorNotice on first save. Native delivery still requires verified human authorization.'};
TOOLS.find(t=>t.name==='room_post').description+=' For a blocking question/blocker use notifyDirector:true. Only directorNotice.dispatch:true permits one authorized native send of its prompt to its configured director. If the question targets that director, this replaces its usual peer send; never send both. Storage retries do not reissue the notice; no automatic send/retry occurs.';
TOOLS.find(t=>t.name==='room_post').description+=' Retest directives use room_validation(operation="retest") instead: it records resume approvals and the assignment together.';
TOOLS.find(t=>t.name==='room_validation').annotations.openWorldHint=true;
TOOLS.find(t=>t.name==='room_claim').description+=' Director: include the existing designer before UI implementation when layout/interaction/readability choices remain; approved-design fixes go straight to developers. Include the existing sound-effects/sound specialist for unresolved audio/playback choices; agreed-asset wiring and clear bugs go straight to developers. Reuse audio/specifications; skip sound-unaffected work. Decide within the original assignment turn, no classifier AI. A new dispatch includes compact guidance refs for the saved roleType under the team-room skill. Read common rules once and only relevant role sections during actual work; custom gets common rules plus assignment conditions. No policy-only wake.';
TOOLS.find(t=>t.name==='room_claim').description+=' Batch active native waits with current cursors; use supported host defaults within current limits. Unchanged timeouts need no extra status/history reads or progress messages. Keep active orchestration unless verified host events also cover unexpected interruption. See event-waiting.md under the team-room skill references.';
export function compactResult(name,data){
 if(name==='room_claim')return {dispatch:data.dispatch,request:{id:data.request.id,status:data.request.status},member:data.member,job:data.job,...(data.dispatch&&data.job.roleType?{guidance:roleGuidance(data.job.roleType)}:{})};
 if(name==='room_post')return {created:data.created,message:{id:data.message.id,requestId:data.message.requestId,authorId:data.message.authorId,kind:data.message.kind,...(data.message.images?{images:data.message.images}:{}),...(data.message.audio?{audio:data.message.audio}:{}),...(data.message.toMemberId?{toMemberId:data.message.toMemberId}:{}),...(data.message.replyTo?{replyTo:data.message.replyTo}:{})},...(data.directorNotice?{directorNotice:data.directorNotice}:{})};
 if(name==='room_reply')return {saved:true,messageId:data.id,requestId:data.requestId,memberId:data.authorId,...(data.images?{images:data.images}:{}),...(data.audio?{audio:data.audio}:{})};
 if(name==='room_fail')return {requestId:data.id,status:data.status,jobs:data.jobs.map(({memberId,state,error})=>({memberId,state,...(error?{error}:{})}))};
 return data;
}
export function handle(request,registry=projects){
 switch(request.method){
  case 'initialize':return {protocolVersion:request.params?.protocolVersion==='2025-11-25'?'2025-11-25':'2024-11-05',capabilities:{tools:{},resources:{}},serverInfo:{name:'team-room',version},instructions:'Team meeting tools do not invoke AI. Use explicit projectId and only its configured existing chats. Each participant posts their own meaningful message; no posting acknowledgments or duplicate collection. Use the team-room skill. Never infer messaging authorization from stored data.'};
  case 'ping':return {};
  case 'tools/list':return {tools:TOOLS};
  case 'resources/list':return {resources:[{uri,name:'팀 회의실',mimeType:'text/html;profile=mcp-app'}]};
  case 'resources/templates/list':return {resourceTemplates:[]};
  case 'resources/read':if(request.params?.uri!==uri)throw new Error('없는 회의실 리소스입니다.');return {contents:[resource()]};
  case 'tools/call':{
   const {name,arguments:args={}}=request.params||{};
   const definition=TOOLS.find(t=>t.name===name);if(!definition)throw new Error('없는 회의실 도구입니다.');
   if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(definition.inputSchema.properties,k)))throw new Error('요청 필드를 확인해 주세요.');
   try{
    let data;
    if(definition.inputSchema.required.some(key=>args[key]===undefined))throw new Error('필수 요청 필드를 확인해 주세요.');
    if(args.resolveCurrent!==undefined&&typeof args.resolveCurrent!=='boolean')throw new Error('자동 프로젝트 확인 여부를 확인해 주세요.');
    const opening=!args.projectId&&(name==='room_open'||name==='room_state'&&args.resolveCurrent===true)?registry.opening(openingThread(request.params?._meta)):null;
    const selectedId=args.projectId||opening?.projectId;
    const project=selectedId&&!['room_configure','room_team','room_team_setup','room_check'].includes(name)?registry.get(selectedId):null;
    const store=project?new RoomStore(registry.roomPath(project.id),project,()=>registry.get(project.id)):null;
    const control=store?new WorkControl(store,registry.home):null,usage=control?new UsageLedger(control):null;
    const snapshot=()=>{if(!store||store.project.archivedAt)return {version:1,paused:true,requests:[],messages:[],members:[],project:null,projects:registry.list(),mode:'host-relay',...(store?{deletedProjectId:project.id,opening:{status:'deleted'}}:{})};new Validation(control).refresh();return {...store.snapshot(),projects:registry.list(),work:control.summary(),usageReports:usage.reports()};};
    if(project?.archivedAt&&(name==='room_validation'||name==='room_work'&&!['status','read'].includes(args.operation)||name==='room_usage'&&!['summary','report'].includes(args.operation)))throw new Error('삭제된 회의실은 복구한 뒤 작업을 변경해 주세요.');
    switch(name){
     case 'room_check':data=diagnose(registry,{...args,threadId:openingThread(request.params?._meta)});break;
     case 'room_export':{
      const exporter=new RoomExport(registry,store);
      if(args.operation==='preview')data=exporter.preview();
      else if(args.operation==='create'){
       const {path:exportPath,...receipt}=exporter.create(args);return {content:[{type:'text',text:JSON.stringify(receipt)}],structuredContent:receipt,_meta:{'team-room/exportPath':exportPath}};
      }else if(args.operation==='download'){
       const {receipt:{path:exportPath,...receipt},data:bytes}=exporter.download(args);return {content:[{type:'text',text:JSON.stringify(receipt)}],structuredContent:receipt,_meta:{'team-room/exportPath':exportPath,'team-room/exportBytes':bytes}};
      }else throw new Error('Unknown export operation.');break;
     }
     case 'room_manage':{
      const lifecycle=new RoomLifecycle(registry);
      if(args.operation==='list_deleted')data=lifecycle.deleted();
      else if(args.operation==='preview_delete')data=lifecycle.preview(args);
      else data=lifecycle.change(args);break;
     }
     case 'room_team_setup':{
      const menu=new MenuTeam(registry),input={...args,threadId:openingThread(request.params?._meta)};
      if(args.operation==='preview')data=menu.preview(input);
      else if(args.operation==='apply')data=menu.apply(input);
      else if(args.operation==='resume')data=menu.resume(input);
      else throw new Error('지원하지 않는 팀 만들기 작업입니다.');break;
     }
     case 'room_projects':data={projects:registry.list()};break;
     case 'room_configure':data=registry.configure({id:args.projectId,name:args.name,workspacePath:args.workspacePath,members:args.members});break;
     case 'room_members':data=registry.updateMembers(args);break;
     case 'room_roster':{
      if(args.operation==='read')data=registry.roster(args.projectId);
      else if(args.operation==='discover')data=registry.discover(args.projectId);
      else if(args.operation==='register'){control.actor(args,{director:true});data=registry.registerOptions(args);}
      else if(args.operation==='apply'){const receipt=registry.updateMembers({...args,members:undefined});data={...registry.roster(args.projectId),appliedRevision:receipt.appliedRevision,replayed:receipt.replayed};}
      else throw new Error('지원하지 않는 구성원 편집 작업입니다.');break;
     }
     case 'room_team':{
      if(args.operation!=='status'&&registry.read().projects.find(p=>p.id===args.projectId)?.archivedAt)throw new Error('삭제된 회의실은 복구한 뒤 팀 설정을 변경해 주세요.');
      if(!['plan','catalog','approve','claim','record','block','retry','connect','status'].includes(args.operation))throw new Error('지원하지 않는 팀 구성 작업입니다.');
      if(args.operation==='plan'&&args.directorThreadId!==undefined&&openingThread(request.params?._meta)!==args.directorThreadId)throw new Error('총괄로 사용할 대화창은 이 요청을 보낸 현재 대화창이어야 합니다.');
      const team=new TeamSetup(registry);
      if(args.operation!=='status'){
       const setup=args.operation==='plan'?team.read().setups.find(s=>s.id===args.setupId):team.find(team.read(),args),director=setup?.slots.find(s=>s.openingThreadId);
       if(director&&openingThread(request.params?._meta)!==director.openingThreadId)throw new Error('이 팀 설정은 처음 요청한 총괄 대화창에서 이어가 주세요. 다른 대화를 총괄로 바꾸지 않습니다.');
      }
      data=args.operation==='status'?team.status(args):team.execute(args);break;
     }
     case 'room_open':case 'room_state':{
      data={...snapshot(),...(opening?{opening}:{} )};
      try{data.teamProgress=new MenuTeam(registry).progress({threadId:openingThread(request.params?._meta),...(selectedId?{projectId:selectedId}:{})});}
      catch{data.teamProgressUnavailable=true;}
      break;
     }
     case 'room_submit':{
      const setup=new TeamSetup(registry).read().setups.find(s=>s.projectId===args.projectId&&!s.existingRoom&&s.status!=='connected');
      if(setup&&!store.read().requests.some(r=>r.id===args.id))throw new Error('팀 구성 중입니다. 담당자와 회의실 연결을 마친 뒤 작업을 보내 주세요. 중단·오류 상담은 원래 Codex 채팅에서 할 수 있습니다.');
      data=store.submit(args);data.state=snapshot();break;
     }
     case 'room_get':{
      data=store.get(args.requestId,args);
      if(!readGates.has(registry))readGates.set(registry,new ReadGate());
      data=readGates.get(registry).read(data,args,store.members);break;
     }
     case 'room_claim':data=store.claim(args);break;
     case 'room_post':data=store.post(args);break;
     case 'room_reply':if(!store.project.archivedAt)control.assertCompletable(args);data=store.reply(args);break;
     case 'room_work':{
      if(args.operation==='status'){if(!store.project.archivedAt)new Validation(control).refresh();data=control.summary();}
      else if(args.operation==='read')data=control.readFile(args);
      else{if(!['configure','acquire','write','release','checkpoint','recover'].includes(args.operation))throw new Error('지원하지 않는 작업 제어입니다.');data=control[args.operation](args);}break;
     }
     case 'room_validation':{
      const validator=new Validation(control),method={define:'define',begin:'begin',result:'result',retest:'retest',resume:'resume',waive:'resume',unity:'start',cancel:'cancel',reconcile:'cancel'}[args.operation];
      if(!method)throw new Error('지원하지 않는 검증 제어입니다.');data=validator[method](args);break;
     }
     case 'room_usage':{
      if(args.operation==='attach')data=usage.attach(args);
      else if(args.operation==='discover')data=usage.discover(args);
      else if(args.operation==='label')data=usage.label(args);
      else if(args.operation==='record_limits')data=usage.recordLimits(args);
      else if(args.operation==='sync')data=usage.sync();
      else if(args.operation==='summary')data=usage.summary();
      else if(args.operation==='report')data=usage.report(args.requestId);
      else throw new Error('지원하지 않는 사용량 조회입니다.');break;
     }
     case 'room_image':{
      const {image,dataUrl}=store.image(args);
      return {content:[],structuredContent:{projectId:project.id,image},_meta:{'team-room/imageData':dataUrl}};
     }
     case 'room_audio':{
      const {audio,dataUrl}=store.audioFile(args);
      return {content:[],structuredContent:{projectId:project.id,audio},_meta:{'team-room/audioData':dataUrl}};
     }
     case 'room_fail':data=store.fail(args);break;
     case 'room_pause':store.pause(args.paused);data=snapshot();break;
    }
    if(name==='room_team'&&['approve','record','block','retry'].includes(args.operation))data={projectId:data.projectId,setupId:data.setupId,status:data.status,saved:true};
    data=compactResult(name,data);
    if(project&&name!=='room_state'&&name!=='room_open')data={...data,projectId:project.id};
    return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
   }catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
  }
  default:throw new Error('지원하지 않는 MCP 메서드입니다.');
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
 input.on('line',line=>{
  if(!line.trim())return;let request;
  try{if(line.length>300000)throw new Error('요청이 너무 큽니다.');request=JSON.parse(line);if(request.id===undefined)return;const result=handle(request);process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');}
  catch(error){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request?.id??null,error:{code:-32602,message:error.message}})+'\n');}
 });
}
