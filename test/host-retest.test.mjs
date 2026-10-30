import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../host-plugin/store.mjs';
import {WorkControl} from '../host-plugin/control.mjs';
import {Validation} from '../host-plugin/validation.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';

function fixture(t){
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'team-room-retest-'));
 t.after(()=>{assert.equal(path.dirname(path.resolve(home)),path.resolve(os.tmpdir()));assert(path.basename(home).startsWith('team-room-retest-'));fs.rmSync(home,{recursive:true,force:true});});
 const members=['director','qa','developer'].map(id=>({id,name:id,role:id,threadId:'fixture-chat-'+id,hostId:'local'}));
 const registry=new Projects(home);registry.configure({id:'example',name:'Example',members});
 const store=new RoomStore(registry.roomPath('example'),registry.get('example')),control=new WorkControl(store,home),requestId=randomUUID();
 store.submit({id:requestId,text:'Synthetic validation request',recipients:['director']});for(const member of members)store.claim({requestId,memberId:member.id});
 const actor=memberId=>({requestId,memberId});return {home,registry,store,control,requestId,actor,v:new Validation(control)};
}
function checked(f,id,status='blocked'){
 const c=f.v.define({...f.actor('director'),caseId:id,label:id,signature:id});
 const run=f.v.begin({...f.actor('qa'),caseId:c.caseId,key:'initial'});
 f.v.result({...f.actor('qa'),caseId:c.caseId,attemptId:run.attempt.id,status,summary:'Synthetic '+status});return c.caseId;
}
function order(f,caseIds,extra={}){return {...f.actor('director'),operation:'retest',caseIds,toMemberId:'qa',key:'repair-1',reason:'Implementation repaired and the environment checked',summary:'Recheck the specified repaired cases only; preserve unrelated results.',...extra};}

test('director retest records batch approvals before one scoped assignment and preserves failed history',t=>{
 const f=fixture(t),ids=[checked(f,'domain'),checked(f,'ui')],untouched=checked(f,'other');
 const original=f.store.post.bind(f.store);f.store.post=args=>{for(const id of ids){assert.equal(f.control.state().cases[id].generation,1);assert.equal(f.control.state().cases[id].blocked,false);}return original(args);};
 const result=f.v.retest(order(f,ids));assert.equal(result.dispatch,true);assert.equal(result.member.threadId,'fixture-chat-qa');assert.equal(result.cases.length,2);assert.equal(new Set(result.cases.map(c=>c.key)).size,2);
 const posts=f.store.read().messages.filter(m=>m.kind==='assignment');assert.equal(posts.length,1);assert.equal(posts[0].authorId,'director');assert.equal(posts[0].kind,'assignment');assert.equal(posts[0].toMemberId,'qa');assert.equal(posts[0].text,order(f,ids).summary);
 for(const c of result.cases){assert.match(c.key,/^[a-zA-Z0-9_.:-]{1,120}$/);assert(posts[0].details.includes(c.key));assert.equal(f.control.state().cases[c.caseId].attempts.length,1);assert.equal(f.control.state().cases[c.caseId].decisions[0].action,'retest');}
 assert.equal(f.control.state().cases[untouched].blocked,true);assert.equal(f.control.state().cases[untouched].generation,0);assert.equal(f.control.summary().locks.length,0);
 const first=result.cases[0],begun=f.v.begin({...f.actor('qa'),...first});assert.equal(begun.created,true);assert.equal(begun.attempt.generation,1);
 f.v.result({...f.actor('qa'),caseId:first.caseId,attemptId:begun.attempt.id,status:'failed',summary:'A remaining defect'});
 assert.equal(f.v.begin({...f.actor('qa'),...first}).created,false);
 const retry=f.v.begin({...f.actor('qa'),caseId:first.caseId,key:'new-real-retry',analysis:'Inspected remaining defect'});
 f.v.result({...f.actor('qa'),caseId:first.caseId,attemptId:retry.attempt.id,status:'failed',summary:'Same defect'});
 assert.throws(()=>f.v.begin({...f.actor('qa'),caseId:first.caseId,key:'third',analysis:'No new repair'}),/차단/);
});

test('retest directive retries keep keys and approvals across restarts and reject changed bodies',t=>{
 const f=fixture(t),id=checked(f,'case'),args=order(f,[id]),first=f.v.retest(args);
 const reopened=new Validation(new WorkControl(f.store,f.home));const again=reopened.retest(args);
 assert.equal(again.dispatch,false);assert.equal(again.messageId,first.messageId);assert.deepEqual(again.cases,first.cases);assert.equal(f.control.state().cases[id].generation,1);assert.equal(f.control.state().cases[id].decisions.length,1);
 const other=checked(f,'other');for(const change of [{reason:'Different repair'},{summary:'Different scope'},{toMemberId:'developer'},{caseIds:[other]}])assert.throws(()=>reopened.retest({...args,...change}),/같은 재검증 지시 키/);
 assert.equal(f.store.read().messages.filter(m=>m.kind==='assignment').length,1);
});

test('invalid or unauthorized retest batches never partially approve or post instructions',t=>{
 const f=fixture(t),id=checked(f,'case'),running=f.v.define({...f.actor('director'),caseId:'running',label:'running',signature:'running'}).caseId;
 f.v.begin({...f.actor('qa'),caseId:running,key:'running'});
 const before=f.control.read(),messages=f.store.read().messages;
 const invalid=[{memberId:'qa'},{caseIds:[id,'missing']},{caseIds:[id,running]},{caseIds:[id,id]},{caseIds:[]},{caseIds:['constructor']},{reason:''},{summary:''},{key:'bad key'},{toMemberId:'missing'}];
 for(const change of invalid){assert.throws(()=>f.v.retest(order(f,[id],change)));assert.deepEqual(f.control.read(),before);assert.deepEqual(f.store.read().messages,messages);}
 f.store.change(s=>{s.requests[0].jobs.find(j=>j.memberId==='qa').state='completed';});
 assert.throws(()=>f.v.retest(order(f,[id])),/배정받은/);assert.deepEqual(f.control.read(),before);
});

test('approval-to-post interruptions recover without duplicate approval or uncertain native redelivery',t=>{
 for(const afterPost of [false,true]){
  const f=fixture(t),id=checked(f,'case'),args=order(f,[id]),post=f.store.post.bind(f.store);
  f.store.post=a=>{if(afterPost)post(a);throw new Error('Synthetic interrupted receipt');};
  assert.throws(()=>f.v.retest(args),/Synthetic/);const saved=f.control.state().retests[f.requestId+':'+args.key];assert.equal(f.control.state().cases[id].generation,1);
  f.store.post=post;const recovered=new Validation(new WorkControl(f.store,f.home)).retest(args);
  assert.equal(recovered.dispatch,!afterPost);assert.deepEqual(recovered.cases,saved.cases);assert.equal(f.control.state().cases[id].decisions.length,1);assert.equal(f.store.read().messages.filter(m=>m.kind==='assignment').length,1);
 }
});

test('superseded unexecuted retest keys cannot start a later generation or another participant',t=>{
 const f=fixture(t),id=checked(f,'case'),oldArgs=order(f,[id]),post=f.store.post.bind(f.store);
 f.store.post=()=>{throw new Error('Before post');};assert.throws(()=>f.v.retest(oldArgs));const old=f.control.state().retests[f.requestId+':repair-1'];f.store.post=post;
 const current=f.v.retest(order(f,[id],{key:'repair-2',reason:'Further repair changed the validation scope'}));
 const replay=f.v.retest(oldArgs);assert.equal(replay.dispatch,false);assert.equal(replay.superseded,true);assert.equal(f.store.read().messages.filter(m=>m.kind==='assignment').length,1);
 assert.throws(()=>f.v.begin({...f.actor('qa'),...old.cases[0]}),/이전 승인/);
 assert.throws(()=>f.v.begin({...f.actor('developer'),...current.cases[0]}),/다른 담당자/);
 assert.equal(f.v.begin({...f.actor('qa'),...current.cases[0]}).created,true);
});

test('a pending retest publication cannot revive a finished recipient, while saved receipts stay idempotent',t=>{
 const f=fixture(t),id=checked(f,'case'),args=order(f,[id]),post=f.store.post.bind(f.store);
 f.store.post=()=>{throw new Error('Before post');};assert.throws(()=>f.v.retest(args));f.store.post=post;
 f.store.change(s=>{s.requests[0].jobs.find(j=>j.memberId==='qa').state='completed';});
 assert.throws(()=>f.v.retest(args),/배정받은/);assert.equal(f.store.read().messages.filter(m=>m.kind==='assignment').length,0);
 const g=fixture(t),savedArgs=order(g,[checked(g,'saved')]),saved=g.v.retest(savedArgs);
 g.store.change(s=>{s.requests[0].status='completed';for(const job of s.requests[0].jobs)job.state='completed';});
 const receipt=g.v.retest(savedArgs);assert.equal(receipt.dispatch,false);assert.equal(receipt.messageId,saved.messageId);
});

test('required retests cannot complete using an earlier pass, including cases from another request',t=>{
 const f=fixture(t),id=checked(f,'case','passed');
 const next=randomUUID();f.store.submit({id:next,text:'Synthetic repaired follow-up',recipients:['director']});for(const memberId of ['director','qa'])f.store.claim({requestId:next,memberId});
 const args=order(f,[id],{requestId:next}),prepared=f.v.retest(args);
 assert.throws(()=>f.control.assertCompletable({requestId:next,memberId:'director'}),/아직 실행하지 않은 재검증/);
 const run=f.v.begin({requestId:next,memberId:'qa',...prepared.cases[0]});f.v.result({requestId:next,memberId:'qa',caseId:id,attemptId:run.attempt.id,status:'passed',summary:'Passed after the repair'});
 assert.doesNotThrow(()=>f.control.assertCompletable({requestId:next,memberId:'director'}));assert.equal(f.v.retest(args).dispatch,false);assert.equal(f.control.state().cases[id].attempts.length,2);
});

test('retest preserves Unity-wide blocking until the actual blocking cause is explicitly included',t=>{
 const f=fixture(t),cause=checked(f,'cause'),unity=checked(f,'unity'),manual=checked(f,'manual');
 f.control.change(s=>{s.cases[unity].mode='playmode';s.unityBlocked={caseId:cause,summary:'Synthetic environment block'};});
 assert.throws(()=>f.v.retest(order(f,[unity])),/차단 원인/);assert.equal(f.control.state().cases[unity].generation,0);
 f.v.retest(order(f,[manual],{key:'manual-repair'}));assert.equal(f.control.state().unityBlocked.caseId,cause);
 f.v.retest(order(f,[cause,unity]));assert.equal(f.control.state().unityBlocked,undefined);
});

test('MCP retest needs explicit project and director identity, and missing run keys give actionable guidance',t=>{
 const f=fixture(t),id=checked(f,'case'),call=args=>handle({method:'tools/call',params:{name:'room_validation',arguments:args}},f.registry);
 assert.equal(call(order(f,[id])).isError,true);assert.equal(call({...order(f,[id]),projectId:'example',memberId:'qa'}).isError,true);
 const result=call({...order(f,[id]),projectId:'example'});assert.equal(result.structuredContent.dispatch,true);assert.equal(result.structuredContent.cases[0].caseId,id);
 assert.equal(TOOLS.length,19);assert(TOOLS.find(t=>t.name==='room_validation').inputSchema.properties.operation.enum.includes('retest'));
 for(const key of [undefined,'','bad key','한글','a'.repeat(121)])assert.throws(()=>f.v.begin({...f.actor('qa'),caseId:id,key}),/새 검증 실행에는 새 key/);
 assert.equal(f.control.state().cases[id].attempts.length,1);
});
