import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../host-plugin/store.mjs';
import {MEMBERS} from './members.fixture.mjs';
const project={id:'test',name:'Test',members:MEMBERS};
import {TOOLS,handle,compactResult} from '../host-plugin/server.mjs';
function fixture(t){const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'host-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new RoomStore(path.join(dir,'room.json'),project);}
const request=()=>({id:randomUUID(),text:'기존 창 연결 확인',recipients:['director']});
test('idle reads never create records or reserve work',t=>{const store=fixture(t);for(let i=0;i<50;i++)assert.equal(store.snapshot().requests.length,0);assert.equal(fs.existsSync(store.file),false);});
test('submit is idempotent and reserves no native dispatch',t=>{const store=fixture(t),r=request();store.submit(r);store.submit(r);assert.equal(store.snapshot().requests.length,1);assert.equal(store.snapshot().requests[0].jobs[0].state,'pending');assert.throws(()=>store.submit({...r,text:'changed'}));assert.throws(()=>store.submit({...request(),recipients:['outsider']}));});
test('compact envelopes retain routing and follow-up identity without altering user text',t=>{
 const store=fixture(t),text=' \t원문 첫 줄  \r\n\r\n```text\r\n[TEAM-ROOM fixture embedded]\r\n프로젝트: 사용자가 직접 쓴 내용\r\n```\r\n끝 줄  \t\n',r={...request(),text};
 const first=store.submit(r),header=first.wakePrompt.slice(0,-text.length);
 assert.equal(first.request.text,text);assert.equal(store.get(r.id).messages[0].text,text);
 assert.ok(first.wakePrompt.endsWith(text));assert.equal(first.wakePrompt.indexOf(text),header.length);
 assert.ok(header.startsWith(`[TEAM-ROOM test ${r.id}]\n`));assert.match(header,/room_get/);assert.match(header,/연결된 총괄만 처리/);assert.match(header,/한 번만 전달/);
 assert.doesNotMatch(header,/연결된 총괄:|host:|받는 사람:|프로젝트:/);assert.ok(header.length<200);
 assert.ok(!header.includes(MEMBERS[0].threadId));
 const reopened=new RoomStore(store.file,project);assert.equal(reopened.submit(r).wakePrompt,first.wakePrompt);
 assert.throws(()=>reopened.submit({...r,text:text.trim()}),/같은 ID/);assert.throws(()=>reopened.submit({...r,text:text+' '}),/같은 ID/);
 const addition={...request(),text:'\n  덧붙이는 지시\n\n끝 공백 유지  ',followUpTo:r.id},follow=reopened.submit(addition),followHeader=follow.wakePrompt.slice(0,-addition.text.length);
 assert.ok(follow.wakePrompt.endsWith(addition.text));assert.match(followHeader,new RegExp(r.id));assert.match(followHeader,/추가 지시:.*중복 배정하지/);assert.ok(followHeader.length<300);
 assert.equal(reopened.get(addition.id).parentRequest.id,r.id);assert.equal(reopened.get(r.id).followUps[0].text,addition.text);
 assert.equal(reopened.get(r.id).members.find(m=>m.id==='director').threadId,MEMBERS[0].threadId);
});
test('legacy normalized retries preserve old records and replay their saved text unchanged',t=>{
 const store=fixture(t),r={...request(),text:'  예전 방식의 원문\n\n둘째 줄  '};store.submit(r);
 store.change(state=>{const old=state.requests[0];delete old.textVerbatim;old.text=old.text.trim();state.messages[0].text=old.text;});
 const before=fs.readFileSync(store.file),saved=store.read().requests[0].text;
 const replay=new RoomStore(store.file,project).submit(r);
 assert.equal(replay.request.text,saved);assert.ok(replay.wakePrompt.endsWith(saved));assert.ok(replay.wakePrompt.includes(`연결된 총괄: ${MEMBERS[0].threadId}`));assert.equal(replay.request.textVerbatim,undefined);assert.ok(fs.readFileSync(store.file).equals(before));
 assert.throws(()=>store.submit({...r,text:'다른 원문'}),/같은 ID/);
});
test('claimed work is never redispatched, including after restart',t=>{const store=fixture(t),r=request();store.submit(r);assert.equal(store.claim({requestId:r.id,memberId:'director'}).dispatch,true);assert.equal(new RoomStore(store.file,project).claim({requestId:r.id,memberId:'director'}).dispatch,false);});
test('reply validates target and preserves source; does not overwrite',t=>{const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});const reply={requestId:r.id,memberId:'director',text:'실제 응답 fixture',sourceThreadId:MEMBERS[0].threadId,sourceTurnId:randomUUID(),sourceMessageId:randomUUID()};assert.throws(()=>store.reply({...reply,sourceThreadId:MEMBERS[2].threadId}));store.reply(reply);store.reply(reply);assert.equal(store.snapshot().messages.length,2);assert.equal(store.snapshot().requests[0].status,'completed');assert.throws(()=>store.reply({...reply,text:'replacement'}));});
test('pause refuses new submit and claim, allows completing in-flight work',t=>{const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});store.pause(true);assert.throws(()=>store.submit(request()));store.reply({requestId:r.id,memberId:'director',text:'done',sourceThreadId:MEMBERS[0].threadId,sourceTurnId:randomUUID(),sourceMessageId:randomUUID()});assert.equal(store.snapshot().requests[0].status,'completed');});
test('mutual exclusion prevents overwrites across MCP processes',t=>{const store=fixture(t);fs.writeFileSync(store.lock,'fixture');assert.throws(()=>store.submit(request()));fs.unlinkSync(store.lock);assert.equal(store.snapshot().messages.length,0);});
test('MCP exposes fixed room/control tools, no thread/runtime execution or scheduled AI wake',()=>{assert.equal(TOOLS.length,20);assert.deepEqual(TOOLS.find(t=>t.name==='room_reply')._meta.ui.visibility,['model']);assert.deepEqual(TOOLS.find(t=>t.name==='room_image')._meta.ui.visibility,['app']);assert.deepEqual(TOOLS.find(t=>t.name==='room_members').inputSchema.properties.memberId.enum,['director']);assert.deepEqual(TOOLS.find(t=>t.name==='room_open')._meta['openai/ui'].entrypoints,[{type:'thread'}]);assert.throws(()=>handle({method:'turn/start'}));assert.equal(handle({method:'tools/list'}).tools.length,20);});

const speech=(requestId,memberId,extra={})=>({requestId,memberId,text:'공개 발언 fixture',sourceThreadId:MEMBERS.find(m=>m.id===memberId).threadId,sourceTurnId:randomUUID(),sourceMessageId:randomUUID(),...extra});
test('new user submissions go only to director; delegation retains the original recipient',t=>{
 const store=fixture(t),r=request();assert.throws(()=>store.submit({...r,recipients:['planner']}));store.submit(r);
 assert.equal(store.claim({requestId:r.id,memberId:'planner'}).dispatch,true);
 assert.equal(new RoomStore(store.file,project).claim({requestId:r.id,memberId:'planner'}).dispatch,false);
 assert.deepEqual(store.get(r.id).request.recipients,['director']);
 assert.equal(store.get(r.id).request.jobs.find(j=>j.memberId==='planner').delegated,true);
 assert.throws(()=>store.claim({requestId:r.id,memberId:'outsider'}));
});

test('in-flight user additions preserve original dispatch and must be handled before director completion',t=>{
 const store=fixture(t),root=request();store.submit(root);store.claim({requestId:root.id,memberId:'director'});store.claim({requestId:root.id,memberId:'programmer'});
 const jobs=structuredClone(store.get(root.id).request.jobs);
 const addition={...request(),text:'실행 중 바뀐 요구사항',followUpTo:root.id};const submitted=store.submit(addition);
 assert.match(submitted.wakePrompt,/추가 지시:/);assert.match(submitted.wakePrompt,new RegExp(root.id));assert.match(submitted.wakePrompt,/중복 배정하지/);
 assert.equal(store.get(addition.id).parentRequest.id,root.id);assert.equal(store.get(addition.id).parentRequest.text,root.text);
 assert.equal(store.get(root.id).followUps[0].text,addition.text);assert.equal(store.get(root.id,{statusOnly:true}).request.openFollowUpCount,1);
 assert.deepEqual(store.get(root.id).request.jobs,jobs);assert.equal(store.claim({requestId:root.id,memberId:'programmer'}).dispatch,false);
 assert.throws(()=>store.reply({requestId:root.id,memberId:'director',text:'놓친 추가 내용이 있는 완료'}),/추가로 보낸 요청/);
 store.reply({requestId:root.id,memberId:'programmer',text:'원래 구현 결과'});
 store.claim({requestId:addition.id,memberId:'director'});store.reply({requestId:addition.id,memberId:'director',text:'추가 조건을 기존 작업에 반영한 결과'});
 assert.equal(store.get(root.id,{statusOnly:true}).request.openFollowUpCount,0);
 store.reply({requestId:root.id,memberId:'director',text:'원래 요청과 추가 조건 통합 결과'});
 assert.equal(store.get(root.id).request.status,'completed');assert.equal(store.submit(addition).request.id,addition.id);
 assert.equal(store.snapshot().requests.length,2);assert.equal(store.snapshot().messages.filter(m=>m.authorId==='user').length,2);
 assert.equal(store.claim({requestId:addition.id,memberId:'director'}).dispatch,false);
});

test('follow-up linkage cannot be changed, chained, cross-scoped, or added after completion/pause',t=>{
 const store=fixture(t),root=request(),other=request();store.submit(root);store.submit(other);
 const addition={...request(),followUpTo:root.id};store.submit(addition);
 const before=fs.readFileSync(store.file);
 for(const candidate of [{...addition,followUpTo:other.id},{...request(),followUpTo:addition.id},{...request(),followUpTo:randomUUID()},{...request(),followUpTo:'../other-room'},{...request(),followUpTo:root.id,recipients:['qa']}])assert.throws(()=>store.submit(candidate));
 assert.ok(fs.readFileSync(store.file).equals(before));
 store.pause(true);assert.throws(()=>store.submit({...request(),followUpTo:root.id}));store.pause(false);
 store.claim({requestId:other.id,memberId:'director'});store.reply({requestId:other.id,memberId:'director',text:'완료된 원래 요청'});
 assert.throws(()=>store.submit({...request(),followUpTo:other.id}),/이미 끝난 요청/);
});

test('a failed addition cannot silently produce a successful original result',t=>{
 const store=fixture(t),root=request();store.submit(root);store.claim({requestId:root.id,memberId:'director'});
 const addition={...request(),followUpTo:root.id};store.submit(addition);
 store.fail({requestId:addition.id,memberId:'director',reason:'추가 요구 실행 불가'});
 assert.throws(()=>store.reply({requestId:root.id,memberId:'director',text:'성공으로 숨김'}),/추가로 보낸 요청/);
 store.fail({requestId:root.id,memberId:'director',reason:'추가 요구의 제한을 사용자에게 보고'});
 assert.equal(store.get(root.id).request.status,'failed');
});
test('direct posts form a question/answer timeline without finishing assigned work',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'planner'});
 const progress=store.post(speech(r.id,'planner',{kind:'progress'}));
 const q=speech(r.id,'planner',{kind:'question',toMemberId:'qa'}),question=store.post(q);
 assert.equal(store.post(q).created,false);
 assert.equal(new RoomStore(store.file,project).post(q).created,false);
 assert.throws(()=>store.reply(speech(r.id,'planner')));
 assert.throws(()=>store.post(speech(r.id,'graphics',{kind:'answer',toMemberId:'planner',replyTo:question.message.id})));
 const answer=store.post(speech(r.id,'qa',{kind:'answer',toMemberId:'planner',replyTo:question.message.id}));
 assert.equal(answer.message.provenance,'participant-posted');
 assert.equal(store.get(r.id).request.jobs.find(j=>j.memberId==='planner').state,'reserved');
 store.reply(speech(r.id,'planner'));
 assert.equal(store.get(r.id).messages.length,5);
 assert.equal(store.get(r.id).messages[1].id,progress.message.id);
 assert.equal(store.get(r.id).request.status,'processing');
 store.claim({requestId:r.id,memberId:'director'});store.reply(speech(r.id,'director'));
 assert.equal(store.get(r.id).request.status,'completed');
 assert.throws(()=>store.post(speech(r.id,'planner',{kind:'progress'})));
 assert.throws(()=>store.claim({requestId:r.id,memberId:'sound'}));
});
test('posts cannot replace source text, mix requests, invent members or complete unassigned jobs',t=>{
 const store=fixture(t),r=request(),other=request();store.submit(r);store.submit(other);
 const input=speech(r.id,'director',{kind:'question',toMemberId:'qa'}),q=store.post(input);
 assert.throws(()=>store.post({...input,text:'edited'}));
 assert.throws(()=>store.post({...input,sourceThreadId:MEMBERS[1].threadId}));
 assert.throws(()=>store.post(speech(r.id,'sound',{kind:'progress'})));
 assert.throws(()=>store.post(speech(r.id,'director',{kind:'question',toMemberId:'outsider'})));
 assert.throws(()=>store.post(speech(other.id,'qa',{kind:'answer',toMemberId:'director',replyTo:q.message.id})));
 assert.throws(()=>store.reply(speech(r.id,'qa')));
 assert.equal(store.get(r.id).messages.length,2);
});
test('pause blocks new questions and delegated dispatch but keeps in-flight answers',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});
 const q=store.post(speech(r.id,'director',{kind:'question',toMemberId:'qa'}));store.pause(true);
 assert.throws(()=>store.post(speech(r.id,'director',{kind:'question',toMemberId:'planner'})));
 assert.throws(()=>store.claim({requestId:r.id,memberId:'planner'}));
 store.post(speech(r.id,'qa',{kind:'answer',toMemberId:'director',replyTo:q.message.id}));store.reply(speech(r.id,'director'));
 assert.equal(store.get(r.id).request.status,'completed');
});
test('legacy collected records remain unchanged and old submit IDs stay idempotent',t=>{
 const store=fixture(t),r={...request(),recipients:['planner']};
 const legacy={version:1,paused:false,requests:[{...r,status:'completed',jobs:[{memberId:'planner',state:'completed'}]}],messages:[{id:'legacy',requestId:r.id,authorId:'planner',text:'original',provenance:'director-collected'}]};
 fs.writeFileSync(store.file,JSON.stringify(legacy));store.submit(r);
 assert.deepEqual(store.snapshot().messages,legacy.messages);
});
test('a late peer question keeps the request open even after all assigned jobs complete',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});store.claim({requestId:r.id,memberId:'planner'});
 store.reply(speech(r.id,'planner'));
 const q=store.post(speech(r.id,'planner',{kind:'question',toMemberId:'qa'}));
 store.reply(speech(r.id,'director'));
 assert.equal(store.get(r.id).request.status,'processing');assert.equal(store.get(r.id).request.openQuestionCount,1);
 store.post(speech(r.id,'qa',{kind:'answer',toMemberId:'planner',replyTo:q.message.id}));
 assert.equal(store.get(r.id).request.status,'completed');assert.equal(store.get(r.id).request.openQuestionCount,0);
});
test('direct authoring needs no native self-read and remains immutable and idempotent',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});
 const q={requestId:r.id,memberId:'director',kind:'question',toMemberId:'qa',text:'질문',messageKey:'question-qa-1'};
 const first=store.post(q);assert.equal(first.message.sourceType,'tool-authored');assert.equal(first.message.sourceMessageId,undefined);
 assert.equal(new RoomStore(store.file,project).post(q).created,false);assert.throws(()=>store.post({...q,text:'changed'}));
 assert.throws(()=>store.post({...q,messageKey:undefined}));
 assert.throws(()=>store.reply({requestId:r.id,memberId:'director',text:'done'}));
 store.post({requestId:r.id,memberId:'qa',kind:'answer',toMemberId:'director',replyTo:first.message.id,text:'답변',messageKey:'answer-1'});
 const answer={requestId:r.id,memberId:'director',text:'결론'};const saved=store.reply(answer);
 assert.equal(saved.sourceType,'tool-authored');assert.equal(store.reply(answer).id,saved.id);
 assert.throws(()=>store.reply({...answer,text:'다른 결론'}));
 assert.equal(store.get(r.id).request.status,'completed');
 assert.throws(()=>store.reply({...answer,sourceThreadId:MEMBERS[0].threadId}));
});
test('compact status and write receipts omit transcripts while preserving stored messages',t=>{
 const store=fixture(t),prior=request(),r=request();store.submit(prior);store.submit(r);
 const claim=store.claim({requestId:r.id,memberId:'director'});
 assert.equal(compactResult('room_claim',claim).request.text,undefined);
 const msg=store.reply({requestId:r.id,memberId:'director',text:'긴 실제 본문'});
 assert.equal(compactResult('room_reply',msg).saved,true);
 assert.equal(compactResult('room_reply',msg).text,undefined);
 assert.equal(store.get(r.id,{statusOnly:true}).messages,undefined);
 assert.equal(store.get(r.id,{statusOnly:true}).request.text,undefined);
 assert.equal(store.get(r.id).previousMessages,undefined);
 assert.equal(store.get(r.id,{includePrevious:true}).previousMessages.length,1);
 assert.equal(store.get(r.id).messages.at(-1).text,'긴 실제 본문');
 assert.equal(store.snapshot().messages.at(-1).text,'긴 실제 본문');
 const other=request();store.submit(other);
 const post=store.post({requestId:other.id,memberId:'director',kind:'progress',text:'진행 본문',messageKey:'progress-1'});
 assert.equal(compactResult('room_post',post).message.text,undefined);
 assert.equal(compactResult('room_post',post).created,true);
});
test('plain messages and exact technical details remain together, immutable and fully readable by peers',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});store.claim({requestId:r.id,memberId:'programmer'});
 const question={requestId:r.id,memberId:'programmer',kind:'question',toMemberId:'qa',messageKey:'natural-question',text:'작은 화면에서 설명이 잘려요. 두 줄로 나눠도 될까요?',details:'Synthetic exact context:\nUI/FixturePanel.cs:42\nViewport 420x900; expected wrap=2.\nKeep binding FixtureLabel unchanged.'};
 const posted=store.post(question);assert.equal(store.post(question).created,false);
 for(const details of ['다른 기술 근거',undefined])assert.throws(()=>store.post({...question,details}),/덮어쓰지/);
 const answer={requestId:r.id,memberId:'qa',kind:'answer',toMemberId:'programmer',replyTo:posted.message.id,messageKey:'natural-answer',text:'네. 두 줄로 나눠 주세요. 버튼 크기는 유지하고 작은 화면에서 다시 확인해 주세요.',details:'Acceptance: FixtureLabel wraps to two lines; FixtureButton hit area is unchanged.'};
 store.post(answer);
 const final={requestId:r.id,memberId:'programmer',text:'설명을 두 줄로 나눴어요. 작은 화면에서의 확인은 아직 남아 있어요.',details:'FixturePanel.cs changed. Self-check only; independent QA pending.\nreview/fixture-checks.json'};
 const saved=store.reply(final);assert.equal(store.reply(final).id,saved.id);assert.throws(()=>store.reply({...final,details:'lost evidence'}),/덮어쓰지/);
 const reopened=new RoomStore(store.file,project),messages=reopened.get(r.id).messages;
 assert.equal(messages.find(m=>m.id===posted.message.id).details,question.details);
 assert.equal(messages.find(m=>m.kind==='answer').details,answer.details);
 assert.equal(messages.find(m=>m.id===saved.id).details,final.details);
 assert.equal(reopened.snapshot().messages.find(m=>m.id===saved.id).text,final.text);
 assert.equal(compactResult('room_post',posted).message.details,undefined);assert.equal(compactResult('room_reply',saved).details,undefined);
});
test('technical detail validation rejects malformed payloads without changing old or new records',t=>{
 const store=fixture(t),r=request();store.submit(r);store.claim({requestId:r.id,memberId:'director'});
 const args={requestId:r.id,memberId:'director',text:'검사 결과는 아직 확인 중이에요.'};
 const before=fs.readFileSync(store.file);
 for(const details of ['', '   ',null,{},'a'.repeat(20001)]){
  assert.throws(()=>store.post({...args,kind:'progress',messageKey:'invalid-detail',details}),/작업 상세/);
  assert.throws(()=>store.reply({...args,details}),/작업 상세/);
 }
 assert.ok(fs.readFileSync(store.file).equals(before));
 const message=store.reply(args);assert.equal(Object.hasOwn(message,'details'),false);
 assert.equal(store.reply(args).id,message.id);
 for(const name of ['room_post','room_reply'])assert.equal(TOOLS.find(t=>t.name===name).inputSchema.properties.details.maxLength,20000);
});
