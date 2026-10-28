import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {handle} from '../host-plugin/server.mjs';

const packageRoot=fileURLToPath(new URL('../',import.meta.url));
function fixture(t){const base=path.join(packageRoot,'.local','test-data');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'projects-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new Projects(path.join(dir,'data'));}
const config=(id)=>({id,name:id.toUpperCase(),workspacePath:'/example/'+id,members:[{id:'director',name:id+' leader',role:'총괄',threadId:id+'-director',hostId:'local'},{id:'writer',name:id+' writer',role:'작가',threadId:id+'-writer',hostId:'remote-fixture'}]});
const call=(registry,name,args={})=>handle({method:'tools/call',params:{name,arguments:args}},registry);
const ok=(registry,name,args)=>{const result=call(registry,name,args);assert.notEqual(result.isError,true,result.content?.[0]?.text);return result.structuredContent;};

test('unconfigured reads have no side effects and never guess a project',t=>{
 const registry=fixture(t);assert.deepEqual(ok(registry,'room_projects').projects,[]);
 assert.equal(ok(registry,'room_open').project,null);assert.equal(fs.existsSync(registry.file),false);
 registry.configure(config('alpha'));const chooser=ok(registry,'room_state');assert.equal(chooser.project,null);assert.equal(chooser.messages.length,0);assert.equal(chooser.projects.length,1);
});
test('project registration supports arbitrary roles/hosts, is idempotent and cannot silently rewire',t=>{
 const registry=fixture(t),a=config('alpha');assert.equal(registry.configure(a).created,true);assert.equal(registry.configure(a).created,false);
 const selected=ok(registry,'room_open',{projectId:'alpha'});assert.equal(selected.members[1].role,'작가');assert.equal(selected.members[1].hostId,'remote-fixture');
 assert.throws(()=>registry.configure({...a,members:[a.members[0],{...a.members[1],threadId:'replacement'}]}));
 assert.throws(()=>registry.configure({...a,id:'../escape'}));assert.throws(()=>registry.configure({...a,id:'com9'}));
 assert.throws(()=>registry.configure({...a,id:'other',members:[a.members[1]]}));
 assert.throws(()=>registry.configure({...a,id:'other',members:[a.members[0],{...a.members[1],threadId:a.members[0].threadId,hostId:'local'}]}));
 assert.equal(registry.list().length,1);
});
test('every request operation is explicitly scoped, with isolated history and pause',t=>{
 const registry=fixture(t);registry.configure(config('alpha'));registry.configure(config('beta'));
 const id=randomUUID();
 for(const projectId of ['alpha','beta'])ok(registry,'room_submit',{projectId,id,text:projectId+' request',recipients:['director']});
 const missing=call(registry,'room_claim',{requestId:id,memberId:'director'});assert.equal(missing.isError,true);
 assert.equal(call(registry,'room_get',{projectId:'missing',requestId:id}).isError,true);
 const reserved=ok(registry,'room_claim',{projectId:'alpha',requestId:id,memberId:'writer'});
 assert.equal(reserved.member.threadId,'alpha-writer');assert.match(reserved.job.marker,/alpha/);
 ok(registry,'room_reply',{projectId:'alpha',requestId:id,memberId:'writer',text:'alpha result'});
 const beta=ok(registry,'room_get',{projectId:'beta',requestId:id});assert.equal(beta.messages.length,1);assert.equal(beta.request.jobs.length,1);
 assert.equal(call(registry,'room_claim',{projectId:'beta',requestId:id,memberId:'programmer'}).isError,true);
 ok(registry,'room_pause',{projectId:'alpha',paused:true});assert.equal(ok(registry,'room_state',{projectId:'beta'}).paused,false);
 const newRequest=ok(registry,'room_submit',{projectId:'beta',id:randomUUID(),text:'continue',recipients:['director']});
 assert.match(newRequest.wakePrompt,/TEAM-ROOM beta/);assert.match(newRequest.wakePrompt,/beta-director/);assert.doesNotMatch(newRequest.wakePrompt,/unconfigured-project/);
 assert.equal(ok(registry,'room_get',{projectId:'alpha',requestId:id,includePrevious:true}).previousMessages.length,0);
});
test('foreign source references and cross-project reply links fail without changing either room',t=>{
 const registry=fixture(t);registry.configure(config('alpha'));registry.configure(config('beta'));const ids={alpha:randomUUID(),beta:randomUUID()};
 for(const projectId of ['alpha','beta']){ok(registry,'room_submit',{projectId,id:ids[projectId],text:'task',recipients:['director']});ok(registry,'room_claim',{projectId,requestId:ids[projectId],memberId:'director'});}
 const q=ok(registry,'room_post',{projectId:'alpha',requestId:ids.alpha,memberId:'director',kind:'question',toMemberId:'writer',text:'question',messageKey:'q1'});
 assert.equal(call(registry,'room_post',{projectId:'beta',requestId:ids.beta,memberId:'writer',kind:'answer',toMemberId:'director',replyTo:q.message.id,text:'wrong room',messageKey:'a1'}).isError,true);
 assert.equal(call(registry,'room_reply',{projectId:'beta',requestId:ids.beta,memberId:'director',text:'bad source',sourceThreadId:'alpha-director',sourceTurnId:'t',sourceMessageId:'m'}).isError,true);
 assert.equal(ok(registry,'room_get',{projectId:'beta',requestId:ids.beta}).messages.length,1);
 assert.equal(ok(registry,'room_get',{projectId:'alpha',requestId:ids.alpha,statusOnly:true}).request.openQuestionCount,1);
});
test('existing data remains byte-identical after reopening the external registry',t=>{
 const registry=fixture(t);registry.configure(config('alpha'));
 const id=randomUUID();ok(registry,'room_submit',{projectId:'alpha',id,text:'retained fixture',recipients:['director']});
 const before=fs.readFileSync(registry.roomPath('alpha')),connections=fs.readFileSync(registry.file);
 const reopened=new Projects(registry.home);
 const result=ok(reopened,'room_open',{projectId:'alpha'});
 assert.equal(result.requests[0].id,id);assert.equal(result.messages[0].text,'retained fixture');
 assert.ok(fs.readFileSync(registry.roomPath('alpha')).equals(before));assert.ok(fs.readFileSync(registry.file).equals(connections));
});

test('MCP follow-ups use only an active original request in their explicit project',t=>{
 const registry=fixture(t);registry.configure(config('alpha'));registry.configure(config('beta'));
 const root=randomUUID(),addition=randomUUID();ok(registry,'room_submit',{projectId:'alpha',id:root,text:'원래 작업',recipients:['director']});
 assert.equal(call(registry,'room_submit',{projectId:'beta',id:addition,text:'외부 요청에 추가',recipients:['director'],followUpTo:root}).isError,true);
 assert.equal(ok(registry,'room_state',{projectId:'beta'}).requests.length,0);
 const saved=ok(registry,'room_submit',{projectId:'alpha',id:addition,text:'추가 조건',recipients:['director'],followUpTo:root});assert.equal(saved.request.followUpTo,root);
 const found=ok(registry,'room_get',{projectId:'alpha',requestId:root});assert.equal(found.followUps[0].id,addition);assert.equal(found.followUps[0].text,'추가 조건');
 assert.equal(ok(registry,'room_get',{projectId:'alpha',requestId:addition}).parentRequest.text,'원래 작업');
 assert.equal(ok(registry,'room_get',{projectId:'alpha',requestId:root,statusOnly:true}).request.openFollowUpCount,1);
});
