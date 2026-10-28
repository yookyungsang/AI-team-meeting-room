import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const script=fs.readFileSync(new URL('../host-plugin/widget.html',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.value='';this.disabled=false;this.hidden=false;this.scrollHeight=0;this.scrollTop=0;this.clientHeight=300;}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(name,fn){this.events[name]=fn;}
 requestSubmit(){return this.events.submit({preventDefault(){}});}
 querySelectorAll(){return this.children.flatMap(n=>[...(n.tag==='input'?[n]:[]),...n.querySelectorAll()]);}
 focus(){}
 closest(){return null;}
 set innerHTML(value){throw new Error('unsafe HTML rendering');}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function widget(t,{capability={},messageFails=false,autoSelect=true}={}){
 const elements=new Map(),sent=[],callbacks={},intervals=[];
 const projects=[{id:'test',name:'Test',directorName:'테스트 총괄'},{id:'second',name:'Second',directorName:'다른 총괄'}];
 const state={project:{id:'test',name:'Test'},projects,members:[{id:'director',name:'테스트 총괄',role:'총괄'}],requests:[],messages:[],paused:false};
 const second={project:{id:'second',name:'Second'},projects,members:[{id:'director',name:'다른 총괄',role:'리더'},{id:'writer',name:'작가',role:'작가'}],requests:[],messages:[],paused:false};
 const states=new Map([['test',state],['second',second]]);
 const chooser={project:null,projects,members:[],requests:[],messages:[],paused:true};
 const styles=new Map();
 const document={hidden:false,body:{hidden:false},documentElement:{style:{setProperty:(key,value)=>styles.set(key,value)}},activeElement:null,getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:tag=>new Element(tag),addEventListener:(name,fn)=>callbacks[name]=fn};
 const parent={postMessage:packet=>{sent.push(packet);if(packet.id===undefined)return;let result={};
  if(packet.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostCapabilities:{message:{text:capability},experimental:{'openai/message':{}}}};
  if(packet.method==='tools/call'){
   const {name,arguments:args}=packet.params;
   if(name==='room_state')result={structuredContent:args.projectId?states.get(args.projectId):chooser};
   if(name==='room_submit'){const target=states.get(args.projectId);target.requests.push({...args,status:'pending',jobs:[]});result={structuredContent:{request:target.requests.at(-1),state:target,wakePrompt:'fixture '+args.id}};}
  }
  queueMicrotask(()=>callbacks.message({source:parent,data:{jsonrpc:'2.0',id:packet.id,...(packet.method==='ui/message'&&messageFails?{error:{code:-1}}:{result})}}));
 }};
 const window={parent,addEventListener:(name,fn)=>callbacks[name]=fn};
 vm.runInNewContext(script,{window,document,crypto:{randomUUID},console,Intl,Date,Map,Set,Object,Array,JSON,setTimeout,clearTimeout,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){}});
 await settle();
 const notify=data=>callbacks.message({source:parent,data:{jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:data}}});
 if(autoSelect)notify(state);
 const receive=data=>callbacks.message({source:parent,data:{jsonrpc:'2.0',...data}});
 return {sent,elements,state,second,notify,callbacks,intervals,document,styles,receive,window};
}
test('bridge initialization and repeated state reads never wake AI',async t=>{const w=await widget(t);for(let i=0;i<4;i++){await w.intervals[0]();await settle();}assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.sent.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit').length,0);});
test('explicit submit wakes current chat once and subsequent polls do not',async t=>{const w=await widget(t);w.elements.get('text').value='test';w.elements.get('text').events.input();assert.equal(w.elements.get('send').disabled,false);const first=w.elements.get('form').events.submit({preventDefault(){}});await w.elements.get('form').events.submit({preventDefault(){}});await first;await settle();await w.intervals[0]();const messages=w.sent.filter(p=>p.method==='ui/message');assert.equal(messages.length,1);assert.equal(messages[0].params._meta['openai/message'].target,'active');assert.equal(w.state.requests.length,1);});
test('unsupported host keeps sending disabled',async t=>{const w=await widget(t,{capability:false});w.elements.get('text').value='test';w.elements.get('text').events.input();await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.sent.filter(p=>p.method==='ui/message').length,0);assert.equal(w.elements.get('send').disabled,true);});
test('failed host send locks uncertain request without automatic retry',async t=>{const w=await widget(t,{messageFails:true});w.elements.get('text').value='test';w.elements.get('text').events.input();await w.elements.get('form').events.submit({preventDefault(){}});await w.intervals[0]();await w.elements.get('form').events.submit({preventDefault(){}});assert.equal(w.sent.filter(p=>p.method==='ui/message').length,1);assert.equal(w.elements.get('send').disabled,true);assert.match(w.elements.get('result').textContent,/자동 재전송하지 않습니다/);});
test('hidden panel does not poll and reply text is rendered without HTML execution',async t=>{const w=await widget(t);const count=w.sent.length;w.document.hidden=true;await w.intervals[0]();assert.equal(w.sent.length,count);w.document.hidden=false;w.state.messages.push({id:'fixture',authorId:'director',authorName:'테스트 총괄',text:'<img src=x onerror=alert(1)>'});await w.intervals[0]();assert.equal(w.elements.get('messages').children.length,1);});

const visibleText=n=>[n.textContent||'',...n.children.map(visibleText)].join(' ');
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
