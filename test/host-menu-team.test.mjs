import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {MenuTeam} from '../host-plugin/menu-team.mjs';
import {TeamSetup,TEAM_ROLES} from '../host-plugin/team-setup.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';
const requested=[{slotId:'director',model:'default'},{slotId:'planner',model:'default'},{slotId:'designer',model:'default'},{slotId:'programmer1',model:'gpt-6.1-sol',thinking:'high'},{slotId:'programmer2',model:'gpt-6.1-sol',thinking:'high'},{slotId:'qa',model:'gpt-6-luna',thinking:'medium'}];
const observed=[{id:'gpt-6.1-sol',label:'Fixture observed Sol',family:'balanced',efforts:['medium','high','xhigh']},{id:'gpt-6-luna',label:'Fixture observed Luna',family:'light',efforts:['medium']}];

function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'menu-team-'));
 t.after(()=>{assert(home.startsWith(base));fs.rmSync(home,{recursive:true,force:true});});
 const contexts=new Map(['alpha','beta'].flatMap(id=>['one','two'].map(n=>[id+'-'+n,{scopeId:'scope-'+id,name:'Fixture '+id,nativeProjectIds:['native-'+id,'scope-'+id]}])));
 const linked=new Set(),registry=new Projects(home,{setupContextReader:id=>{assert(contexts.has(id),'Fixture opener missing');return contexts.get(id);},openingReader:(_projects,id)=>({status:linked.has(contexts.get(id)?.scopeId)?'selected':'unregistered'})});
 return {home,contexts,linked,registry,menu:new MenuTeam(registry),team:new TeamSetup(registry)};
}
const call=(f,args,threadId='alpha-one')=>handle({method:'tools/call',params:{name:'room_team_setup',arguments:args,_meta:{thread_id:threadId}}},f.registry);
const ok=(f,args,threadId)=>{const result=call(f,args,threadId);assert(!result.isError,result.content?.[0]?.text);return result.structuredContent;};
const approve=(preview,requestId=randomUUID())=>({operation:'apply',previewId:preview.previewId,requestId,confirmed:true});
const snapshot=(f,projectId,threadId='alpha-one')=>handle({method:'tools/call',params:{name:'room_state',arguments:projectId?{projectId}:{resolveCurrent:true},_meta:{thread_id:threadId}}},f.registry).structuredContent;

test('menu preview is local, stable and cannot initialize chats or a room before confirmation',t=>{
 const f=fixture(t),first=ok(f,{operation:'preview'}),again=ok(f,{operation:'preview'});
 assert.equal(first.previewId,again.previewId);assert.equal(first.status,'preview');assert.equal(first.roles.length,6);assert.equal(first.roles.filter(r=>r.id.startsWith('programmer')).length,2);assert.equal(first.modelMode,'role-preset');assert.equal(first.prompt,undefined);
 assert.match(first.roles.find(r=>r.id==='director').modelLabel,/현재 대화창 사용 · 현재 모델·추론 유지/);assert.match(first.roles.find(r=>r.id==='qa').modelLabel,/GPT-6 Luna · Medium/);
 assert(!fs.existsSync(f.team.file));assert(!fs.existsSync(f.registry.file));assert(!fs.existsSync(path.join(f.home,'rooms')));
 assert.deepEqual(TOOLS.find(t=>t.name==='room_team_setup')._meta.ui.visibility,['app']);
});

test('confirmed role models are verified before approval and reach native actions exactly without changing default roles',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args=approve(preview),receipt=ok(f,args);
 assert.equal(receipt.dispatch,true);assert.match(receipt.prompt,/프로그래머 2명/);assert.match(receipt.prompt,/역할별 모델/);assert.match(receipt.prompt,/새 대화창 5개만/);assert.match(receipt.prompt,/별도 초기화 메시지를 보내지/);
 assert.equal(ok(f,args).dispatch,false);assert.equal(new MenuTeam(f.registry).apply({...args,threadId:'alpha-one'}).dispatch,false);
 assert.equal(call(f,{...args,requestId:randomUUID()}).isError,true);
 const setup=f.team.status(receipt);assert.equal(setup.status,'planned');assert.deepEqual(setup.requestedChoices,requested);assert.throws(()=>f.team.claim({...receipt,slotId:'director'}),/승인/);
 const catalogReply=handle({method:'tools/call',params:{name:'room_team',arguments:{projectId:receipt.projectId,setupId:receipt.setupId,operation:'catalog',models:observed},_meta:{thread_id:'alpha-one'}}},f.registry);assert(!catalogReply.isError);f.team.approve({...receipt,confirmed:true,choices:requested});
 for(const role of setup.roles){const choice=requested.find(c=>c.slotId===role.slotId),claim=f.team.claim({...receipt,slotId:role.slotId});assert.equal(claim.dispatch,true);assert.equal(claim.action.model,choice.model==='default'?undefined:choice.model);assert.equal(claim.action.thinking,choice.thinking);assert.equal(claim.nativeTool,role.slotId==='director'?'set_thread_title':'create_thread');if(role.slotId==='director'){assert.deepEqual(claim.action,{threadId:'alpha-one',title:'Fixture alpha · 총괄 디렉터'});assert.equal(claim.action.prompt,undefined);}else assert.equal(claim.action.target.projectId,'native-alpha');assert.equal(f.team.claim({...receipt,slotId:role.slotId}).dispatch,false);f.team.record({...receipt,slotId:role.slotId,attemptId:claim.attemptId,threadId:role.slotId==='director'?'alpha-one':'fixture-'+role.slotId,hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true});}
 f.team.connect(receipt);const members=f.registry.get(receipt.projectId).members;assert.equal(members.length,6);assert.equal(members.filter(m=>m.roleType==='programmer').length,2);assert.equal(members.find(m=>m.id==='director').threadId,'alpha-one');
 assert.equal(ok(f,args).dispatch,false,'late exact replay cannot create another team after connection');
});

test('missing confirmation, wrong opener and changed project context cannot apply a preview',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args=approve(preview);
 assert.equal(call(f,{...args,confirmed:false}).isError,true);assert.equal(call(f,args,'alpha-two').isError,true);assert.equal(call(f,args,'beta-one').isError,true);
 f.contexts.set('alpha-one',{...f.contexts.get('alpha-one'),name:'Renamed fixture'});assert.equal(call(f,args).isError,true);assert(!fs.existsSync(f.team.file));
 const noMeta=handle({method:'tools/call',params:{name:'room_team_setup',arguments:{operation:'preview'}}},f.registry);assert.equal(noMeta.isError,true);
});

test('two panels in one project cannot dispatch two teams while separate projects remain independent',t=>{
 const f=fixture(t),one=ok(f,{operation:'preview'}),two=ok(f,{operation:'preview'},'alpha-two');
 assert.equal(one.projectId,two.projectId);assert.notEqual(one.previewId,two.previewId);
 ok(f,approve(one));assert.equal(call(f,approve(two),'alpha-two').isError,true);assert.equal(ok(f,{operation:'preview'},'alpha-two').status,'existing');
 const beta=ok(f,{operation:'preview'},'beta-one');assert.notEqual(beta.projectId,one.projectId);assert.equal(ok(f,approve(beta),'beta-one').dispatch,true);assert.equal(f.team.read().setups.length,2);
});

test('existing rooms and prior conversational setup plans block duplicate menu creation',t=>{
 const f=fixture(t);f.linked.add('scope-alpha');assert.equal(call(f,{operation:'preview'}).isError,true);f.linked.clear();
 f.team.plan({projectId:'existing-plan',setupId:randomUUID(),name:'Existing fixture',codexProjectId:'native-alpha',hostId:'local',models:[]});const view=ok(f,{operation:'preview'});assert.equal(view.status,'existing');assert.equal(view.previewId,undefined);assert.equal(view.modelMode,'default');assert.equal(f.team.read().setups.length,1);
});

test('interruption between plan creation and menu receipt reuses the same setup without losing reservations',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args={...approve(preview),threadId:'alpha-one'},original=f.menu.team.plan.bind(f.menu.team);
 f.menu.team.plan=input=>{original(input);throw new Error('Fixture interruption before receipt');};assert.throws(()=>f.menu.apply(args),/Fixture interruption/);assert.equal(f.team.read().setups.length,1);
 const resumed=new MenuTeam(f.registry).apply(args);assert.equal(resumed.dispatch,true);assert.equal(resumed.setupId,preview.setupId);assert.equal(f.team.read().setups.length,1);assert.equal(new MenuTeam(f.registry).apply(args).dispatch,false);
});

test('missing models, unsupported effort and changed approvals block before creating any native reservation',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),receipt=ok(f,approve(preview));
 assert.throws(()=>f.team.approve({...receipt,confirmed:true,choices:requested}),/호스트/);
 assert.throws(()=>f.team.catalog({...receipt,models:observed.slice(0,1)}),/지원하지 않습니다/);
 assert.throws(()=>f.team.catalog({...receipt,models:observed.map(m=>({...m,efforts:['medium']}))}),/지원하지 않습니다/);
 f.team.catalog({...receipt,models:observed});const bytes=fs.readFileSync(f.team.file);f.team.catalog({...receipt,models:observed});assert(fs.readFileSync(f.team.file).equals(bytes));
 assert.throws(()=>f.team.catalog({...receipt,models:[...observed,{id:'fixture-other',label:'Other',family:'other',efforts:[]}]}),/덮어쓰지/);
 assert.throws(()=>f.team.approve({...receipt,confirmed:true,choices:requested.map(c=>c.slotId==='programmer1'?{...c,thinking:'medium'}:c)}),/그대로/);
 assert(f.team.status(receipt).roles.every(r=>r.state==='planned'));assert(!fs.existsSync(f.registry.file));
});

test('an old default-only preview keeps its original consent after a role-preset update',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),state=JSON.parse(fs.readFileSync(f.menu.file));delete state.requests[0].choices;delete state.requests[0].directorMode;fs.writeFileSync(f.menu.file,JSON.stringify(state));
 const receipt=ok(f,approve(preview)),setup=f.team.status(receipt);assert.equal(receipt.modelMode,'default');assert.equal(setup.status,'approved');assert.equal(setup.requestedChoices,undefined);assert(setup.roles.every(r=>r.model.model==='default'));const claim=f.team.claim({...receipt,slotId:'director'});assert.equal(claim.action.model,undefined);assert.equal(claim.action.thinking,undefined);
});

test('a denied native attempt reopens the same setup with explicit human continuation, never a new dispatch',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args=approve(preview),receipt=ok(f,args);f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});const claim=f.team.claim({...receipt,slotId:'director'});f.team.block({...receipt,slotId:'director',attemptId:claim.attemptId,reason:'Fixture host requires direct user confirmation'});
 const before=fs.readFileSync(f.team.file),again=ok(f,{operation:'preview'});assert.equal(again.setupId,receipt.setupId);assert.equal(again.status,'requested');assert.equal(again.setupStatus,'attention');assert.equal(again.readyCount,0);assert(again.continuationPrompt.includes(receipt.setupId));assert.match(again.continuationPrompt,/GPT-6 Luna · Medium/);assert.match(again.continuationPrompt,/기존 설정/);assert.equal(ok(f,args).dispatch,false);assert.equal(f.team.read().setups.length,1);assert(fs.readFileSync(f.team.file).equals(before));assert.equal(receipt.handoff,'editable-draft');
});

test('an original director is reserved before rename, cannot be replaced or reused as a worker, and survives interruption',t=>{
 const f=fixture(t),receipt=ok(f,approve(ok(f,{operation:'preview'})));
 f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});
 const director=f.team.claim({...receipt,slotId:'director'});assert.equal(director.nativeTool,'set_thread_title');
 const qa=f.team.claim({...receipt,slotId:'qa'}),record={...receipt,slotId:'director',attemptId:director.attemptId,threadId:'alpha-one',hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true};
 assert.throws(()=>f.team.record({...record,slotId:'qa',attemptId:qa.attemptId}),/같은 대화창/);
 assert.throws(()=>f.team.record({...record,threadId:'replacement'}),/처음 요청한/);
 f.team.block({...record,reason:'Synthetic missing rename receipt'});
 const resumed=new TeamSetup(f.registry);assert.equal(resumed.claim({...receipt,slotId:'director'}).dispatch,false);
 assert.throws(()=>resumed.retry({...record,retryId:randomUUID(),confirmed:true,confirmedAbsent:true,reason:'Must not create another director'}),/기존 총괄/);
 resumed.record(record);assert.equal(resumed.status(receipt).roles.find(r=>r.slotId==='director').threadId,'alpha-one');
 const before=fs.readFileSync(f.team.file);resumed.record(record);assert(fs.readFileSync(f.team.file).equals(before));
 const other=ok(f,{operation:'preview'},'alpha-two');assert.equal(other.directorMode,'opening-chat');assert.equal(other.setupId,receipt.setupId);
});

test('opening director membership is rechecked before native dispatch, record and initial connection',t=>{
 const f=fixture(t),receipt=ok(f,approve(ok(f,{operation:'preview'}))),context=f.contexts.get('alpha-one');
 f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});
 f.contexts.set('alpha-one',f.contexts.get('beta-one'));assert.throws(()=>f.team.claim({...receipt,slotId:'director'}),/프로젝트 소속/);
 assert(f.team.status(receipt).roles.every(r=>!r.attemptId));f.contexts.set('alpha-one',context);
 for(const role of TEAM_ROLES){const claim=f.team.claim({...receipt,slotId:role.id}),args={...receipt,slotId:role.id,attemptId:claim.attemptId,threadId:role.id==='director'?'alpha-one':'fixture-'+role.id,hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true};
  if(role.id==='director'){f.contexts.set('alpha-one',f.contexts.get('beta-one'));assert.throws(()=>f.team.record(args),/프로젝트 소속/);f.contexts.set('alpha-one',context);}f.team.record(args);
 }
 f.contexts.set('alpha-one',f.contexts.get('beta-one'));assert.throws(()=>f.team.connect(receipt),/프로젝트 소속/);assert(!fs.existsSync(f.registry.file));
 f.contexts.set('alpha-one',context);f.team.connect(receipt);assert.equal(f.registry.get(receipt.projectId).members.find(m=>m.id==='director').threadId,'alpha-one');
});

test('explicit current-director plans require host identity and native scope, while older presets retain their original six-chat plan',t=>{
 const f=fixture(t),plan={projectId:'direct-fixture',setupId:randomUUID(),name:'Fixture',codexProjectId:'native-alpha',hostId:'local',models:[],directorThreadId:'alpha-one',operation:'plan'};
 const send=(meta,args=plan)=>handle({method:'tools/call',params:{name:'room_team',arguments:args,_meta:meta}},f.registry);
 assert.equal(send({thread_id:'beta-one'}).isError,true);assert.equal(send({}).isError,true);assert(!fs.existsSync(f.team.file));
 assert.equal(send({thread_id:'alpha-one'},{...plan,codexProjectId:'native-beta'}).isError,true);
 assert(!send({thread_id:'alpha-one'}).isError);
 const update={projectId:plan.projectId,setupId:plan.setupId,operation:'approve',confirmed:true,choices:TEAM_ROLES.map(r=>({slotId:r.id,model:'default'}))};
 assert.equal(send({thread_id:'beta-one'},update).isError,true);assert.equal(send({},update).isError,true);assert(!send({thread_id:'alpha-one'},update).isError);
 const g=fixture(t),preview=ok(g,{operation:'preview'}),state=JSON.parse(fs.readFileSync(g.menu.file));delete state.requests[0].directorMode;state.requests[0].choices[0]={slotId:'director',model:'gpt-6.1-sol',thinking:'xhigh'};fs.writeFileSync(g.menu.file,JSON.stringify(state));
 const prior=ok(g,{operation:'preview'});assert.equal(prior.previewId,preview.previewId);assert.equal(prior.directorMode,'new-chat');
 const receipt=ok(g,approve(prior)),choices=state.requests[0].choices;assert.match(receipt.prompt,/새 대화창 6개/);assert(!receipt.prompt.includes('새 대화창 5개'));
 g.team.catalog({...receipt,models:observed});g.team.approve({...receipt,confirmed:true,choices});assert.equal(g.team.claim({...receipt,slotId:'director'}).nativeTool,'create_thread');
});

test('saved progress is read-only, scoped and counts five new workers separately from the reused director',t=>{
 const f=fixture(t);assert.equal(snapshot(f).teamProgress,null);assert(!fs.existsSync(f.team.file));assert(!fs.existsSync(f.menu.file));
 const receipt=ok(f,approve(ok(f,{operation:'preview'})));assert.equal(receipt.progress.totalCount,5);assert.equal(receipt.progress.readyCount,0);
 f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});
 for(const id of ['director','planner','designer']){const claim=f.team.claim({...receipt,slotId:id});f.team.record({...receipt,slotId:id,attemptId:claim.attemptId,threadId:id==='director'?'alpha-one':'fixture-'+id,hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true});}
 const before=fs.readFileSync(f.team.file),menu=fs.readFileSync(f.menu.file),progress=snapshot(f).teamProgress;
 assert.equal(progress.readyCount,2);assert.equal(progress.totalCount,5);assert.equal(progress.blocksWork,true);assert.equal(progress.canContinue,true);assert.equal(progress.roles[0].state,'ready');assert.equal(progress.roles[0].threadId,undefined);
 assert.equal(snapshot(f,undefined,'alpha-two').teamProgress.canContinue,false);assert.equal(snapshot(f,undefined,'beta-one').teamProgress,null);
 assert(fs.readFileSync(f.team.file).equals(before));assert(fs.readFileSync(f.menu.file).equals(menu));
});

test('resume prepares the original direct request after restart without changing attempts or creating chats',t=>{
 const f=fixture(t),receipt=ok(f,approve(ok(f,{operation:'preview'})));f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});
 const claim=f.team.claim({...receipt,slotId:'qa'});f.team.block({...receipt,slotId:'qa',attemptId:claim.attemptId,reason:'Synthetic interrupted native receipt'});
 const before=fs.readFileSync(f.team.file),menu=fs.readFileSync(f.menu.file),args={operation:'resume',projectId:receipt.projectId,setupId:receipt.setupId};
 const resumed=new MenuTeam(f.registry).resume({...args,threadId:'alpha-one'});assert.equal(resumed.setupId,receipt.setupId);assert.match(resumed.continuationPrompt,/이미 준비된 담당자는 유지/);assert.match(resumed.continuationPrompt,/생성 여부가 불확실하면 새로 만들지/);assert.match(resumed.continuationPrompt,/GPT-6 Luna · Medium/);assert.equal(resumed.progress.status,'attention');
 assert.equal(ok(f,args).progress.roles.find(r=>r.id==='qa').state,'uncertain');assert.equal(call(f,args,'alpha-two').isError,true);assert.equal(call(f,args,'beta-one').isError,true);assert.equal(call(f,{...args,setupId:randomUUID()}).isError,true);
 assert(fs.readFileSync(f.team.file).equals(before));assert(fs.readFileSync(f.menu.file).equals(menu));assert.equal(f.team.claim({...receipt,slotId:'qa'}).dispatch,false);
});

test('authorized setup errors are persisted once for the UI and cleared by successful recovery with history retained',t=>{
 const f=fixture(t),receipt=ok(f,approve(ok(f,{operation:'preview'}))),args={operation:'catalog',projectId:receipt.projectId,setupId:receipt.setupId,models:observed.slice(0,1)};
 const run=(a,threadId='alpha-one')=>handle({method:'tools/call',params:{name:'room_team',arguments:a,_meta:{thread_id:threadId}}},f.registry);
 assert.equal(run(args,'beta-one').isError,true);assert.equal(f.team.read().setups[0].failure,undefined);
 const untouched=fs.readFileSync(f.team.file);assert.equal(run({operation:'plan',projectId:receipt.projectId,setupId:receipt.setupId,name:'Foreign rewrite',codexProjectId:'native-alpha',hostId:'local',models:[]},'beta-one').isError,true);assert(fs.readFileSync(f.team.file).equals(untouched));
 assert.equal(run(args).isError,true);const progress=snapshot(f).teamProgress;assert.equal(progress.status,'attention');assert.match(progress.failure.reason,/지원하지 않습니다/);assert.equal(progress.failure.operation,'catalog');
 const before=fs.readFileSync(f.team.file);run(args);assert(fs.readFileSync(f.team.file).equals(before));assert.equal(f.team.read().setups[0].failureHistory.length,1);
 assert(!run({...args,models:observed}).isError);assert.equal(snapshot(f).teamProgress.status,'planned');assert.equal(f.team.read().setups[0].failure,undefined);assert.equal(f.team.read().setups[0].failureHistory.length,1);
});

test('the room cannot accept new work between initial registry commit and setup connection; exact old storage retries remain valid',t=>{
 const f=fixture(t),receipt=ok(f,approve(ok(f,{operation:'preview'})));f.team.catalog({...receipt,models:observed});f.team.approve({...receipt,confirmed:true,choices:requested});
 for(const role of TEAM_ROLES){const claim=f.team.claim({...receipt,slotId:role.id});f.team.record({...receipt,slotId:role.id,attemptId:claim.attemptId,threadId:role.id==='director'?'alpha-one':'fixture-'+role.id,hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true});}
 const configure=f.registry.configure.bind(f.registry);f.registry.configure=config=>{configure(config);throw new Error('Synthetic interruption after room registration');};assert.throws(()=>f.team.connect(receipt),/interruption/);
 const submit={projectId:receipt.projectId,id:randomUUID(),text:'First actual task',recipients:['director']},send=()=>handle({method:'tools/call',params:{name:'room_submit',arguments:submit}},f.registry);
 assert.equal(snapshot(f,receipt.projectId).teamProgress.blocksWork,true);assert.equal(send().isError,true);assert(!fs.existsSync(f.registry.roomPath(receipt.projectId)));
 f.registry.configure=configure;f.team.connect(receipt);assert.equal(snapshot(f,receipt.projectId).teamProgress.status,'connected');assert.equal(snapshot(f,receipt.projectId).teamProgress.blocksWork,false);assert(!send().isError);assert(!send().isError);
 assert.equal(call(f,{operation:'resume',projectId:receipt.projectId,setupId:receipt.setupId}).isError,true);
});
