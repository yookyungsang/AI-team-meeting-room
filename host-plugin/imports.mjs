// Explicit local ZIP recovery. No native messages, execution, merging or overwrite.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {check,hash,transaction,now} from './control.mjs';
import {validateProject,knownMembers} from './projects.mjs';
import {MAX_EXPORT_BYTES,MAX_DOWNLOAD_BYTES} from './exports.mjs';
import {imageMime,MAX_IMAGE_BYTES} from './images.mjs';
import {audioMime,MAX_AUDIO_BYTES} from './audio.mjs';
import {unzipOwn} from './zip.mjs';

export const IMPORT_CHUNK_BYTES=128*1024;
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const extensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','audio/wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg'};
const encode=value=>Buffer.from(JSON.stringify(value,null,2));
function fileBytes(file,max=MAX_EXPORT_BYTES){
 const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=max,'Invalid or oversized backup file.');
 const bytes=fs.readFileSync(file);check(bytes.length===stat.size,'Backup changed while reading.');return bytes;
}
function noLink(file){try{check(!fs.lstatSync(file).isSymbolicLink(),'Backup paths must not use symbolic links or junctions.');}catch(error){if(error.code!=='ENOENT')throw error;}}
function directory(root,...parts){
 fs.mkdirSync(root,{recursive:true});let current=fs.realpathSync(root);
 for(const part of parts){check(/^[a-zA-Z0-9_.-]+$/.test(part)&&!['.','..'].includes(part),'Invalid backup directory.');current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current);const stat=fs.lstatSync(current);check(stat.isDirectory()&&!stat.isSymbolicLink(),'Backup paths must stay inside runtime storage.');}
 return current;
}
function atomic(file,bytes){
 noLink(file);const temp=file+'.'+randomUUID()+'.next';
 try{fs.writeFileSync(temp,bytes,{flag:'wx'});noLink(file);fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
const currentHash=file=>{noLink(file);return fs.existsSync(file)?hash(fileBytes(file)):'missing';};
function parsed(bytes){
 const value=JSON.parse(bytes.toString('utf8'));
 // Reject object keys that could acquire meaning if future code merges them.
 const visit=item=>{if(Array.isArray(item))item.forEach(visit);else if(object(item))for(const [key,value] of Object.entries(item)){check(!['__proto__','prototype','constructor'].includes(key),'Unsafe backup object key.');visit(value);}};
 visit(value);return value;
}
export function inspectBackup(bytes){
 check(Buffer.isBuffer(bytes)&&bytes.length<=MAX_EXPORT_BYTES,'Backup exceeds the 128 MiB limit.');
 const entries=unzipOwn(bytes),files=new Map(entries.map(e=>[e.name,e.bytes]));
 check(entries[0].name==='manifest.json','This is not a Team Room backup.');
 const manifest=parsed(entries[0].bytes);
 check(manifest.version===1&&uuid(manifest.exportId)&&Array.isArray(manifest.files)&&manifest.files.length===entries.length-1,'Unsupported backup manifest.');
 for(let i=1;i<entries.length;i++){const expected=manifest.files[i-1],entry=entries[i];check(object(expected)&&expected.name===entry.name&&expected.size===entry.bytes.length&&expected.sha256===hash(entry.bytes),'Backup integrity verification failed.');}
 for(const name of ['project.json','room.json','index.html','meeting.md','README.txt'])check(files.has(name),'Incomplete Team Room backup.');
 check(entries.every(e=>['manifest.json','project.json','room.json','index.html','meeting.md','README.txt'].includes(e.name)||/^(images|audio)\/[a-f0-9]{64}\.(png|jpg|gif|webp|wav|mp3|ogg)$/.test(e.name)),'Unexpected backup file.');
 const originalProject=parsed(files.get('project.json')),project=validateProject(originalProject),room=parsed(files.get('room.json'));
 check(project.id===manifest.projectId,'Backup project does not match its manifest.');
 check(originalProject.revision===undefined||Number.isSafeInteger(originalProject.revision)&&originalProject.revision>=1,'Invalid roster revision.');project.revision=originalProject.revision||1;
 for(const key of ['memberChanges','optionChanges','lifecycleChanges'])if(originalProject[key]!==undefined){check(Array.isArray(originalProject[key])&&originalProject[key].length<=100000,'Invalid roster history.');project[key]=originalProject[key];}
 if(originalProject.retiredMembers!==undefined){
  check(Array.isArray(originalProject.retiredMembers)&&originalProject.retiredMembers.length<=500,'Invalid former participants.');
  for(const member of originalProject.retiredMembers)validateProject({...project,members:[project.members.find(m=>m.id==='director'),member]});
  project.retiredMembers=originalProject.retiredMembers;
 }
 const members=knownMembers(project),ids=new Set(members.map(m=>m.id));check(ids.size===members.length,'Duplicate backup participant.');
 if(originalProject.legacyMembers!==undefined){check(Array.isArray(originalProject.legacyMembers)&&originalProject.legacyMembers.every(m=>ids.has(m.id)&&text(m.name,80)&&text(m.role,80)),'Invalid legacy participant labels.');project.legacyMembers=originalProject.legacyMembers;}
 check(object(room)&&room.version===1&&typeof room.paused==='boolean'&&Array.isArray(room.requests)&&room.requests.length<=50000&&Array.isArray(room.messages)&&room.messages.length<=100000,'Invalid room records.');
 const requests=new Set(),messageIds=new Set(),media=new Map();let unfinished=false;
 for(const r of room.requests){
  check(object(r)&&uuid(r.id)&&!requests.has(r.id)&&r.projectId===project.id&&text(r.text,6000)&&Array.isArray(r.recipients)&&r.recipients.length>0&&r.recipients.length<=20&&r.recipients.every(id=>ids.has(id))&&Array.isArray(r.jobs)&&r.jobs.length<=members.length,'Invalid backup request.');requests.add(r.id);
  check(['pending','processing','completed','failed'].includes(r.status)&&r.jobs.every(j=>object(j)&&ids.has(j.memberId)&&['pending','reserved','completed','failed','superseded'].includes(j.state))&&new Set(r.jobs.map(j=>j.memberId)).size===r.jobs.length,'Invalid backup job.');
  if(!['completed','failed'].includes(r.status)||r.jobs.some(j=>['pending','reserved'].includes(j.state)))unfinished=true;
 }
 for(const r of room.requests)check(r.followUpTo===undefined||requests.has(r.followUpTo)&&r.followUpTo!==r.id,'Invalid backup follow-up.');
 for(const m of room.messages){
  check(object(m)&&text(m.id,500)&&m.id&&!messageIds.has(m.id)&&requests.has(m.requestId)&&(m.authorId==='user'||ids.has(m.authorId))&&text(m.text,20000)&&(m.details===undefined||text(m.details,30000))&&(m.toMemberId===undefined||ids.has(m.toMemberId)),'Invalid backup message.');messageIds.add(m.id);
  for(const [kind,limit,max,mime] of [['images',4,MAX_IMAGE_BYTES,imageMime],['audio',3,MAX_AUDIO_BYTES,audioMime]]){
   check(m[kind]===undefined||Array.isArray(m[kind])&&m[kind].length<=limit,'Invalid backup attachments.');
   for(const item of m[kind]||[]){
    check(object(item)&&hex(item.id)&&text(item.caption,300)&&item.caption.trim()&&extensions[item.mimeType]&&item.mimeType.startsWith(kind==='images'?'image/':'audio/'),'Invalid backup attachment metadata.');
    const name=kind+'/'+item.id+'.'+extensions[item.mimeType],body=files.get(name);
    check(body&&body.length>0&&body.length<=max&&item.size===body.length&&hash(body)===item.id&&mime(body)===item.mimeType,'Backup attachment is missing or damaged.');media.set(name,{kind,id:item.id,bytes:body});
   }
  }
 }
 check(entries.filter(e=>/^(images|audio)\//.test(e.name)).length===media.size,'Unreferenced backup attachments.');
 const counts={requests:room.requests.length,messages:room.messages.length,images:[...media.values()].filter(m=>m.kind==='images').length,audio:[...media.values()].filter(m=>m.kind==='audio').length};
 check(manifest.counts?.projectId===project.id&&Object.entries(counts).every(([key,value])=>manifest.counts[key]===value),'Backup record counts do not match.');
 // Workspace authorization and cached native catalog entries are never imported.
 delete project.workspacePath;
 return {manifest,project,room,media,counts,unfinished,sha256:hash(bytes)};
}

export class RoomImport{
 constructor(registry){this.registry=registry;}
 list(args){
  this.context(args.threadId);const root=directory(this.registry.home,'imports'),rows=[];
  for(const name of fs.readdirSync(root).filter(uuid)){
   const dir=path.join(root,name);if(fs.lstatSync(dir).isSymbolicLink())continue;const file=path.join(dir,'session.json');if(!fs.existsSync(file))continue;
   try{const session=parsed(fileBytes(file,1024*1024));if(session.threadId!==args.threadId||typeof session.createdAt!=='string'||typeof session.name!=='string'||!Number.isSafeInteger(session.size)||!Number.isSafeInteger(session.offset))continue;rows.push({importId:name,name:session.name,size:session.size,offset:session.offset,status:session.receipt?'restored':session.applying?'applying':session.preview?'prepared':'uploading',createdAt:session.createdAt});}catch{}
  }
  return {imports:rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)};
 }
 context(threadId){check(typeof threadId==='string'&&threadId,'Open backup import in an existing local project chat.');const context=this.registry.setupContextReader(threadId);check(context&&typeof context.scopeId==='string','The opening project could not be verified.');return context;}
 location(importId){check(uuid(importId),'A stable import ID is required.');return directory(this.registry.home,'imports',importId);}
 session(args,action){
  const context=this.context(args.threadId),dir=this.location(args.importId),file=path.join(dir,'session.json');noLink(file);noLink(path.join(dir,'source.zip'));
  return transaction(file,()=>({}),session=>{check(session.threadId===args.threadId&&session.scopeId===context.scopeId,'Use the original project chat for this backup.');return action(session,dir);});
 }
 start(args){
  const context=this.context(args.threadId);check(Number.isSafeInteger(args.size)&&args.size>0&&args.size<=MAX_DOWNLOAD_BYTES&&text(args.name,240)&&!/[\\/\u0000-\u001f]/.test(args.name)&&/\.zip$/i.test(args.name),'Choose a ZIP up to 16 MiB, or use its local path for a larger backup.');
  const dir=this.location(args.importId),file=path.join(dir,'session.json');noLink(file);
  return transaction(file,()=>({}),session=>{
   if(session.threadId)check(session.threadId===args.threadId&&session.size===args.size&&session.name===args.name,'The original backup selection cannot change under the same import ID.');
   else{Object.assign(session,{threadId:args.threadId,scopeId:context.scopeId,name:args.name,size:args.size,offset:0,createdAt:now()});const source=path.join(dir,'source.zip');noLink(source);if(fs.existsSync(source))check(fs.lstatSync(source).isFile()&&fs.statSync(source).size===0,'The original upload stage is unavailable.');else fs.writeFileSync(source,Buffer.alloc(0),{flag:'wx'});}
   return {importId:args.importId,offset:session.offset,size:session.size,chunkBytes:IMPORT_CHUNK_BYTES};
  });
 }
 chunk(args){return this.session(args,(session,dir)=>{
  check(!session.preview&&!session.applying&&Number.isSafeInteger(args.offset)&&args.offset>=0&&typeof args.data==='string'&&args.data.length<=Math.ceil(IMPORT_CHUNK_BYTES/3)*4&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(args.data),'Invalid backup upload chunk.');
  const bytes=Buffer.from(args.data,'base64'),file=path.join(dir,'source.zip');check(bytes.length>0&&bytes.length<=IMPORT_CHUNK_BYTES&&bytes.toString('base64')===args.data&&args.offset+bytes.length<=session.size,'Invalid backup upload range.');
  const stat=fs.lstatSync(file);check(stat.isFile()&&stat.size>=session.offset&&stat.size<=session.size,'Backup upload is inconsistent.');
  const matches=()=>{const fd=fs.openSync(file,'r'),stored=Buffer.alloc(bytes.length);try{return fs.readSync(fd,stored,0,stored.length,args.offset)===stored.length&&stored.equals(bytes);}finally{fs.closeSync(fd);}};
  if(args.offset<session.offset){check(args.offset+bytes.length<=session.offset&&matches(),'A retried chunk must keep its original bytes.');}
  else{check(args.offset===session.offset,'Upload the next original chunk in order.');if(stat.size>session.offset)check(stat.size===session.offset+bytes.length&&matches(),'The uncertain upload chunk does not match.');else fs.appendFileSync(file,bytes);session.offset+=bytes.length;}
  return {importId:args.importId,offset:session.offset,size:session.size};
 });}
 fromPath(args){
  const context=this.context(args.threadId);check(typeof args.path==='string'&&args.path.length<=2000&&path.isAbsolute(args.path)&&!/^\\\\/.test(args.path)&&/\.zip$/i.test(args.path),'Use the absolute local path of a Team Room ZIP.');
  const bytes=fileBytes(args.path),sha256=hash(bytes),dir=this.location(args.importId),file=path.join(dir,'session.json');noLink(file);
  return transaction(file,()=>({}),session=>{
   if(session.threadId)check(session.threadId===args.threadId&&session.pathSource===sha256,'The original backup selection cannot change under the same import ID.');
   else{Object.assign(session,{threadId:args.threadId,scopeId:context.scopeId,name:path.basename(args.path),size:bytes.length,offset:bytes.length,pathSource:sha256,createdAt:now()});const source=path.join(dir,'source.zip');noLink(source);if(fs.existsSync(source))check(hash(fileBytes(source))===sha256,'The original backup stage is unavailable.');else fs.writeFileSync(source,bytes,{flag:'wx'});}
   return {importId:args.importId,offset:session.offset,size:session.size};
  });
 }
 scope(backup,args,session){
  const opening=this.context(args.threadId);check(opening.scopeId===session.scopeId,'The opening project changed. Select the backup again.');
  const director=backup.project.members.find(m=>m.id==='director');check(director.hostId==='local','Only local project backups can be reconnected.');
  const source=this.registry.setupContextReader(director.threadId);check(source?.scopeId===opening.scopeId,'Open this backup from its original project. No cross-project restore is allowed.');
  const catalog=this.registry.catalogReader(backup.project),routes=new Set(catalog.candidates.map(c=>c.hostId+'\0'+c.threadId));
  check(catalog.scopeId===opening.scopeId&&backup.project.members.every(m=>routes.has(m.hostId+'\0'+m.threadId)),'The original participants could not all be verified in this project. No replacement chats are created.');
 }
 destinationScope(projectId,args){const opening=this.registry.opening(args.threadId);return opening.status==='unregistered'||opening.status==='selected'&&opening.projectId===projectId;}
 target(projectId){
  directory(this.registry.home,'rooms');for(const file of [this.registry.file,this.registry.roomPath(projectId),this.registry.roomPath(projectId)+'.images',this.registry.roomPath(projectId)+'.audio',path.join(this.registry.home,'work-control.json'),path.join(this.registry.home,'team-setups.json')])noLink(file);
  const state=this.registry.read(),project=state.projects.find(p=>p.id===projectId),controlFile=path.join(this.registry.home,'work-control.json'),setupFile=path.join(this.registry.home,'team-setups.json');
  const control=fs.existsSync(controlFile)?parsed(fileBytes(controlFile)):{projects:{},leases:[]},setups=fs.existsSync(setupFile)?parsed(fileBytes(setupFile)):{setups:[]};
  const leases=(control.leases||[]).filter(l=>l.projectId===projectId),work=control.projects?.[projectId]||null,teams=(setups.setups||[]).filter(s=>s.projectId===projectId);
  return {project,roomHash:currentHash(this.registry.roomPath(projectId)),fingerprint:hash(JSON.stringify([project||null,currentHash(this.registry.roomPath(projectId)),work,leases,teams])),busy:leases.some(l=>!l.releasedAt)||Object.values(work?.cases||{}).some(c=>c.attempts?.some(a=>a.status==='running'))||teams.some(s=>s.status!=='connected')};
 }
 preview(args){return this.session(args,(session,dir)=>{
  if(session.receipt)return {importId:args.importId,...session.preview,canRestore:false,restored:true,reasons:['restored']};
  check(session.offset===session.size,'Finish choosing the backup file before preview.');const backup=inspectBackup(fileBytes(path.join(dir,'source.zip')));this.scope(backup,args,session);const target=this.target(backup.project.id);
  if(session.applying||session.receipt)return {importId:args.importId,...session.preview,...(session.receipt?{canRestore:false,restored:true,reasons:['restored']}:{resuming:true})};
  const reasons=[];if(backup.unfinished)reasons.push('unfinished');
  if(target.project||target.roomHash!=='missing')reasons.push('exists');
  if(target.busy)reasons.push('busy');
  if(!this.destinationScope(backup.project.id,args))reasons.push('scope');
  const preview={projectId:backup.project.id,name:backup.project.name,sha256:backup.sha256,counts:backup.counts,members:backup.project.members.length,canRestore:!reasons.length,reasons,sourceVersion:1};
  if(session.preview)check(session.preview.sha256===preview.sha256,'The staged backup changed. Select it again.');
  session.preview=preview;session.targetFingerprint=target.fingerprint;return {importId:args.importId,...preview};
 });}
 apply(args){return this.session(args,(session,dir)=>{
  check(args.confirmed===true&&session.preview?.canRestore&&args.projectId===session.preview.projectId&&args.sha256===session.preview.sha256&&args.confirmName===session.preview.name,'Review the original backup preview and confirm its exact room name and checksum.');
  if(session.receipt)return {...session.receipt,replayed:true};
  const backup=inspectBackup(fileBytes(path.join(dir,'source.zip')));check(!backup.unfinished&&backup.sha256===args.sha256,'The original restorable backup is required.');this.scope(backup,args,session);
  const roomFile=this.registry.roomPath(backup.project.id);directory(this.registry.home,'rooms');
  const roomBytes=encode({...backup.room,paused:true}),project={...backup.project,backupRecovery:{importId:args.importId,sha256:backup.sha256,at:session.applyingAt||now()}};
  return transaction(path.join(this.registry.home,'team-setups.json'),()=>({setups:[]}),()=>transaction(roomFile,()=>({}),()=>transaction(path.join(this.registry.home,'work-control.json'),()=>({projects:{},leases:[]}),()=>transaction(this.registry.file,()=>({version:1,projects:[]}),registry=>{
   const target=this.target(backup.project.id),ownRoom=target.roomHash===hash(roomBytes),ownProject=target.project&&JSON.stringify(target.project)===JSON.stringify(project);
   check(!target.busy&&this.destinationScope(backup.project.id,args),'Existing setup, room, ownership or validation must be resolved before recovery.');
   if(!session.applying)check(target.fingerprint===session.targetFingerprint&&!target.project&&target.roomHash==='missing','The destination changed after preview. Existing records are never overwritten.');
   else check((!target.project||ownProject)&&(target.roomHash==='missing'||ownRoom),'Recovery encountered newer records. Keep them and check the original import.');
   if(!session.applying){session.applying=true;session.applyingAt=project.backupRecovery.at;atomic(path.join(dir,'session.json'),encode(session));}
   for(const item of backup.media.values()){
    const folder=directory(this.registry.home,'rooms',backup.project.id+'.json.'+item.kind),file=path.join(folder,item.id);noLink(file);
    if(fs.existsSync(file))check(hash(fileBytes(file,8*1024*1024))===item.id,'Existing attachment conflicts with the backup.');else fs.writeFileSync(file,item.bytes,{flag:'wx'});
   }
   if(!ownRoom)atomic(roomFile,roomBytes);
   if(!target.project)registry.projects.push(project);
   // Registry commits last. A crash can be reconciled by the same explicit apply.
   session.receipt={importId:args.importId,projectId:project.id,name:project.name,restored:true,paused:true,counts:backup.counts,workspaceAuthorizationRestored:false,usageRecordsRestored:false};return {...session.receipt,replayed:false};
  }),{readOnly:true}),{readOnly:true}),{readOnly:true});
 });}
}
