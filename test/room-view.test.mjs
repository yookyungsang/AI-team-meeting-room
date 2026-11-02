import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {RoomView,roomViewScope} from '../host-plugin/room-view.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';

function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});
 const home=fs.mkdtempSync(path.join(base,'room-view-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 let time=1000;const guard=new RoomView(home,{clock:()=>time});
 const intent=scope=>guard.issue(scope).id,claim=(intentId,instanceId=randomUUID())=>({operation:'claim',intentId,instanceId});
 return {home,guard,intent,claim,advance:ms=>time+=ms};
}
test('fresh open is consumed before display; historical replay and restart never reopen it',t=>{
 const f=fixture(t),args=f.claim(f.intent('synthetic-project'));
 assert.equal(f.guard.execute(args).status,'open');
 assert.equal(f.guard.execute(args).status,'consumed');
 assert.equal(new RoomView(f.home).execute({...args,instanceId:randomUUID()}).status,'consumed');
 const next=f.claim(f.intent('synthetic-project'));f.advance(86400000);
 // Time cannot prove a background/restored tab closed. This fresh request
 // expires, and the next genuinely fresh request still needs confirmation.
 assert.equal(f.guard.execute(next).status,'expired');
 assert.equal(f.guard.execute(f.claim(f.intent('synthetic-project'))).status,'uncertain');
});
test('only an explicit no-old-tab confirmation can reconcile a crashed display, once',t=>{
 const f=fixture(t),first=f.guard.execute(f.claim(f.intent('one'))),args=f.claim(f.intent('one'));
 const blocked=f.guard.execute(args);assert.equal(blocked.status,'uncertain');assert.equal(blocked.viewId,first.viewId);
 const confirm={...args,operation:'confirm',viewId:blocked.viewId};
 assert.throws(()=>f.guard.execute(confirm),/직접 확인/);
 const resumed=new RoomView(f.home).execute({...confirm,confirmedNoTab:true});assert.equal(resumed.status,'open');
 assert.equal(f.guard.execute({...confirm,confirmedNoTab:true}).status,'consumed');
 assert.equal(f.guard.execute(f.claim(f.intent('one'))).status,'uncertain');
});
test('competing recovery cards are fenced and stale teardown cannot clear a newer tab',t=>{
 const f=fixture(t),owner=f.claim(f.intent('one')),opened=f.guard.execute(owner);
 const a=f.claim(f.intent('one')),b=f.claim(f.intent('one'));f.guard.execute(a);f.guard.execute(b);
 const next=f.guard.execute({...a,operation:'confirm',viewId:opened.viewId,confirmedNoTab:true});assert.equal(next.status,'open');
 assert.equal(f.guard.execute({...b,operation:'confirm',viewId:opened.viewId,confirmedNoTab:true}).status,'superseded');
 assert.equal(f.guard.execute({...owner,operation:'release',viewId:opened.viewId}).status,'superseded');
 assert.equal(f.guard.execute(f.claim(f.intent('one'))).status,'uncertain');
});
test('verified close frees only its own display; other projects and consumed cards stay independent',t=>{
 const f=fixture(t),a=f.claim(f.intent('one')),b=f.claim(f.intent('two'));
 const aa=f.guard.execute(a),bb=f.guard.execute(b);assert.equal(aa.status,'open');assert.equal(bb.status,'open');
 assert.equal(f.guard.execute({...a,instanceId:randomUUID(),operation:'release',viewId:aa.viewId}).status,'superseded');
 assert.equal(f.guard.execute({...a,operation:'release',viewId:aa.viewId}).status,'released');
 assert.equal(f.guard.execute({...a,instanceId:randomUUID()}).status,'consumed');
 assert.equal(f.guard.execute(f.claim(f.intent('one'))).status,'open');
 assert.equal(f.guard.execute(f.claim(f.intent('two'))).status,'uncertain');
});
test('uncertain display receipts permit one explicit recovery, never an automatic retry',t=>{
 const f=fixture(t),args=f.claim(f.intent('one')),opened=f.guard.execute(args);
 assert.equal(f.guard.execute(args).status,'consumed');
 const recovery={...args,operation:'confirm',viewId:opened.viewId,confirmedNoTab:true};
 assert.equal(f.guard.execute(recovery).status,'open');assert.equal(f.guard.execute(recovery).status,'consumed');
});
test('expired/pruned/unknown tickets never reopen and corrupt storage fails closed',t=>{
 const f=fixture(t),old=f.claim(f.intent('one'));f.advance(120001);
 assert.equal(f.guard.execute(old).status,'expired');
 for(let i=0;i<260;i++)f.intent('one');
 assert.equal(f.guard.execute(old).status,'expired');
 assert.equal(f.guard.execute(f.claim(randomUUID())).status,'expired');
 fs.writeFileSync(f.guard.file,'broken fixture');const original=fs.readFileSync(f.guard.file);
 assert.throws(()=>f.intent('one'));assert.deepEqual(fs.readFileSync(f.guard.file),original);
 fs.writeFileSync(f.guard.file,JSON.stringify({version:1,scopes:[],intents:{}}));assert.throws(()=>f.intent('one'),/형식/);
});
test('sibling native chats and newly connected rooms share display scope without guessing cwd',()=>{
 const registry={setupContextReader:thread=>{if(thread==='unknown')throw Error('fixture');return {scopeId:'synthetic-native-project'};}};
 const project={id:'room',members:[{id:'director',threadId:'director-chat',hostId:'local'}]};
 assert.equal(roomViewScope(registry,null,'first-chat'),roomViewScope(registry,project,'second-chat'));
 assert.equal(roomViewScope(registry,null,null),null);
 assert.equal(roomViewScope(registry,null,'unknown'),null);
 assert.equal(roomViewScope(registry,project,null),'native:synthetic-native-project');
 assert.equal(roomViewScope({setupContextReader:()=>{throw Error('unavailable')}},project,'first-chat'),null);
 assert.equal(roomViewScope(registry,{...project,members:[{id:'director',hostId:'remote',threadId:'remote-director'}]},null),'room:room');
});
test('open intent is UI metadata only; state reads never mint it or change original room data',t=>{
 const f=fixture(t),registry=new Projects(f.home,{openingReader:()=>({status:'unregistered'}),setupContextReader:()=>({scopeId:'synthetic-project'})});
 const request=(name,args={})=>handle({method:'tools/call',params:{name,arguments:args,_meta:{'openai/threadId':'synthetic-chat'}}},registry);
 const result=request('room_open');assert.ok(result._meta?.['team-room/openIntent']?.id);
 assert.ok(!JSON.stringify(result.structuredContent).includes('openIntent'));
 const saved=fs.readFileSync(f.guard.file);
 for(let i=0;i<5;i++)assert.equal(request('room_state')._meta,undefined);
 assert.deepEqual(fs.readFileSync(f.guard.file),saved);assert.equal(fs.existsSync(registry.file),false);
 assert.deepEqual(TOOLS.find(t=>t.name==='room_view')._meta.ui.visibility,['app']);
 const unavailable=new Projects(path.join(f.home,'unavailable'),{setupContextReader:()=>{throw Error('metadata unavailable')}});
 const safe=handle({method:'tools/call',params:{name:'room_open',arguments:{},_meta:{'openai/threadId':'synthetic-chat'}}},unavailable);
 assert.deepEqual(safe._meta['team-room/openIntent'],{unavailable:true});assert.equal(fs.existsSync(path.join(unavailable.home,'room-views.json')),false);
});
