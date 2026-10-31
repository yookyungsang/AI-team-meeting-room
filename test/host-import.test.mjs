import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {RoomExport} from '../host-plugin/exports.mjs';
import {RoomImport,inspectBackup,IMPORT_CHUNK_BYTES} from '../host-plugin/imports.mjs';
import {zip,unzipOwn} from '../host-plugin/zip.mjs';
import {hash} from '../host-plugin/control.mjs';
import {WorkControl} from '../host-plugin/control.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';
import {wav} from './audio.fixture.mjs';

function fixture(t,{unfinished=false}={}){
 const base=path.resolve('.local/test-data');fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'import-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const context=id=>{if(!/^(alpha|beta)-/.test(id))throw new Error('Fixture chat missing');const scopeId=id.split('-')[0];return {scopeId,name:scopeId,nativeProjectIds:['native-'+scopeId]};};
 const options={setupContextReader:context,catalogReader:project=>({scopeId:context(project.members[0].threadId).scopeId,candidates:project.members.map(m=>({...m,chatTitle:m.name}))}),openingReader:(projects,id)=>{const scope=context(id).scopeId,matches=projects.filter(p=>context(p.members[0].threadId).scopeId===scope);return matches.length===1?{status:'selected',projectId:matches[0].id}:matches.length?{status:'ambiguous'}:{status:'unregistered'};}};
 const source=new Projects(path.join(home,'source'),options),target=new Projects(path.join(home,'target'),options);
 const members=[{id:'director',name:'Fixture director',role:'총괄 디렉터',roleType:'director',threadId:'alpha-director',hostId:'local'},{id:'developer',name:'Fixture developer',role:'프로그래머',roleType:'programmer',threadId:'alpha-developer',hostId:'local'}];
 source.configure({id:'alpha',name:'Fixture Alpha',workspacePath:path.join(home,'old-workspace'),members});const store=new RoomStore(source.roomPath('alpha'),source.get('alpha'));
 const requestId=randomUUID(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),image=path.join(home,'fixture.png'),audio=path.join(home,'fixture.wav');fs.writeFileSync(image,png);fs.writeFileSync(audio,wav());
 store.submit({id:requestId,text:'  원문\n\nKeep 原文 exactly.  ',recipients:['director']});store.claim({requestId,memberId:'director'});if(!unfinished)store.reply({requestId,memberId:'director',text:'Completed <script>literal</script>',details:'Original evidence',images:[{path:image,caption:'Original caption'}],audio:[{path:audio,caption:'Original sound'}]});
 const exported=new RoomExport(source,store).create({projectId:'alpha',exportId:randomUUID()}),importer=new RoomImport(target),args={threadId:'alpha-director',importId:randomUUID()};
 return {home,source,target,store,png,exported,importer,args};
}
function prepare(f){f.importer.fromPath({...f.args,path:f.exported.path});return f.importer.preview(f.args);}
const approved=(f,preview)=>({...f.args,projectId:preview.projectId,sha256:preview.sha256,confirmName:preview.name,confirmed:true});
function rewrite(f,edit){const entries=unzipOwn(fs.readFileSync(f.exported.path));edit(entries);const manifest=JSON.parse(entries[0].bytes);manifest.files=entries.slice(1).map(e=>({name:e.name,size:e.bytes.length,sha256:hash(e.bytes)}));entries[0].bytes=Buffer.from(JSON.stringify(manifest));return zip(entries);}

test('recovery restores exact prose and media into a missing room, paused, without workspace/usage authority or other-project writes',t=>{
 const f=fixture(t);f.target.configure({id:'beta',name:'Fixture Beta',members:[{id:'director',name:'Beta',role:'총괄',threadId:'beta-director',hostId:'local'}]});
 const control=path.join(f.target.home,'work-control.json'),usage=path.join(f.target.home,'usage-ledger.json'),controls={version:1,projects:{alpha:{config:null,cases:{old:{attempts:[{status:'failed',key:'old-run'}]}}},beta:{fixture:true}},leases:[]};fs.writeFileSync(control,JSON.stringify(controls));fs.writeFileSync(usage,'{"version":1,"sources":{}}');
 const original=fs.readFileSync(f.store.file),preview=prepare(f);assert.equal(preview.canRestore,true);assert.equal(preview.counts.images,1);assert.equal(preview.counts.audio,1);assert(!fs.existsSync(f.target.file)||f.target.read().projects.length===1);
 for(const message of f.store.read().messages)for(const kind of ['images','audio'])for(const item of message[kind]||[]){const file=path.join(kind==='images'?f.store.images.directory:f.store.audio.directory,item.id);assert(file.startsWith(f.home+path.sep));fs.unlinkSync(file);}
 assert.throws(()=>f.importer.apply({...approved(f,preview),confirmed:false}));const receipt=f.importer.apply(approved(f,preview));assert.equal(receipt.paused,true);assert.equal(receipt.usageRecordsRestored,false);assert.equal(receipt.workspaceAuthorizationRestored,false);
 const project=f.target.get('alpha'),restored=new RoomStore(f.target.roomPath('alpha'),project),before=JSON.parse(original);assert.equal(project.workspacePath,undefined);assert.deepEqual(project.members,f.source.get('alpha').members);assert.deepEqual(restored.read(),{...before,paused:true});
 const message=restored.read().messages.find(m=>m.images?.length);assert.equal(restored.image({requestId:message.requestId,messageId:message.id,imageId:message.images[0].id}).dataUrl.split(',')[1],f.png.toString('base64'));assert(restored.audioFile({requestId:message.requestId,messageId:message.id,audioId:message.audio[0].id}).dataUrl.startsWith('data:audio/wav;'));
 assert.equal(fs.readFileSync(control,'utf8'),JSON.stringify(controls));assert.equal(fs.readFileSync(usage,'utf8'),'{"version":1,"sources":{}}');assert.equal(f.target.get('beta').name,'Fixture Beta');assert(fs.readFileSync(f.store.file).equals(original));
 restored.pause(false);restored.submit({id:randomUUID(),text:'A new task',recipients:['director']});const latest=fs.readFileSync(restored.file);assert.equal(f.importer.apply(approved(f,preview)).replayed,true);assert(fs.readFileSync(restored.file).equals(latest));
});
test('missing membership, different opening project and caller changes cannot reconnect a backup',t=>{
 const f=fixture(t);f.importer.fromPath({...f.args,path:f.exported.path});assert.throws(()=>f.importer.preview({...f.args,threadId:'beta-director'}));
 const changed=new RoomImport(new Projects(f.target.home,{setupContextReader:f.target.setupContextReader,catalogReader:()=>({scopeId:'alpha',candidates:[]}),openingReader:f.target.openingReader}));assert.throws(()=>changed.preview(f.args),/participants/);
 const foreign={...f.args,importId:randomUUID(),threadId:'beta-director'};f.importer.fromPath({...foreign,path:f.exported.path});assert.throws(()=>f.importer.preview(foreign),/original project/);assert(!fs.existsSync(f.target.file));
});
test('roster revisions and idempotent change history survive recovery',t=>{
 const f=fixture(t),members=f.source.get('alpha').members.map(m=>m.id==='developer'?{...m,name:'Renamed fixture'}:m),change={projectId:'alpha',memberId:'director',expectedRevision:1,changeId:randomUUID(),members};
 f.source.updateMembers(change);f.exported=new RoomExport(f.source,f.store).create({projectId:'alpha',exportId:randomUUID()});const preview=prepare(f);f.importer.apply(approved(f,preview));
 assert.equal(f.target.get('alpha').revision,2);assert.deepEqual(f.target.get('alpha').memberChanges,f.source.get('alpha').memberChanges);assert.equal(f.target.updateMembers(change).replayed,true);
});
test('recovered routing cannot reuse an orphaned workspace authorization before explicit director reconfiguration',t=>{
 const f=fixture(t),workspace=path.join(f.home,'workspace');fs.mkdirSync(workspace);fs.mkdirSync(f.target.home,{recursive:true});const file=path.join(f.target.home,'work-control.json'),prior={version:1,projects:{alpha:{config:{workspaceRoot:workspace,configuredAt:'2026-01-01T00:00:00Z'},checkpoints:{},recoveries:{},cases:{},writes:{}}},leases:[]};fs.writeFileSync(file,JSON.stringify(prior));
 const preview=prepare(f);f.importer.apply(approved(f,preview));const store=new RoomStore(f.target.roomPath('alpha'),f.target.get('alpha')),control=new WorkControl(store,f.target.home);assert.equal(control.configured(),false);assert.throws(()=>control.resolve('note.txt'),/복구/);assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(prior));
 store.pause(false);const requestId=randomUUID();store.submit({id:requestId,text:'New authorized work',recipients:['director']});store.claim({requestId,memberId:'director'});assert.throws(()=>control.acquire({requestId,memberId:'director',key:'before-review',paths:['@editor']}),/복구/);
 control.configure({memberId:'director',workspaceRoot:workspace});assert.equal(control.configured(),true);assert.equal(control.acquire({requestId,memberId:'director',key:'after-review',paths:['@editor']}).memberId,'director');
});
test('existing records, another room in the same project, unfinished work and active controls block import',t=>{
 for(const kind of ['exists','other-room','unfinished','lease']){
  const f=fixture(t,{unfinished:kind==='unfinished'});
  if(kind==='exists'||kind==='other-room')f.target.configure({...f.source.get('alpha'),id:kind==='exists'?'alpha':'other'});
  if(kind==='lease'){fs.mkdirSync(f.target.home,{recursive:true});fs.writeFileSync(path.join(f.target.home,'work-control.json'),JSON.stringify({projects:{},leases:[{projectId:'alpha',id:'held'}]}));}
  const preview=prepare(f);assert.equal(preview.canRestore,false,kind);assert.throws(()=>f.importer.apply(approved(f,preview)));assert(!fs.existsSync(f.target.roomPath('alpha')));
 }
});
test('changed destination and altered staged ZIP are rejected after preview without overwriting history',t=>{
 const f=fixture(t),preview=prepare(f);f.target.configure(f.source.get('alpha'));const before=fs.readFileSync(f.target.file);assert.throws(()=>f.importer.apply(approved(f,preview)),/destination changed/i);assert(fs.readFileSync(f.target.file).equals(before));
 const other=fixture(t),p=prepare(other),file=path.join(other.target.home,'imports',other.args.importId,'source.zip'),bytes=fs.readFileSync(file);bytes[45]^=1;fs.writeFileSync(file,bytes);assert.throws(()=>other.importer.apply(approved(other,p)));assert(!fs.existsSync(other.target.file));
});
test('an interrupted registry commit reconciles only the same explicit apply and preserves newer records',t=>{
 for(const change of [false,true]){
  const f=fixture(t),preview=prepare(f),originalRename=fs.renameSync;let failed=false;
  fs.renameSync=(from,to)=>{if(to===f.target.file&&!failed){failed=true;throw new Error('Fixture interrupted registry commit');}return originalRename(from,to);};
  try{assert.throws(()=>f.importer.apply(approved(f,preview)),/interrupted/);}finally{fs.renameSync=originalRename;}
  assert(fs.existsSync(f.target.roomPath('alpha')));assert(!fs.existsSync(f.target.file));const reopened=new RoomImport(f.target);assert.equal(reopened.list(f.args).imports[0].status,'applying');assert.equal(reopened.preview(f.args).resuming,true);
  if(change){fs.writeFileSync(f.target.roomPath('alpha'),'{"newer":"keep"}');assert.throws(()=>reopened.apply(approved(f,preview)),/newer records/);assert.equal(fs.readFileSync(f.target.roomPath('alpha'),'utf8'),'{"newer":"keep"}');}
  else{assert.equal(reopened.apply(approved(f,preview)).restored,true);assert.equal(reopened.apply(approved(f,preview)).replayed,true);assert.equal(f.target.read().projects.length,1);}
 }
});
test('bounded chunk uploads accept exact retries only and resume without resending recorded chunks',t=>{
 const f=fixture(t),bytes=fs.readFileSync(f.exported.path),args={...f.args,name:'fixture.zip',size:bytes.length};assert.equal(f.importer.start(args).offset,0);
 const middle=Math.min(200,bytes.length),first={...f.args,offset:0,data:bytes.subarray(0,middle).toString('base64')};assert.equal(f.importer.chunk(first).offset,middle);assert.equal(f.importer.chunk(first).offset,middle);assert.equal(f.importer.start(args).offset,middle);
 assert.throws(()=>f.importer.chunk({...first,data:Buffer.alloc(middle).toString('base64')}));assert.throws(()=>f.importer.chunk({...first,offset:middle+1}));assert.throws(()=>f.importer.chunk({...first,data:Buffer.alloc(IMPORT_CHUNK_BYTES+1).toString('base64')}));
 f.importer.chunk({...f.args,offset:middle,data:bytes.subarray(middle).toString('base64')});assert.equal(f.importer.preview(f.args).canRestore,true);assert.equal(f.importer.list(f.args).imports.length,1);assert.equal(f.importer.list({...f.args,threadId:'beta-director'}).imports.length,0);
});
test('ZIP recovery rejects traversal, duplicate names, encryption, compression and central-directory mismatches',t=>{
 const f=fixture(t),original=fs.readFileSync(f.exported.path);
 for(const alter of [b=>b.writeUInt16LE(1,6),b=>b.writeUInt16LE(8,8),b=>b.writeUInt32LE(0,b.length-22+12),b=>b.writeUInt32LE(1,b.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]))+42)]){const bytes=Buffer.from(original);alter(bytes);assert.throws(()=>inspectBackup(bytes));}
 const duplicate=rewrite(f,entries=>entries.push({...entries[1]}));assert.throws(()=>inspectBackup(duplicate));
 assert.throws(()=>zip([{name:'../escape',bytes:Buffer.from('bad')}]));const truncated=original.subarray(0,original.length-1);assert.throws(()=>inspectBackup(truncated));
});
test('manifest-valid corrupt media, unreferenced attachments and foreign request routing fail before recovery',t=>{
 const f=fixture(t);
 for(const alter of [entries=>{const image=entries.find(e=>e.name.startsWith('images/'));image.bytes=Buffer.from('bad image');},entries=>{const room=entries.find(e=>e.name==='room.json'),value=JSON.parse(room.bytes);value.requests[0].projectId='beta';room.bytes=Buffer.from(JSON.stringify(value));},entries=>{const project=entries.find(e=>e.name==='project.json');project.bytes=Buffer.from(project.bytes.toString().replace('"members":','"__proto__":{},"members":'));}])assert.throws(()=>inspectBackup(rewrite(f,alter)));
 assert(!fs.existsSync(f.target.file));
});
test('MCP import is app-only, requires original host scope and returns no archive bytes, routes or local paths',t=>{
 const f=fixture(t),call=(args,meta={thread_id:f.args.threadId})=>handle({method:'tools/call',params:{name:'room_import',arguments:args,_meta:meta}},f.target);
 assert.deepEqual(TOOLS.find(t=>t.name==='room_import')._meta.ui.visibility,['app']);assert.equal(call({operation:'from_path',importId:f.args.importId,path:f.exported.path},{}).isError,true);
 const stage=call({operation:'from_path',importId:f.args.importId,path:f.exported.path});assert(!stage.isError);const preview=call({operation:'preview',importId:f.args.importId});assert.equal(preview.structuredContent.canRestore,true);assert(!JSON.stringify(preview).includes(f.home));assert(!JSON.stringify(preview).includes('alpha-director'));assert(!JSON.stringify(preview).includes('Keep 原文 exactly'));
});
test('staging and media junctions cannot redirect recovered files outside runtime storage',t=>{
 for(const kind of ['imports','media']){
  const f=fixture(t),outside=path.join(f.home,'outside');fs.mkdirSync(outside);fs.mkdirSync(f.target.home,{recursive:true});
  if(kind==='imports'){fs.symlinkSync(outside,path.join(f.target.home,'imports'),'junction');assert.throws(()=>f.importer.fromPath({...f.args,path:f.exported.path}),/runtime storage|symbolic links/);}
  else{f.importer.fromPath({...f.args,path:f.exported.path});fs.mkdirSync(path.join(f.target.home,'rooms'));fs.symlinkSync(outside,f.target.roomPath('alpha')+'.images','junction');assert.throws(()=>f.importer.preview(f.args),/symbolic links/);}
  assert.deepEqual(fs.readdirSync(outside),[]);assert(!fs.existsSync(f.target.file));
 }
});
