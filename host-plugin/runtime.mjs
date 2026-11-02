import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export const MIN_NODE_VERSION='22.13.0';
export function runtimeSupport(version=process.versions.node,sqlite){
 const parts=typeof version==='string'&&/^(\d+)\.(\d+)\.(\d+)(?:$|-)/.exec(version);
 const compatible=!!parts&&(Number(parts[1])>22||Number(parts[1])===22&&Number(parts[2])>=13);
 let sqliteAvailable=false;
 if(compatible){try{sqliteAvailable=typeof (sqlite===undefined?require('node:sqlite'):sqlite)?.DatabaseSync?.prototype.function==='function';}catch{}}
 return {version:String(version),minimum:MIN_NODE_VERSION,supported:compatible&&sqliteAvailable,sqliteAvailable};
}
export function requireSupportedRuntime(){
 const result=runtimeSupport();
 if(!result.supported)throw new Error('Team Room requires Node.js '+MIN_NODE_VERSION+' or later with node:sqlite DatabaseSync.function. Current: '+result.version+'. Install a supported Node.js LTS, verify `node --version`, then fully restart Codex. / Node.js 22.13.0 이상과 SQLite API가 필요합니다. Node.js LTS를 업데이트하고 Codex를 완전히 다시 실행해 주세요.');
 return result;
}
