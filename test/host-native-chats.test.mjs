import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {metadataPath,projectForThread,readNativeProjectChats,openingThread,findNativeMeetingProject,readNativeOpeningProject} from '../host-plugin/native-chats.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {handle} from '../host-plugin/server.mjs';

let DatabaseSync;try{({DatabaseSync}=await import('node:sqlite'));}catch{}
const sqliteTest=typeof DatabaseSync?.prototype.function==='function'?test:test.skip;
const members=['director','one'].map(id=>({id,name:'Fixture '+id,role:id==='director'?'총괄 디렉터':'프로그래머',threadId:'fixture-chat-'+id,hostId:'local'}));
function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'native-chats-'));
 t.after(()=>{assert(path.resolve(home).startsWith(path.resolve(base)+path.sep+'native-chats-'));fs.rmSync(home,{recursive:true,force:true});});
 const file=path.join(home,'index.sqlite'),db=new DatabaseSync(file);
 db.exec('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE project_roots(project_id TEXT,path TEXT); CREATE TABLE threads(id TEXT PRIMARY KEY,name TEXT,title TEXT,cwd TEXT,project_id TEXT,archived INTEGER,thread_source TEXT,updated_at INTEGER)');
 for(const [id,root] of [['parent','/workspace'],['alpha','/workspace/a'],['beta','/workspace/b'],['nested','/workspace/a/inner']]){db.prepare('INSERT INTO projects VALUES(?,?)').run(id,'Fixture '+id);db.prepare('INSERT INTO project_roots VALUES(?,?)').run(id,root);}
 const rows=[
  ['fixture-chat-director','Fixture director','Original leader title','/workspace/a','alpha',0,'user',10],
  ['fixture-chat-one','Fixture one','Old developer title','/workspace/a','alpha',0,'user',9],
  ['fixture-new','New project chat','Original prompt title','/workspace/a/sub','alpha',0,'user',8],
  ['fixture-explicit','Explicit project chat','Old title','/outside','alpha',0,'user',7],
  ['fixture-other','Other project','Do not expose','/workspace/a','beta',0,'user',6],
  ['fixture-nested','Nested project','Do not expose','/workspace/a/inner','nested',0,'user',5],
  ['fixture-archived','Archived chat','Do not expose','/workspace/a',null,1,'user',4],
  ['fixture-review','Guardian review','Do not expose','/workspace/a',null,0,'guardian_review',3],
  ['fixture-child','Internal subagent','Do not expose','/workspace/a',null,0,'subagent',2],
  ['fixture-unassigned','Unassigned chat','Do not expose','/workspace/a',null,0,'user',1]
 ];for(const row of rows)db.prepare('INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)').run(...row);db.close();
 const project={id:'meeting',name:'Meeting fixture',workspacePath:'/workspace/a',members};
 const registry=new Projects(path.join(home,'runtime'),{catalogReader:p=>readNativeProjectChats(p,{file}),openingReader:(projects,id)=>findNativeMeetingProject(projects,id,{file})});registry.configure(project);
 const mutate=sql=>{const d=new DatabaseSync(file);try{d.exec(sql);}finally{d.close();}};
 return {home,file,project,registry,mutate};
}
const call=(registry,name,args)=>handle({method:'tools/call',params:{name,arguments:args}},registry);
const ok=(registry,name,args)=>{const r=call(registry,name,args);assert(!r.isError,JSON.stringify(r));return r.structuredContent;};
const apply=(f,view,selection)=>f.registry.updateMembers({projectId:'meeting',memberId:'director',expectedRevision:view.revision,optionsRevision:view.optionsRevision,changeId:randomUUID(),selection});

test('opening identity comes only from consistent bounded host metadata',()=>{
 assert.equal(openingThread({thread_id:'fixture-new',threadId:'fixture-new'}),'fixture-new');
 assert.equal(openingThread({'x-codex-turn-metadata':JSON.stringify({thread_id:'fixture-new',source:'mcp_app'})}),'fixture-new');
 for(const meta of [undefined,{},[],{thread_id:'fixture-new',threadId:'other'},{thread_id:'fixture-new',hostId:'remote'},{thread_id:'  fixture-new'},{thread_id:42},{'x-codex-turn-metadata':'{'},{'x-codex-turn-metadata':'x'.repeat(8193)},{thread_id:'fixture-new','x-codex-turn-metadata':{thread_id:'other'}}])assert.equal(openingThread(meta),null);
});

sqliteTest('opening from each project selects its own registered meeting without changing any runtime data',t=>{
 const f=fixture(t);f.registry.configure({...f.project,id:'second',name:'Second fixture',workspacePath:'/workspace/b',members:[{...members[0],threadId:'fixture-other'}]});
 const before=fs.readFileSync(f.registry.file),dbBefore=fs.readFileSync(f.file);
 const open=(name,args,threadId)=>handle({method:'tools/call',params:{name,arguments:args,_meta:{thread_id:threadId,threadId}}},f.registry).structuredContent;
 assert.equal(open('room_open',{},'fixture-new').project.id,'meeting','an unconnected chat in the same project can open its meeting');
 assert.equal(open('room_open',{},'fixture-other').project.id,'second');
 assert.equal(open('room_state',{resolveCurrent:true},'fixture-other').project.id,'second');
 assert.equal(open('room_state',{},'fixture-new').project,null,'ordinary unscoped polls do not resolve again');
 assert.equal(open('room_open',{projectId:'meeting'},'fixture-other').project.id,'meeting','explicit selection takes precedence');
 const blocked=handle({method:'tools/call',params:{name:'room_submit',arguments:{id:'test',text:'No implicit write',recipients:['director']},_meta:{thread_id:'fixture-new'}}},f.registry);assert.equal(blocked.isError,true);
 assert(fs.readFileSync(f.registry.file).equals(before));assert(fs.readFileSync(f.file).equals(dbBefore));assert(!fs.existsSync(path.join(f.registry.home,'rooms')),'opening alone cannot create room history');
});

sqliteTest('ambiguous, unregistered, moved, internal and unavailable openings never fall back to another project',t=>{
 const f=fixture(t),open=threadId=>f.registry.opening(threadId);
 assert.deepEqual(open('fixture-new'),{status:'selected',projectId:'meeting'});
 assert.deepEqual(open('fixture-nested'),{status:'unregistered',projectName:'Fixture nested'});
 for(const id of ['fixture-unassigned','fixture-child','fixture-review','fixture-archived','missing',null])assert.deepEqual(open(id),{status:'unavailable'});
 f.mutate("UPDATE threads SET project_id='beta' WHERE id='fixture-new'");assert.deepEqual(open('fixture-new'),{status:'unregistered',projectName:'Fixture beta'});
 f.registry.configure({...f.project,id:'duplicate'});assert.deepEqual(open('fixture-chat-director'),{status:'ambiguous'});
 f.registry.openingReader=()=>{throw new Error('Fixture unavailable');};assert.deepEqual(open('fixture-chat-director'),{status:'unavailable'});
});

test('native project matching respects explicit membership, nested roots and Windows path forms',()=>{
 const roots=[{project_id:'parent',path:'C:/work'},{project_id:'child',path:'C:/work/Game'}],ids=new Set(['parent','child']);
 assert.equal(metadataPath('\\\\?\\C:\\work\\Game\\'),metadataPath('c:/WORK/game'));
 assert.equal(projectForThread({cwd:'C:/work/Game/sub'},roots,ids),'child');
 assert.equal(projectForThread({cwd:'C:/work/GameOther'},roots,ids),'parent');
 assert.equal(projectForThread({cwd:'C:/work/Game',project_id:'parent'},roots,ids),'parent');
 assert.equal(projectForThread({cwd:'C:/work/Game',project_id:'missing'},roots,ids),null);
 assert.equal(projectForThread({cwd:'C:/work/Game'},[...roots,{project_id:'duplicate',path:'c:/work/game'}],new Set([...ids,'duplicate'])),null);
});

sqliteTest('read-only catalog exposes only active user chat titles in the verified director project',t=>{
 const f=fixture(t),hash=()=>createHash('sha256').update(fs.readFileSync(f.file)).digest('hex'),before=hash();
 const result=readNativeProjectChats(f.project,{file:f.file});assert.equal(result.scopeId,'alpha');assert.equal(result.label,'Fixture alpha');
 assert.deepEqual(result.candidates.map(c=>c.threadId),['fixture-chat-director','fixture-chat-one','fixture-new','fixture-explicit']);
 assert.equal(result.candidates[2].chatTitle,'New project chat');assert(!JSON.stringify(result).includes('Do not expose'));assert.equal(hash(),before);
});

sqliteTest('unsupported, remote, ambiguous and mismatched project metadata fails closed',t=>{
 const f=fixture(t);assert.throws(()=>readNativeProjectChats({...f.project,members:members.map(m=>({...m,hostId:'remote'}))},{file:f.file}));
 assert.throws(()=>readNativeProjectChats({...f.project,workspacePath:'/workspace/b'},{file:f.file}));
 f.mutate("INSERT INTO projects VALUES('duplicate','Duplicate'); INSERT INTO project_roots VALUES('duplicate','/workspace/a')");
 assert.equal(readNativeProjectChats(f.project,{file:f.file}).scopeId,'alpha','explicit project membership disambiguates shared folders');
 f.mutate("UPDATE threads SET project_id=NULL WHERE id='fixture-chat-director'");
 assert.throws(()=>readNativeProjectChats(f.project,{file:f.file}));
 const empty=path.join(f.home,'empty.sqlite');const db=new DatabaseSync(empty);db.close();assert.throws(()=>readNativeProjectChats(f.project,{file:empty}));
});

sqliteTest('discovery prepares choices without changing membership and never exposes native routes',t=>{
 const f=fixture(t),before=f.registry.get('meeting').members;
 const first=ok(f.registry,'room_roster',{projectId:'meeting',operation:'discover'});
 assert.equal(first.catalog.available,true);assert.equal(first.choices.length,4);assert.deepEqual(f.registry.get('meeting').members,before);assert.equal(first.revision,1);
 assert(!JSON.stringify(first).includes('fixture-new'));assert(!JSON.stringify(first).includes('threadId'));assert(!JSON.stringify(first).includes('hostId'));
 const candidate=first.choices.find(c=>c.chatTitle==='New project chat');assert.equal(candidate.roleType,'custom');assert.equal(candidate.role,'담당자');
 const again=f.registry.discover('meeting');assert.equal(again.optionsRevision,first.optionsRevision);
 assert(!fs.existsSync(f.registry.roomPath('meeting')),'discovery cannot create a request or transcript');
});

sqliteTest('picked chats join only on save; excluded members return with original identity and labels',t=>{
 const f=fixture(t),view=f.registry.discover('meeting'),choice=view.choices.find(c=>c.chatTitle==='New project chat');
 const added={...choice,name:'Chosen room label',role:'프로그래머',roleType:'programmer'};apply(f,view,[...view.members,added]);
 let current=f.registry.roster('meeting');assert.equal(current.members.length,3);const actual=f.registry.get('meeting').members.find(m=>m.id===choice.id);assert.equal(actual.threadId,'fixture-new');
 apply(f,current,current.members.filter(m=>m.id!=='one'));current=f.registry.roster('meeting');assert(!current.members.some(m=>m.id==='one'));assert(current.choices.some(m=>m.id==='one'));
 const original=current.choices.find(m=>m.id==='one');apply(f,current,[...current.members,original]);assert.equal(f.registry.get('meeting').members.find(m=>m.id==='one').threadId,'fixture-chat-one');
});

sqliteTest('moving or archiving a candidate after discovery blocks stale additions without changing the roster',t=>{
 for(const change of ["project_id='beta'","archived=1"]){const f=fixture(t),view=f.registry.discover('meeting'),choice=view.choices.find(c=>c.chatTitle==='New project chat'),before=fs.readFileSync(f.registry.file);
  f.mutate('UPDATE threads SET '+change+" WHERE id='fixture-new'");assert.throws(()=>apply(f,view,[...view.members,choice]),/이동·보관/);assert(fs.readFileSync(f.registry.file).equals(before));
  assert(!f.registry.discover('meeting').choices.some(m=>m.id===choice.id));
 }
});

sqliteTest('catalog failure keeps existing edits available but cannot silently activate stale choices',t=>{
 const f=fixture(t),view=f.registry.discover('meeting'),choice=view.choices.find(c=>c.chatTitle==='New project chat');
 f.registry.catalogReader=()=>{throw new Error('Synthetic unavailable index');};
 const unavailable=f.registry.discover('meeting');assert.equal(unavailable.catalog.available,false);assert.deepEqual(unavailable.choices.map(m=>m.id),view.members.map(m=>m.id));
 assert.throws(()=>apply(f,view,[...view.members,choice]),/다시 확인/);
 apply(f,view,view.members.map(m=>({...m,name:m.id==='one'?'Renamed existing member':m.name})));assert.equal(f.registry.get('meeting').members[1].name,'Renamed existing member');
});

sqliteTest('legacy desktop assignments are explicit and projectless, remote or conflicting membership stays out',t=>{
 const f=fixture(t),stateFile=path.join(f.home,'.codex-global-state.json');f.mutate("UPDATE threads SET project_id=NULL WHERE id IN ('fixture-chat-director','fixture-new','fixture-chat-one')");
 const assignment=projectId=>({projectKind:'local',projectId});
 fs.writeFileSync(stateFile,JSON.stringify({'thread-project-assignments':{'fixture-chat-director':assignment('legacy-alpha'),'fixture-new':assignment('legacy-alpha'),'fixture-chat-one':assignment('legacy-alpha')},'app-server-project-id-by-legacy-project-id-by-host':{['local:'+path.dirname(f.file)]:{'legacy-alpha':'alpha'}},'projectless-thread-ids':['fixture-new'],'thread-project-membership-host-ids':{'fixture-chat-one':'remote'}}));
 const result=readNativeProjectChats(f.project,{file:f.file});assert.deepEqual(result.candidates.map(c=>c.threadId),['fixture-chat-director','fixture-explicit']);
 const context=readNativeOpeningProject('fixture-chat-director',{file:f.file});assert.equal(context.name,'Fixture alpha');assert.deepEqual(context.nativeProjectIds,['legacy-alpha','alpha']);
 f.mutate("UPDATE threads SET project_id='beta' WHERE id='fixture-chat-director'");assert.throws(()=>readNativeProjectChats(f.project,{file:f.file}));
});
