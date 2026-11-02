import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {historyRead,historyPage} from '../host-plugin/history.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {handle} from '../host-plugin/server.mjs';

test('bounded pages traverse every original once; scoped revisions, appends and atomic replacements cannot reuse stale data',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const file=path.join(dir,'room.json'),room={version:1,paused:false,requests:[],messages:Array.from({length:10003},(_,i)=>({id:'m'+i,text:'Original '+i,details:'kept exactly'}))};
 const save=()=>fs.writeFileSync(file,JSON.stringify(room));save();
 let entry=historyRead(file),page=historyPage(entry),seen=[];
 assert.equal(page.state.messages.length,100);assert.equal(page.history.total,10003);
 assert.equal(historyRead(file),entry,'unchanged files reuse the bounded cache');
 assert.equal(historyPage(entry,{knownRevision:page.history.revision}).history.unchanged,true);
 assert.equal(historyPage(entry,{before:page.history.olderBefore,knownRevision:page.history.revision}).history.unchanged,false);
 page.state.messages[0].text='mutated response';assert.notEqual(historyPage(entry).state.messages[0].text,'mutated response');
 page=historyPage(entry);
 while(true){seen.unshift(...page.state.messages.map(m=>m.id));if(!page.history.hasOlder)break;page=historyPage(entry,{before:page.history.olderBefore});}
 assert.deepEqual(seen,room.messages.map(m=>m.id));assert.equal(new Set(seen).size,10003);
 assert.throws(()=>historyPage(entry,{before:'foreign-room-cursor'}));assert.throws(()=>historyPage(entry,{knownRevision:'bad'}));
 const revision=historyPage(entry).history.revision,cursor=historyPage(entry).history.olderBefore;
 room.messages.push({id:'new',text:'new'});save();entry=historyRead(file);assert.notEqual(historyPage(entry).history.revision,revision);assert.equal(historyPage(entry,{before:cursor}).state.messages.at(-1).id,'m9902');
 const replacement=JSON.stringify({...room,paused:true});fs.writeFileSync(file+'.new',replacement);fs.renameSync(file+'.new',file);assert.equal(historyRead(file).state.paused,true);
});

test('page byte budget preserves a single oversized original, old active work and complete peer reads',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-feed-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const registry=new Projects(dir);registry.configure({id:'fixture',name:'Fixture',members:[{id:'director',name:'Synthetic director',role:'Director',threadId:'fixture-director',hostId:'local'}]});
 const store=new RoomStore(registry.roomPath('fixture'),registry.get('fixture'));
 const room={version:1,paused:false,requests:[{id:'active-old',status:'processing',jobs:[]},...Array.from({length:1000},(_,i)=>({id:'r'+i,status:'completed',jobs:[]}))],messages:Array.from({length:180},(_,i)=>({id:'m'+i,requestId:'active-old',authorId:'director',text:'한'.repeat(20000),details:'x'.repeat(20000)}))};
 fs.mkdirSync(path.dirname(store.file),{recursive:true});fs.writeFileSync(store.file,JSON.stringify(room));const original=fs.readFileSync(store.file);
 const call=args=>handle({method:'tools/call',params:{name:'room_state',arguments:{projectId:'fixture',...args}}},registry);
 const feed=call({history:true});assert(!feed.isError);const data=feed.structuredContent;
 assert(data.messages.length>0&&data.messages.length<100);assert(Buffer.byteLength(JSON.stringify(data.messages))<280000);
 assert(data.requests.some(r=>r.id==='active-old'));assert.equal(data.requests.length,21);
 const linked=historyPage({...historyRead(store.file),state:{...room,messages:[{id:'single',requestId:'r0',text:'kept'}]}});assert(linked.state.requests.some(r=>r.id==='r0'),'older page keeps its original completed request');
 assert.equal(store.get('active-old').messages.length,180);assert.equal(call({}).structuredContent.messages.length,180);
 assert.equal(call({history:true,knownRevision:data.history.revision}).structuredContent.history.unchanged,true);
 assert.equal(call({before:'m1'}).isError,true);assert.equal(call({history:true,before:'foreign'}).isError,true);
 assert(fs.readFileSync(store.file).equals(original));
 const oversized={...historyRead(store.file),state:{...room,messages:[{id:'big',text:'字'.repeat(100000)}]}};
 assert.equal(historyPage(oversized).state.messages[0].text.length,100000,'one valid legacy record is never truncated');
});
