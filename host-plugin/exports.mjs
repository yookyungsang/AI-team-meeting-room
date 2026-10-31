import fs from 'node:fs';
import path from 'node:path';
import {check,hash,transaction} from './control.mjs';
import {validId} from './projects.mjs';
import {randomUUID} from 'node:crypto';
import {zip,unzipOwn} from './zip.mjs';
export const MAX_EXPORT_BYTES=128*1024*1024,MAX_DOWNLOAD_BYTES=16*1024*1024;
const extensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','audio/wav':'wav','audio/mpeg':'mp3','audio/ogg':'ogg'};
const json=value=>Buffer.from(JSON.stringify(value,null,2));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function bounded(file){const stat=fs.lstatSync(file);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_EXPORT_BYTES,'Invalid or oversized archive.');const bytes=fs.readFileSync(file);check(bytes.length===stat.size,'Archive changed while reading.');return bytes;}
export class RoomExport{
 constructor(registry,store){this.registry=registry;this.store=store;}
 preview(){
  const state=this.store.read(),images=new Map(),audio=new Map();
  for(const message of state.messages){for(const item of message.images||[])images.set(item.id,item);for(const item of message.audio||[])audio.set(item.id,item);}
  return {projectId:this.store.project.id,requests:state.requests.length,messages:state.messages.length,images:images.size,audio:audio.size,maxBytes:MAX_EXPORT_BYTES};
 }
 directory(projectId){
  check(validId(projectId),'Explicit export project required.');
  fs.mkdirSync(this.registry.home,{recursive:true});const root=fs.realpathSync(this.registry.home);
  let current=root;for(const part of ['exports',projectId]){current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current);const stat=fs.lstatSync(current);check(stat.isDirectory()&&!stat.isSymbolicLink(),'Export directory must stay inside runtime storage.');}
  return current;
 }
 create(args){
  check(validId(args.projectId)&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(args.exportId||''),'Original project and export ID required.');
  return transaction(path.join(this.directory(args.projectId),args.exportId+'.guard'),()=>({}),()=>this.createArchive(args),{readOnly:true});
 }
 createArchive({projectId,exportId}){
  check(projectId===this.store.project.id&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(exportId||''),'Original project and export ID required.');
  const directory=this.directory(projectId),file=path.join(directory,exportId+'.zip');
  if(fs.existsSync(file))return this.receipt(projectId,exportId,file,true);
  // Snapshot only one room and its roster under the established room → registry
  // lock order. Attachment snapshots are immutable and verified afterwards.
  const snapshot=transaction(this.store.file,()=>({version:1,paused:false,requests:[],messages:[]}),room=>transaction(this.registry.file,()=>({projects:[]}),registry=>({room,project:registry.projects.find(p=>p.id===projectId)}),{readOnly:true}),{readOnly:true});
  check(snapshot.project,'The original project is unavailable.');
  const entries=[{name:'project.json',bytes:json(snapshot.project)},{name:'room.json',bytes:json(snapshot.room)}],seen=new Set();let size=entries.reduce((n,e)=>n+e.bytes.length,0);
  const attachment=(item,kind)=>{
   check(/^[0-9a-f]{64}$/.test(item.id)&&extensions[item.mimeType],'Invalid attachment metadata.');
   const name=kind+'/'+item.id+'.'+extensions[item.mimeType];if(seen.has(name))return name;
   const data=kind==='images'?this.store.images.read(item):this.store.audio.read(item),bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64');
   size+=bytes.length;check(size<=MAX_EXPORT_BYTES,'The archive exceeds the 128 MiB limit; no partial archive was created.');seen.add(name);entries.push({name,bytes});return name;
  };
  const readable=[],html=[];
  for(const m of snapshot.room.messages){
   const title=(m.authorName||m.authorId)+' · '+(m.createdAt||'');readable.push('## '+title,m.text||'');
   let body='<article><h2>'+escape(title)+'</h2><p>'+escape(m.text).replace(/\n/g,'<br>')+'</p>';
   for(const item of m.images||[]){const name=attachment(item,'images');readable.push('!['+item.caption.replace(/[\[\]\n]/g,' ')+']('+name+')');body+='<figure><img src="'+name+'" alt="'+escape(item.caption)+'"><figcaption>'+escape(item.caption)+'</figcaption></figure>';}
   for(const item of m.audio||[]){const name=attachment(item,'audio');readable.push('['+item.caption.replace(/[\[\]\n]/g,' ')+']('+name+')');body+='<figure><audio controls preload="none" src="'+name+'"></audio><figcaption>'+escape(item.caption)+'</figcaption></figure>';}
   if(m.details){readable.push('### Work details',m.details);body+='<details><summary>Work details</summary><pre>'+escape(m.details)+'</pre></details>';}
   readable.push('');html.push(body+'</article>');
  }
  entries.push({name:'meeting.md',bytes:Buffer.from('# '+snapshot.project.name+'\n\n'+readable.join('\n\n'))},{name:'index.html',bytes:Buffer.from('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';img-src \'self\' file: data:;media-src \'self\' file:;style-src \'unsafe-inline\'"><title>'+escape(snapshot.project.name)+'</title><style>body{max-width:900px;margin:32px auto;padding:0 20px;font:16px/1.8 system-ui;background:#161616;color:#eee}article{border-bottom:1px solid #555;padding:20px 0}h2{font-size:15px}img{max-width:100%;max-height:500px}audio{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><h1>'+escape(snapshot.project.name)+'</h1>'+html.join('')+'</body></html>')},{name:'README.txt',bytes:Buffer.from('Unzip this archive, then open index.html to read the meeting and view/play attachments offline.\nmeeting.md is a text export. project.json and room.json preserve this room only, including original routes and history.\nmanifest.json lists SHA-256 file checksums. For missing-room recovery, use Menu > Import backup in the original local project. Existing records and unfinished work cannot be overwritten or restarted. Workspace/QA/usage authority is not imported.\nThis private archive contains meeting content and connection information. Keep it out of public source control.\n\n압축을 푼 뒤 index.html을 열면 회의와 이미지·음원을 오프라인으로 볼 수 있습니다.\n원래 프로젝트에서 메뉴 > 백업 불러오기로 없어진 회의실만 확인 후 복구할 수 있습니다. 기존 기록과 진행 중인 작업은 덮어쓰거나 다시 실행하지 않습니다. 원본 기록은 변경하지 않았습니다. 공개 저장소에 올리지 마세요.\n')});
  const manifest={version:1,projectId,exportId,createdAt:new Date().toISOString(),counts:{projectId,requests:snapshot.room.requests.length,messages:snapshot.room.messages.length,images:entries.filter(e=>e.name.startsWith('images/')).length,audio:entries.filter(e=>e.name.startsWith('audio/')).length},files:entries.map(e=>({name:e.name,size:e.bytes.length,sha256:hash(e.bytes)}))};
  const archive=zip([{name:'manifest.json',bytes:json(manifest)},...entries]);check(archive.length<=MAX_EXPORT_BYTES,'The archive exceeds the 128 MiB limit; no partial archive was created.');
  const temporary=path.join(directory,randomUUID()+'.next');
  try{fs.writeFileSync(temporary,archive,{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  return this.receipt(projectId,exportId,file,false);
 }
 receipt(projectId,exportId,file,replayed){
  const bytes=bounded(file),entries=unzipOwn(bytes),manifest=JSON.parse(entries[0].bytes.toString('utf8'));
  check(entries[0].name==='manifest.json'&&manifest.version===1&&manifest.projectId===projectId&&manifest.exportId===exportId&&manifest.files.length===entries.length-1,'Archive scope does not match this export.');
  for(let n=1;n<entries.length;n++){const expected=manifest.files[n-1],entry=entries[n];check(entry.name===expected.name&&entry.bytes.length===expected.size&&hash(entry.bytes)===expected.sha256,'Archive integrity verification failed.');}
  return {projectId,exportId,name:projectId+'-'+exportId.slice(0,8)+'.zip',path:file,size:bytes.length,sha256:hash(bytes),counts:manifest.counts,createdAt:manifest.createdAt,replayed,downloadable:bytes.length<=MAX_DOWNLOAD_BYTES};
 }
 download({projectId,exportId}){
  check(projectId===this.store.project.id&&/^[0-9a-f-]{36}$/i.test(exportId||''),'Original export scope required.');
  const file=path.join(this.directory(projectId),exportId+'.zip'),receipt=this.receipt(projectId,exportId,file,true);
  check(receipt.downloadable,'Use the saved local ZIP path for archives larger than 16 MiB.');
  return {receipt,data:bounded(file).toString('base64')};
 }
}
