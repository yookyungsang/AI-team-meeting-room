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

test('menu preview is local, stable and cannot initialize chats or a room before confirmation',t=>{
 const f=fixture(t),first=ok(f,{operation:'preview'}),again=ok(f,{operation:'preview'});
 assert.equal(first.previewId,again.previewId);assert.equal(first.status,'preview');assert.equal(first.roles.length,6);assert.equal(first.roles.filter(r=>r.id.startsWith('programmer')).length,2);assert.equal(first.modelMode,'default');assert.equal(first.prompt,undefined);
 assert(!fs.existsSync(f.team.file));assert(!fs.existsSync(f.registry.file));assert(!fs.existsSync(path.join(f.home,'rooms')));
 assert.deepEqual(TOOLS.find(t=>t.name==='room_team_setup')._meta.ui.visibility,['app']);
});

test('confirmed menu setup approves defaults once, preserves native reservations and connects six synthetic identities',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args=approve(preview),receipt=ok(f,args);
 assert.equal(receipt.dispatch,true);assert.match(receipt.prompt,/프로그래머 2명/);assert.match(receipt.prompt,/기본 모델/);
 assert.equal(ok(f,args).dispatch,false);assert.equal(new MenuTeam(f.registry).apply({...args,threadId:'alpha-one'}).dispatch,false);
 assert.equal(call(f,{...args,requestId:randomUUID()}).isError,true);
 const setup=f.team.status(receipt);assert.equal(setup.status,'approved');assert(setup.roles.every(r=>r.model.model==='default'));
 for(const role of setup.roles){const claim=f.team.claim({...receipt,slotId:role.slotId});assert.equal(claim.dispatch,true);assert.equal(claim.action.model,undefined);assert.equal(claim.action.thinking,undefined);assert.equal(claim.action.target.projectId,'native-alpha');assert.equal(f.team.claim({...receipt,slotId:role.slotId}).dispatch,false);f.team.record({...receipt,slotId:role.slotId,attemptId:claim.attemptId,threadId:'fixture-'+role.slotId,hostId:'local',codexProjectId:'native-alpha',verified:true,titleVerified:true});}
 f.team.connect(receipt);const members=f.registry.get(receipt.projectId).members;assert.equal(members.length,6);assert.equal(members.filter(m=>m.roleType==='programmer').length,2);assert.equal(members.find(m=>m.id==='director').threadId,'fixture-director');
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
 f.team.plan({projectId:'existing-plan',setupId:randomUUID(),name:'Existing fixture',codexProjectId:'native-alpha',hostId:'local',models:[]});const view=ok(f,{operation:'preview'});assert.equal(view.status,'existing');assert.equal(view.previewId,undefined);assert.equal(f.team.read().setups.length,1);
});

test('interruption between plan approval and menu receipt reuses the same setup without losing reservations',t=>{
 const f=fixture(t),preview=ok(f,{operation:'preview'}),args={...approve(preview),threadId:'alpha-one'},original=f.menu.team.approve.bind(f.menu.team);
 f.menu.team.approve=input=>{original(input);throw new Error('Fixture interruption before receipt');};assert.throws(()=>f.menu.apply(args),/Fixture interruption/);assert.equal(f.team.read().setups.length,1);
 const resumed=new MenuTeam(f.registry).apply(args);assert.equal(resumed.dispatch,true);assert.equal(resumed.setupId,preview.setupId);assert.equal(f.team.read().setups.length,1);assert.equal(new MenuTeam(f.registry).apply(args).dispatch,false);
});
