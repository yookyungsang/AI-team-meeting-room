import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
import {roleCatalog,roleTypeOf} from '../host-plugin/roles.mjs';
import {TEAM_ROLES} from '../host-plugin/team-setup.mjs';
const script=fs.readFileSync(new URL('../host-plugin/widget.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.value='';this.dataset={};this.disabled=false;this.hidden=false;this.scrollHeight=0;this.scrollTop=0;this.clientHeight=300;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(name,fn){this.events[name]=fn;}
 requestSubmit(){return this.events.submit({preventDefault(){}});}
 querySelectorAll(selector='input'){const tags=selector.split(',').map(s=>s.trim());return this.children.flatMap(n=>[...(tags.includes(n.tag)?[n]:[]),...n.querySelectorAll(selector)]);}
 focus(){}
 pause(){this.paused=true;this.pauseCalls=(this.pauseCalls||0)+1;}
 load(){this.loadCalls=(this.loadCalls||0)+1;}
 showModal(){this.open=true;}
 close(){this.open=false;this.events.close?.();}
 removeAttribute(key){delete this[key];}
 closest(){return null;}
 set innerHTML(value){throw new Error('unsafe HTML rendering');}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function widget(t,{capability={},messageFails=false,autoSelect=true,deferMessages=false,holdSubmit=false,holdImages=false,badImage=false,holdAudio=false,badAudio=false,holdRoster=null,rosterError=null,currentProject=null,openingStatus='unavailable',holdOpening=false,initialInput,holdTeam=null,teamStatus='preview'}={}){
 const elements=new Map(),sent=[],callbacks={},intervals=[],messagePackets=[],imagePackets=[],audioPackets=[],openingPackets=[],teamPackets=[],timeouts=new Map();let timeoutSeq=0;
 const teamData={previewId:randomUUID(),setupId:randomUUID(),projectId:'created',projectName:'가상 새 프로젝트',status:teamStatus,roles:TEAM_ROLES.map(r=>({id:r.id,name:r.name})),modelMode:'default'};
 const projects=[{id:'test',name:'Test',directorName:'테스트 총괄'},{id:'second',name:'Second',directorName:'다른 총괄'}];
 const state={project:{id:'test',name:'Test'},projects,members:[{id:'director',name:'테스트 총괄',role:'총괄'}],requests:[],messages:[],paused:false};
 const second={project:{id:'second',name:'Second'},projects,members:[{id:'director',name:'다른 총괄',role:'리더'},{id:'writer',name:'작가',role:'작가'}],requests:[],messages:[],paused:false};
 const states=new Map([['test',state],['second',second]]);
 const chooser={project:null,projects,members:[],requests:[],messages:[],paused:true};
 const rosterPackets=[],rosterBehavior={hold:holdRoster,error:rosterError},rosterChanges=new Map();
 const catalogs=new Map([...states].map(([id,room])=>[id,{projectId:id,revision:1,optionsRevision:1,members:room.members.map(m=>({...m})),choices:[...room.members.map(m=>({...m})),{id:'designer',name:'선택 디자이너',role:'디자이너'}]}]));
 for(const data of catalogs.values()){data.roles=roleCatalog();data.members=data.members.map(m=>({...m,roleType:roleTypeOf(m)}));data.choices=data.choices.map(m=>({...m,roleType:roleTypeOf(m)}));}
 const styles=new Map();
 const document={hidden:false,body:{hidden:false},documentElement:{style:{setProperty:(key,value)=>styles.set(key,value)}},activeElement:null,getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:tag=>new Element(tag),addEventListener:(name,fn)=>callbacks[name]=fn};
 const parent={postMessage:packet=>{sent.push(packet);if(packet.id===undefined)return;let result={};
  if(packet.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostCapabilities:{message:{text:capability},experimental:{'openai/message':{}}}};
  if(packet.method==='tools/call'){
   const {name,arguments:args}=packet.params;
   if(name==='room_team_setup'){
    teamPackets.push(packet);if(args.operation==='apply')teamData.status='requested';
    result={structuredContent:{...teamData,...(args.operation==='apply'?{dispatch:true,prompt:'Synthetic human-confirmed team creation request'}:{})}};
    if(holdTeam===args.operation)return;
   }
   if(name==='room_roster'){
    rosterPackets.push(packet);const data=catalogs.get(args.projectId);
    if(args.operation==='apply'&&!rosterBehavior.error){if(!rosterChanges.has(args.changeId)){data.members=args.selection.map(m=>({...m}));data.revision++;rosterChanges.set(args.changeId,true);states.get(args.projectId).members=data.members;states.get(args.projectId).project.revision=data.revision;}}
    result=rosterBehavior.error?{isError:true,content:[{type:'text',text:rosterBehavior.error}]}:{structuredContent:{...data,members:data.members.map(m=>({...m}))}};
    if(rosterBehavior.hold===args.operation)return;
   }
   if(name==='room_state'){
    result={structuredContent:args.projectId?states.get(args.projectId):args.resolveCurrent&&currentProject?states.get(currentProject):{...chooser,...(args.resolveCurrent?{opening:{status:openingStatus}}:{})}};
    if(args.resolveCurrent){openingPackets.push(packet);if(holdOpening)return;}
   }
   if(name==='room_image'){
    imagePackets.push(packet);if(holdImages)return;
    result={structuredContent:{projectId:args.projectId,image:{id:args.imageId,mimeType:'image/png'}},_meta:{'team-room/imageData':badImage?'https://example.invalid/tracker.png':'data:image/png;base64,fixture'}};
   }
   if(name==='room_audio'){
    audioPackets.push(packet);if(holdAudio)return;
    result={structuredContent:{projectId:args.projectId,audio:{id:args.audioId,mimeType:'audio/wav'}},_meta:{'team-room/audioData':badAudio?'https://example.invalid/tracker.wav':'data:audio/wav;base64,fixture'}};
   }
   if(name==='room_submit'){const target=states.get(args.projectId);target.requests.push({...args,status:'pending',jobs:[]});result={structuredContent:{request:target.requests.at(-1),state:target,wakePrompt:'fixture '+args.id}};if(holdSubmit)return;}
  }
  if(packet.method==='ui/message'&&deferMessages){messagePackets.push(packet);return;}
  queueMicrotask(()=>callbacks.message({source:parent,data:{jsonrpc:'2.0',id:packet.id,...(packet.method==='ui/message'&&messageFails?{error:{code:-1}}:{result})}}));
  if(packet.method==='ui/initialize'&&initialInput!==undefined)queueMicrotask(()=>callbacks.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-input',params:{arguments:initialInput}}}));
 }};
 const window={parent,addEventListener:(name,fn)=>callbacks[name]=fn};
 vm.runInNewContext(script,{window,document,crypto:{randomUUID},console,Intl,Date,Map,Set,Object,Array,JSON,setTimeout:fn=>{const id=++timeoutSeq;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){}});
 t.after(async()=>{callbacks.pagehide();await settle();});
 await settle();
 const notify=data=>callbacks.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}}});
 if(autoSelect)notify(state);
 const receive=data=>callbacks.message({source:parent,data:{jsonrpc:'2.0',...data}});
 const respondMessage=(index,result={})=>receive({id:messagePackets[index].id,result});
 const expire=()=>{for(const [id,fn] of [...timeouts]){timeouts.delete(id);fn();}};
 return {rosterPackets,rosterBehavior,catalogs,sent,elements,state,second,states,chooser,notify,callbacks,intervals,document,styles,receive,window,messagePackets,imagePackets,audioPackets,openingPackets,teamPackets,teamData,respondMessage,expire};
}

async function explainTeam(w){w.elements.get('open-menu').events.click();await w.elements.get('create-team').events.click();}
test('new-project menu explains six roles and defaults before an explicit apply, while cancel invokes no AI',async t=>{
 const w=await widget(t,{autoSelect:false,openingStatus:'unregistered'});assert.equal(w.elements.get('team-setup-entry').hidden,false);await explainTeam(w);
 assert.equal(w.elements.get('team-setup').hidden,false);assert.equal(w.elements.get('team-setup-roles').children.length,6);assert.equal(w.elements.get('team-setup-apply').disabled,false);assert.match(w.elements.get('team-setup-project').textContent,/가상 새 프로젝트/);
 w.elements.get('team-setup-cancel').events.click();assert.equal(w.elements.get('team-setup').hidden,true);assert.deepEqual(w.teamPackets.map(p=>p.params.arguments.operation),['preview']);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('menu role presets display exact model and effort labels before confirmation',async t=>{
 const w=await widget(t,{autoSelect:false});w.teamData.modelMode='role-preset';
 const labels={director:'GPT-6.1 Sol · Extra High',programmer1:'GPT-6.1 Sol · High',programmer2:'GPT-6.1 Sol · High',qa:'GPT-6 Luna · Medium'};
 w.teamData.roles=w.teamData.roles.map(r=>({...r,modelLabel:labels[r.id]||'Codex 기본 설정'}));await explainTeam(w);
 const roles=w.elements.get('team-setup-roles').children.map(r=>r.textContent).join('\n');assert.match(roles,/총괄 디렉터 · GPT-6.1 Sol · Extra High/);assert.match(roles,/프로그래머 2 · GPT-6.1 Sol · High/);assert.match(roles,/QA 담당자 · GPT-6 Luna · Medium/);assert.match(roles,/디자이너 · Codex 기본 설정/);assert.equal(w.elements.get('team-setup-apply').disabled,false);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('team menu apply sends one human-confirmed setup request and selects the connected room on a later local refresh',async t=>{
 const w=await widget(t,{autoSelect:false,openingStatus:'unregistered'});await explainTeam(w);
 const pending=w.elements.get('team-setup-apply').events.click();await w.elements.get('team-setup-apply').events.click();await pending;
 const applies=w.teamPackets.filter(p=>p.params.arguments.operation==='apply');assert.equal(applies.length,1);assert.equal(applies[0].params.arguments.confirmed,true);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);assert.equal(w.elements.get('team-setup-apply').disabled,true);
 const project={id:'created',name:'가상 새 프로젝트',directorName:'새 총괄'};w.chooser.projects.push(project);w.states.set(project.id,{project,members:[{id:'director',name:'새 총괄',role:'총괄'}],projects:w.chooser.projects,messages:[],requests:[],paused:false});
 await w.intervals[0]();assert.equal(w.elements.get('project').value,'created');assert.equal(w.elements.get('team-setup-entry').hidden,true);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);
});

test('existing setups and hosts without message support cannot apply another menu team',async t=>{
 for(const options of [{teamStatus:'existing'},{teamStatus:'requested'},{capability:false}]){const w=await widget(t,{autoSelect:false,...options});await explainTeam(w);assert.equal(w.elements.get('team-setup-apply').disabled,true);await w.elements.get('team-setup-apply').events.click();assert.equal(w.teamPackets.length,1);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);}
});

test('late menu apply after close, switch, hide or teardown never dispatches a setup request',async t=>{
 for(const action of ['close','switch','hide','teardown']){
  const w=await widget(t,{autoSelect:false,holdTeam:'apply'});await explainTeam(w);const applying=w.elements.get('team-setup-apply').events.click();await settle();const packet=w.teamPackets.at(-1);
  if(action==='close')w.elements.get('close-menu').events.click();
  if(action==='switch'){w.elements.get('project').value='second';await w.elements.get('project').events.change();}
  if(action==='hide'){w.document.hidden=true;w.callbacks.visibilitychange();}
  if(action==='teardown')w.callbacks.pagehide();
  w.receive({id:packet.id,result:{structuredContent:{...w.teamData,dispatch:true,prompt:'Late setup request'}}});await applying;assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0,action);assert.equal(w.elements.get('team-setup').hidden,true);
 }
});

test('rejected and uncertain setup deliveries never auto resend or reenable creation',async t=>{
 const rejected=await widget(t,{autoSelect:false,messageFails:true});await explainTeam(rejected);await rejected.elements.get('team-setup-apply').events.click();assert.match(rejected.elements.get('team-setup-status').textContent,/자동 재전송/);await rejected.intervals[0]();assert.equal(rejected.sent.filter(p=>p.method==='ui/message').length,1);assert.equal(rejected.elements.get('team-setup-apply').disabled,true);
 const w=await widget(t,{autoSelect:false,deferMessages:true});await explainTeam(w);const applying=w.elements.get('team-setup-apply').events.click();await settle();w.expire();assert.match(w.elements.get('team-setup-status').textContent,/자동 재전송/);await w.elements.get('team-setup-apply').events.click();assert.equal(w.messagePackets.length,1);w.respondMessage(0);await applying;assert.equal(w.messagePackets.length,1);
});

test('initial mount resolves its opening project once, then polls only that explicit room without AI',async t=>{
 for(const currentProject of ['test','second']){
  const w=await widget(t,{autoSelect:false,currentProject});assert.equal(w.elements.get('project').value,currentProject);
  for(let i=0;i<3;i++)await w.intervals[0]();
  assert.equal(w.openingPackets.length,1);assert(w.sent.filter(p=>p.params?.name==='room_state').slice(1).every(p=>p.params.arguments.projectId===currentProject));
  assert.equal(w.sent.filter(p=>p.method==='ui/message'||p.params?.name==='room_submit').length,0);
 }
});

test('opening input project takes precedence and later input cannot replace a manual selection',async t=>{
 const w=await widget(t,{autoSelect:false,currentProject:'second',initialInput:{projectId:'test'}});assert.equal(w.elements.get('project').value,'test');assert.equal(w.openingPackets.length,0);
 const select=w.elements.get('project');select.value='second';await select.events.change();
 w.receive({method:'ui/notifications/tool-input',params:{arguments:{projectId:'test'}}});w.notify(w.state);assert.equal(select.value,'second');
 select.value='';await select.events.change();w.notify(w.state);assert.equal(select.value,'','clearing a manual selection cannot be undone by a late opening result');
});

test('unavailable or unregistered openings keep the chooser with a stable notice and no discovery retry',async t=>{
 for(const openingStatus of ['unavailable','unregistered','ambiguous']){
  const w=await widget(t,{autoSelect:false,openingStatus});assert.equal(w.elements.get('project').value,'');assert.equal(w.elements.get('send').disabled,true);
  const notice=w.elements.get('empty').textContent;assert.match(notice,/프로젝트/);await w.intervals[0]();assert.equal(w.elements.get('empty').textContent,notice);assert.equal(w.openingPackets.length,1);
 }
});

test('late automatic opening cannot override a manual project, typed draft or closed panel',async t=>{
 const w=await widget(t,{autoSelect:false,holdOpening:true}),packet=w.openingPackets[0];w.elements.get('project').value='second';await w.elements.get('project').events.change();w.elements.get('text').value='Other room draft';
 w.receive({id:packet.id,result:{structuredContent:w.state}});await settle();assert.equal(w.elements.get('project').value,'second');assert.equal(w.elements.get('text').value,'Other room draft');
 const d=await widget(t,{autoSelect:false,holdOpening:true});d.elements.get('text').value='Unscoped draft';d.elements.get('text').events.input();d.receive({id:d.openingPackets[0].id,result:{structuredContent:d.state}});await settle();assert.equal(d.elements.get('project').value,'');assert.equal(d.elements.get('text').value,'Unscoped draft');
 const c=await widget(t,{autoSelect:false,holdOpening:true});c.callbacks.pagehide();await settle();const count=c.sent.length;c.receive({id:c.openingPackets[0].id,result:{structuredContent:c.state}});await settle();assert.equal(c.sent.length,count);assert.equal(c.document.body.hidden,true);
});
test('role picker links standard guidance, shows custom input only when selected and never wakes AI',async t=>{
 const w=await widget(t);await w.elements.get('edit-roster').events.click();const rows=()=>w.elements.get('roster-rows').children;
 assert.equal(rows()[0].children[1].children[0].children[0].disabled,true);
 w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();
 const picker=()=>rows()[1].children[1].children[0].children[0];assert.equal(picker().value,'designer');assert.equal(rows()[1].children[1].children[1].hidden,true);
 picker().value='programmer';picker().events.change();assert.match(visibleText(rows()[1]),/프로그래머 협업 지침/);
 picker().value='custom';picker().events.change();const label=rows()[1].children[1].children[1];assert.equal(label.hidden,false);const field=label.children[0];field.value='번역 검수';field.events.input();
 await w.elements.get('roster-save').events.click();const saved=w.rosterPackets.find(p=>p.params.arguments.operation==='apply').params.arguments.selection.find(m=>m.id==='designer');assert.equal(saved.roleType,'custom');assert.equal(saved.role,'번역 검수');assert.match(visibleText(rows()[1]),/공통 기본 지침/);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('malformed role-catalog save receipts keep the exact pending edit for explicit retry',async t=>{
 const w=await widget(t,{holdRoster:'apply'});await w.elements.get('edit-roster').events.click();w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();
 const saving=w.elements.get('roster-save').events.click();await settle();const call=w.rosterPackets.find(p=>p.params.arguments.operation==='apply');const bad={...w.catalogs.get('test')};delete bad.roles;
 w.receive({id:call.id,result:{structuredContent:bad}});await saving;assert.match(w.elements.get('roster-status').textContent,/저장 결과를 확인/);assert.equal(w.elements.get('roster-rows').children.length,2);
 w.rosterBehavior.hold=null;await w.elements.get('roster-save').events.click();const calls=w.rosterPackets.filter(p=>p.params.arguments.operation==='apply');assert.deepEqual(calls[0].params.arguments,calls[1].params.arguments);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('menu roster edits add, rename and remove locally before an explicit save without AI or IDs',async t=>{
 const w=await widget(t),input=w.elements.get('text');input.value='보존할 입력';input.events.input();await w.elements.get('edit-roster').events.click();
 assert.equal(w.elements.get('roster-rows').children[0].children[2].disabled,true);w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();
 const row=w.elements.get('roster-rows').children[1],name=row.children[0].children[0];name.value='새 디자인 담당';name.events.input();
 assert.equal(w.state.members.length,1);await w.elements.get('roster-save').events.click();assert.equal(w.state.members.length,2);assert.equal(w.state.members[1].name,'새 디자인 담당');
 const apply=w.rosterPackets.find(p=>p.params.arguments.operation==='apply');assert(!JSON.stringify(apply.params.arguments).includes('threadId'));assert.equal(input.value,'보존할 입력');
 w.elements.get('roster-rows').children[1].children[2].events.click();await w.elements.get('roster-save').events.click();assert.equal(w.state.members.length,1);
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});
test('roster rejection preserves edits and uncertain saves reuse the exact change ID without automatic retry',async t=>{
 const w=await widget(t,{rosterError:'진행 중인 담당자는 먼저 인계하세요'});await w.elements.get('edit-roster').events.click();
 w.rosterBehavior.error=null;await w.elements.get('roster-refresh').events.click();w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();
 w.rosterBehavior.error='진행 중인 담당자는 먼저 인계하세요';await w.elements.get('roster-save').events.click();assert.equal(w.elements.get('roster-rows').children.length,2);assert.match(w.elements.get('roster-status').textContent,/인계/);
 w.rosterBehavior.error=null;w.rosterBehavior.hold='apply';const saving=w.elements.get('roster-save').events.click();await settle();w.expire();await saving;
 const before=w.rosterPackets.filter(p=>p.params.arguments.operation==='apply');assert.equal(before.length,2);await w.intervals[0]();assert.equal(w.rosterPackets.filter(p=>p.params.arguments.operation==='apply').length,2);
 w.rosterBehavior.hold=null;await w.elements.get('roster-save').events.click();const calls=w.rosterPackets.filter(p=>p.params.arguments.operation==='apply');assert.deepEqual(calls[1].params.arguments,calls[2].params.arguments);
});
test('late project-chat discovery cannot update or dispatch after close, switch or teardown',async t=>{
 const w=await widget(t,{holdRoster:'discover'});const loading=w.elements.get('edit-roster').events.click();await settle();const packet=w.rosterPackets[0];w.elements.get('roster-close').events.click();
 w.receive({id:packet.id,result:{structuredContent:w.catalogs.get('test')}});await loading;assert.equal(w.elements.get('roster-editor').hidden,true);
 const h=await widget(t,{holdRoster:'discover'});const pending=h.elements.get('edit-roster').events.click();await settle();const late=h.rosterPackets[0];h.elements.get('project').value='second';await h.elements.get('project').events.change();h.receive({id:late.id,result:{structuredContent:h.catalogs.get('test')}});await pending;assert.equal(h.elements.get('roster-editor').hidden,true);
 const k=await widget(t,{holdRoster:'discover'});const closing=k.elements.get('edit-roster').events.click();await settle();const ignored=k.rosterPackets[0];k.callbacks.pagehide();await closing;const count=k.sent.length;k.receive({id:ignored.id,result:{structuredContent:k.catalogs.get('test')}});assert.equal(k.sent.length,count);assert.equal(k.document.body.hidden,true);
});
test('opening and refreshing the project-chat picker performs local discovery without AI',async t=>{
 const w=await widget(t);await w.elements.get('edit-roster').events.click();await w.elements.get('roster-refresh').events.click();
 assert.deepEqual(w.rosterPackets.map(p=>p.params.arguments.operation),['discover','discover']);
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.sent.filter(p=>p.params?.name==='room_submit').length,0);
 assert.doesNotMatch(fs.readFileSync(new URL('../host-plugin/widget.html',import.meta.url),'utf8'),/id="roster-prepare"/);
});

test('excluding an edited member returns it to the picker and readding preserves its draft',async t=>{
 const w=await widget(t);await w.elements.get('edit-roster').events.click();w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();
 const row=w.elements.get('roster-rows').children[1],name=row.children[0].children[0];name.value='수정한 표시 이름';name.events.input();row.children[2].events.click();
 assert.equal(w.elements.get('roster-rows').children.length,1);assert(w.elements.get('roster-choice').children.some(o=>o.value==='designer'));
 w.elements.get('roster-choice').value='designer';w.elements.get('roster-add').events.click();assert.equal(w.elements.get('roster-rows').children[1].children[0].children[0].value,'수정한 표시 이름');
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('bridge initialization and repeated state reads never wake AI',async t=>{const w=await widget(t);for(let i=0;i<4;i++){await w.intervals[0]();await settle();}assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.sent.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit').length,0);});
test('explicit submit wakes current chat once and subsequent polls do not',async t=>{const w=await widget(t);w.elements.get('text').value='test';w.elements.get('text').events.input();assert.equal(w.elements.get('send').disabled,false);const first=w.elements.get('form').events.submit({preventDefault(){}});await w.elements.get('form').events.submit({preventDefault(){}});await first;await settle();await w.intervals[0]();const messages=w.sent.filter(p=>p.method==='ui/message');assert.equal(messages.length,1);assert.equal(messages[0].params._meta['openai/message'].target,'active');assert.equal(w.state.requests.length,1);});
test('the composer preserves the original whitespace while uncertain duplicate checks stay normalized',async t=>{
 const w=await widget(t,{deferMessages:true}),input=w.elements.get('text'),raw='  첫 줄  \n\n\t둘째 줄\n  ';
 input.value=raw;input.events.input();await w.elements.get('form').events.submit({preventDefault(){}});await settle();
 const packets=w.sent.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit');assert.equal(packets.length,1);assert.equal(packets[0].params.arguments.text,raw);assert.equal(w.state.requests[0].text,raw);
 input.value=raw.trim();input.events.input();assert.equal(w.elements.get('send').disabled,true);
 await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.sent.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit').length,1);
 input.value=' \n\t ';input.events.input();assert.equal(w.elements.get('send').disabled,true);
});
test('unsupported host keeps sending disabled',async t=>{const w=await widget(t,{capability:false});w.elements.get('text').value='test';w.elements.get('text').events.input();await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.elements.get('send').disabled,true);});
test('a rejected host message is not retried and does not lock other additions',async t=>{
 const w=await widget(t,{messageFails:true}),input=w.elements.get('text');input.value='test';input.events.input();
 await w.elements.get('form').events.submit({preventDefault(){}});await settle();await w.intervals[0]();
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);assert.match(w.elements.get('result').textContent,/자동 재전송하지 않습니다/);
 input.value='중간 추가 내용';input.events.input();assert.equal(input.readOnly,false);assert.equal(w.elements.get('send').disabled,false);
 await w.elements.get('form').events.submit({preventDefault(){}});await settle();
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,2);assert.equal(w.state.requests[1].followUpTo,w.state.requests[0].id);
});

test('a second user message reaches the host before the first receipt or job completes',async t=>{
 const w=await widget(t,{deferMessages:true}),input=w.elements.get('text'),send=()=>w.elements.get('form').events.submit({preventDefault(){}});
 input.value='원래 작업';input.events.input();await send();const root=w.state.requests[0];root.status='processing';
 assert.equal(w.messagePackets.length,1);assert.equal(input.value,'');assert.equal(input.readOnly,false);
 input.value='작업 중 바뀐 조건';input.events.input();await send();
 assert.equal(w.messagePackets.length,2);assert.notEqual(w.state.requests[1].id,root.id);assert.equal(w.state.requests[1].followUpTo,root.id);
 assert.equal(root.status,'processing');assert.equal(w.elements.get('project').disabled,false);
 const before=w.sent.length;await w.intervals[0]();assert.ok(w.sent.length>before);assert.equal(w.messagePackets.length,2);
 input.value='작성 중인 다음 내용';input.events.input();w.respondMessage(1);await settle();w.respondMessage(0);await settle();
 assert.equal(input.value,'작성 중인 다음 내용');assert.equal(w.elements.get('send').disabled,false);assert.equal(w.messagePackets.length,2);
});

test('an overdue receipt isolates duplicate text, allows new additions and recovers on a late receipt',async t=>{
 const w=await widget(t,{deferMessages:true}),input=w.elements.get('text');input.value='원래 작업';input.events.input();
 await w.elements.get('form').events.submit({preventDefault(){}});w.expire();await settle();
 assert.match(w.elements.get('result').textContent,/처리 여부 확인 필요/);assert.equal(input.readOnly,false);
 input.value='원래 작업';input.events.input();assert.equal(w.elements.get('send').disabled,true);
 await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.messagePackets.length,1);
 input.value='다른 추가 지시';input.events.input();assert.equal(w.elements.get('send').disabled,false);
 await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.messagePackets.length,2);
 w.respondMessage(0);w.respondMessage(1);await settle();assert.doesNotMatch(w.elements.get('result').textContent,/처리 여부 확인 필요/);
 assert.equal(w.messagePackets.length,2);
});

test('late delivery receipts cannot erase another project draft or change its selected room',async t=>{
 const w=await widget(t,{deferMessages:true}),input=w.elements.get('text'),select=w.elements.get('project');
 input.value='A 작업';input.events.input();await w.elements.get('form').events.submit({preventDefault(){}});
 select.value='second';await select.events.change();input.value='B 작성 중';input.events.input();
 w.respondMessage(0,{isError:true});await settle();
 assert.equal(select.value,'second');assert.equal(input.value,'B 작성 중');assert.equal(w.elements.get('result').textContent,'');
 assert.equal(w.elements.get('send').disabled,false);assert.equal(w.second.requests.length,0);
});

test('closing while a submit receipt is pending never dispatches a late wake message',async t=>{
 const w=await widget(t,{holdSubmit:true});w.elements.get('text').value='저장 응답 대기';w.elements.get('text').events.input();
 const saving=w.elements.get('form').events.submit({preventDefault(){}});const packet=w.sent.at(-1);
 w.callbacks.pagehide();await saving;w.receive({id:packet.id,result:{structuredContent:{request:w.state.requests[0],state:w.state,wakePrompt:'late'}}});await settle();
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.document.body.hidden,true);
});
test('hidden panel does not poll and reply text is rendered without HTML execution',async t=>{const w=await widget(t);const count=w.sent.length;w.document.hidden=true;await w.intervals[0]();assert.equal(w.sent.length,count);w.document.hidden=false;w.state.messages.push({id:'fixture',authorId:'director',authorName:'테스트 총괄',text:'<img src=x onerror=alert(1)>'});await w.intervals[0]();assert.equal(w.elements.get('messages').children.length,1);});

const visibleText=n=>[n.textContent||'',...n.children.map(visibleText)].join(' ');
test('usage is shown only for completed reports, per participant, without an AI message',async t=>{
 const w=await widget(t);assert.doesNotMatch(visibleText(w.elements.get('messages')),/측정 가능한 합계/);
 w.state.messages=[{id:'final',requestId:'done',authorId:'director',kind:'final',text:'완료 결과'}];
 w.state.usageReports=[{requestId:'done',complete:false,total:{total_tokens:120},rows:[{name:'테스트 총괄',role:'총괄',status:'measured',usage:{input_tokens:100,output_tokens:20,total_tokens:120}},{name:'테스트 QA',role:'QA',status:'unavailable',usage:null}],quota:{available:true,rows:[{usedPercent:14,remainingPercent:86,windowDurationMins:10080,changePercentagePoints:4}]}}];
 w.state.work={configured:true,locks:[{memberId:'director',paths:['Example.cs']}],checkpoints:1,validations:[{label:'QA 검사',status:'blocked',blocked:true}]};
 w.notify(w.state);const text=visibleText(w.elements.get('messages'));assert.match(text,/테스트 총괄 · 총괄: 120 토큰/);assert.match(text,/테스트 QA · QA: 측정 불가/);assert.match(text,/7일 한도 · 사용 14% · 남음 86%/);assert.match(visibleText(w.elements.get('work-status')),/총괄 조치 필요/);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 w.elements.get('project').value='second';await w.elements.get('project').events.change();assert.doesNotMatch(visibleText(w.elements.get('usage-reports')),/120 토큰/);
});
const descendants=n=>[n,...n.children.flatMap(descendants)];
const audioMessage=(id='sound')=>({id,requestId:'audio-request',authorId:'director',text:'가상 효과음입니다.',details:'음원 기술 사양',audio:[{id:(id==='sound'?'a':'b').repeat(64),mimeType:'audio/wav',caption:'가상 테스트 음원'}]});
test('audio appears outside details, loads only on click, never autoplays and reuses cached bytes',async t=>{
 const w=await widget(t);w.state.messages=[audioMessage()];w.notify(w.state);
 const nodes=descendants(w.elements.get('messages')),detail=nodes.find(n=>n.className==='message-details'),button=nodes.find(n=>n.className==='button audio-preview');
 assert.equal(w.audioPackets.length,0);assert.equal(descendants(detail).some(n=>n.className==='audio-attachment'),false);
 await button.events.click();assert.equal(w.audioPackets.length,1);assert.equal(w.elements.get('audio-viewer').open,true);assert.equal(w.elements.get('audio-full').src,'data:audio/wav;base64,fixture');
 assert.equal(w.elements.get('audio-full').autoplay,undefined);w.elements.get('close-audio').events.click();assert.equal(w.elements.get('audio-full').src,undefined);
 await button.events.click();assert.equal(w.audioPackets.length,1);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});
test('normal record refresh preserves the open audio player; hiding, switching or teardown clears it',async t=>{
 const w=await widget(t);w.state.messages=[audioMessage()];w.notify(w.state);await descendants(w.elements.get('messages')).find(n=>n.className==='button audio-preview').events.click();
 const player=w.elements.get('audio-full'),pauses=player.pauseCalls;player.currentTime=0.5;w.state.messages.push({id:'new-progress',authorId:'director',text:'다른 진행 보고'});w.notify(w.state);
 assert.equal(w.elements.get('audio-viewer').open,true);assert.equal(player.currentTime,0.5);assert.equal(player.pauseCalls,pauses);assert.equal(w.audioPackets.length,1);
 w.document.hidden=true;w.callbacks.visibilitychange();assert.equal(player.src,undefined);assert.equal(w.elements.get('audio-viewer').open,false);
 w.document.hidden=false;w.elements.get('project').value='second';await w.elements.get('project').events.change();assert.equal(player.src,undefined);
 w.callbacks.pagehide();assert.equal(player.src,undefined);
});
test('late audio responses and detached buttons cannot open a different project or a closed panel',async t=>{
 const w=await widget(t,{holdAudio:true});w.state.messages=[audioMessage()];w.notify(w.state);const button=descendants(w.elements.get('messages')).find(n=>n.className==='button audio-preview'),load=button.events.click();await settle();
 const packet=w.audioPackets[0];w.elements.get('project').value='second';await w.elements.get('project').events.change();
 w.receive({id:packet.id,result:{structuredContent:{projectId:'test',audio:{id:'a'.repeat(64),mimeType:'audio/wav'}},_meta:{'team-room/audioData':'data:audio/wav;base64,fixture'}}});await load;
 assert.notEqual(w.elements.get('audio-viewer').open,true);assert.equal(w.elements.get('audio-full').src,undefined);await button.events.click();assert.equal(w.audioPackets.length,1);
 w.callbacks.pagehide();assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});
test('untrusted audio URLs never become media sources',async t=>{
 const w=await widget(t,{badAudio:true});w.state.messages=[audioMessage()];w.notify(w.state);await descendants(w.elements.get('messages')).find(n=>n.className==='button audio-preview').events.click();
 assert.equal(w.elements.get('audio-full').src,undefined);assert.notEqual(w.elements.get('audio-viewer').open,true);
 assert.match(visibleText(w.elements.get('messages')),/불러오지 못했습니다/);
});
test('roster refresh updates the active team while preserving past author roles, target names and the draft',async t=>{
 const w=await widget(t),input=w.elements.get('text');input.value='보존할 초안';
 w.state.members.push({id:'one',name:'새 표시 이름',role:'새 역할'},{id:'two',name:'새 담당자',role:'개발자'});
 w.state.messages.push({id:'old-result',authorId:'one',authorName:'작성 당시 이름',authorRole:'작성 당시 역할',kind:'progress',toMemberId:'two',text:'기존 보고'});w.notify(w.state);
 assert.match(visibleText(w.elements.get('messages')),/작성 당시 이름 · 작성 당시 역할/);
 w.state.formerMembers=[w.state.members.find(m=>m.id==='two')];w.state.members=w.state.members.filter(m=>m.id!=='two');w.notify(w.state);
 assert.doesNotMatch(visibleText(w.elements.get('members')),/새 담당자/);assert.match(visibleText(w.elements.get('messages')),/대상 새 담당자/);
 assert.equal(input.value,'보존할 초안');assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 assert.equal(w.sent.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit').length,0);
});
const imageMessage=(id='preview')=>({id,requestId:'fixture-request',authorId:'director',kind:'progress',text:'중간 시안',images:[{id:'a'.repeat(64),caption:'시안 확인'}]});
test('progress images render from UI-only data, zoom and refresh without another image or AI call',async t=>{
 const w=await widget(t);w.state.messages.push(imageMessage());w.notify(w.state);await settle();
 const nodes=descendants(w.elements.get('messages')),img=nodes.find(n=>n.tag==='img');assert.equal(img.src,'data:image/png;base64,fixture');
 nodes.find(n=>n.className==='image-preview').events.click();assert.equal(w.elements.get('image-viewer').open,true);
 assert.equal(w.elements.get('image-full').src,img.src);w.elements.get('close-image').events.click();assert.equal(w.elements.get('image-full').src,undefined);
 w.state.requests.push({id:'status-fixture'});w.notify(w.state);await settle();
 assert.equal(w.imagePackets.length,1);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});
test('late image responses cannot update a different project or dispatch queued loads after teardown',async t=>{
 const w=await widget(t,{holdImages:true});w.state.messages.push(...Array.from({length:6},(_,i)=>imageMessage('preview-'+i)));w.notify(w.state);await settle();
 assert.equal(w.imagePackets.length,2,'image loading must have bounded concurrency');
 const oldImages=descendants(w.elements.get('messages')).filter(n=>n.className==='image-preview');
 const first=w.imagePackets[0];
 w.elements.get('project').value='second';await w.elements.get('project').events.change();
 w.receive({id:first.id,result:{structuredContent:{projectId:'test',image:{id:'a'.repeat(64),mimeType:'image/png'}},_meta:{'team-room/imageData':'data:image/png;base64,late'}}});await settle();
 assert.ok(oldImages.every(n=>!descendants(n).some(child=>child.tag==='img')));
 w.callbacks.pagehide();await settle();assert.equal(w.imagePackets.length,2);
});
test('untrusted remote image URLs are rejected and raw Markdown images never cause network loads',async t=>{
 const w=await widget(t,{badImage:true});w.state.messages.push({...imageMessage(),text:'![tracker](https://example.invalid/image.png)'});w.notify(w.state);await settle();
 assert.equal(descendants(w.elements.get('messages')).filter(n=>n.tag==='img').length,0);
 assert.match(visibleText(w.elements.get('messages')),/다시 보기/);
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});
test('meeting prose separates paragraphs and lists while keeping content and unsafe markup literal',async t=>{
 const w=await widget(t);
 const text=['## 진행 결과','','첫 번째  문장의 띄어쓰기입니다.','같은 문단의 다음 줄입니다.','','**중요한 변경**과 `inlineCode()`를 확인해 주세요.','','- 항목 하나','  - 하위 항목','- 항목 둘','','3. 세 번째 단계','4. 네 번째 단계','','```js','  const value = "<script>literal</script>";','\t//  공백과 들여쓰기 유지','```','','<img src=x onerror=alert(1)>'].join('\n');
 w.state.messages.push({id:'readability-fixture',authorId:'director',text});w.notify(w.state);
 const root=descendants(w.elements.get('messages')).find(n=>n.className==='text'),nodes=descendants(root);
 assert.ok(nodes.some(n=>/^h[3-6]$/.test(n.tag)));assert.ok(root.children.filter(n=>n.tag==='p').length>=3);
 assert.ok(nodes.some(n=>n.tag==='strong'));assert.equal(nodes.filter(n=>n.tag==='li').length,5);
 assert.equal(nodes.find(n=>n.tag==='ol').start,3);
 assert.ok(nodes.some(n=>n.textContent==='첫 번째  문장의 띄어쓰기입니다.\n같은 문단의 다음 줄입니다.'));
 assert.equal(nodes.find(n=>n.tag==='pre').children[0].textContent,'  const value = "<script>literal</script>";\n\t//  공백과 들여쓰기 유지');
 assert.equal(nodes.some(n=>['img','script','iframe'].includes(n.tag)),false);assert.match(visibleText(root),/<img src=x onerror=alert\(1\)>/);
 assert.equal(w.state.messages[0].text,text);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('technical details fold locally, preserve peer text and stay safe across refresh, project switch and teardown',async t=>{
 const w=await widget(t),message={id:'same-fixture-id',authorId:'director',text:'그림을 만들었어요. 실제 화면에서의 확인은 아직 남아 있어요.',details:'정확한 기술 근거\n\n`FixtureAsset.png`\n\n<script>literal evidence</script> ![remote](https://example.invalid/x.png)'};
 w.state.messages.push(message);w.notify(w.state);
 const find=()=>descendants(w.elements.get('messages')).find(n=>n.className==='message-details');
 let detail=find();assert.equal(detail.open,false);assert.equal(detail.children[0].textContent,'작업 상세 보기');
 assert.match(visibleText(detail),/FixtureAsset/);assert.equal(descendants(detail).some(n=>['img','script','iframe'].includes(n.tag)),false);
 const body=descendants(w.elements.get('messages')).find(n=>n.className==='body');assert.doesNotMatch(visibleText(body.children.find(n=>n.className==='text')),/FixtureAsset/);
 const calls=w.sent.length;detail.open=true;detail.events.toggle();assert.equal(detail.children[0].textContent,'작업 상세 접기');assert.equal(w.sent.length,calls);
 const stale=detail;w.state.messages.push({id:'refresh-trigger',authorId:'director',text:'확인 중이에요.'});w.notify(w.state);detail=find();assert.equal(detail.open,true);
 stale.open=false;stale.events.toggle();w.state.messages.push({id:'second-trigger',authorId:'director',text:'다음 확인을 진행해요.'});w.notify(w.state);assert.equal(find().open,true,'late detached toggle must not overwrite current state');
 w.second.messages.push({...message,details:'다른 프로젝트의 별도 기술 정보'});
 w.elements.get('project').value='second';await w.elements.get('project').events.change();await settle();assert.equal(find().open,false);assert.doesNotMatch(visibleText(find()),/FixtureAsset/);
 const current=find();w.callbacks.pagehide();current.open=true;current.events.toggle();assert.equal(current.children[0].textContent,'작업 상세 보기');
 assert.equal(w.state.messages[0].details,message.details);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.imagePackets.length,0);
});
test('dense historical prose gains display breaks without changing its text or invoking AI',async t=>{
 const w=await widget(t);
 const text='화면이 빽빽해 보이는 이유를 확인했습니다. '+ '문장과 문단 사이에 여유를 두어 중요한 내용을 쉽게 찾을 수 있게 합니다. '.repeat(5)+'\n기존 기록은 그대로 보관합니다. 다음 작업도 같은 방식으로 확인합니다.';
 w.state.messages.push({id:'dense-fixture',authorId:'director',text});w.notify(w.state);
 const root=descendants(w.elements.get('messages')).find(n=>n.className==='text');
 const chunks=descendants(root).filter(n=>n.className==='prose-chunk');
 assert.ok(chunks.length>=3);
 const exactText=n=>(n.textContent||'')+n.children.map(exactText).join('');
 assert.equal(exactText(root),text);assert.equal(w.state.messages[0].text,text);
 for(let i=0;i<3;i++)await w.intervals[0]();
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 assert.equal(w.sent.filter(p=>p.method==='tools/call'&&p.params.name!=='room_state').length,0);
});

test('display breaks preserve long inline code, emphasis, URLs and fenced code',async t=>{
 const w=await widget(t),code='value. '.repeat(35),bold='중요한 문장입니다. '.repeat(20),url='https://example.invalid/'+ 'part.'.repeat(40);
 const text='`'+code+'`\n\n**'+bold+'**\n\n'+url+'\n\n```txt\n'+code+'\n```';
 w.state.messages.push({id:'protected-fixture',authorId:'director',text});w.notify(w.state);
 const root=descendants(w.elements.get('messages')).find(n=>n.className==='text'),nodes=descendants(root);
 assert.equal(nodes.filter(n=>n.className==='prose-chunk').length,0);
 assert.ok(nodes.some(n=>n.tag==='code'&&n.textContent===code));
 assert.ok(nodes.some(n=>n.tag==='strong'&&visibleText(n).includes(bold)));
 assert.ok(nodes.some(n=>n.textContent===url));
 assert.equal(nodes.find(n=>n.tag==='pre').children[0].textContent,code);
});

test('deeply indented meeting lists remain bounded and preserve every item',async t=>{
 const w=await widget(t),lines=Array.from({length:40},(_,index)=>'  '.repeat(index)+'- 예시 항목 '+index);
 w.state.messages.push({id:'nested-fixture',authorId:'director',text:lines.join('\n')});w.notify(w.state);
 const root=descendants(w.elements.get('messages')).find(n=>n.className==='text');
 assert.ok(descendants(root).filter(n=>n.tag==='ul').length<=9);
 for(let index=0;index<40;index++)assert.ok(visibleText(root).includes('예시 항목 '+index));
});
test('composer sends only to director and renders direct peer replies with context',async t=>{
 const w=await widget(t);w.elements.get('text').value='진행 요청';w.elements.get('text').events.input();await w.elements.get('form').events.submit({preventDefault(){}});
 assert.deepEqual(Array.from(w.sent.find(p=>p.params?.name==='room_submit').params.arguments.recipients),['director']);
 assert.equal(w.elements.has('recipients'),false);
 w.state.members.push({id:'planner',name:'테스트 기획',role:'기획자'},{id:'qa',name:'테스트 QA',role:'QA'});
 w.state.messages.push({id:'q',authorId:'planner',authorName:'테스트 기획',kind:'question',toMemberId:'qa',text:'실제 질문 fixture',provenance:'participant-posted'},
 {id:'a',authorId:'qa',authorName:'테스트 QA',kind:'answer',toMemberId:'planner',replyTo:'q',text:'실제 답변 fixture',provenance:'participant-posted'});
 await w.intervals[0]();const text=visibleText(w.elements.get('messages'));
 assert.match(text,/테스트 기획 · 기획자/);assert.match(text,/테스트 QA · QA/);assert.match(text,/질문/);assert.match(text,/답변/);assert.match(text,/실제 질문 fixture/);assert.doesNotMatch(text,/기록 정보|참여자 직접 기록/);
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);
});
test('Enter sends once, while Shift+Enter, Korean composition and key repeat do not',async t=>{
 const w=await widget(t),input=w.elements.get('text');input.value='안녕하세요';input.events.input();
 let prevented=0;const key=extra=>({key:'Enter',preventDefault(){prevented++;},...extra});
 await input.events.keydown(key({shiftKey:true}));
 input.events.compositionstart();await input.events.keydown(key({}));input.events.compositionend();
 await input.events.keydown(key({isComposing:true}));await input.events.keydown(key({keyCode:229}));
 assert.equal(prevented,0);assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 await input.events.keydown(key({repeat:true}));assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 const sending=input.events.keydown(key({}));await input.events.keydown(key({}));await sending;await settle();
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);
 assert.deepEqual(Array.from(w.sent.find(p=>p.params?.name==='room_submit').params.arguments.recipients),['director']);
});
test('Enter cannot bypass empty, paused, unsupported or uncertain send controls',async t=>{
 for(const options of [{},{capability:false},{messageFails:true}]){
  const w=await widget(t,options),input=w.elements.get('text'),key=()=>({key:'Enter',preventDefault(){}});
  await input.events.keydown(key());assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
  input.value='test';input.events.input();w.state.paused=true;await w.intervals[0]();await input.events.keydown(key());assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
  w.state.paused=false;await w.intervals[0]();await input.events.keydown(key());await input.events.keydown(key());
  assert.equal(w.sent.filter(p=>p.method==='ui/message').length,options.capability===false?0:1);
 }
});
test('project selection is explicit, read-only, isolated and retains separate drafts',async t=>{
 const w=await widget(t,{autoSelect:false}),input=w.elements.get('text'),select=w.elements.get('project');
 input.value='unscoped';input.events.input();assert.equal(w.elements.get('send').disabled,true);
 assert.equal(select.value,'');select.value='test';await select.events.change();input.value='A draft';
 select.value='second';await select.events.change();assert.equal(input.value,'');assert.match(w.elements.get('input-label').textContent,/다른 총괄/);
 w.notify({...w.state,messages:[{id:'wrong',text:'A transcript'}]});assert.equal(select.value,'second');assert.doesNotMatch(visibleText(w.elements.get('messages')),/A transcript/);
 input.value='B draft';select.value='test';await select.events.change();assert.equal(input.value,'A draft');
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
 select.value='second';await select.events.change();assert.equal(input.value,'B draft');
 await w.elements.get('form').events.submit({preventDefault(){}});
 assert.equal(w.sent.find(p=>p.params?.name==='room_submit').params.arguments.projectId,'second');
 assert.equal(w.state.requests.length,0);assert.equal(w.second.requests.length,1);
});

test('fullscreen to inline converges to bounded height without resize feedback',async t=>{
 const w=await widget(t);
 assert.equal(w.styles.get('--room-height'),'720px');
 w.receive({method:'ui/notifications/host-context-changed',params:{displayMode:'fullscreen',containerDimensions:{height:1100}}});
 assert.equal(w.styles.get('--room-height'),'1100px');
 w.receive({method:'ui/notifications/host-context-changed',params:{displayMode:'inline',containerDimensions:{maxHeight:640}}});
 assert.equal(w.styles.get('--room-height'),'640px');
 const count=w.sent.length;
 for(let i=0;i<50;i++){w.window.innerHeight=640+i;w.callbacks.resize();w.receive({method:'ui/notifications/host-context-changed',params:{containerDimensions:{maxHeight:640}}});}
 assert.equal(w.sent.length,count);
 w.receive({method:'ui/notifications/host-context-changed',params:{displayMode:'fullscreen',containerDimensions:{height:900}}});
 w.receive({method:'ui/notifications/host-context-changed',params:{displayMode:'inline'}});
 assert.equal(w.styles.get('--room-height'),'720px');
 assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);
});

test('teardown acknowledges a host request with a colliding ID and stops pending polling permanently',async t=>{
 const w=await widget(t);
 const polling=w.intervals[0]();const id=w.sent.at(-1).id;
 w.receive({method:'ui/resource-teardown',id,params:{}});await polling;await settle();
 assert.equal(w.document.body.hidden,true);
 assert.ok(w.sent.some(p=>p.id===id&&!p.method&&p.result));
 const count=w.sent.length;
 w.notify({...w.state,messages:[{id:'late',text:'late message'}]});
 w.callbacks.visibilitychange();w.callbacks.resize();await w.intervals[0]();
 assert.equal(w.sent.length,count);assert.equal(w.elements.get('messages').children.length,0);
 assert.equal(w.elements.get('send').disabled,true);
});

test('pagehide also disposes a view when the host omits teardown',async t=>{
 const w=await widget(t);w.callbacks.pagehide();const count=w.sent.length;
 await w.intervals[0]();w.callbacks.visibilitychange();await settle();
 assert.equal(w.sent.length,count);assert.equal(w.document.body.hidden,true);
});
