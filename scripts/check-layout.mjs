// Optional real-browser regression. No real host, account, chats or model calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {wav} from '../test/audio.fixture.mjs';
import {roleCatalog} from '../host-plugin/roles.mjs';
const root=path.resolve(import.meta.dirname,'..');
const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,args:['--mute-audio'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const output=path.join(root,'.local');fs.mkdirSync(output,{recursive:true});
const report={host:'isolated Chromium harness, not Codex',cases:[]};
async function mount(page,html,width){
 await page.setViewportSize({width,height:1000});
 // Intercept the entire fixture origin: no external server or network request.
 // A secure origin supplies native crypto.randomUUID used by explicit submits.
 await page.route('https://team-room.invalid/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"><iframe title="Test meeting" style="display:block;border:0;width:100%;height:1000px"></iframe></body></html>'}));
 await page.goto('https://team-room.invalid/');
 await page.evaluate(({html,roles})=>{
  window.fixtureRoles=roles;
  window.packets=[];
  const iframe=document.querySelector('iframe');
  window.addEventListener('message',event=>{
   if(event.source!==iframe.contentWindow)return;
   const p=event.data;window.packets.push(p);
   if(p.method==='ui/notifications/size-changed' && p.params.height)iframe.style.height=p.params.height+'px';
   if(p.id===undefined||!p.method)return;
   if(p.method==='ui/message'&&window.deferMessageReceipts){(window.delayedReceipts||=[]).push(p.id);return;}
   let result={};
   if(p.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostCapabilities:{message:{text:{}}},hostContext:{displayMode:'fullscreen',containerDimensions:{height:1000}}};
   if(p.method==='tools/call'){
    const empty={project:null,projects:[],members:[],requests:[],messages:[],paused:true};
    if(p.params.name==='room_submit'){
     const request={...p.params.arguments,status:'pending',jobs:[]};
     window.testRoomState.requests.push(request);
     result={structuredContent:{request,state:window.testRoomState,wakePrompt:'isolated keyboard fixture '+request.id}};
    }else if(p.params.name==='room_roster'){
     const a=p.params.arguments,view=window.rosterFixture;
     if(a.operation==='apply'){view.members=a.selection;view.revision++;window.testRoomState.members=view.members;window.testRoomState.project.revision=view.revision;}
     result={structuredContent:view};
    }else if(p.params.name==='room_audio'){
     result={structuredContent:{projectId:p.params.arguments.projectId,audio:{id:p.params.arguments.audioId,mimeType:'audio/wav'}},_meta:{'team-room/audioData':window.fixtureAudioData}};
     if(window.deferAudio){(window.delayedAudio||=[]).push({id:p.id,result});return;}
    }else if(p.params.name==='room_image'){
     result={structuredContent:{projectId:p.params.arguments.projectId,image:{id:p.params.arguments.imageId,mimeType:'image/png'}},_meta:{'team-room/imageData':window.fixtureImageData}};
     if(window.deferImages){(window.delayedImages||=[]).push({id:p.id,result});return;}
    }else result={structuredContent:window.testRoomState||empty};
   }
   event.source.postMessage({jsonrpc:'2.0',id:p.id,result},'*');
  });
  iframe.srcdoc=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; media-src data:">');
 },{html,roles:roleCatalog()});
 const frame=page.frames().find(f=>f!==page.mainFrame());
 await frame.waitForSelector('.shell');
 await page.waitForFunction(()=>window.packets.some(p=>p.method==='tools/call'));
 return frame;
}
async function context(page,params){
 await page.evaluate(params=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/host-context-changed',params},'*'),params);
 await page.waitForTimeout(30);
}
async function measurements(page,frame,count=20){
 const values=[];
 for(let i=0;i<count;i++){
  const height=await frame.evaluate(()=>Math.ceil(document.querySelector('.shell').getBoundingClientRect().height));values.push(height);
  // Emulate an auto-sizing host feeding measured content height into iframe height.
  await page.locator('iframe').evaluate((el,height)=>{el.style.height=height+'px';},height);
  await page.waitForTimeout(20);
 }
 return values;
}
try{
 const baseline=process.argv[2];
 if(baseline){
  const page=await browser.newPage(),frame=await mount(page,fs.readFileSync(baseline,'utf8'),1280);
  await context(page,{displayMode:'inline',containerDimensions:{maxHeight:720}});
  report.baselineHeights=await measurements(page,frame);
  await page.close();
 }
 for(const width of (process.env.TEAM_ROOM_LAYOUT_NARROW_ONLY==='1'?[420]:[1280,420])){
  const page=await browser.newPage(),frame=await mount(page,fs.readFileSync(path.join(root,'host-plugin/widget.html'),'utf8'),width);
  for(let i=0;i<10;i++){
   await context(page,{displayMode:'fullscreen',containerDimensions:{height:1000}});
   await context(page,{displayMode:'inline',containerDimensions:{maxHeight:720}});
  }
  const heights=await measurements(page,frame);assert.ok(heights.every(h=>h===720),JSON.stringify(heights));
  const layout=await frame.evaluate(()=>{
   const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
   return {shell:rect('.shell'),form:rect('.composer'),records:rect('.records'),width:innerWidth};
  });
  assert.ok(layout.form.top>=layout.records.bottom-1);assert.ok(layout.form.bottom<=layout.shell.bottom+1);
  assert.ok(layout.form.right<=layout.width+1);
  assert.ok(layout.shell.bottom-layout.form.bottom<=20,'composer must stay at bottom');
  assert.ok(layout.records.height>450,'footer controls must not consume transcript height');
  assert.equal(await frame.locator('#send').isVisible(),false,'large send button must not be displayed');
  assert.equal(await frame.locator('#send').getAttribute('tabindex'),'-1');
  assert.equal(await frame.locator('#text').getAttribute('aria-describedby'),'send-hint');
  assert.equal(await frame.locator('#text').getAttribute('aria-keyshortcuts'),'Enter');
  assert.equal(await frame.locator('#send-hint').isVisible(),false);
  assert.equal(await frame.locator('#form #result,#form .actions').count(),0,'no delivery history or hint row beneath composer');
  assert.match(await frame.locator('#send-hint').textContent(),/Enter 전송.*Shift\+Enter 줄바꿈/);
  await frame.locator('#open-menu').click();
  assert.equal(await frame.locator('#room-menu').evaluate(el=>el.open),true);
  assert.equal(await frame.locator('#send-hint').isVisible(),true);
  assert.equal(await frame.locator('#room-menu #connection').isVisible(),true);
  assert.equal(await frame.locator('.shell').evaluate(el=>el.getBoundingClientRect().height),720);
  assert.equal(await frame.locator('.composer').evaluate(el=>el.getBoundingClientRect().top),layout.form.top);
  await page.keyboard.press('Escape');
  assert.equal(await frame.locator('#room-menu').evaluate(el=>el.open),false);
  assert.equal(await frame.evaluate(()=>document.activeElement.id),'open-menu');
  await frame.locator('#open-menu').click();await frame.locator('#close-menu').click();
  assert.equal(await frame.locator('#room-menu').evaluate(el=>el.open),false);
  await page.evaluate(()=>{
   const text=['## 진행 결과','','요청하신 화면을 읽기 편하게 정리했습니다.','문장 사이의 띄어쓰기와 원래 줄바꿈을 유지합니다.','','**달라진 점**','','- 답변을 짧은 문단으로 나눕니다.','- 중요한 내용은 목록으로 구분합니다.','  - 하위 설명도 여유 있게 읽을 수 있습니다.','','## 다음 단계','','1. 변경된 내용을 확인해 주세요.','2. 필요한 수정 사항을 추가로 남겨 주세요.','','```js','const note = "  공백을 유지합니다  ";','console.log(note);','```','','<img src=x onerror=alert(1)>'].join('\n');
   const fixture={project:{id:'keyboard-fixture',name:'가독성 확인용 예시'},projects:[{id:'keyboard-fixture',name:'가독성 확인용 예시'}],members:[{id:'director',name:'예시 총괄',role:'총괄 디렉터'},{id:'planner',name:'예시 기획자',role:'기획자'}],requests:[],messages:[{id:'readability-user',authorId:'user',text:'현재 진행 상황과 다음 단계를 보기 좋게 정리해 주세요.'},{id:'readability-director',authorId:'director',kind:'progress',text}],paused:false};
   window.testRoomState=fixture;
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:fixture}},'*');
  });
  await frame.waitForSelector('.text h4');
  const typography=await frame.locator('.message:not(.user) .text').evaluate(el=>{const style=getComputedStyle(el),p=el.querySelector('p');return {fontSize:parseFloat(style.fontSize),lineHeight:parseFloat(style.lineHeight),wordSpacing:parseFloat(style.wordSpacing),paragraphGap:parseFloat(getComputedStyle(p).marginBottom)};});
  assert.ok(typography.fontSize>=14);assert.ok(typography.lineHeight>=typography.fontSize*1.8);assert.ok(typography.paragraphGap>=12);assert.ok(typography.wordSpacing>0);
  assert.equal(await frame.locator('.text img,.text script,.text iframe').count(),0,'message markup must remain literal text');
  assert.equal(await frame.locator('.text pre code').textContent(),'const note = "  공백을 유지합니다  ";\nconsole.log(note);');
  assert.equal(await frame.locator('.text ol>li').count(),2);assert.equal(await frame.locator('.text ul ul>li').count(),1);
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'prose must not widen the page');
  await page.evaluate(()=>{
   const dense='진행 상황을 쉽게 확인할 수 있도록 문장 사이에 여유를 두었습니다. '.repeat(8);
   window.testRoomState.messages[1].text='## 진행 결과\n\n'+dense+'\n\n- 다음 작업은 화면 확인입니다.\n- 기존 기록은 그대로 보관합니다.';
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.waitForSelector('.prose-chunk');
  assert.equal(await frame.locator('.message:not(.user) .text p').textContent(),'진행 상황을 쉽게 확인할 수 있도록 문장 사이에 여유를 두었습니다. '.repeat(8));
  const chunkGap=await frame.locator('.prose-chunk').nth(1).evaluate(el=>parseFloat(getComputedStyle(el).marginTop));
  assert.ok(chunkGap>=14,'dense prose needs visible breathing room');
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'dense prose must not widen the page');
  await frame.locator('#records').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:path.join(output,`layout-${width}.png`)});
  await page.screenshot({path:path.join(output,`readability-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await frame.locator('#open-menu').click();await frame.locator('.guide').evaluate(el=>{el.open=true;});
  await page.screenshot({path:path.join(output,`readability-menu-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await frame.locator('#close-menu').click();
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),0,'layout and menu reads must not wake AI');
  await page.evaluate(()=>{
   const fixture={project:{id:'keyboard-fixture',name:'쉬운 보고와 대화 · 가상 예시'},projects:[{id:'keyboard-fixture',name:'쉬운 보고와 대화 · 가상 예시'}],members:[{id:'director',name:'예시 총괄',role:'총괄'},{id:'designer',name:'예시 디자이너',role:'디자이너'},{id:'programmer',name:'예시 개발자',role:'프로그래머'}],requests:[],messages:[
    {id:'plain-final',authorId:'designer',kind:'final',text:'설정 화면에 쓸 그림 세 가지를 만들었어요.\n\n기존 그림과 이미 승인받은 내용은 그대로 유지했어요. 새 그림은 아직 승인 전인 시안이에요.\n\n다음에는 실제 화면에 넣어 크기와 글자 가독성을 확인해야 해요.',details:'가상 검증 자료 · 실제 프로젝트 기록이 아닙니다.\n\n원본: fixture-assets/settings-art/\n검사 근거: review/fixture-checks.json\n설정: RGBA, sRGB, Clamp\n\n기존 승인 상태 보존. 실제 기기 검증은 아직 미수행.\n\n<script>이 문자열은 코드로 실행하지 않습니다.</script>'},
    {id:'plain-question',authorId:'designer',kind:'question',toMemberId:'programmer',text:'작은 화면에서 설명이 잘려요. 두 줄로 나눠도 될까요?',details:'FixtureLabel: viewport 420px, wrap=2. Keep FixtureButton size unchanged.'},
    {id:'plain-answer',authorId:'programmer',kind:'answer',toMemberId:'designer',replyTo:'plain-question',text:'네. 두 줄로 나눠 주세요. 버튼 크기는 그대로 유지하면 돼요.'}
   ],paused:false};
   window.testRoomState=fixture;
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:fixture}},'*');
  });
  await frame.waitForSelector('.message-details');
  const detail=frame.locator('.message-details').first();
  assert.equal(await detail.evaluate(el=>el.open),false);
  assert.equal(await detail.locator('.text').isVisible(),false);
  assert.match(await frame.locator('.message').first().locator('.body>.text').innerText(),/기존 그림/);
  assert.equal(await frame.locator('.message-details script,.message-details img,.message-details iframe').count(),0);
  const detailCalls=await page.evaluate(()=>window.packets.length);
  await detail.locator('summary').click();await frame.waitForFunction(()=>document.querySelector('.message-details summary').textContent==='작업 상세 접기');
  assert.equal(await detail.locator('.text').isVisible(),true);assert.match(await detail.innerText(),/review\/fixture-checks.json/);
  assert.equal(await page.evaluate(()=>window.packets.length),detailCalls,'opening technical details must not call tools or AI');
  await page.evaluate(()=>{
   window.testRoomState.requests.push({id:'plain-refresh',text:'가상 새로고침',status:'processing',recipients:['director'],jobs:[]});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.waitForFunction(()=>document.querySelector('.message-details').open);
  await frame.locator('#records').evaluate(el=>{el.scrollTop=0;});
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'expanded details must not widen the page');
  await page.screenshot({path:path.join(output,`plain-report-details-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await detail.locator('summary').click();await frame.waitForFunction(()=>!document.querySelector('.message-details').open);
  assert.equal(await frame.locator('.composer').evaluate(el=>el.getBoundingClientRect().top),layout.form.top);
  await frame.locator('#records').evaluate(el=>{el.scrollTop=0;});
  await page.screenshot({path:path.join(output,`plain-report-${width}.png`),clip:{x:0,y:0,width,height:720}});
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>{
   const fixture={project:{id:'keyboard-fixture',name:'Keyboard fixture'},projects:[{id:'keyboard-fixture',name:'Keyboard fixture'}],members:[{id:'director',name:'Fixture director',role:'Director'}],requests:[],messages:[],paused:false};
   window.testRoomState=fixture;
   window.deferMessageReceipts=true;
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:fixture}},'*');
  });
  await frame.locator('#text').fill('키보드 전송 fixture');
  await frame.locator('#text').press('Shift+Enter');
  assert.match(await frame.locator('#text').inputValue(),/\n/);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),0);
  await frame.locator('#text').press('Enter');
  await page.waitForFunction(()=>window.packets.filter(p=>p.method==='ui/message').length===1);
  await frame.locator('#text').press('Enter');
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),1,'empty follow-up must not resend');
  assert.equal(await frame.locator('#text').evaluate(el=>el.readOnly),false,'host receipt must not lock new input');
  await frame.locator('#text').fill('진행 중 추가 조건');
  await frame.locator('#text').press('Enter');
  await page.waitForFunction(()=>window.packets.filter(p=>p.method==='ui/message').length===2);
  const submissions=await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call'&&p.params.name==='room_submit').map(p=>p.params.arguments));
  assert.equal(submissions[1].followUpTo,submissions[0].id);assert.notEqual(submissions[1].id,submissions[0].id);
  await frame.locator('#text').fill('다음 내용 작성 중');
  await page.evaluate(()=>{const target=document.querySelector('iframe').contentWindow;for(const id of window.delayedReceipts.reverse())target.postMessage({jsonrpc:'2.0',id,result:{}},'*');});
  await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#result').textContent.includes('호스트 전달 확인'));
  assert.equal(await frame.locator('#text').inputValue(),'다음 내용 작성 중','late receipts must preserve new draft');
  const afterDelivery=await frame.locator('#form').evaluate(el=>el.getBoundingClientRect().top);
  assert.equal(afterDelivery,layout.form.top,'delivery history must not push composer upward');
  assert.equal(await frame.locator('#result').isVisible(),false);
  await frame.locator('#open-menu').click();
  assert.equal(await frame.locator('#result').isVisible(),true);
  assert.match(await frame.locator('#result').textContent(),/키보드 전송 fixture/);
  await page.screenshot({path:path.join(output,`delivery-menu-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await frame.locator('#close-menu').click();
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=480;const ctx=canvas.getContext('2d');
   ctx.fillStyle='#102a35';ctx.fillRect(0,0,900,480);ctx.fillStyle='#edf4e9';ctx.font='bold 32px sans-serif';ctx.fillText('작업 중 시안 · 합성 테스트 화면',40,60);
   ['상태 표시','작업 화면','확인 버튼'].forEach((label,i)=>{ctx.fillStyle=['#458477','#bc965e','#536d95'][i];ctx.fillRect(40+i*280,100,250,280);ctx.fillStyle='#fff';ctx.font='24px sans-serif';ctx.fillText(label,60+i*280,145);});
   window.fixtureImageData=canvas.toDataURL('image/png');
   window.testRoomState.messages.push({id:'image-progress',requestId:'image-request',authorId:'director',kind:'progress',text:'작업 중인 화면입니다. 배치와 색상을 먼저 확인할 수 있습니다.',images:[{id:'a'.repeat(64),caption:'중간 시안 · 아직 작업 중입니다.'}]});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.locator('.image-preview').scrollIntoViewIfNeeded();
  await frame.waitForFunction(()=>{const image=document.querySelector('.image-preview img');return image?.complete&&image.naturalWidth===900;});
  assert.equal(await frame.locator('.image-preview img').getAttribute('alt'),'중간 시안 · 아직 작업 중입니다.');
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`image-progress-${width}.png`),clip:{x:0,y:0,width,height:720}});
  const imageReads=await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call'&&p.params.name==='room_image').length);
  await frame.locator('.image-preview').click();assert.equal(await frame.locator('#image-viewer').evaluate(el=>el.open),true);
  await frame.waitForFunction(()=>document.querySelector('#image-full').naturalWidth===900);
  await page.screenshot({path:path.join(output,`image-zoom-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await page.keyboard.press('Escape');assert.equal(await frame.locator('#image-viewer').evaluate(el=>el.open),false);
  assert.equal(await frame.evaluate(()=>document.activeElement.className),'image-preview');
  await page.evaluate(()=>{
   window.testRoomState.requests[0].status='processing';
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.waitForFunction(()=>Boolean(document.querySelector('.image-preview img')?.complete));
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call'&&p.params.name==='room_image').length),imageReads,'refresh uses cached immutable image bytes');
  await page.evaluate(()=>{
   window.testRoomState.messages.push({id:'usage-final',requestId:'image-request',authorId:'director',kind:'final',text:'요청한 기능을 구현하고 필요한 검증을 마쳤습니다. 아래는 가상 기록으로 확인하는 담당자별 완료 사용량입니다.'});
   window.testRoomState.usageReports=[{requestId:'image-request',total:{total_tokens:12450},complete:false,rows:[{name:'테스트 총괄',role:'총괄',status:'measured',usage:{input_tokens:5000,output_tokens:1200,total_tokens:6200}},{name:'테스트 개발자',role:'프로그래머',status:'measured',usage:{input_tokens:5000,output_tokens:1250,total_tokens:6250}},{name:'테스트 QA',role:'QA',status:'unavailable',usage:null}],quota:{available:true,rows:[{usedPercent:14,remainingPercent:86,windowDurationMins:10080,changePercentagePoints:4}]}}];
   window.testRoomState.work={configured:true,locks:[],checkpoints:2,validations:[{id:'fixture-case',label:'관련 검증',status:'passed',attempts:1,blocked:false}]};
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.locator('#messages .usage-report').scrollIntoViewIfNeeded();
  assert.match(await frame.locator('#messages .usage-report').innerText(),/테스트 QA · QA: 측정 불가/);
  assert.match(await frame.locator('#messages .usage-report').innerText(),/계정 전체 변화 \+4%p/);
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`work-usage-final-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await page.evaluate(data=>{
   window.fixtureAudioData=data;
   window.testRoomState.messages.push({id:'sound-final',requestId:'image-request',authorId:'director',kind:'final',text:'가상 테스트 음원입니다. 실제 프로젝트의 효과음이 아닙니다.',details:'테스트용 PCM WAV',audio:[{id:'c'.repeat(64),mimeType:'audio/wav',caption:'가상 효과음 · 합성 테스트 음원'}]});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  },'data:audio/wav;base64,'+wav({seconds:8}).toString('base64'));
  await frame.waitForSelector('.audio-preview');
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call'&&p.params.name==='room_audio').length),0);
  assert.equal(await frame.locator('.message-details .audio-preview').count(),0);
  await frame.locator('.audio-preview').click();await frame.waitForFunction(()=>document.querySelector('#audio-viewer').open);
  assert.equal(await frame.locator('#audio-full').evaluate(el=>el.autoplay),false);
  assert.equal(await frame.locator('#audio-full').evaluate(el=>el.controls),true);
  await frame.locator('#audio-full').evaluate(el=>el.play());
  await frame.waitForFunction(()=>document.querySelector('#audio-full').currentTime>0.1);
  const audioTime=await frame.locator('#audio-full').evaluate(el=>el.currentTime);
  await page.evaluate(()=>{
   window.testRoomState.messages.push({id:'while-audio-playing',authorId:'director',kind:'progress',text:'가상 검증: 다른 보고가 갱신돼도 미리듣기를 유지합니다.'});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.waitForFunction(()=>document.querySelector('#messages').textContent.includes('다른 보고가 갱신'));
  assert.equal(await frame.locator('#audio-full').evaluate(el=>el.paused),false);
  assert.ok(await frame.locator('#audio-full').evaluate(el=>el.currentTime)>=audioTime);
  await page.screenshot({path:path.join(output,`audio-preview-${width}.png`),clip:{x:0,y:0,width,height:720}});
  await frame.locator('#audio-viewer').screenshot({path:path.join(output,`audio-player-${width}.png`)});
  await frame.locator('#audio-title').evaluate(el=>{el.textContent='LongAudioCaption'.repeat(20);});
  assert.equal(await frame.locator('#audio-viewer').evaluate(el=>el.scrollWidth>el.clientWidth),false,'long audio captions must wrap');
  await frame.locator('#close-audio').click();await frame.waitForFunction(()=>!document.querySelector('#audio-full').getAttribute('src'));
  assert.equal(await frame.locator('#audio-full').evaluate(el=>el.paused),true);
  await frame.locator('.audio-preview').click();await frame.waitForFunction(()=>document.querySelector('#audio-viewer').open);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call'&&p.params.name==='room_audio').length),1);
  await page.keyboard.press('Escape');await frame.waitForFunction(()=>!document.querySelector('#audio-full').getAttribute('src'));
  assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>{
   const director={id:'director',name:'예시 총괄',role:'총괄 디렉터',roleType:'director'},designer={id:'designer',name:'예시 디자이너',role:'디자이너',roleType:'designer'},qa={id:'qa',name:'예시 QA',role:'QA',roleType:'qa'};
   window.rosterFixture={roles:window.fixtureRoles,projectId:window.testRoomState.project.id,revision:window.testRoomState.project.revision||1,optionsRevision:1,members:[director,designer],choices:[director,designer,qa]};
   window.testRoomState.members=window.rosterFixture.members;
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.locator('#open-menu').click();await frame.locator('#edit-roster').click();await frame.waitForSelector('.roster-row');
  assert.equal(await frame.locator('.roster-row').first().locator('button').isDisabled(),true);
  await frame.locator('#roster-choice').selectOption('qa');await frame.locator('#roster-add').click();
  assert.equal(await frame.locator('.roster-row').count(),3);await frame.locator('#roster-save').click();
  assert.equal(await frame.locator('.roster-row').first().locator('select').isDisabled(),true);
  await frame.locator('.roster-row').nth(1).locator('select').selectOption('programmer');
  assert.match(await frame.locator('.roster-role-note').nth(1).innerText(),/프로그래머/);
  await frame.locator('.roster-row').nth(1).locator('select').selectOption('designer');
  await frame.locator('.roster-row').nth(2).locator('select').selectOption('custom');
  await frame.locator('.roster-row').nth(2).locator('input').first().fill('예시 검수자');
  await frame.locator('.roster-row').nth(2).locator('input').nth(1).fill('번역 검수');
  assert.match(await frame.locator('.roster-role-note').nth(2).innerText(),/공통 기본 지침/);
  await frame.locator('#roster-save').click();
  await frame.waitForFunction(()=>document.querySelector('#roster-status').textContent.includes('구성원을 저장했습니다'));
  assert.equal(await frame.locator('#room-menu').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  assert.equal(await frame.locator('#roster-editor').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  const rosterAlignment=await frame.locator('.roster-row').evaluateAll(rows=>rows.map(row=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
   return {name:rect(row.querySelector('input')),role:rect(row.querySelector('select')),action:rect(row.querySelector('button')),custom:row.querySelector('.roster-role label:nth-child(2)').hidden?null:rect(row.querySelector('.roster-role input'))};
  }));
  for(const row of rosterAlignment){
   assert.ok(Math.abs(row.name.top-row.action.top)<=1,'member action must align with its name input');
   assert.ok(Math.abs(row.name.height-row.role.height)<=1,'name and role controls must have equal heights');
   assert.ok(Math.abs(row.name.height-row.action.height)<=1,'member action must match input height');
   assert.ok(Math.abs(row.name.left-rosterAlignment[0].name.left)<=1,'name column must not shift across members');
   assert.ok(Math.abs(row.role.left-rosterAlignment[0].role.left)<=1,'role column must not shift across members');
   assert.ok(Math.abs(row.name.right-rosterAlignment[0].name.right)<=1,'name column width must remain consistent');
   if(width>560)assert.ok(Math.abs(row.name.top-row.role.top)<=1,'name and role must align even for a custom role');
   else{assert.ok(row.role.top>row.name.bottom,'narrow rows stack role below name');assert.ok(Math.abs(row.role.left-row.name.left)<=1,'stacked fields share a left edge');}
   if(row.custom){assert.ok(row.custom.top>row.role.bottom,'custom role input stays below the selector');assert.ok(Math.abs(row.custom.left-row.role.left)<=1);}
  }
  await frame.locator('#roster-save').scrollIntoViewIfNeeded();await frame.locator('#room-menu').screenshot({path:path.join(output,`roster-editor-${width}.png`)});
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),2,'roster selection and saving must not wake AI');
  await frame.locator('#close-menu').click();assert.equal(await frame.locator('#roster-editor').isVisible(),false);
  await page.evaluate(()=>{
   window.deferImages=true;
   window.testRoomState.messages.push({id:'image-late',requestId:'image-request',authorId:'director',kind:'progress',text:'다음 시안',images:[{id:'b'.repeat(64),caption:'늦은 이미지 응답 예시'}]});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.locator('.image-preview').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.delayedImages?.length>0);
  await page.evaluate(()=>{
   window.deferAudio=true;
   window.testRoomState.messages.push({id:'sound-late',requestId:'image-request',authorId:'director',text:'늦은 음원 응답 검증',audio:[{id:'d'.repeat(64),mimeType:'audio/wav',caption:'늦은 가상 음원'}]});
   document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:{structuredContent:window.testRoomState}},'*');
  });
  await frame.locator('.audio-preview').last().click();await page.waitForFunction(()=>window.delayedAudio?.length>0);
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',id:'teardown-fixture',method:'ui/resource-teardown',params:{}},'*'));
  await page.waitForFunction(()=>window.packets.some(p=>p.id==='teardown-fixture'&&p.result));
  await page.evaluate(()=>{for(const packet of [...window.delayedImages,...(window.delayedAudio||[])])document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',...packet},'*');});
  const calls=await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call').length);
  await page.waitForTimeout(4200);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call').length),calls);
  assert.equal(await frame.evaluate(()=>document.body.hidden),true);assert.equal(await frame.locator('#audio-full').getAttribute('src'),null);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),2);
  report.cases.push({width,transitions:20,heights,layout,typography,rosterAlignment,safeReadableMessages:true,foldedTechnicalDetails:true,audioPreview:{lazy:true,outsideDetails:true,decodedWav:true,manualPlay:true,refreshKeepsPlayback:true,cache:true,closeStops:true,lateAfterTeardown:'ignored'},detailsPreservedOnRefresh:true,naturalPeerExample:true,inlineImages:true,imageZoom:true,imageCache:true,finalUsageByParticipant:true,missingUsageNotZero:true,lateImagesAfterTeardown:'ignored',teardown:'acknowledged; no polling for 4.2 seconds',sendButtonVisible:false,keyboardSubmit:true,inFlightAddition:true,outOfOrderReceiptsPreserveDraft:true,simulatedHostMessages:2,modelCalls:0});
  await page.close();
 }
 fs.writeFileSync(path.join(output,process.env.TEAM_ROOM_LAYOUT_NARROW_ONLY==='1'?'layout-report-narrow.json':'layout-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
