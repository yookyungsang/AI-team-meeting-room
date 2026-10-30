import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

export const check=(ok,message)=>{if(!ok)throw new Error(message);};
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const now=()=>new Date().toISOString();
export function fileHash(file){
 if(!fs.existsSync(file))return 'missing';
 const digest=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024);
 try{let length;while((length=fs.readSync(fd,buffer,0,buffer.length,null))>0)digest.update(buffer.subarray(0,length));return digest.digest('hex');}finally{fs.closeSync(fd);}
}
export const cleanKey=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,120}$/.test(value);
const bounded=(value,max=4000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const canonical=value=>process.platform==='win32'?value.toLowerCase():value;
const inside=(root,target)=>target===root||target.startsWith(root+path.sep);

// Cross-process, local-only transactions. Dead owners can be recovered without
// guessing a timeout. Unknown legacy locks and live/reused PIDs remain blocked.
export function transaction(file,initial,action,{readOnly=false}={}){
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const lock=file+'.lock',token=randomUUID();let fd;
 try{fd=fs.openSync(lock,'wx');}catch{
  let owner;try{owner=JSON.parse(fs.readFileSync(lock,'utf8'));}catch{}
  check(Number.isInteger(owner?.pid)&&owner.pid>0,'저장 잠금의 소유자를 확인할 수 없습니다. 기존 작업 상태를 확인해 주세요.');
  let dead=false;try{process.kill(owner.pid,0);}catch(error){dead=error.code==='ESRCH';}
  check(dead,'다른 작업이 기록을 저장 중입니다. 잠시 뒤 다시 확인해 주세요.');
  // Compare the identity again before removing a dead owner's lock.
  check(fs.readFileSync(lock,'utf8')===JSON.stringify(owner),'저장 잠금이 변경됐습니다. 다시 확인해 주세요.');
  fs.unlinkSync(lock);fd=fs.openSync(lock,'wx');
 }
 const temp=file+'.'+token+'.next';
 try{
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));
  const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):initial();
  const result=action(state);
  if(!readOnly){fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,file);}
  return result;
 }finally{
  fs.closeSync(fd);
  let own=false;try{own=JSON.parse(fs.readFileSync(lock,'utf8')).token===token;}catch{}
  if(own)fs.unlinkSync(lock);
  if(fs.existsSync(temp))fs.unlinkSync(temp);
 }
}

const empty=()=>({version:1,projects:{},leases:[]});
const projectState=()=>({config:null,checkpoints:{},recoveries:{},cases:{},writes:{}});
export class WorkControl{
 constructor(store,home){this.store=store;this.home=path.resolve(home);this.file=path.join(this.home,'work-control.json');}
 get project(){return this.store.project;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):empty();}
 state(document=this.read()){return document.projects[this.project.id]||projectState();}
 change(action){return transaction(this.file,empty,document=>{document.projects[this.project.id]??=projectState();return action(this.state(document),document);});}
 actor(args,{director=false,active=true}={}){
  const member=this.store.members.find(m=>m.id===args.memberId);check(member,'이 프로젝트의 기존 담당자가 필요합니다.');
  if(director)check(member.id==='director','총괄만 이 작업을 승인할 수 있습니다.');
  if(active){const request=this.store.read().requests.find(r=>r.id===args.requestId);check(request&&!['completed','failed'].includes(request.status),'진행 중인 요청을 지정해 주세요.');check(request.jobs.some(j=>j.memberId===member.id&&j.state==='reserved'),'현재 작업을 배정받은 담당자만 실행할 수 있습니다.');}
  return member;
 }
 configure(args){
  this.actor(args,{director:true,active:false});
  check(bounded(args.workspaceRoot,2000)&&path.isAbsolute(args.workspaceRoot),'명시적으로 승인한 작업 폴더의 절대 경로가 필요합니다.');
  const workspaceRoot=fs.realpathSync(args.workspaceRoot);check(fs.statSync(workspaceRoot).isDirectory(),'작업 폴더가 필요합니다.');
  let unityCli;
  if(args.unityCli!==undefined){check(path.isAbsolute(args.unityCli)&&fs.statSync(args.unityCli).isFile()&&/^unity(?:\.exe)?$/i.test(path.basename(args.unityCli)),'공식 Unity CLI 실행 파일의 절대 경로를 지정해 주세요.');unityCli=fs.realpathSync(args.unityCli);}
  return this.change((state,document)=>{
   check(!document.leases.some(l=>l.projectId===this.project.id&&!l.releasedAt),'진행 중인 파일·Editor 소유권을 반환한 뒤 설정을 바꿔 주세요.');
   check(!Object.values(state.cases).some(c=>c.attempts.some(a=>a.status==='running')),'실행 중인 검증을 먼저 마쳐 주세요.');
   state.config={workspaceRoot,...(unityCli?{unityCli}:{}),configuredAt:now()};return {configured:true,workspaceRoot,unityReady:!!unityCli};
  });
 }
 resolve(relative,state=this.state()){
  check(state.config,'총괄이 승인된 작업 폴더를 먼저 설정해야 합니다.');
  check(bounded(relative,2000)&&!path.isAbsolute(relative)&&!relative.includes('\\')&&!relative.includes(':')&&!relative.split('/').some(p=>p==='..'||p==='.'||!p||/^(\.git|\.codex|\.agents)$/i.test(p)),'작업 폴더 안의 안전한 상대 파일 경로를 지정해 주세요.');
  const root=state.config.workspaceRoot,target=path.resolve(root,relative);check(inside(canonical(root),canonical(target)),'작업 폴더 밖에는 접근할 수 없습니다.');
  let existing=target;while(!fs.existsSync(existing))existing=path.dirname(existing);
  check(inside(canonical(root),canonical(fs.realpathSync(existing))),'심볼릭 링크나 junction을 통해 작업 폴더를 벗어날 수 없습니다.');
  if(fs.existsSync(target))check(fs.statSync(target).isFile(),'폴더 대신 파일을 지정해 주세요.');
  return {absolute:target,key:canonical(target),relative:path.relative(root,target).split(path.sep).join('/')};
 }
 acquire(args){
  this.actor(args);check(cleanKey(args.key),'재시도에도 같은 소유권 요청 키가 필요합니다.');
  check(Array.isArray(args.paths)&&args.paths.length>0&&args.paths.length<=100,'한 번에 1~100개 파일 또는 @editor를 지정해 주세요.');
  return this.change((state,document)=>{
   check(state.config,'승인된 작업 폴더를 먼저 설정해 주세요.');
   const targets=[...new Set(args.paths)].map(p=>p==='@editor'?{key:canonical(state.config.workspaceRoot),relative:p,type:'editor'}:{...this.resolve(p,state),type:'file'}).sort((a,b)=>a.key.localeCompare(b.key));
   const old=document.leases.find(l=>l.projectId===this.project.id&&l.requestId===args.requestId&&l.memberId===args.memberId&&l.key===args.key);
   if(old){check(JSON.stringify(old.targets.map(t=>[t.key,t.type]))===JSON.stringify(targets.map(t=>[t.key,t.type])),'같은 키로 소유권 범위를 바꿀 수 없습니다.');check(!old.releasedAt,'반환한 소유권은 새 키로 요청해 주세요.');return this.leaseReceipt(old);}
   for(const target of targets)for(const held of document.leases.filter(l=>!l.releasedAt))for(const other of held.targets){
    const conflict=target.type==='file'&&other.type==='file'?target.key===other.key:target.type==='editor'&&other.type==='editor'?inside(target.key,other.key)||inside(other.key,target.key):target.type==='editor'?inside(target.key,other.key):inside(other.key,target.key);
    check(!conflict,'다른 파일·Editor 소유권과 겹칩니다. 반환 또는 명시적인 인계가 필요합니다.');
   }
   const lease={id:randomUUID(),projectId:this.project.id,requestId:args.requestId,memberId:args.memberId,key:args.key,targets,acquiredAt:now()};document.leases.push(lease);return this.leaseReceipt(lease);
  });
 }
 leaseReceipt(lease){return {leaseId:lease.id,memberId:lease.memberId,paths:lease.targets.map(t=>({path:t.relative,...(t.type==='file'?{hash:fileHash(t.absolute)}:{})})),acquiredAt:lease.acquiredAt};}
 owned(args,document=this.read()){
  const lease=document.leases.find(l=>l.id===args.leaseId&&l.projectId===this.project.id&&l.requestId===args.requestId&&l.memberId===args.memberId&&!l.releasedAt);check(lease,'이 담당자와 요청이 가진 유효한 소유권이 필요합니다.');return lease;
 }
 readFile(args){this.actor(args);const target=this.resolve(args.path);check(fs.existsSync(target.absolute),'파일이 없습니다.');check(fs.statSync(target.absolute).size<=200000,'큰 파일은 기존 읽기 도구로 필요한 부분만 확인해 주세요.');return {path:target.relative,hash:fileHash(target.absolute),content:fs.readFileSync(target.absolute,'utf8')};}
 write(args){
  this.actor(args);check(cleanKey(args.key)&&typeof args.content==='string'&&Buffer.byteLength(args.content)<=200000,'안전한 쓰기 키와 최대 200KB의 UTF-8 본문이 필요합니다.');check(bounded(args.expectedHash,64),'읽은 파일의 해시 또는 missing이 필요합니다.');
  return this.change((state,document)=>{
   const lease=this.owned(args,document),target=this.resolve(args.path,state);check(lease.targets.some(t=>t.type==='file'&&t.key===target.key),'이 파일의 편집 소유권이 없습니다.');
   const key=lease.id+':'+args.key,input=hash(JSON.stringify([target.key,args.expectedHash,args.content]));
   if(state.writes[key]){check(state.writes[key].input===input,'같은 쓰기 키의 내용을 바꿀 수 없습니다.');return {...state.writes[key].receipt,replayed:true};}
   check(fileHash(target.absolute)===args.expectedHash,'파일이 다른 곳에서 변경됐습니다. 최신 내용을 확인한 뒤 다시 작업해 주세요.');
   fs.mkdirSync(path.dirname(target.absolute),{recursive:true});this.resolve(args.path,state);
   const temp=target.absolute+'.team-room-'+randomUUID()+'.tmp';
   try{fs.writeFileSync(temp,args.content,{flag:'wx'});check(fileHash(target.absolute)===args.expectedHash,'저장 직전 파일 변경을 발견했습니다.');fs.renameSync(temp,target.absolute);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
   const receipt={saved:true,path:target.relative,hash:fileHash(target.absolute)};state.writes[key]={input,receipt};return receipt;
  });
 }
 release(args){this.actor(args,{active:false});return this.change((state,document)=>{const lease=document.leases.find(l=>l.id===args.leaseId&&l.projectId===this.project.id&&l.requestId===args.requestId&&l.memberId===args.memberId);check(lease,'본인이 가진 소유권만 반환할 수 있습니다.');if(lease.releasedAt)return {released:true,leaseId:lease.id};check(!Object.values(state.cases).some(c=>c.attempts.some(a=>a.status==='running'&&a.leaseId===lease.id)),'실행 중인 Unity 검증의 조작권은 먼저 반환할 수 없습니다.');lease.releasedAt=now();return {released:true,leaseId:lease.id};});}
 checkpoint(args){
  this.actor(args);check(bounded(args.summary)&&Array.isArray(args.nextSteps)&&args.nextSteps.length<=30&&args.nextSteps.every(v=>bounded(v,1000)),'현재 결과와 다음 작업 목록이 필요합니다.');
  return this.change(state=>{const files=(args.paths||[]).map(p=>{const target=this.resolve(p,state);return {path:target.relative,hash:fileHash(target.absolute)};});const checkpoint={summary:args.summary,nextSteps:args.nextSteps,files,updatedAt:now()};state.checkpoints[args.requestId+':'+args.memberId]=checkpoint;return {saved:true,checkpoint};});
 }
 recover(args){
  this.actor(args,{director:true,active:false});check(args.confirmedStopped===true&&bounded(args.reason)&&cleanKey(args.key),'기존 작업 중단 확인, 복구 이유와 고정 키가 필요합니다.');
  const from=this.store.members.find(m=>m.id===args.fromMemberId),to=this.store.members.find(m=>m.id===args.toMemberId);check(from&&to,'이 프로젝트의 기존 담당자만 인계할 수 있습니다.');check(from.id!=='director'||to.id==='director','총괄 작업은 기존 총괄 채팅에서 재개해 주세요.');
  const result=this.change((state,document)=>{
   const key=args.requestId+':'+args.key,input=hash(JSON.stringify([from.id,to.id,args.reason]));
   if(state.recoveries[key]){check(state.recoveries[key].input===input,'같은 복구 키의 대상을 바꿀 수 없습니다.');return {...state.recoveries[key].result,dispatch:false};}
   check(!Object.values(state.cases).some(c=>c.attempts.some(a=>a.status==='running'&&a.requestId===args.requestId&&a.memberId===from.id)),'실행 중이거나 상태 미확인인 검증을 먼저 정리해 주세요.');
   const request=this.store.read().requests.find(r=>r.id===args.requestId),old=request?.jobs.find(j=>j.memberId===from.id),target=request?.jobs.find(j=>j.memberId===to.id);
   if(old?.recoveryPlan?.key===key){
    check(old.recoveryPlan.input===input,'복구 중인 인계의 내용을 바꿀 수 없습니다.');
    for(const lease of document.leases)if(lease.projectId===this.project.id&&lease.requestId===args.requestId&&lease.memberId===from.id&&!lease.releasedAt){lease.releasedAt=now();lease.recoveryKey=key;}
    state.recoveries[key]={input,result:old.recoveryPlan.result,createdAt:now()};
    return {...old.recoveryPlan.result,dispatch:false,repaired:true,note:'중단된 저장을 복구했습니다. 이전 전달 여부를 확인하고, 필요하면 현재 담당자에게 새 복구 키로 명시적으로 재개해 주세요.'};
   }
   check(this.project.members.some(m=>m.id===to.id),'현재 연결된 담당자에게만 새로 인계할 수 있습니다.');
   check(old&&old.state!=='completed'&&old.state!=='superseded','완료 또는 이미 인계된 작업을 다시 복구하지 않습니다.');check(from.id===to.id||!target||target.state==='pending','이미 수행 중인 다른 담당자의 작업을 덮어쓰지 않습니다.');
   const checkpoint=state.checkpoints[args.requestId+':'+from.id]||null;
   const changedFiles=checkpoint?.files.filter(f=>fileHash(this.resolve(f.path,state).absolute)!==f.hash).map(f=>f.path)||[];
   for(const lease of document.leases)if(lease.projectId===this.project.id&&lease.requestId===args.requestId&&lease.memberId===from.id&&!lease.releasedAt){lease.releasedAt=now();lease.recoveryKey=key;}
   const files=document.leases.filter(l=>l.projectId===this.project.id&&l.requestId===args.requestId&&l.memberId===from.id&&l.recoveryKey===key).flatMap(l=>l.targets.map(t=>({path:t.relative,...(t.absolute?{hash:fileHash(t.absolute)}:{})})));
   const result={dispatch:true,recoveryId:randomUUID(),requestId:args.requestId,fromMemberId:from.id,member:to,checkpoint,files,changedFiles,reason:args.reason,...(old.requireFinalImage||target?.requireFinalImage?{requireFinalImage:true}:{}),...(old.requireFinalAudio||target?.requireFinalAudio?{requireFinalAudio:true}:{})};
   // Job transition is persisted first; a crash never silently replays a native send.
   this.store.change(room=>{
    const r=room.requests.find(r=>r.id===args.requestId),j=r.jobs.find(j=>j.memberId===from.id);
    if(j.requireFinalImage)result.requireFinalImage=true;
    if(j.requireFinalAudio)result.requireFinalAudio=true;
    j.recoveryHistory??=[];j.recoveryHistory.push({state:j.state,error:j.error||null,at:now(),toMemberId:to.id,recoveryId:result.recoveryId});
    j.recoveryPlan={key,input,result};
    if(from.id!==to.id){j.state='superseded';j.supersededAt=now();j.recoveredBy=to.id;j.recoveryId=result.recoveryId;let next=r.jobs.find(j=>j.memberId===to.id);if(next){next.state='reserved';next.claimedAt=now();}else{next={memberId:to.id,state:'reserved',recoveryId:result.recoveryId,claimedAt:now()};r.jobs.push(next);}if(result.requireFinalImage)next.requireFinalImage=true;if(result.requireFinalAudio)next.requireFinalAudio=true;}
    else{j.state='reserved';j.recoveryId=result.recoveryId;}
    r.status='processing';
   });
   state.recoveries[key]={input,result,createdAt:now()};return result;
  });return result;
 }
 assertCompletable(args){
  const document=this.read(),state=this.state(document);
  check(!document.leases.some(l=>l.projectId===this.project.id&&l.requestId===args.requestId&&l.memberId===args.memberId&&!l.releasedAt),'파일·Editor 소유권을 반환하고 완료해 주세요.');
  for(const c of Object.values(state.cases)){const last=c.attempts.at(-1);if(!last||last.requestId!==args.requestId)continue;check(last.status!=='running','진행 중인 검증을 완료한 뒤 답변해 주세요.');if(args.memberId==='director'&&c.required!==false)check(last.status==='passed'||c.waived,'실패·차단·미검증이 남아 있습니다. 수정·재검증하거나 한계를 명시하여 총괄이 예외를 기록해 주세요.');}
 }
 summary(){const document=this.read(),state=this.state(document);return {configured:!!state.config,unityReady:!!state.config?.unityCli,locks:document.leases.filter(l=>l.projectId===this.project.id&&!l.releasedAt).map(l=>({memberId:l.memberId,requestId:l.requestId,paths:l.targets.map(t=>t.relative)})),checkpoints:Object.keys(state.checkpoints).length,validations:Object.values(state.cases).map(c=>({id:c.id,label:c.label,status:c.attempts.at(-1)?.status||'pending',attempts:c.attempts.length,blocked:c.blocked,waived:!!c.waived})),recoveryCount:Object.keys(state.recoveries).length};}
}
