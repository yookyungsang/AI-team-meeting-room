import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {ReadGate} from '../host-plugin/read-gate.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {handle} from '../host-plugin/server.mjs';

const members=['director','one','qa'].map(id=>({id,name:'Fixture '+id,role:id,threadId:'fixture-chat-'+id,hostId:'fixture-host'}));
const data=()=>({request:{id:'fixture-request',status:'processing',jobs:[{memberId:'one',state:'reserved',requireFinalImage:true}],openQuestionCount:0},members,messages:[{text:'Original private content',details:'Exact evidence'}],followUps:[]});
const options={projectId:'alpha',requestId:'fixture-request',readerId:'one'};
function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'read-notice-'));
 t.after(()=>{assert(path.resolve(home).startsWith(path.resolve(base)+path.sep+'read-notice-'));fs.rmSync(home,{recursive:true,force:true});});
 const registry=new Projects(home);registry.configure({id:'alpha',name:'Fixture alpha',members});
 const store=new RoomStore(registry.roomPath('alpha'),registry.get('alpha'),()=>registry.get('alpha'));
 const requestId=randomUUID();store.submit({id:requestId,text:'Synthetic task',recipients:['director']});
 for(const memberId of ['director','one'])store.claim({requestId,memberId});
 return {registry,store,requestId,context:{projectId:'alpha',requestId}};
}
const call=(registry,name,args)=>handle({method:'tools/call',params:{name,arguments:args}},registry);
const ok=(registry,name,args)=>{const r=call(registry,name,args);assert(!r.isError,JSON.stringify(r));return r.structuredContent;};

test('unchanged rapid reads compact without sliding the expiry or caching content',()=>{
 let now=100;const gate=new ReadGate({clock:()=>now}),original=data();
 const first=gate.read(original,options,members);assert.deepEqual(first,original);assert.equal(first.messages[0].details,'Exact evidence');
 now+=1000;const repeat=gate.read(data(),options,members);assert.equal(repeat.unchanged,true);assert.equal(repeat.messages,undefined);assert.equal(repeat.request.jobs[0].requireFinalImage,true);assert.equal(repeat.retryAfterMs,29000);
 assert(!JSON.stringify([...gate.entries]).includes('Original private content'));
 now+=29000;assert(gate.read(data(),options,members).messages);
 now=0;assert(gate.read(data(),options,members).messages,'clock reversal must not suppress reads indefinitely');
});

test('readers, projects, requests and query options never suppress each other',()=>{
 const gate=new ReadGate();gate.read(data(),options,members);
 for(const change of [{readerId:'qa'},{projectId:'beta'},{requestId:'another'},{statusOnly:true},{includePrevious:true}])assert(gate.read(data(),{...options,...change},members).messages);
 assert(gate.read(data(),{...options,readerId:undefined},members).messages,'legacy anonymous caller stays compatible');
 assert(gate.read(data(),{...options,readerId:undefined},members).messages);
 assert.deepEqual(gate.read(data(),{...options,statusOnly:true},members),data(),'already compact status reads need no extra wrapper');
 assert.throws(()=>gate.read(data(),{...options,readerId:'outsider'},members));
});

test('changed results, follow-ups, errors and necessary full reads bypass compaction',()=>{
 const gate=new ReadGate();gate.read(data(),options,members);
 for(const mutate of [d=>d.messages.push({text:'New result'}),d=>d.followUps.push({id:'addition',text:'Human change',status:'pending'}),d=>d.request.jobs[0].error='Actual failure',d=>d.members[1].role='Revised role']){
  const next=data();mutate(next);assert(gate.read(next,options,members).messages);
 }
 for(const refreshReason of ['decision','recovery','evidence','user_request']){
  gate.read(data(),options,members);assert(gate.read(data(),{...options,refreshReason},members).messages);
 }
 assert.throws(()=>gate.read(data(),{...options,refreshReason:'poll'},members));
 const failed=data();failed.request.jobs[0].state='failed';failed.request.jobs[0].error='Actual failure';gate.read(failed,options,members);
 assert.equal(gate.read(failed,options,members).request.jobs[0].error,'Actual failure');
 const bounded=new ReadGate({maxEntries:2});for(let i=0;i<8;i++)bounded.read(data(),{...options,requestId:'request-'+i},members);assert.equal(bounded.entries.size,2);
});

test('MCP reads compact only scoped repeats and preserve full UI and legacy reads',t=>{
 const f=fixture(t),args={...f.context,readerId:'one'},bytes=fs.readFileSync(f.store.file);
 assert(ok(f.registry,'room_get',args).messages);
 assert.equal(ok(f.registry,'room_get',args).unchanged,true);
 assert(ok(f.registry,'room_get',{...args,readerId:'qa'}).messages);
 assert(ok(f.registry,'room_get',{...args,refreshReason:'recovery'}).messages);
 assert(ok(f.registry,'room_get',f.context).messages);assert(ok(f.registry,'room_get',f.context).messages);
 assert(ok(f.registry,'room_state',{projectId:'alpha'}).messages);assert(ok(f.registry,'room_state',{projectId:'alpha'}).messages);
 assert(fs.readFileSync(f.store.file).equals(bytes),'reads must not write history');
 assert(ok(new Projects(f.registry.home),'room_get',args).messages,'fresh server/cache returns full content');
 assert.equal(call(f.registry,'room_get',{...args,readerId:'outsider'}).isError,true);
 assert.equal(call(f.registry,'room_get',{...args,requestId:randomUUID()}).isError,true);
 assert.equal(call(f.registry,'room_get',{...args,projectId:'unknown'}).isError,true);
 ok(f.registry,'room_submit',{projectId:'alpha',id:randomUUID(),text:'Human addition',recipients:['director'],followUpTo:f.requestId});
 assert.equal(ok(f.registry,'room_get',args).followUps[0].text,'Human addition');
});

test('a blocking question keeps full room content and issues one short director notice',t=>{
 const f=fixture(t),text='  구체적인 판단이 필요한 질문입니다.\n'+('설명 '.repeat(180)),details='Exact fixture evidence\nKeep every line.';
 const args={...f.context,memberId:'one',kind:'question',toMemberId:'director',messageKey:'blocking-question',text,details,notifyDirector:true};
 const first=ok(f.registry,'room_post',args);assert.equal(first.created,true);assert.equal(first.directorNotice.dispatch,true);
 assert.equal(first.directorNotice.member.threadId,'fixture-chat-director');assert.equal(first.directorNotice.member.hostId,'fixture-host');
 assert(first.directorNotice.prompt.startsWith('[TEAM-ROOM-ALERT alpha '+f.requestId+' '+first.message.id+']'));
 assert(first.directorNotice.prompt.length<500);assert(!first.directorNotice.prompt.includes(details));assert(!first.directorNotice.prompt.includes(text));
 const saved=f.store.get(f.requestId).messages.find(m=>m.id===first.message.id);assert.equal(saved.text,text);assert.equal(saved.details,details);assert.equal(saved.toMemberId,'director');
 assert.equal(f.store.get(f.requestId).request.openQuestionCount,1);assert.equal(f.store.get(f.requestId).messages.filter(m=>m.kind==='question').length,1);
 const replay=ok(new Projects(f.registry.home),'room_post',args);assert.equal(replay.created,false);assert.equal(replay.directorNotice.dispatch,false);assert.equal(replay.directorNotice.prompt,undefined);
 assert.equal(call(f.registry,'room_post',{...args,notifyDirector:false}).isError,true);
 assert.equal(call(f.registry,'room_post',{...args,text:'Changed retry'}).isError,true);
 assert.throws(()=>f.store.reply({requestId:f.requestId,memberId:'one',text:'Premature completion'}));
});

test('director escalation does not retarget peer questions or permit duplicate completion notices',t=>{
 const f=fixture(t),args={...f.context,memberId:'one',kind:'question',toMemberId:'qa',messageKey:'peer-needs-decision',text:'A real blocking decision',notifyDirector:true};
 const result=ok(f.registry,'room_post',args);assert.equal(result.message.toMemberId,'qa');assert.equal(result.directorNotice.member.id,'director');
 assert.equal(call(f.registry,'room_post',{...f.context,memberId:'director',kind:'answer',toMemberId:'one',replyTo:result.message.id,messageKey:'wrong-responder',text:'Cannot impersonate QA'}).isError,true);
 ok(f.registry,'room_post',{...f.context,memberId:'qa',kind:'answer',toMemberId:'one',replyTo:result.message.id,messageKey:'qa-answer',text:'Actual QA response'});
 ok(f.registry,'room_reply',{...f.context,memberId:'one',text:'Own completed work'});ok(f.registry,'room_reply',{...f.context,memberId:'director',text:'Integrated result'});
 assert.equal(ok(f.registry,'room_post',args).directorNotice.dispatch,false);
});

test('routine progress never notifies, blockers can notify, and invalid notice requests are rejected',t=>{
 const f=fixture(t),base={...f.context,memberId:'one',messageKey:'routine',text:'Actual progress'};
 assert.equal(ok(f.registry,'room_post',{...base,kind:'progress'}).directorNotice,undefined);
 for(const change of [{kind:'progress',notifyDirector:true},{kind:'decision',notifyDirector:true},{kind:'blocker',notifyDirector:'true'},{kind:'blocker',memberId:'director',notifyDirector:true}])assert.equal(call(f.registry,'room_post',{...base,...change,messageKey:randomUUID()}).isError,true);
 const blocked=ok(f.registry,'room_post',{...base,kind:'blocker',messageKey:'actual-blocker',notifyDirector:true});assert.equal(blocked.directorNotice.dispatch,true);
 assert.equal(f.store.get(f.requestId).messages.filter(m=>m.notifyDirector).length,1);
});

test('the same question ID in another project never shares notification routing',t=>{
 const f=fixture(t);f.registry.configure({id:'beta',name:'Fixture beta',members:members.map(m=>({...m,threadId:'beta-'+m.threadId}))});
 const beta=new RoomStore(f.registry.roomPath('beta'),f.registry.get('beta'));beta.submit({id:f.requestId,text:'Other synthetic task',recipients:['director']});beta.claim({requestId:f.requestId,memberId:'one'});
 for(const projectId of ['alpha','beta']){
  const result=ok(f.registry,'room_post',{projectId,requestId:f.requestId,memberId:'one',kind:'question',toMemberId:'director',messageKey:'same-key',text:'Actual blocking question',notifyDirector:true});
  assert.equal(result.directorNotice.dispatch,true);assert.equal(result.directorNotice.member.threadId,(projectId==='beta'?'beta-':'')+'fixture-chat-director');
 }
});
