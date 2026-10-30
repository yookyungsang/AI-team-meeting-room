import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {WorkControl,transaction} from '../host-plugin/control.mjs';
import {Validation} from '../host-plugin/validation.mjs';
import {UsageLedger} from '../host-plugin/usage.mjs';
import {handle} from '../host-plugin/server.mjs';

const member=id=>({id,name:'Fixture '+id,role:id,threadId:'fixture-chat-'+id,hostId:'local'});
const roster=['director','one','qa'].map(member);
function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'members-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const registry=new Projects(home);registry.configure({id:'example',name:'Example',members:roster});
 const store=new RoomStore(registry.roomPath('example'),registry.get('example'),()=>registry.get('example'));
 const control=new WorkControl(store,home),update=members=>registry.updateMembers({projectId:'example',memberId:'director',expectedRevision:registry.get('example').revision||1,changeId:randomUUID(),members});
 const task=()=>{const id=randomUUID();store.submit({id,text:'  Synthetic request\n',recipients:['director']});store.claim({requestId:id,memberId:'director'});return id;};
 return {home,registry,store,control,update,task};
}
const call=(registry,name,args={})=>handle({method:'tools/call',params:{name,arguments:args}},registry);
const ok=(registry,name,args)=>{const result=call(registry,name,args);assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent;};

test('project-scoped roster choices are prepared once without activating staff or exposing routes',t=>{
 const f=fixture(t),requestId=f.task(),args={projectId:'example',operation:'register',memberId:'director',requestId,verified:true,candidates:[member('designer')]};
 assert.equal(call(f.registry,'room_roster',{...args,memberId:'qa'}).isError,true);assert.equal(call(f.registry,'room_roster',{...args,verified:false}).isError,true);
 const saved=ok(f.registry,'room_roster',args);assert.equal(saved.count,1);assert.deepEqual(f.registry.get('example').members,roster);
 const view=ok(f.registry,'room_roster',{projectId:'example',operation:'read'});assert.equal(view.choices.length,4);assert(!JSON.stringify(view).includes('threadId'));assert(!JSON.stringify(view).includes('hostId'));
 const candidate=view.choices.find(c=>c.name==='Fixture designer');assert.match(candidate.id,/^member_/);
 assert.equal(ok(f.registry,'room_roster',args).replayed,true);assert.equal(call(f.registry,'room_roster',{...args,candidates:[member('different')]}).isError,true);
 f.registry.configure({id:'other',name:'Other',members:roster});assert.equal(f.registry.roster('other').choices.length,3);
 const nextRequest=f.task();ok(f.registry,'room_roster',{...args,requestId:nextRequest,candidates:[member('newer')]});const before=f.registry.roster('example');
 ok(f.registry,'room_roster',args);assert.deepEqual(f.registry.roster('example'),before);
});
test('visual roster selections resolve routing server-side, preserve history and deduplicate explicit saves',t=>{
 const f=fixture(t);f.update([roster[0],roster[1]]);const view=f.registry.roster('example');
 const edit={projectId:'example',operation:'apply',memberId:'director',expectedRevision:view.revision,optionsRevision:view.optionsRevision,changeId:randomUUID(),selection:[...view.members,view.choices.find(c=>c.id==='qa')].map(m=>({...m,threadId:'forged-route'}))};
 const result=ok(f.registry,'room_roster',edit);assert.equal(result.members.length,3);assert.equal(f.registry.get('example').members.find(m=>m.id==='qa').threadId,'fixture-chat-qa');
 assert.equal(ok(f.registry,'room_roster',edit).replayed,true);assert.equal(f.registry.get('example').memberChanges.length,2);
 for(const selection of [[view.members[1]],[...view.members,{id:'unknown',name:'Unknown',role:'QA'}],[...view.members,view.members[1]]])assert.equal(call(f.registry,'room_roster',{...edit,changeId:randomUUID(),expectedRevision:result.revision,selection}).isError,true);
 assert.equal(f.registry.get('example').members.length,3);
 f.update([roster[0]]);const replay=ok(f.registry,'room_roster',edit);assert.equal(replay.members.length,1);assert.equal(replay.replayed,true);
});
test('visual selections cannot exceed the team limit or replace the director route',t=>{
 const f=fixture(t),requestId=f.task();ok(f.registry,'room_roster',{projectId:'example',operation:'register',memberId:'director',requestId,verified:true,candidates:Array.from({length:21},(_,i)=>member('extra'+i))});
 const view=f.registry.roster('example'),edit={projectId:'example',operation:'apply',memberId:'director',expectedRevision:view.revision,optionsRevision:view.optionsRevision,changeId:randomUUID()};
 assert.equal(call(f.registry,'room_roster',{...edit,selection:view.choices.slice(0,21)}).isError,true);
 assert.equal(call(f.registry,'room_roster',{...edit,selection:view.members.filter(m=>m.id!=='director')}).isError,true);assert.equal(f.registry.get('example').revision,1);
});
test('visual edits preserve busy-member and revision guards, including stale candidate lists',t=>{
 const f=fixture(t),requestId=f.task();f.store.claim({requestId,memberId:'qa'});const view=f.registry.roster('example');
 const edit={projectId:'example',operation:'apply',memberId:'director',expectedRevision:view.revision,optionsRevision:view.optionsRevision,changeId:randomUUID(),selection:view.members.filter(m=>m.id!=='qa')};
 assert.equal(call(f.registry,'room_roster',edit).isError,true);assert.equal(f.registry.get('example').revision,1);
 ok(f.registry,'room_roster',{projectId:'example',operation:'register',memberId:'director',requestId,verified:true,candidates:[member('designer')]});
 assert.equal(call(f.registry,'room_roster',{...edit,selection:view.members}).isError,true);
 assert.equal(f.registry.get('example').revision,1);assert.equal(f.store.read().requests[0].jobs.find(j=>j.memberId==='qa').state,'reserved');
});

test('roster edits add members and change labels in place without waking or creating room/control data',t=>{
 const f=fixture(t),next=[roster[0],{...roster[1],name:'New display name',role:'developer'},roster[2],member('two')];
 const result=f.update(next);assert.equal(result.revision,2);assert.equal(result.replayed,false);assert.deepEqual(result.members,next);
 assert.equal(fs.existsSync(f.store.file),false);assert.equal(fs.existsSync(f.control.file),false);
 const state=ok(f.registry,'room_state',{projectId:'example'});assert.equal(state.project.revision,2);assert.deepEqual(state.members,next);assert.equal(state.requests.length,0);
 const id=f.task(),job=f.store.claim({requestId:id,memberId:'two'});assert.equal(job.dispatch,true);assert.equal(job.member.threadId,'fixture-chat-two');
 assert.equal(f.store.claim({requestId:id,memberId:'two'}).dispatch,false);
 assert.equal(f.registry.configure({id:'example',name:'Example',members:next}).created,false);
});

test('an assigned member needs a real handoff before removal, and the replacement keeps image requirements',t=>{
 const f=fixture(t),id=f.task();f.update([...roster,member('two')]);f.store.claim({requestId:id,memberId:'one',requireFinalImage:true});
 const next=[roster[0],roster[2],member('two')],before=fs.readFileSync(f.registry.file);
 assert.throws(()=>f.update(next),/진행 중/);assert.ok(fs.readFileSync(f.registry.file).equals(before));
 f.control.checkpoint({requestId:id,memberId:'one',summary:'Synthetic checkpoint',nextSteps:['Finish art'],paths:[]});
 const handoff={requestId:id,memberId:'director',fromMemberId:'one',toMemberId:'two',confirmedStopped:true,reason:'Explicit synthetic handoff',key:'handoff'};
 assert.equal(f.control.recover(handoff).requireFinalImage,true);
 const roomBefore=fs.readFileSync(f.store.file),controlBefore=fs.readFileSync(f.control.file);f.update(next);
 assert.ok(fs.readFileSync(f.store.file).equals(roomBefore));assert.ok(fs.readFileSync(f.control.file).equals(controlBefore));
 assert.equal(f.store.claim({requestId:id,memberId:'one'}).dispatch,false);assert.equal(f.control.recover(handoff).dispatch,false);
 assert.throws(()=>f.store.claim({requestId:f.task(),memberId:'one'}),/현재 회의실/);
 assert.equal(f.store.get(id).request.jobs.find(j=>j.memberId==='two').requireFinalImage,true);
});

test('unanswered questions block removing either endpoint, while completed post retries stay immutable',t=>{
 const f=fixture(t),id=f.task(),question={requestId:id,memberId:'director',kind:'question',toMemberId:'qa',messageKey:'q',text:'Synthetic question'};
 const posted=f.store.post(question),next=roster.filter(m=>m.id!=='qa');assert.throws(()=>f.update(next),/질문/);
 const answer={requestId:id,memberId:'qa',kind:'answer',toMemberId:'director',replyTo:posted.message.id,messageKey:'answer',text:'Synthetic answer'};
 f.store.post(answer);const roomBefore=fs.readFileSync(f.store.file);f.update(next);
 assert.equal(f.store.post(answer).created,false);assert.ok(fs.readFileSync(f.store.file).equals(roomBefore));
 assert.throws(()=>f.store.post({...question,messageKey:'new-question'}),/제외된 담당자/);
 assert.throws(()=>f.store.post({...answer,messageKey:'new-answer'}),/제외된 담당자/);
 assert.equal(f.store.get(id).members.find(m=>m.id==='qa').retired,true);
 const unrelated=f.task();assert.equal(f.store.get(unrelated).members.some(m=>m.id==='qa'),false);
 assert.equal(f.store.get(unrelated,{includePrevious:true}).members.find(m=>m.id==='qa').retired,true);
});

test('file leases and running validations independently block removal without altering ownership or attempts',t=>{
 const f=fixture(t),id=f.task(),root=path.join(f.home,'workspace');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'Example.cs'),'fixture');
 f.control.configure({memberId:'director',workspaceRoot:root});f.store.claim({requestId:id,memberId:'one'});
 const lease=f.control.acquire({requestId:id,memberId:'one',paths:['Example.cs'],key:'edit'});f.store.fail({requestId:id,memberId:'one',reason:'Synthetic stop'});
 assert.throws(()=>f.update(roster.filter(m=>m.id!=='one')),/소유권/);
 f.control.release({requestId:id,memberId:'one',leaseId:lease.leaseId});f.update(roster.filter(m=>m.id!=='one'));
 assert.equal(f.control.release({requestId:id,memberId:'one',leaseId:lease.leaseId}).released,true);
 f.store.claim({requestId:id,memberId:'qa'});const validation=new Validation(f.control);
 const c=validation.define({requestId:id,memberId:'director',caseId:'check',label:'Synthetic check',signature:'fixture-check'});
 const run=validation.begin({requestId:id,memberId:'qa',caseId:c.caseId,key:'run'});f.store.fail({requestId:id,memberId:'qa',reason:'Synthetic validation stop'});
 const before=fs.readFileSync(f.control.file);assert.throws(()=>f.update([roster[0]]),/검증/);assert.ok(fs.readFileSync(f.control.file).equals(before));
 validation.cancel({requestId:id,memberId:'director',operation:'reconcile',caseId:c.caseId,attemptId:run.attempt.id,confirmedStopped:true,reason:'Synthetic validation has stopped'});
 f.update([roster[0]]);assert.equal(f.control.state().cases[c.caseId].attempts[0].status,'blocked');
});

test('roster revisions and fixed change IDs reject stale edits and replay without undoing newer changes',t=>{
 const f=fixture(t),edit={projectId:'example',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:[...roster,member('two')]};
 assert.equal(ok(f.registry,'room_members',edit).revision,2);const bytes=fs.readFileSync(f.registry.file);
 assert.equal(ok(f.registry,'room_members',edit).replayed,true);assert.ok(fs.readFileSync(f.registry.file).equals(bytes));
 assert.equal(call(f.registry,'room_members',{...edit,members:roster}).isError,true);
 assert.equal(call(f.registry,'room_members',{...edit,changeId:randomUUID()}).isError,true);
 f.update([...roster,member('two'),member('three')]);const replay=ok(f.registry,'room_members',edit);
 assert.equal(replay.appliedRevision,2);assert.equal(replay.revision,3);assert.equal(replay.members.length,5);
 assert.equal(call(f.registry,'room_members',{...edit,memberId:'qa'}).isError,true);
 assert.equal(call(f.registry,'room_members',{...edit,projectId:'other'}).isError,true);
 assert.equal(call(f.registry,'room_members',{...edit,expectedRevision:undefined}).isError,true);
});

test('member IDs and chats cannot be recycled, including the director, while an idle retired member can rejoin',t=>{
 const f=fixture(t);f.update([roster[0]]);
 for(const changed of [{...roster[1],threadId:'new-chat'},{...roster[1],hostId:'other-host'},{...roster[1],id:'replacement'}])assert.throws(()=>f.update([roster[0],changed]),/ID|중복/);
 assert.throws(()=>f.update([{...roster[0],threadId:'new-director'}]),/기존 담당자 ID/);
 assert.throws(()=>f.update([member('qa')]),/총괄/);
 assert.throws(()=>f.update([roster[0],...Array.from({length:20},(_,i)=>member('worker'+i))]),/1~20/);
 f.update(roster);assert.equal(f.registry.get('example').retiredMembers.length,0);assert.equal(f.store.members.length,3);
 const id=f.task();assert.equal(f.store.claim({requestId:id,memberId:'one'}).member.threadId,roster[1].threadId);
});

test('legacy records, source routes and measured participant usage survive removal and restart unchanged',t=>{
 const f=fixture(t),id=f.task();f.store.claim({requestId:id,memberId:'one'});
 const answer={requestId:id,memberId:'one',text:'Original answer',sourceThreadId:roster[1].threadId,sourceTurnId:'fixture-turn',sourceMessageId:'fixture-message'};
 f.store.reply(answer);f.store.reply({requestId:id,memberId:'director',text:'Integrated result'});
 f.store.change(state=>{const r=state.requests[0];r.createdAt='2026-01-01T10:00:00Z';for(const job of r.jobs){job.claimedAt=r.createdAt;job.completedAt='2026-01-01T10:02:00Z';}});
 const file=path.join(f.home,'usage.jsonl'),events=[{type:'session_meta',payload:{id:roster[1].threadId}},{type:'event_msg',timestamp:'2026-01-01T10:00:01Z',payload:{type:'task_started',turn_id:'new'}},{type:'event_msg',timestamp:'2026-01-01T10:01:00Z',payload:{type:'token_count',info:{total_token_usage:{input_tokens:50,output_tokens:10,total_tokens:60},last_token_usage:{input_tokens:50,output_tokens:10,total_tokens:60}}}},{type:'event_msg',timestamp:'2026-01-01T10:02:01Z',payload:{type:'task_complete'}}];
 fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');const usage=new UsageLedger(f.control);usage.attach({memberId:'director',sourceMemberId:'one',file});usage.sync();
 const report=usage.report(id),bytes=fs.readFileSync(f.store.file);f.update([roster[0],roster[2]]);
 fs.appendFileSync(file,JSON.stringify({type:'event_msg',timestamp:'2027-01-01T00:00:00Z',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:20,total_tokens:120}}}})+'\n');
 assert.equal(usage.sync().total.total_tokens,60);assert.throws(()=>usage.attach({memberId:'director',sourceMemberId:'one',file}),/현재 연결/);
 const reopened=new Projects(f.home),store=new RoomStore(reopened.roomPath('example'),reopened.get('example'));
 assert.equal(store.reply(answer).text,'Original answer');assert.equal(store.claim({requestId:id,memberId:'one'}).dispatch,false);
 assert.throws(()=>store.reply({...answer,sourceThreadId:'different-chat'}));assert.ok(fs.readFileSync(f.store.file).equals(bytes));
 assert.deepEqual(new UsageLedger(new WorkControl(store,f.home)).report(id),report);
 assert.equal(report.rows.find(r=>r.memberId==='one').usage.total_tokens,60);
 assert.equal(store.snapshot().formerMembers.find(m=>m.id==='one').name,roster[1].name);
 // A pre-revision registration also upgrades without rewriting its room file.
 transaction(f.registry.file,()=>({}),state=>{delete state.projects[0].revision;delete state.projects[0].memberChanges;});
 assert.equal(f.update([...f.registry.get('example').members,member('new')]).revision,2);assert.ok(fs.readFileSync(f.store.file).equals(bytes));
});

test('membership edits share live room/control locks and a reused store resolves the latest active roster',t=>{
 const f=fixture(t),args={projectId:'example',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:[roster[0]]};
 for(const file of [f.store.file,f.control.file])transaction(file,()=>({}),()=>assert.throws(()=>f.registry.updateMembers(args),/다른 작업/),{readOnly:true});
 assert.equal(f.registry.get('example').revision,1);f.registry.updateMembers(args);
 const id=f.task();assert.throws(()=>f.store.claim({requestId:id,memberId:'one'}),/현재 회의실/);
});

test('changing a meeting name or role preserves both legacy and newly authored report labels',t=>{
 const f=fixture(t),id=f.task();f.store.claim({requestId:id,memberId:'one'});f.store.reply({requestId:id,memberId:'one',text:'Earlier report'});
 f.store.change(state=>{delete state.messages.find(m=>m.authorId==='one').authorRole;});const bytes=fs.readFileSync(f.store.file);
 f.update(roster.map(m=>m.id==='one'?{...m,name:'Updated name',role:'Updated role'}:m));
 const old=f.store.get(id).messages.find(m=>m.authorId==='one');assert.equal(old.authorName,roster[1].name);assert.equal(old.authorRole,roster[1].role);assert.ok(fs.readFileSync(f.store.file).equals(bytes));
 const next=f.store.post({requestId:id,memberId:'one',kind:'progress',messageKey:'updated-report',text:'New report'}).message;
 assert.equal(next.authorName,'Updated name');assert.equal(next.authorRole,'Updated role');
});

test('concurrent processes cannot overwrite a roster revision or merge stale member selections',async t=>{
 const f=fixture(t),moduleUrl=new URL('../host-plugin/projects.mjs',import.meta.url).href;
 const run=async id=>{
  const args={projectId:'example',memberId:'director',expectedRevision:1,changeId:randomUUID(),members:[...roster,member(id)]};
  const script=`import {Projects} from ${JSON.stringify(moduleUrl)};try{new Projects(process.argv[1]).updateMembers(JSON.parse(process.argv[2]));process.stdout.write('saved');}catch{process.stdout.write('blocked');}`;
  const child=spawn(process.execPath,['--input-type=module','-e',script,f.home,JSON.stringify(args)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',error='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>error+=data);
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(error)));});return output;
 };
 const outcomes=await Promise.all([run('two'),run('three')]);assert.equal(outcomes.filter(o=>o==='saved').length,1);
 const state=f.registry.get('example');assert.equal(state.revision,2);assert.equal(state.members.length,4);assert.equal(state.memberChanges.length,1);
});
