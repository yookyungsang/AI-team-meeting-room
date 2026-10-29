import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {RoomStore} from '../host-plugin/store.mjs';
import {WorkControl,fileHash,transaction} from '../host-plugin/control.mjs';
import {Validation,parseNUnit} from '../host-plugin/validation.mjs';
import {UsageLedger,normalizeLimits} from '../host-plugin/usage.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {handle} from '../host-plugin/server.mjs';

const members=['director','one','two','qa'].map(id=>({id,name:id,role:id==='qa'?'QA':id,threadId:'fixture-chat-'+id,hostId:'local'}));
function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'team-room-control-'));
 t.after(()=>{assert.ok(path.resolve(home).startsWith(path.resolve(base)+path.sep+'team-room-control-'));fs.rmSync(home,{recursive:true,force:true});});
 const root=path.join(home,'workspace');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'Example.cs'),'original');
 const project={id:'example',name:'Example',members},store=new RoomStore(path.join(home,'rooms','example.json'),project),control=new WorkControl(store,home),requestId=randomUUID();
 store.submit({id:requestId,text:'Synthetic work',recipients:['director']});for(const m of members)store.claim({requestId,memberId:m.id});
 control.configure({memberId:'director',workspaceRoot:root});
 return {home,root,store,control,requestId,actor:memberId=>({requestId,memberId})};
}
test('exclusive file and Editor leases survive restart and conflict across project rooms',t=>{
 const f=fixture(t),first=f.control.acquire({...f.actor('one'),key:'edit',paths:['Example.cs']});
 assert.equal(f.control.acquire({...f.actor('one'),key:'edit',paths:['Example.cs']}).leaseId,first.leaseId);
 const reopened=new WorkControl(f.store,f.home);assert.throws(()=>reopened.acquire({...f.actor('two'),key:'other',paths:['Example.cs']}));
 assert.throws(()=>f.control.acquire({...f.actor('qa'),key:'editor',paths:['@editor']}));
 const otherStore=new RoomStore(path.join(f.home,'rooms','other.json'),{id:'other',name:'Other',members}),id=randomUUID();otherStore.submit({id,text:'other',recipients:['director']});otherStore.claim({requestId:id,memberId:'director'});
 const other=new WorkControl(otherStore,f.home);other.configure({memberId:'director',workspaceRoot:f.root});assert.throws(()=>other.acquire({requestId:id,memberId:'director',key:'duplicate',paths:['Example.cs']}));
 f.control.release({...f.actor('one'),leaseId:first.leaseId});const editor=f.control.acquire({...f.actor('qa'),key:'editor',paths:['@editor']});
 assert.throws(()=>f.control.acquire({...f.actor('one'),key:'again',paths:['Example.cs']}));f.control.release({...f.actor('qa'),leaseId:editor.leaseId});
});
test('guarded writes reject foreign owners, stale hashes, changed retries and path escapes',t=>{
 const f=fixture(t),lease=f.control.acquire({...f.actor('one'),key:'edit',paths:['Example.cs']}),input={...f.actor('one'),leaseId:lease.leaseId,path:'Example.cs',key:'save-1',content:'new',expectedHash:lease.paths[0].hash};
 assert.throws(()=>f.control.write({...input,memberId:'two'}));assert.throws(()=>f.control.write({...input,expectedHash:'missing'}));
 const saved=f.control.write(input);assert.equal(saved.hash,fileHash(path.join(f.root,'Example.cs')));assert.equal(f.control.write(input).replayed,true);assert.throws(()=>f.control.write({...input,content:'changed'}));
 fs.writeFileSync(path.join(f.root,'Example.cs'),'external');assert.throws(()=>f.control.write({...input,key:'save-2',expectedHash:saved.hash}));
 for(const bad of ['../outside.cs','/outside.cs','C:/outside.cs','.git/config','Assets/../Example.cs','Assets\\Example.cs'])assert.throws(()=>f.control.acquire({...f.actor('two'),key:'bad',paths:[bad]}));
 const outside=path.join(f.home,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.root,'link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>f.control.acquire({...f.actor('two'),key:'escape',paths:['link/file.cs']}));
});
test('recovery requires stopped-work confirmation, keeps checkpoints and only dispatches once',t=>{
 const f=fixture(t);f.control.acquire({...f.actor('one'),key:'edit',paths:['Example.cs']});f.control.checkpoint({...f.actor('one'),summary:'Implementation partly complete',nextSteps:['Finish method','Hand off to QA'],paths:['Example.cs']});
 fs.writeFileSync(path.join(f.root,'Example.cs'),'new after checkpoint');
 // The target is an existing unassigned chat, never a replacement identity.
 f.store.change(s=>{s.requests[0].jobs=s.requests[0].jobs.filter(j=>j.memberId!=='two');});
 const args={...f.actor('director'),key:'recover-1',fromMemberId:'one',toMemberId:'two',reason:'Old native task stopped'};
 assert.throws(()=>f.control.recover(args));const recovered=f.control.recover({...args,confirmedStopped:true});
 assert.equal(recovered.dispatch,true);assert.deepEqual(recovered.changedFiles,['Example.cs']);assert.equal(recovered.member.threadId,'fixture-chat-two');
 assert.equal(new WorkControl(f.store,f.home).recover({...args,confirmedStopped:true}).dispatch,false);
 assert.equal(f.store.read().requests[0].jobs.find(j=>j.memberId==='one').state,'superseded');assert.equal(f.control.summary().locks.length,0);
 f.store.reply({...f.actor('two'),text:'Recovered work finished'});f.store.reply({...f.actor('qa'),text:'QA finished'});f.store.reply({...f.actor('director'),text:'Integrated'});assert.equal(f.store.read().requests[0].status,'completed');
});
test('retry caps survive restarts and renamed aliases; blocked checks need explicit director action',t=>{
 const f=fixture(t),v=new Validation(f.control),director=f.actor('director'),qa=f.actor('qa'),defined=v.define({...director,caseId:'case-1',label:'Preserve data',signature:'save-preservation'});
 assert.throws(()=>v.define({...director,caseId:'renamed',label:'Preserve data',signature:'save-preservation'}));
 const first=v.begin({...qa,key:'first',caseId:defined.caseId});v.result({...qa,caseId:defined.caseId,attemptId:first.attempt.id,status:'failed',summary:'First failure'});
 assert.throws(()=>v.begin({...qa,key:'retry',caseId:defined.caseId}));
 const retry=new Validation(new WorkControl(f.store,f.home)).begin({...qa,key:'retry',caseId:defined.caseId,analysis:'Checked fixture and log'});
 assert.equal(v.result({...qa,caseId:defined.caseId,attemptId:retry.attempt.id,status:'failed',summary:'Same failure'}).blocked,true);
 assert.throws(()=>v.begin({...qa,key:'third',caseId:defined.caseId,analysis:'again'}));assert.throws(()=>f.control.assertCompletable(director));
 assert.throws(()=>v.resume({...qa,caseId:defined.caseId,operation:'resume',reason:'unauthorized'}));
 v.resume({...director,caseId:defined.caseId,operation:'resume',reason:'Implementation fixed; retest failed case only'});
 const fixed=v.begin({...qa,key:'fixed',caseId:defined.caseId});v.result({...qa,caseId:defined.caseId,attemptId:fixed.attempt.id,status:'passed',summary:'Passed after fix'});assert.throws(()=>v.begin({...qa,key:'repeat-pass',caseId:defined.caseId}));
 assert.equal(f.control.state().cases[defined.caseId].attempts.length,3);
});
test('recovery journal repairs a crash between the room and control commits without redispatch',t=>{
 const f=fixture(t);f.control.acquire({...f.actor('one'),key:'edit',paths:['Example.cs']});f.store.change(s=>{s.requests[0].jobs=s.requests[0].jobs.filter(j=>j.memberId!=='two');});
 const before=fs.readFileSync(f.control.file),args={...f.actor('director'),key:'recover-crash',fromMemberId:'one',toMemberId:'two',confirmedStopped:true,reason:'Verified interruption'};
 const first=f.control.recover(args);fs.writeFileSync(f.control.file,before);
 const restored=new WorkControl(f.store,f.home).recover(args);assert.equal(restored.repaired,true);assert.equal(restored.dispatch,false);assert.equal(restored.recoveryId,first.recoveryId);assert.equal(f.control.summary().locks.length,0);
});
test('manual result cannot overwrite an earlier verdict or accept an unassigned member',t=>{
 const f=fixture(t),v=new Validation(f.control),defined=v.define({...f.actor('director'),caseId:'manual',label:'Manual',signature:'manual'}),first=v.begin({...f.actor('qa'),caseId:defined.caseId,key:'first'});
 const result={...f.actor('qa'),caseId:defined.caseId,attemptId:first.attempt.id,status:'blocked',summary:'Editor unavailable'};v.result(result);assert.equal(v.result(result).saved,true);assert.throws(()=>v.result({...result,status:'passed'}));assert.throws(()=>v.begin({...f.actor('qa'),caseId:defined.caseId,key:'retry',analysis:'retry'}));
 assert.throws(()=>f.control.acquire({...f.actor('outsider'),key:'no',paths:['Example.cs']}));
});
test('usage import reads measured events once, validates identity and never persists chat text',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control),file=path.join(f.home,'rollout-fixture-chat-one.jsonl'),stamp=new Date().toISOString();
 const events=[{type:'session_meta',payload:{id:'fixture-chat-one'}},{type:'response_item',payload:{type:'message',content:'PRIVATE FIXTURE BODY'}},{type:'event_msg',timestamp:stamp,payload:{type:'task_started',turn_id:'turn-1'}},{type:'response_item',payload:{type:'function_call',name:'room_post'}},{type:'event_msg',timestamp:stamp,payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,cached_input_tokens:60,output_tokens:20,reasoning_output_tokens:10,total_tokens:120}}}},{type:'event_msg',timestamp:stamp,payload:{type:'task_complete'}}];
 fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');assert.throws(()=>usage.attach({memberId:'director',sourceMemberId:'two',file}));
 usage.attach({memberId:'director',sourceMemberId:'one',file});assert.equal(usage.sync().total.total_tokens,120);assert.equal(usage.sync().total.total_tokens,120);assert.equal(usage.summary().byActivity.meeting.total_tokens,120);
 assert.ok(!fs.readFileSync(usage.file,'utf8').includes('PRIVATE FIXTURE BODY'));
 const next={type:'event_msg',timestamp:stamp,payload:{type:'token_count',info:{total_token_usage:{input_tokens:150,cached_input_tokens:70,output_tokens:30,reasoning_output_tokens:10,total_tokens:180}}}};const encoded=JSON.stringify(next);
 fs.appendFileSync(file,encoded.slice(0,30));assert.equal(usage.sync().total.total_tokens,120);fs.appendFileSync(file,encoded.slice(30)+'\n');assert.equal(usage.sync().total.total_tokens,180);
});
test('completed usage reports are per participant, exclude old history and disclose missing records',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control),file=path.join(f.home,'usage.jsonl');
 f.store.change(s=>{const r=s.requests[0];r.createdAt='2026-01-01T10:00:00Z';for(const j of r.jobs){j.claimedAt=r.createdAt;j.completedAt='2026-01-01T10:02:00Z';j.state='completed';}r.status='completed';});
 const usageEvent=(input,output,at)=>({type:'event_msg',timestamp:at,payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:output,total_tokens:input+output}}}});
 const events=[{type:'session_meta',payload:{id:'fixture-chat-one'}},usageEvent(100,10,'2025-12-31T10:00:00Z'),{type:'event_msg',timestamp:'2026-01-01T10:00:01Z',payload:{type:'task_started',turn_id:'new'}},usageEvent(150,20,'2026-01-01T10:01:00Z'),{type:'event_msg',timestamp:'2026-01-01T10:02:01Z',payload:{type:'task_complete'}}];
 fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');usage.attach({memberId:'director',sourceMemberId:'one',file});usage.sync();
 const report=usage.report(f.requestId);assert.equal(report.rows.find(r=>r.memberId==='one').usage.total_tokens,60);assert.equal(report.total.total_tokens,60);assert.equal(report.rows.find(r=>r.memberId==='qa').usage,null);assert.equal(report.complete,false);
});
test('NUnit verdict refuses missing, truncated, empty and inconsistent evidence',()=>{
 assert.equal(parseNUnit('<test-run total="1" passed="1" failed="0" result="Passed"><test-case result="Passed"/></test-run>').passedAll,true);
 for(const xml of ['', '<test-run total="0" passed="0" failed="0" result="Passed"></test-run>','<test-run total="1" passed="1" failed="0" result="Passed"><test-case result="Failed"/></test-run>','<test-run total="1" passed="1" failed="0" result="Passed">'])assert.equal(parseNUnit(xml),null);
});
test('Unity runner executes once, parses XML and logs, and enforces Editor ownership',async t=>{
 const f=fixture(t),cli=path.join(f.home,'unity.exe');fs.writeFileSync(cli,'fixture executable');fs.mkdirSync(path.join(f.root,'ProjectSettings'));fs.writeFileSync(path.join(f.root,'ProjectSettings','ProjectVersion.txt'),'m_EditorVersion: fixture');f.control.configure({memberId:'director',workspaceRoot:f.root,unityCli:cli});
 const fake=path.join(f.home,'fake-unity.mjs');fs.writeFileSync(fake,`import fs from 'node:fs';import path from 'node:path';const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];fs.writeFileSync(value('-logFile'),'Initialize engine version: fixture');fs.writeFileSync(value('--output'),'<test-run total="1" passed="1" failed="0" result="Passed"><test-case result="Passed"/></test-run>');`);
 let launches=0;const v=new Validation(f.control,{launch:(_exe,args,options)=>{launches++;return spawn(process.execPath,[fake,...args],options);}}),lease=f.control.acquire({...f.actor('qa'),key:'editor',paths:['@editor']}),args={...f.actor('qa'),key:'play',mode:'playmode',leaseId:lease.leaseId};
 const first=v.start(args);assert.equal(first.started,true);assert.equal(v.start(args).started,false);assert.equal(launches,1);assert.throws(()=>f.control.release({...f.actor('qa'),leaseId:lease.leaseId}));
 const deadline=Date.now()+5000;while(f.control.state().cases[first.caseId].attempts[0].status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(f.control.state().cases[first.caseId].attempts[0].status,'passed');f.control.release({...f.actor('qa'),leaseId:lease.leaseId});
});
test('an already-open Editor blocks launch and server-restart reconciliation never kills an unrelated PID',t=>{
 const f=fixture(t),cli=path.join(f.home,'unity.exe');fs.writeFileSync(cli,'fixture');fs.mkdirSync(path.join(f.root,'ProjectSettings'));fs.writeFileSync(path.join(f.root,'ProjectSettings','ProjectVersion.txt'),'fixture');fs.mkdirSync(path.join(f.root,'Temp'));fs.writeFileSync(path.join(f.root,'Temp','UnityLockfile'),'fixture');f.control.configure({memberId:'director',workspaceRoot:f.root,unityCli:cli});
 const lease=f.control.acquire({...f.actor('qa'),key:'editor',paths:['@editor']}),v=new Validation(f.control,{launch:()=>{throw new Error('Must not launch');}}),run=v.start({...f.actor('qa'),leaseId:lease.leaseId,key:'compile',mode:'compile'});
 assert.equal(run.status,'blocked');assert.throws(()=>v.start({...f.actor('qa'),leaseId:lease.leaseId,key:'repeat',mode:'compile'}));
 const manual=v.define({...f.actor('director'),caseId:'pending',label:'Pending external check',signature:'pending'}),a=v.begin({...f.actor('qa'),caseId:manual.caseId,key:'pending'});
 assert.throws(()=>v.cancel({...f.actor('director'),operation:'reconcile',caseId:manual.caseId,attemptId:a.attempt.id}));
 assert.equal(v.cancel({...f.actor('director'),operation:'reconcile',caseId:manual.caseId,attemptId:a.attempt.id,confirmedStopped:true,reason:'Verified original task stopped'}).status,'blocked');
});
test('MCP control tools require explicit project scope and reject completion while leases remain',t=>{
 const f=fixture(t),registry=new Projects(f.home);registry.configure({id:'example',name:'Example',members});
 const call=(name,args)=>handle({method:'tools/call',params:{name,arguments:args}},registry);
 assert.equal(call('room_work',{operation:'status'}).isError,true);assert.equal(call('room_work',{projectId:'foreign',operation:'status'}).isError,true);
 const lease=f.control.acquire({...f.actor('director'),key:'owned',paths:['Example.cs']});assert.equal(call('room_reply',{projectId:'example',...f.actor('director'),text:'done'}).isError,true);f.control.release({...f.actor('director'),leaseId:lease.leaseId});
 assert.equal(call('room_usage',{projectId:'example',operation:'summary'}).structuredContent.available,false);
});
test('two independent processes cannot both reserve the same actual file',async t=>{
 const f=fixture(t),script=path.join(f.home,'reserve.mjs');
 fs.writeFileSync(script,`import {RoomStore} from ${JSON.stringify(new URL('../host-plugin/store.mjs',import.meta.url).href)};import {WorkControl} from ${JSON.stringify(new URL('../host-plugin/control.mjs',import.meta.url).href)};const [home,file,project,requestId,memberId]=process.argv.slice(2);const store=new RoomStore(file,JSON.parse(project));try{new WorkControl(store,home).acquire({requestId,memberId,key:'concurrent-'+memberId,paths:['Example.cs']});process.stdout.write('acquired');}catch{process.stdout.write('blocked');}`);
 const run=member=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,f.home,f.store.file,JSON.stringify(f.store.project),f.requestId,member],{shell:false,windowsHide:true});let output='';child.stdout.on('data',data=>output+=data);child.once('error',reject);child.once('close',()=>resolve(output));});
 const results=await Promise.all([run('one'),run('two')]);assert.deepEqual(results.sort(),['acquired','blocked']);
});
test('dead process storage locks recover while a live or unknown lock remains protected',async t=>{
 const f=fixture(t),file=path.join(f.home,'transaction.json');
 const child=spawn(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';fs.writeFileSync(process.argv[1],JSON.stringify({pid:process.pid,token:'fixture-owner'}));`,file+'.lock'],{shell:false,windowsHide:true});
 await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject);});
 transaction(file,()=>({value:0}),s=>s.value++);assert.equal(JSON.parse(fs.readFileSync(file)).value,1);
 fs.writeFileSync(file+'.lock',JSON.stringify({pid:process.pid,token:'live'}));assert.throws(()=>transaction(file,()=>({}),()=>{}));fs.unlinkSync(file+'.lock');
 fs.writeFileSync(file+'.lock','legacy unknown');assert.throws(()=>transaction(file,()=>({}),()=>{}));
});
test('usage discovery is scoped and overlapping native tasks never get invented token splits',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control),file=path.join(f.home,'fixture-chat-one.jsonl');
 f.store.change(s=>{s.requests[0].createdAt='2026-01-01T10:00:00Z';for(const j of s.requests[0].jobs){j.claimedAt='2026-01-01T10:00:00Z';j.completedAt='2026-01-01T10:02:00Z';j.state='completed';}s.requests[0].status='completed';s.requests.push({id:randomUUID(),createdAt:'2026-01-01T10:00:30Z',status:'processing',jobs:[{memberId:'one',claimedAt:'2026-01-01T10:00:30Z',state:'reserved'}]});});
 const events=[{type:'session_meta',payload:{id:'fixture-chat-one'}},{type:'event_msg',timestamp:'2026-01-01T10:00:10Z',payload:{type:'task_started',turn_id:'overlap'}},{type:'event_msg',timestamp:'2026-01-01T10:01:00Z',payload:{type:'token_count',info:{total_token_usage:{input_tokens:100,output_tokens:20},last_token_usage:{input_tokens:100,output_tokens:20}}}}];
 fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');fs.writeFileSync(path.join(f.home,'foreign.jsonl'),'{"type":"session_meta","payload":{"id":"unrelated"}}\n');
 assert.deepEqual(usage.discover({memberId:'director',file:f.home}).attachedMembers,['one']);usage.sync();const row=usage.report(f.requestId).rows.find(r=>r.memberId==='one');assert.equal(row.status,'overlap');assert.equal(row.usage,null);
});
test('Console errors, empty builds and absent evidence cannot become Unity success',async t=>{
 const f=fixture(t),cli=path.join(f.home,'unity.exe');fs.writeFileSync(cli,'fixture');fs.mkdirSync(path.join(f.root,'ProjectSettings'));fs.writeFileSync(path.join(f.root,'ProjectSettings','ProjectVersion.txt'),'fixture');f.control.configure({memberId:'director',workspaceRoot:f.root,unityCli:cli});
 const fake=path.join(f.home,'bad-unity.mjs');fs.writeFileSync(fake,`import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),v=k=>a[a.indexOf(k)+1];const log=v('--log-file');fs.writeFileSync(log,a[0]==='run'?'Initialize engine version: fixture\\nExample.cs(1,2): error CS0001: fixture compile error':'Initialize engine version: fixture');if(a[0]==='build'){const out=v('--output-path');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,'');}`);
 const v=new Validation(f.control,{launch:(_exe,args,options)=>spawn(process.execPath,[fake,...args],options)}),lease=f.control.acquire({...f.actor('qa'),key:'editor',paths:['@editor']});
 const wait=async run=>{const deadline=Date.now()+5000;while(f.control.state().cases[run.caseId].attempts.at(-1).status==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));return f.control.state().cases[run.caseId].attempts.at(-1).status;};
 const compile=v.start({...f.actor('qa'),key:'bad-compile',mode:'compile',leaseId:lease.leaseId});assert.equal(await wait(compile),'failed');
 const retry=v.start({...f.actor('qa'),key:'compile-retry',mode:'compile',analysis:'Compiler diagnostic reproduced',leaseId:lease.leaseId});assert.equal(await wait(retry),'failed');assert.throws(()=>v.start({...f.actor('qa'),key:'renamed',mode:'playmode',leaseId:lease.leaseId}));
 v.resume({...f.actor('director'),caseId:compile.caseId,operation:'resume',reason:'Verified repair before separate build'});
 const build=v.start({...f.actor('qa'),key:'empty-build',mode:'build',leaseId:lease.leaseId});assert.equal(await wait(build),'unverified');
});
test('account quota is reported separately from participant tokens and never inferred across resets',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control),limits=usedPercent=>[{bucket:'codex-fixture',window:'primary',usedPercent,windowDurationMins:10080,resetsAt:2000000000}];
 f.store.change(s=>{const r=s.requests[0];r.createdAt='2026-01-01T10:00:00Z';r.status='completed';for(const j of r.jobs){j.state='completed';j.claimedAt=r.createdAt;j.completedAt='2026-01-01T10:02:00Z';}});
 usage.recordLimits({memberId:'director',observedAt:'2026-01-01T09:59:59Z',limits:limits(10)});usage.recordLimits({memberId:'director',observedAt:'2026-01-01T10:02:01Z',limits:limits(14)});
 const report=usage.report(f.requestId);assert.equal(report.total,null);assert.equal(report.quota.rows[0].usedPercent,14);assert.equal(report.quota.rows[0].remainingPercent,86);assert.equal(report.quota.rows[0].changePercentagePoints,4);assert.ok(report.rows.every(row=>row.usage===null));
 const reset=new UsageLedger(f.control);transaction(reset.file,()=>({sources:{}}),s=>{s.hostLimits[1].windows[0].resetsAt=2000100000;s.hostLimits[1].windows[0].usedPercent=2;});
 assert.equal(reset.report(f.requestId).quota.rows[0].changePercentagePoints,null);
 assert.equal(normalizeLimits({accountId:'DO_NOT_STORE',rateLimitsByLimitId:{'codex-fixture':{primary:{usedPercent:14,windowDurationMins:10080,resetsAt:2000000000},credits:{balance:'DO_NOT_STORE'}}}})[0].usedPercent,14);
 assert.ok(!fs.readFileSync(reset.file,'utf8').includes('DO_NOT_STORE'));
});
test('native rate-limit metadata is imported even when no new token-count event exists',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control),file=path.join(f.home,'limits.jsonl'),events=[{type:'session_meta',payload:{id:'fixture-chat-one'}},{type:'event_msg',timestamp:'2026-01-01T10:00:00Z',payload:{type:'token_count',info:null,rate_limits:{limit_id:'codex-fixture',primary:{used_percent:18,window_minutes:300,resets_at:2000000000}}}}];
 fs.writeFileSync(file,events.map(e=>JSON.stringify(e)).join('\n')+'\n');usage.attach({memberId:'director',sourceMemberId:'one',file});assert.equal(usage.sync().available,false);const quota=usage.quota(Date.parse('2026-01-01T09:59:00Z'),Date.parse('2026-01-01T10:00:00Z'));assert.equal(quota.rows[0].usedPercent,18);assert.equal(quota.rows[0].remainingPercent,82);
});
test('upgrade does not add automatic usage cards to legacy completed requests',t=>{
 const f=fixture(t),usage=new UsageLedger(f.control);f.store.change(s=>{const r=s.requests[0];r.status='completed';for(const j of r.jobs){j.state='completed';j.completedAt=new Date().toISOString();}delete r.usageRequested;});
 assert.equal(usage.reports().length,0);assert.equal(usage.report(f.requestId).requestId,f.requestId);
});
