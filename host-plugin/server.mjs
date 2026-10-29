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

const root=path.dirname(fileURLToPath(import.meta.url));
const version=JSON.parse(fs.readFileSync(path.join(root,'plugin.json'),'utf8')).version;
const projects=new Projects(process.env.TEAM_ROOM_HOME||path.join(os.homedir(),'.codex','team-room'));
const uri='ui://team-room/meeting.html';
const str={type:'string'},member={type:'string',pattern:'^[a-z][a-z0-9_-]{0,63}$'};
const schema=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
const tool=(name,description,inputSchema,readonly,visibility=['model'])=>({name,description,inputSchema,annotations:{readOnlyHint:readonly,destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{ui:{visibility}}});
const images={type:'array',maxItems:4,items:schema({path:{type:'string',maxLength:2000},caption:{type:'string',maxLength:300}},['path','caption'])};
export const TOOLS=[
 {...tool('room_open','Open 팀 회의실 for an explicit project in its existing director chat. Without projectId, show the project chooser only. Idle refresh invokes no AI.',schema({projectId:member}),true,['app','model']),title:'팀 회의실',_meta:{ui:{resourceUri:uri},'openai/ui':{entrypoints:[{type:'thread'}]}}},
 tool('room_state','Read only the selected project. Without projectId return the chooser, never infer a project. No model/runtime calls.',schema({projectId:member}),true,['app','model']),
 tool('room_submit','Store an explicit human message, optionally linked to an active original request by followUpTo; does NOT start AI. The UI sends each wakePrompt once without blocking later messages.',schema({id:str,text:{type:'string',maxLength:6000},recipients:{type:'array',items:member,minItems:1,maxItems:6},followUpTo:str},['id','text','recipients']),false,['app']),
 tool('room_get','Read one request and its linked user follow-ups. Directors check these before decisions and completion, integrate additions without redispatching original jobs, and complete each follow-up. statusOnly:true omits text; unrelated history needs includePrevious:true.',schema({requestId:str,statusOnly:{type:'boolean'},includePrevious:{type:'boolean'}},['requestId']),true),
 tool('room_claim','Reserve one selected or delegated existing participant before native dispatch. Only dispatch:true permits sending a new assignment; never resend reserved work.',schema({requestId:str,memberId:member},['requestId','memberId']),false),
 tool('room_post','Write your own substantive message directly. Use a stable messageKey (e.g. question-qa-1) for safe storage retries. Native source IDs are optional only when already known; do not read your chat just to obtain them. No dispatch/AI occurs here. New peer questions require one separate native send only when created:true. No posting acknowledgments.',schema({requestId:str,memberId:member,kind:{type:'string',enum:['assignment','question','answer','progress','decision','blocker']},messageKey:str,toMemberId:member,replyTo:str,text:{type:'string',maxLength:20000},sourceThreadId:str,sourceTurnId:str,sourceMessageId:str},['requestId','memberId','kind','text']),false),
 tool('room_reply','Write your own substantive answer and complete your job once. Only requestId/memberId/text needed; no self-read or duplicate commentary required. Do not add a posted/received/completed acknowledgment afterward. No AI is invoked here.',schema({requestId:str,memberId:member,text:{type:'string',maxLength:20000},sourceThreadId:str,sourceTurnId:str,sourceMessageId:str},['requestId','memberId','text']),false),
 tool('room_fail','Record a delivery failure without retrying or inventing an answer.',schema({requestId:str,memberId:member,reason:{type:'string',maxLength:1000}},['requestId','memberId','reason']),false),
 tool('room_pause','Pause or resume NEW meeting submissions and dispatches only. Does not stop active Codex turns.',schema({paused:{type:'boolean'}},['paused']),false,['app','model'])
];
TOOLS.push(tool('room_image','Read an image already attached to an explicit project/request/message. UI only; no AI or network calls.',schema({requestId:str,messageId:str,imageId:str},['requestId','messageId','imageId']),true,['app']));
// Keep a stable plugin ID for installed users, but require explicit project scope
// on every request operation. No shared mutable current-project setting exists.
for(const definition of TOOLS){
 if(!['room_open','room_state'].includes(definition.name)){
  definition.inputSchema.properties.projectId=member;
  definition.inputSchema.required.push('projectId');
 }
 if(definition.name==='room_submit')definition.inputSchema.properties.recipients.maxItems=20;
 if(['room_post','room_reply'].includes(definition.name)){
  definition.inputSchema.properties.images=images;
  definition.description+=' Optional images:[{path,caption}] attaches up to 4 existing local PNG/JPEG/GIF/WebP files (8 MiB each) from this server host, including work-in-progress previews. Files are copied once; use a new messageKey for a new stage.';
 }
}
TOOLS.push(tool('room_projects','List configured project names and IDs without loading conversations or invoking AI.',schema(),true));
TOOLS.push(tool('room_configure','Register a project with verified existing chat IDs and explicit human authorization. Never create chats or infer permission from this record. Existing connections are immutable; same configuration is idempotent. This changes only meeting configuration, not filesystem access or projects in Codex.',schema({projectId:member,name:{type:'string',maxLength:120},workspacePath:{type:'string',maxLength:1000},members:{type:'array',minItems:1,maxItems:20,items:schema({id:member,name:str,role:str,threadId:str,hostId:str},['id','name','role','threadId','hostId'])}},['projectId','name','members']),false));
function resource(){return {uri,mimeType:'text/html;profile=mcp-app',text:fs.readFileSync(path.join(root,'widget.html'),'utf8'),_meta:{ui:{csp:{connectDomains:[],resourceDomains:[]}},'openai/ui':{availableDisplayModes:['inline','fullscreen'],preferredDisplayMode:'fullscreen'}}};}
TOOLS.push(...workTools(tool,schema,member,str));
TOOLS.find(t=>t.name==='room_validation').annotations.openWorldHint=true;
export function compactResult(name,data){
 if(name==='room_claim')return {dispatch:data.dispatch,request:{id:data.request.id,status:data.request.status},member:data.member,job:data.job};
 if(name==='room_post')return {created:data.created,message:{id:data.message.id,requestId:data.message.requestId,authorId:data.message.authorId,kind:data.message.kind,...(data.message.images?{images:data.message.images}:{}),...(data.message.toMemberId?{toMemberId:data.message.toMemberId}:{}),...(data.message.replyTo?{replyTo:data.message.replyTo}:{})}};
 if(name==='room_reply')return {saved:true,messageId:data.id,requestId:data.requestId,memberId:data.authorId,...(data.images?{images:data.images}:{})};
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
    const project=args.projectId&&name!=='room_configure'?registry.get(args.projectId):null;
    const store=project?new RoomStore(registry.roomPath(project.id),project):null;
    const control=store?new WorkControl(store,registry.home):null,usage=control?new UsageLedger(control):null;
    const snapshot=()=>{if(!store)return {version:1,paused:true,requests:[],messages:[],members:[],project:null,projects:registry.list(),mode:'host-relay'};new Validation(control).refresh();return {...store.snapshot(),projects:registry.list(),work:control.summary(),usageReports:usage.reports()};};
    switch(name){
     case 'room_projects':data={projects:registry.list()};break;
     case 'room_configure':data=registry.configure({id:args.projectId,name:args.name,workspacePath:args.workspacePath,members:args.members});break;
     case 'room_open':case 'room_state':data=snapshot();break;
     case 'room_submit':data=store.submit(args);data.state=snapshot();break;
     case 'room_get':data=store.get(args.requestId,args);break;
     case 'room_claim':data=store.claim(args);break;
     case 'room_post':data=store.post(args);break;
     case 'room_reply':control.assertCompletable(args);data=store.reply(args);break;
     case 'room_work':{
      if(args.operation==='status'){new Validation(control).refresh();data=control.summary();}
      else if(args.operation==='read')data=control.readFile(args);
      else{if(!['configure','acquire','write','release','checkpoint','recover'].includes(args.operation))throw new Error('지원하지 않는 작업 제어입니다.');data=control[args.operation](args);}break;
     }
     case 'room_validation':{
      const validator=new Validation(control),method={define:'define',begin:'begin',result:'result',resume:'resume',waive:'resume',unity:'start',cancel:'cancel',reconcile:'cancel'}[args.operation];
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
     case 'room_fail':data=store.fail(args);break;
     case 'room_pause':store.pause(args.paused);data=snapshot();break;
    }
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
