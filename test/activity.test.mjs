import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {WorkControl,fileHash} from '../host-plugin/control.mjs';
import {Validation} from '../host-plugin/validation.mjs';
import {activitySummary,recoveryGuide} from '../host-plugin/activity.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';

function fixture(t){
 const base=path.resolve('.local/test-data');fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'activity-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const members=['director','dev','qa'].map(id=>({id,name:'Fixture '+id,role:id,threadId:'fixture-chat-'+id,hostId:'local'}));
 const registry=new Projects(home);registry.configure({id:'example',name:'Synthetic work',members});
 const store=new RoomStore(registry.roomPath('example'),registry.get('example')),control=new WorkControl(store,home),requestId=randomUUID();
 store.submit({id:requestId,text:'Synthetic task',recipients:['director']});store.claim({requestId,memberId:'director'});store.claim({requestId,memberId:'dev'});
 const call=(name,args={})=>handle({method:'tools/call',params:{name,arguments:{projectId:'example',...args}}},registry);
 return {home,registry,store,control,requestId,call};
}

test('overview counts full history, unique awaiting members and unanswered questions without native inference',t=>{
 const f=fixture(t),requestId2=randomUUID();f.store.submit({id:requestId2,text:'Second task',recipients:['director']});f.store.claim({requestId:requestId2,memberId:'director'});
 f.store.post({requestId:f.requestId,memberId:'dev',kind:'question',toMemberId:'director',messageKey:'ask',text:'Which option?'});
 f.store.change(r=>{for(let i=0;i<180;i++)r.messages.push({id:'filler-'+i,requestId:requestId2,kind:'progress',authorId:'director',text:'Synthetic filler'});});
 const paged=f.call('room_state',{history:true}).structuredContent;
 assert.equal(paged.messages.some(m=>m.kind==='question'),false);assert.equal(paged.activity.openQuestions,1);
 assert.equal(paged.activity.awaitingMembers,2);assert.equal(paged.activity.activeRequests,2);
 assert.equal(Object.hasOwn(paged.activity,'stopped'),false);
 const unchanged=f.call('room_state',{history:true,knownRevision:paged.history.revision}).structuredContent;
 assert.equal(unchanged.history.unchanged,true);assert.deepEqual(unchanged.activity,paged.activity);assert.deepEqual(unchanged.messages,[]);
 assert.equal(f.call('room_state').structuredContent.activity,undefined,'default model reads do not add presentation context');
 const q=f.store.read().messages.find(m=>m.kind==='question');f.store.post({requestId:f.requestId,memberId:'director',kind:'answer',toMemberId:'dev',replyTo:q.id,messageKey:'answer',text:'Use the first option.'});
 assert.equal(activitySummary(f.store.read()).openQuestions,0);
});

test('guide reads checkpoints, ownership, failure and running validation without changing original records',t=>{
 const f=fixture(t),root=path.join(f.home,'workspace');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'example.txt'),'Original');
 f.control.configure({memberId:'director',workspaceRoot:root});
 f.control.acquire({requestId:f.requestId,memberId:'dev',key:'files',paths:['example.txt']});
 f.control.checkpoint({requestId:f.requestId,memberId:'dev',summary:'Part implemented',nextSteps:['Finish then hand off'],paths:['example.txt']});
 const v=new Validation(f.control),caseId=v.define({requestId:f.requestId,memberId:'director',caseId:'sample',label:'Synthetic validation',signature:'synthetic'}).caseId;
 v.begin({requestId:f.requestId,memberId:'dev',caseId,key:'first'});
 f.store.fail({requestId:f.requestId,memberId:'dev',reason:'Native task stopped'});
 const before=[fileHash(f.store.file),fileHash(f.control.file)],data=f.call('room_recovery_guide',{requestId:f.requestId}).structuredContent;
 assert.deepEqual([fileHash(f.store.file),fileHash(f.control.file)],before);
 const dev=data.jobs.find(j=>j.memberId==='dev');assert.equal(dev.state,'failed');assert.deepEqual(dev.locks,['example.txt']);assert.equal(dev.checkpoint.summary,'Part implemented');assert.deepEqual(dev.checkpoint.nextSteps,['Finish then hand off']);
 assert.equal(data.checks[0].running,true);assert.equal(data.readOnly,true);assert.equal(data.recordTrust,'reference_not_authorization');
 assert.equal(data.dispatch,undefined);assert.equal(data.confirmedStopped,undefined);assert(!JSON.stringify(data).includes('fixture-chat-'));assert(!JSON.stringify(data).includes(root.replaceAll('\\','\\\\')));
 for(let i=0;i<3;i++)recoveryGuide(new WorkControl(f.store,f.home),{requestId:f.requestId});assert.deepEqual([fileHash(f.store.file),fileHash(f.control.file)],before);
});

test('guide preserves scope, shows absent checkpoints honestly and excludes completed jobs from recovery choices',t=>{
 const f=fixture(t),data=recoveryGuide(f.control);assert.equal(data.jobs.find(j=>j.memberId==='dev').checkpoint,null);
 assert(f.call('room_recovery_guide',{requestId:randomUUID()}).isError);assert.throws(()=>f.call('room_recovery_guide',{confirmedStopped:true}),/요청 필드/);
 assert(handle({method:'tools/call',params:{name:'room_recovery_guide',arguments:{}}},f.registry).isError);
 const definition=TOOLS.find(t=>t.name==='room_recovery_guide');assert.deepEqual(definition._meta.ui.visibility,['app']);assert.deepEqual(definition.annotations,{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false});
 f.store.reply({requestId:f.requestId,memberId:'dev',text:'Done'});f.store.reply({requestId:f.requestId,memberId:'director',text:'Integrated'});
 const complete=recoveryGuide(f.control);assert.equal(complete.requestId,null);assert.deepEqual(complete.choices,[]);assert.equal(complete.summary.activeRequests,0);
 assert.equal(recoveryGuide(f.control,{requestId:f.requestId}).status,'completed','a previously selected completed task stays visible as completed');
});

test('guide associates tests with the selected request and current approval generation',t=>{
 const f=fixture(t),v=new Validation(f.control),actor={requestId:f.requestId,memberId:'director'},caseId=v.define({...actor,caseId:'case',label:'Fixture check',signature:'sample'}).caseId;
 const attempt=v.begin({...actor,caseId,key:'first'}).attempt;v.result({...actor,caseId,attemptId:attempt.id,status:'blocked',summary:'Missing environment'});
 assert.equal(recoveryGuide(f.control).checks[0].blocked,true);
 v.resume({...actor,caseId,operation:'resume',key:'approve',reason:'Environment repaired'});
 const check=recoveryGuide(f.control).checks[0];assert.equal(check.status,'pending');assert.equal(check.summary,'');assert.equal(check.blocked,false);
 const other=randomUUID();f.store.submit({id:other,text:'Other task',recipients:['director']});
 assert.deepEqual(recoveryGuide(f.control,{requestId:other}).checks,[]);
});
