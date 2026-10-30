import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {RoomLifecycle} from '../host-plugin/room-lifecycle.mjs';
import {WorkControl} from '../host-plugin/control.mjs';
import {TeamSetup} from '../host-plugin/team-setup.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';
import {wav} from './audio.fixture.mjs';

function fixture(t){
 const base=path.resolve('.local/test-data');fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'lifecycle-'));t.after(()=>{assert(home.startsWith(base+path.sep));fs.rmSync(home,{recursive:true,force:true});});
 const registry=new Projects(home,{openingReader:(projects,id)=>id==='fixture-opener'?(projects.some(p=>p.id==='alpha')?{status:'selected',projectId:'alpha'}:{status:'unregistered'}):{status:'unavailable'}});
 for(const id of ['alpha','beta'])registry.configure({id,name:'Fixture '+id,members:['director','qa'].map(member=>({id:member,name:'Fixture '+member,role:member==='director'?'총괄':'QA',threadId:'fixture-'+id+'-'+member,hostId:'local'}))});
 const store=new RoomStore(registry.roomPath('alpha'),registry.get('alpha'),()=>registry.get('alpha')),lifecycle=new RoomLifecycle(registry),control=new WorkControl(store,home),workspace=path.join(home,'workspace');fs.mkdirSync(workspace);control.configure({memberId:'director',workspaceRoot:workspace});
 const task=()=>{const args={id:randomUUID(),text:'Fixture task',recipients:['director']};store.submit(args);store.claim({requestId:args.id,memberId:'director'});return args;};
 const change=operation=>{const p=registry.get('alpha');return {operation,projectId:'alpha',expectedRevision:p.revision||1,confirmName:p.name,confirmed:true,changeId:randomUUID()};};
 return {home,registry,store,lifecycle,control,workspace,task,change};
}
const call=(f,name,args)=>handle({method:'tools/call',params:{name,arguments:args}},f.registry);
const ok=(f,name,args)=>{const r=call(f,name,args);assert(!r.isError,r.content?.[0]?.text);return r.structuredContent;};

test('delete hides a completed room and restore preserves routes, transcripts, media, control and usage bytes',t=>{
 const f=fixture(t),task=f.task(),png=path.join(f.home,'fixture.png'),sound=path.join(f.home,'fixture.wav');fs.writeFileSync(png,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'));fs.writeFileSync(sound,wav());
 const post={requestId:task.id,memberId:'director',kind:'progress',messageKey:'fixture-progress',text:'Fixture progress',images:[{path:png,caption:'Fixture image'}],audio:[{path:sound,caption:'Fixture sound'}]},reply={requestId:task.id,memberId:'director',text:'Fixture finished'};f.store.post(post);f.store.reply(reply);
 fs.writeFileSync(path.join(f.home,'usage-ledger.json'),JSON.stringify({version:1,sources:{},limits:[]}));
 const beforeMembers=f.registry.get('alpha').members,paths=[f.store.file,f.control.file,path.join(f.home,'usage-ledger.json'),...fs.readdirSync(f.store.file+'.images').map(n=>path.join(f.store.file+'.images',n)),...fs.readdirSync(f.store.file+'.audio').map(n=>path.join(f.store.file+'.audio',n))],before=paths.map(p=>fs.readFileSync(p));
 const preview=ok(f,'room_manage',{operation:'preview_delete',projectId:'alpha'});assert.equal(preview.canDelete,true);assert.deepEqual(preview.counts,{members:2,requests:1,messages:3,images:1,audio:1});
 const deletion=f.change('delete');assert.equal(ok(f,'room_manage',deletion).archived,true);assert.deepEqual(f.registry.list().map(p=>p.id),['beta']);assert.equal(f.registry.opening('fixture-opener').status,'deleted');
 const snapshot=ok(f,'room_state',{projectId:'alpha'});assert.equal(snapshot.project,null);assert.equal(snapshot.deletedProjectId,'alpha');assert.equal(snapshot.messages.length,0);assert.equal(ok(f,'room_get',{projectId:'alpha',requestId:task.id}).messages.length,3);
 assert.equal(f.store.submit(task).request.id,task.id);assert.equal(f.store.claim({requestId:task.id,memberId:'director'}).dispatch,false);assert.equal(f.store.post(post).created,false);ok(f,'room_reply',{projectId:'alpha',...reply});
 assert.equal(ok(f,'room_manage',{operation:'list_deleted'}).rooms.length,1);assert.equal(new RoomLifecycle(new Projects(f.home)).change(deletion).replayed,true);
 assert.equal(ok(f,'room_manage',f.change('restore')).archived,false);assert.deepEqual(f.registry.get('alpha').members,beforeMembers);assert.equal(f.registry.opening('fixture-opener').projectId,'alpha');for(let i=0;i<paths.length;i++)assert.deepEqual(fs.readFileSync(paths[i]),before[i],paths[i]);
});

test('active requests, questions, ownership, validation and team setup block deletion without changing history',t=>{
 for(const kind of ['task','question','lease','run','setup']){
  const f=fixture(t),task=f.task();
  if(kind==='question')f.store.post({requestId:task.id,memberId:'director',kind:'question',messageKey:'question',toMemberId:'qa',text:'Fixture question'});
  if(kind==='lease'){f.control.acquire({requestId:task.id,memberId:'director',key:'editor',paths:['@editor']});f.store.reply({requestId:task.id,memberId:'director',text:'Fixture direct-store completion'});}
  if(['run','setup'].includes(kind)){f.store.reply({requestId:task.id,memberId:'director',text:'Fixture finished'});if(kind==='run')f.control.change(state=>{state.cases.fixture={attempts:[{status:'running'}]};});else new TeamSetup(f.registry).plan({projectId:'alpha',setupId:randomUUID(),name:'Fixture alpha',codexProjectId:'fixture-native',hostId:'local',models:[]});}
  const before=fs.readFileSync(f.registry.file),history=fs.readFileSync(f.store.file),preview=f.lifecycle.preview({projectId:'alpha'});assert.equal(preview.canDelete,false,kind);assert(preview.reasons.length>0);assert.throws(()=>f.lifecycle.change(f.change('delete')),/완료하거나/);assert.deepEqual(fs.readFileSync(f.registry.file),before);assert.deepEqual(fs.readFileSync(f.store.file),history);
 }
});

test('state is rechecked after preview and wrong name, revision, confirmation or scope never deletes',t=>{
 const f=fixture(t),preview=f.lifecycle.preview({projectId:'alpha'}),change=f.change('delete');assert(preview.canDelete);
 for(const args of [{...change,confirmed:false},{...change,confirmName:'Fixture beta'},{...change,expectedRevision:99},{...change,projectId:'missing'},{...change,projectId:'../escape'}])assert.throws(()=>f.lifecycle.change(args));
 f.task();assert.throws(()=>f.lifecycle.change(change),/진행 중인 요청/);assert.equal(f.registry.list().length,2);
});

test('deleted rooms reject new work, member changes and configuration while retaining historical reads',t=>{
 const f=fixture(t),task=f.task();f.store.reply({requestId:task.id,memberId:'director',text:'Fixture finished'});f.lifecycle.change(f.change('delete'));const before=fs.readFileSync(f.store.file);
 assert.throws(()=>f.store.submit({id:randomUUID(),text:'New task',recipients:['director']}),/삭제된/);assert.throws(()=>f.store.post({requestId:task.id,memberId:'director',kind:'progress',messageKey:'new',text:'New post'}),/삭제된/);assert.throws(()=>f.store.pause(false),/삭제된/);
 assert.throws(()=>f.control.configure({memberId:'director',workspaceRoot:f.workspace}),/삭제된/);assert.throws(()=>f.registry.configure(f.registry.get('alpha')),/삭제된/);assert.throws(()=>f.registry.discover('alpha'),/삭제된/);
 assert.throws(()=>f.registry.updateMembers({projectId:'alpha',memberId:'director',expectedRevision:f.registry.get('alpha').revision,changeId:randomUUID(),members:f.registry.get('alpha').members.slice(0,1)}),/삭제된/);
 assert.equal(call(f,'room_validation',{projectId:'alpha',operation:'define',memberId:'director',caseId:'fixture',label:'Fixture',signature:'fixture'}).isError,true);assert.equal(call(f,'room_team',{projectId:'alpha',setupId:randomUUID(),operation:'plan',name:'New',codexProjectId:'fixture-native',hostId:'local',models:[]}).isError,true);assert.deepEqual(fs.readFileSync(f.store.file),before);
});

test('old delete/restore receipts never roll back a later lifecycle operation or alter another room',t=>{
 const f=fixture(t),beta=JSON.stringify(f.registry.get('beta')),deletion=f.change('delete');f.lifecycle.change(deletion);const restoration=f.change('restore');f.lifecycle.change(restoration);assert.equal(f.lifecycle.change(deletion).archived,false);
 f.lifecycle.change(f.change('delete'));assert.equal(f.lifecycle.change(restoration).archived,true);assert.throws(()=>f.lifecycle.change({...deletion,operation:'restore'}),/같은 변경 ID/);assert.equal(JSON.stringify(f.registry.get('beta')),beta);assert.equal(f.registry.get('alpha').lifecycleChanges.length,3);
 assert.deepEqual(TOOLS.find(t=>t.name==='room_manage')._meta.ui.visibility,['app']);
});
