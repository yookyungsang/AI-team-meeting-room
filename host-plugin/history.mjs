import fs from 'node:fs';
import {createHash} from 'node:crypto';

// UI reads only. Guarded writes and exports continue to read current originals.
const cache=new Map(), MAX_BYTES=32*1024*1024;
const digest=value=>createHash('sha256').update(value).digest('hex');
const signature=file=>{try{const s=fs.statSync(file,{bigint:true});return [s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}catch(e){if(e.code==='ENOENT')return 'missing';throw e;}};
export function historyRead(file){
 const before=signature(file),old=cache.get(file);
 if(old?.signature===before){cache.delete(file);cache.set(file,old);return old;}
 const raw=before==='missing'?'':fs.readFileSync(file,'utf8');
 if(signature(file)!==before)throw new Error('회의 기록이 변경되었습니다. 다시 확인해 주세요.');
 const entry={signature:before,revision:digest(file+'\n'+raw),bytes:Buffer.byteLength(raw),state:raw?JSON.parse(raw):{version:1,paused:false,requests:[],messages:[]}};
 cache.delete(file);
 if(entry.bytes<=MAX_BYTES){cache.set(file,entry);while(cache.size>4||[...cache.values()].reduce((n,e)=>n+e.bytes,0)>MAX_BYTES)cache.delete(cache.keys().next().value);}
 return entry;
}
export function historyPage(entry,{before,knownRevision}={}){
 if(before!==undefined&&(typeof before!=='string'||!before||before.length>200))throw new Error('이전 대화 위치를 확인해 주세요.');
 if(knownRevision!==undefined&&(typeof knownRevision!=='string'||!/^[a-f0-9]{64}$/.test(knownRevision)))throw new Error('대화 갱신 정보를 확인해 주세요.');
 const {state}=entry,all=state.messages;
 const end=before===undefined?all.length:all.findIndex(m=>m.id===before);
 if(end<0)throw new Error('이전 대화 위치를 찾을 수 없습니다. 최근 대화로 돌아가 주세요.');
 let start=end,bytes=0;
 while(start>0&&end-start<100){const size=Buffer.byteLength(JSON.stringify(all[start-1]));if(start<end&&bytes+size>192*1024)break;bytes+=size;start--;}
 const revision=digest(entry.revision+'\n'+(before||'')+'\n100:196608');
 const history={revision,before:before||null,total:all.length,start,end,hasOlder:start>0,olderBefore:start>0?all[start].id:null,requestTotal:state.requests.length,unchanged:knownRevision===revision};
 const recent=state.requests.filter(r=>['completed','failed'].includes(r.status)).slice(-20);
 const pageRequests=new Set(all.slice(start,end).map(m=>m.requestId));
 const requests=state.requests.filter(r=>!['completed','failed'].includes(r.status)||recent.includes(r)||pageRequests.has(r.id));
 return {state:structuredClone({...state,messages:history.unchanged?[]:all.slice(start,end),requests:history.unchanged?[]:requests}),history};
}
