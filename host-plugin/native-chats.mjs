import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function metadataPath(value){
 if(typeof value!=='string'||!value)return null;
 if(value.startsWith('\\\\?\\')){value=value.slice(4);if(value.startsWith('UNC\\'))value='\\\\'+value.slice(4);}
 if(/^[a-z]:[\\/]|^\\\\/i.test(value))return 'win:'+path.win32.normalize(value).replace(/[\\/]+$/,'').toLowerCase();
 if(value.startsWith('/'))return 'posix:'+(path.posix.normalize(value).replace(/\/+$/,'')||'/');
 return null;
}
export function projectForThread(thread,roots,projectIds){
 if(thread.project_id)return projectIds.has(thread.project_id)?thread.project_id:null;
 const cwd=metadataPath(thread.cwd);if(!cwd)return null;
 let length=-1;const matches=new Set();
 for(const root of roots){const value=metadataPath(root.path);if(!value)continue;const separator=value.startsWith('win:')?'\\':'/';
  if(cwd!==value&&!cwd.startsWith(value+(value.endsWith(separator)?'':separator)))continue;
  if(value.length>length){length=value.length;matches.clear();}if(value.length===length)matches.add(root.project_id);
 }
 return matches.size===1?[...matches][0]:null;
}

// Read-only compatibility adapter: use only title/project-membership fields.
// Never reads rollouts, changes app state or starts another Codex runtime.
function withNativeIndex({file=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'state_5.sqlite'),stateFile=path.join(path.dirname(file),'.codex-global-state.json')}={},read){
 check(fs.existsSync(file),'로컬 Codex 대화 목록을 찾을 수 없습니다.');
 let DatabaseSync;try{({DatabaseSync}=require('node:sqlite'));}catch{throw new Error('프로젝트 대화 목록에는 node:sqlite를 지원하는 Node가 필요합니다.');}
 check(typeof DatabaseSync?.prototype.function==='function','프로젝트 대화 목록에는 읽기 전용 SQLite API를 지원하는 최신 Node가 필요합니다.');
 let db;
 try{
  db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON');
  for(const [table,required] of Object.entries({threads:['id','name','title','cwd','project_id','archived','thread_source','updated_at'],projects:['id','name'],project_roots:['project_id','path']})){
   const columns=new Set(db.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name));
   check(required.every(name=>columns.has(name)),'현재 Codex 대화 목록 형식은 지원되지 않습니다.');
  }
  const projects=db.prepare('SELECT id FROM projects').all(),ids=new Set(projects.map(p=>p.id));
  const roots=db.prepare('SELECT project_id,path FROM project_roots').all().filter(r=>ids.has(r.project_id));
  // Legacy desktop membership can differ from cwd. Read only these membership
  // keys; never publish or retain the rest of the desktop metadata document.
  let assignments={},projectless=new Set(),hosts={},mapping={};
  if(fs.existsSync(stateFile)){
   check(fs.statSync(stateFile).size<=32*1024*1024,'프로젝트 소속 메타데이터가 너무 큽니다.');
   const state=JSON.parse(fs.readFileSync(stateFile,'utf8'));
   const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
   assignments=state['thread-project-assignments']||{};const excluded=state['projectless-thread-ids']||[];hosts=state['thread-project-membership-host-ids']||{};
   const maps=state['app-server-project-id-by-legacy-project-id-by-host']||{};
   check(object(assignments)&&Array.isArray(excluded)&&excluded.every(id=>typeof id==='string')&&object(hosts)&&object(maps),'현재 프로젝트 소속 기록 형식은 지원되지 않습니다.');
   projectless=new Set(excluded);
   const matching=Object.entries(maps).filter(([key])=>key.startsWith('local:')&&metadataPath(key.slice(6))===metadataPath(path.dirname(file)));
   check(matching.length<=1&&(!matching.length||object(matching[0][1])),'프로젝트 소속 연결이 불명확합니다.');mapping=matching[0]?.[1]||{};
  }
  const resolve=(id,project_id)=>{
   if(projectless.has(id)||hosts[id]&&hosts[id]!=='local')return null;
   const assigned=assignments[id];let desktopId=null;
   if(assigned){if(assigned.projectKind!=='local'||typeof assigned.projectId!=='string')return null;desktopId=mapping[assigned.projectId]||assigned.projectId;if(!ids.has(desktopId))return null;}
   if(project_id){if(!ids.has(project_id)||desktopId&&desktopId!==project_id)return null;return project_id;}
   return desktopId;
  };
  const threadScope=id=>{const row=db.prepare('SELECT id,project_id,archived,thread_source FROM threads WHERE id=?').get(id);return row&&!row.archived&&row.thread_source==='user'?resolve(row.id,row.project_id):null;};
  const workspaceMatches=(project,scopeId)=>!project.workspacePath||projectForThread({cwd:project.workspacePath},roots.filter(r=>r.project_id===scopeId),ids)===scopeId;
  const nativeIds=scopeId=>[...Object.entries(mapping).filter(([,id])=>id===scopeId).map(([id])=>id),scopeId].filter(id=>typeof id==='string'&&id.length>0&&id.length<=200);
  return read({db,resolve,threadScope,workspaceMatches,nativeIds});
 }finally{db?.close();}
}
export function readNativeProjectChats(project,options){
 const director=project.members.find(m=>m.id==='director');
 check(director?.hostId==='local','이 호스트에서는 원격 프로젝트의 대화 목록을 직접 읽을 수 없습니다.');
 return withNativeIndex(options,({db,resolve,threadScope,workspaceMatches})=>{
  const scopeId=threadScope(director.threadId);check(scopeId,'연결된 총괄 대화의 프로젝트 소속을 확인할 수 없습니다.');
  check(workspaceMatches(project,scopeId),'회의실 작업 폴더와 총괄 대화의 프로젝트가 다릅니다.');
  db.function('room_project_match',{deterministic:true},(id,project_id)=>resolve(id,project_id)===scopeId?1:0);
  const rows=db.prepare("SELECT id,name,title FROM threads WHERE archived=0 AND thread_source='user' AND room_project_match(id,project_id)=1 ORDER BY updated_at DESC,id LIMIT 501").all();
  const label=db.prepare('SELECT name FROM projects WHERE id=?').get(scopeId)?.name||project.name;
  return {scopeId,label,truncated:rows.length>500,candidates:rows.slice(0,500).map(row=>({threadId:row.id,hostId:'local',chatTitle:typeof row.name==='string'&&row.name.trim()?row.name:row.title})).filter(row=>typeof row.threadId==='string'&&row.threadId.length>0&&row.threadId.length<=160&&typeof row.chatTitle==='string'&&row.chatTitle.trim()&&row.chatTitle.length<=2000)};
 });
}

// Host metadata is a routing hint, never authorization. Ignore absent/conflicting
// identities instead of using process cwd, global focus or the most recent chat.
export function openingThread(meta){
 if(!meta||typeof meta!=='object'||Array.isArray(meta))return null;
 if(meta.hostId!==undefined&&meta.hostId!=='local'||meta.host_id!==undefined&&meta.host_id!=='local')return null;
 let turn=meta['x-codex-turn-metadata'];
 if(typeof turn==='string'){if(turn.length>8192)return null;try{turn=JSON.parse(turn);}catch{return null;}}
 if(turn!==undefined&&(!turn||typeof turn!=='object'||Array.isArray(turn)))return null;
 const keys=['threadId','thread_id','openai/threadId','openai/thread_id','codexThreadId','codex_thread_id'];
 const values=[...keys.filter(k=>Object.hasOwn(meta,k)).map(k=>meta[k]),...(turn&&Object.hasOwn(turn,'thread_id')?[turn.thread_id]:[])];
 if(!values.length||values.some(v=>typeof v!=='string'||!v.trim()||v.length>160||v!==v.trim()||/[\u0000-\u001f]/.test(v)))return null;
 return new Set(values).size===1?values[0]:null;
}
export function findNativeMeetingProject(projects,threadId,options){
 return withNativeIndex(options,({db,threadScope,workspaceMatches})=>{
  const scopeId=threadScope(threadId);if(!scopeId)return {status:'unavailable'};
  const matches=projects.filter(project=>{const director=project.members.find(m=>m.id==='director');return director?.hostId==='local'&&threadScope(director.threadId)===scopeId&&workspaceMatches(project,scopeId);});
  if(matches.length)return matches.length===1?{status:'selected',projectId:matches[0].id}:{status:'ambiguous'};
  const name=db.prepare('SELECT name FROM projects WHERE id=?').get(scopeId)?.name;
  return {status:'unregistered',...(typeof name==='string'&&name.trim()?{projectName:Array.from(name.trim()).slice(0,120).join('')}:{})};
 });
}
export function readNativeOpeningProject(threadId,options){
 return withNativeIndex(options,({db,threadScope,nativeIds})=>{
  const scopeId=threadScope(threadId);check(scopeId,'현재 대화창의 로컬 프로젝트를 확인할 수 없습니다.');
  const name=db.prepare('SELECT name FROM projects WHERE id=?').get(scopeId)?.name;
  check(typeof name==='string'&&name.trim(),'현재 프로젝트의 이름을 확인할 수 없습니다.');
  return {scopeId,name:Array.from(name.trim()).slice(0,120).join(''),nativeProjectIds:nativeIds(scopeId)};
 });
}
