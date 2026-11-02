// Reproducible local load check: synthetic records, no AI, host or account calls.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {Projects} from '../host-plugin/projects.mjs';
import {handle} from '../host-plugin/server.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-history-load-'));
const rows=[];
try{
 const registry=new Projects(dir);registry.configure({id:'fixture',name:'Synthetic load',members:[{id:'director',name:'Fixture director',role:'Director',threadId:'synthetic-director',hostId:'local'}]});
 const measure=args=>{const start=performance.now(),data=handle({method:'tools/call',params:{name:'room_state',arguments:{projectId:'fixture',...args}}},registry);assert(!data.isError,data.content?.[0]?.text);const json=JSON.stringify(data);return {ms:performance.now()-start,bytes:Buffer.byteLength(json),data:data.structuredContent};};
 for(const count of [100,1000,10000]){
  const state={version:1,paused:false,requests:[],messages:Array.from({length:count},(_,i)=>({id:'m'+i,authorId:'director',authorName:'Fixture director',text:'Synthetic prose. '.repeat(50),details:'Technical evidence. '.repeat(25)}))};
  fs.mkdirSync(path.dirname(registry.roomPath('fixture')),{recursive:true});fs.writeFileSync(registry.roomPath('fixture'),JSON.stringify(state));
  const legacy=measure({}),cold=measure({history:true}),warm=Array.from({length:5},()=>measure({history:true})),unchanged=measure({history:true,knownRevision:cold.data.history.revision});
  assert(cold.data.messages.length<=100);assert.equal(unchanged.data.messages.length,0);assert.equal(unchanged.data.history.unchanged,true);
  rows.push({records:count,full:{ms:legacy.ms,bytes:legacy.bytes},firstPage:{ms:cold.ms,bytes:cold.bytes,renderedMessages:cold.data.messages.length},warmMedianMs:warm.map(x=>x.ms).sort((a,b)=>a-b)[2],unchanged:{ms:unchanged.ms,bytes:unchanged.bytes}});
 }
 console.log(JSON.stringify({scope:'Synthetic local MCP read + serialization; not native Codex latency or token savings',rows},null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
