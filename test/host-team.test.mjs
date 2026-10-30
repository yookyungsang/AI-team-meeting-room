import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {TeamSetup,TEAM_ROLES} from '../host-plugin/team-setup.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {handle} from '../host-plugin/server.mjs';

const models=[{id:'fixture-balanced',label:'Fixture balanced',family:'balanced',efforts:['low','medium','high']},{id:'fixture-visual',label:'Fixture visual',family:'visual',efforts:['medium','high']},{id:'fixture-deep',label:'Fixture deep',family:'deep',efforts:['low','high']}];
const member=id=>({id,name:'Fixture '+id,role:id,threadId:'fixture-existing-'+id,hostId:'local'});
function fixture(t,{existing=false}={}){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'team-setup-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const registry=new Projects(home);if(existing)registry.configure({id:'fixture',name:'Existing room',members:[member('director'),member('observer')]});
 const team=new TeamSetup(registry),scope={projectId:'fixture',setupId:randomUUID()},plan={...scope,name:'Fixture team',codexProjectId:'fixture-native-project',hostId:'local',brief:'  Original brief\n\nKeep this text.  ',models};
 return {home,registry,team,scope,plan};
}
const choices=(model='default')=>TEAM_ROLES.map(role=>({slotId:role.id,model}));
function approve(f,selection=choices()){return f.team.approve({...f.scope,confirmed:true,choices:selection});}
function record(f,slot,claim,extra={}){return f.team.record({...f.scope,slotId:slot,attemptId:claim.attemptId,threadId:'fixture-created-'+slot,hostId:'local',codexProjectId:f.plan.codexProjectId,verified:true,titleVerified:true,...extra});}
function createAll(f){const calls=[];for(const role of TEAM_ROLES){const claim=f.team.claim({...f.scope,slotId:role.id});if(claim.dispatch){calls.push(claim);record(f,role.id,claim);}}return calls;}
const call=(registry,args)=>handle({method:'tools/call',params:{name:'room_team',arguments:args}},registry);

test('team plan offers six named roles, exactly two programmers and observed model options without creating a room',t=>{
 const f=fixture(t),plan=f.team.plan(f.plan);assert.equal(plan.roles.length,6);assert.equal(plan.roles.filter(r=>r.slotId.startsWith('programmer')).length,2);
 assert.equal(plan.roles.find(r=>r.slotId==='designer').suggested.model,'fixture-visual');assert.equal(plan.roles.find(r=>r.slotId==='qa').suggested.thinking,'high');
 assert.equal(plan.modelOptions[0].id,'default');assert.equal(plan.roles.every(r=>r.state==='planned'),true);assert.equal(f.registry.list().length,0);
 assert.equal(fs.existsSync(f.registry.file),false);assert.equal(fs.existsSync(path.join(f.home,'rooms','fixture.json')),false);
 const bytes=fs.readFileSync(f.team.file);assert.deepEqual(f.team.plan(f.plan),plan);assert.ok(fs.readFileSync(f.team.file).equals(bytes));
 assert.throws(()=>f.team.plan({...f.plan,name:'Different'}),/같은 setupId/);assert.throws(()=>f.team.plan({...f.plan,setupId:randomUUID()}),/진행 중/);
 assert.throws(()=>f.team.claim({...f.scope,slotId:'director'}),/승인/);
});

test('explicit model choices are checked and passed exactly; defaults never set model or effort',t=>{
 const f=fixture(t);f.team.plan(f.plan);assert.throws(()=>f.team.approve({...f.scope,confirmed:false,choices:choices()}),/사용자/);
 assert.throws(()=>approve(f,choices('unobserved-model')),/호스트/);assert.throws(()=>approve(f,choices().map(c=>({...c,thinking:'high'}))),/기본 모델/);
 assert.throws(()=>approve(f,choices('fixture-balanced').map(c=>({...c,thinking:'ultra'}))),/조합/);
 const selected=choices().map(c=>c.slotId==='programmer1'?{...c,model:'fixture-balanced',thinking:'high'}:c);approve(f,selected);
 const dev=f.team.claim({...f.scope,slotId:'programmer1'});assert.equal(dev.action.model,'fixture-balanced');assert.equal(dev.action.thinking,'high');
 assert.deepEqual(dev.action.target,{type:'project',projectId:'fixture-native-project',environment:{type:'local'}});
 assert.ok(dev.action.prompt.endsWith(f.plan.brief));assert.match(dev.action.prompt,/당신의 역할: 프로그래머 1/);assert.match(dev.action.prompt,/단독 배정이면 순차 수행/);assert.match(dev.action.prompt,/동료가 있으면 독립 파일·의존성에 따라 협업/);assert.match(dev.action.prompt,/아직 구현/);
 const director=f.team.claim({...f.scope,slotId:'director'});assert.equal(Object.hasOwn(director.action,'model'),false);assert.equal(Object.hasOwn(director.action,'thinking'),false);
 assert.throws(()=>approve(f,choices('fixture-balanced')),/승인 후/);assert.equal(approve(f,selected).status,'creating');
});

test('interruption and uncertain native outcomes never recreate a chat; verified original results resume the plan',t=>{
 const f=fixture(t);f.team.plan(f.plan);approve(f);const first=f.team.claim({...f.scope,slotId:'designer'});
 const reopened=new TeamSetup(new Projects(f.home));assert.equal(reopened.claim({...f.scope,slotId:'designer'}).dispatch,false);
 assert.equal(reopened.status(f.scope).roles.find(r=>r.slotId==='designer').attemptId,first.attemptId);
 reopened.block({...f.scope,slotId:'designer',attemptId:first.attemptId,reason:'Synthetic native receipt missing'});
 assert.equal(reopened.claim({...f.scope,slotId:'designer'}).dispatch,false);
 const independent=reopened.claim({...f.scope,slotId:'planner'});record({...f,team:reopened},'planner',independent);assert.equal(reopened.status(f.scope).status,'attention');
 record({...f,team:reopened},'designer',first);assert.equal(reopened.status(f.scope).roles.find(r=>r.slotId==='designer').state,'ready');
 assert.equal(reopened.claim({...f.scope,slotId:'designer'}).dispatch,false);assert.throws(()=>reopened.block({...f.scope,slotId:'designer',attemptId:first.attemptId,reason:'change'}));
});

test('verified identity, attempt, title, project and host are required and saved identities cannot be replaced',t=>{
 const f=fixture(t);f.team.plan(f.plan);approve(f);const claim=f.team.claim({...f.scope,slotId:'planner'});
 for(const extra of [{attemptId:undefined},{attemptId:randomUUID()},{verified:false},{titleVerified:false},{codexProjectId:'other-project'},{hostId:'other-host'}])assert.throws(()=>record(f,'planner',claim,extra));
 assert.throws(()=>record(f,'qa',claim));record(f,'planner',claim);const bytes=fs.readFileSync(f.team.file);record(f,'planner',claim);assert.ok(fs.readFileSync(f.team.file).equals(bytes));
 assert.throws(()=>record(f,'planner',claim,{threadId:'replacement'}));
 const qa=f.team.claim({...f.scope,slotId:'qa'});assert.throws(()=>record(f,'qa',qa,{threadId:'fixture-created-planner'}),/같은 대화창/);
 assert.throws(()=>f.team.connect(f.scope),/모든 역할/);assert.equal(f.registry.list().length,0);
});

test('a new creation attempt needs verified absence and explicit human retry; changed model choice is recorded',t=>{
 const f=fixture(t);f.team.plan(f.plan);approve(f);const first=f.team.claim({...f.scope,slotId:'qa'});f.team.block({...f.scope,slotId:'qa',attemptId:first.attemptId,reason:'Synthetic rejection'});
 const retry={...f.scope,slotId:'qa',attemptId:first.attemptId,retryId:randomUUID(),confirmed:true,confirmedAbsent:true,reason:'Explicit user retry after native absence check',choice:{model:'fixture-balanced',thinking:'high'}};
 assert.throws(()=>f.team.retry({...retry,confirmedAbsent:false}),/native 확인/);assert.throws(()=>f.team.retry({...retry,confirmed:false}),/사용자/);
 f.team.retry(retry);const second=f.team.claim({...f.scope,slotId:'qa'});assert.equal(second.dispatch,true);assert.notEqual(second.attemptId,first.attemptId);assert.equal(second.action.model,'fixture-balanced');
 f.team.retry(retry);assert.equal(f.team.claim({...f.scope,slotId:'qa'}).dispatch,false);assert.throws(()=>f.team.retry({...retry,reason:'changed'}),/같은 retryId/);
 record(f,'qa',second);assert.equal(f.team.retry(retry).roles.find(s=>s.slotId==='qa').state,'ready');
});

test('a completed synthetic native workflow creates one chat per role and connects their actual IDs once',t=>{
 const f=fixture(t);f.team.plan(f.plan);approve(f);const actions=createAll(f);assert.equal(actions.length,6);assert.equal(new Set(actions.map(a=>a.action.title)).size,6);
 const result=f.team.connect(f.scope);assert.equal(result.status,'connected');assert.equal(result.currentRosterMatches,true);assert.equal(f.registry.get('fixture').members.length,6);
 for(const role of TEAM_ROLES)assert.equal(f.registry.get('fixture').members.find(m=>m.id===role.id).threadId,'fixture-created-'+role.id);
 const bytes=fs.readFileSync(f.registry.file);f.team.connect(f.scope);assert.ok(fs.readFileSync(f.registry.file).equals(bytes));
 assert.equal(createAll(f).length,0);assert.equal(fs.existsSync(path.join(f.home,'rooms','fixture.json')),false);
});

test('existing directors and extra members retain their chat and settings; only five missing chats are planned',t=>{
 const f=fixture(t,{existing:true}),room=new RoomStore(f.registry.roomPath('fixture'),f.registry.get('fixture')),id=randomUUID();room.submit({id,text:'Existing work',recipients:['director']});room.claim({requestId:id,memberId:'director'});
 const bytes=fs.readFileSync(room.file),plan=f.team.plan(f.plan);assert.equal(plan.roles.find(r=>r.slotId==='director').reused,true);
 assert.throws(()=>approve(f,choices('fixture-balanced')),/기존 채팅 모델/);approve(f);assert.equal(createAll(f).length,5);
 f.team.connect(f.scope);assert.equal(f.registry.get('fixture').members.length,7);assert.equal(f.registry.get('fixture').members[0].threadId,'fixture-existing-director');
 assert.ok(fs.readFileSync(room.file).equals(bytes));assert.equal(f.registry.get('fixture').members.some(m=>m.id==='observer'),true);
});

test('existing role bindings are distinct and retired IDs cannot be recycled for newly created chats',t=>{
 const f=fixture(t,{existing:true});assert.throws(()=>f.team.plan({...f.plan,roles:[{slotId:'planner',reuseMemberId:'director'}]}),/총괄/);
 assert.throws(()=>f.team.plan({...f.plan,roles:[{slotId:'planner',reuseMemberId:'observer'},{slotId:'designer',reuseMemberId:'observer'}]}),/중복/);
 f.registry.updateMembers({projectId:'fixture',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:[member('director')]});
 assert.throws(()=>f.team.plan({...f.plan,roles:[{slotId:'planner',memberId:'observer'}]}),/다른 ID/);
 const plan=f.team.plan({...f.plan,roles:[{slotId:'planner',memberId:'newplanner',name:'Custom planner'}]});assert.equal(plan.roles.find(r=>r.slotId==='planner').memberId,'newplanner');
});

test('roster conflicts do not overwrite other edits; explicit reconciliation can complete without recreating chats',t=>{
 const f=fixture(t,{existing:true});f.team.plan(f.plan);approve(f);createAll(f);
 const extra=member('extra');f.registry.updateMembers({projectId:'fixture',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:[...f.registry.get('fixture').members,extra]});
 const bytes=fs.readFileSync(f.registry.file);assert.throws(()=>f.team.connect(f.scope),/revision/);assert.ok(fs.readFileSync(f.registry.file).equals(bytes));
 const plan=f.team.status(f.scope),added=plan.roles.filter(s=>!s.reused).map(s=>({id:s.memberId,name:s.name,role:s.role,threadId:s.threadId,hostId:s.hostId}));
 f.registry.updateMembers({projectId:'fixture',memberId:'director',expectedRevision:2,changeId:randomUUID(),members:[...f.registry.get('fixture').members,...added]});
 assert.equal(f.team.connect(f.scope).status,'connected');assert.equal(createAll(f).length,0);assert.equal(f.registry.get('fixture').members.some(m=>m.id==='extra'),true);
});

test('a crash after registry commit is reconciled, and a late setup replay never restores a removed member',t=>{
 const f=fixture(t);f.team.plan(f.plan);approve(f);createAll(f);const configure=f.registry.configure.bind(f.registry);
 f.registry.configure=input=>{configure(input);throw new Error('Synthetic crash after external commit');};
 assert.throws(()=>f.team.connect(f.scope),/Synthetic crash/);assert.equal(f.team.status(f.scope).status,'ready');f.registry.configure=configure;
 assert.equal(new TeamSetup(new Projects(f.home)).connect(f.scope).status,'connected');
 f.registry.updateMembers({projectId:'fixture',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:f.registry.get('fixture').members.filter(m=>m.id!=='qa')});
 const bytes=fs.readFileSync(f.registry.file);assert.equal(f.team.connect(f.scope).currentRosterMatches,false);assert.ok(fs.readFileSync(f.registry.file).equals(bytes));
});

test('team tools require explicit project/setup scope, expose no runtime and do not alter data on status reads',t=>{
 const f=fixture(t);assert.equal(call(f.registry,{...f.scope,operation:'status'}).isError,true);assert.equal(fs.existsSync(f.team.file),false);
 const plan=call(f.registry,{...f.plan,operation:'plan'});assert.equal(plan.isError,undefined);assert.equal(plan.structuredContent.roles.length,6);
 assert.equal(call(f.registry,{...f.scope,projectId:'another',operation:'status'}).isError,true);
 assert.equal(call(f.registry,{setupId:f.scope.setupId,operation:'status'}).isError,true);
 const bytes=fs.readFileSync(f.team.file);for(let i=0;i<3;i++)assert.equal(call(f.registry,{...f.scope,operation:'status'}).structuredContent.status,'planned');assert.ok(fs.readFileSync(f.team.file).equals(bytes));
 const receipt=call(f.registry,{...f.scope,operation:'approve',confirmed:true,choices:choices()}).structuredContent;assert.equal(receipt.saved,true);assert.equal(receipt.roles,undefined);assert.equal(receipt.models,undefined);
 assert.equal(f.registry.list().length,0);assert.throws(()=>handle({method:'turn/start'}));
});
