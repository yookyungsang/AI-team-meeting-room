// Records the real widget with synthetic records, using an isolated local host.
// No live chat messages, native chat creation, accounts or paid media APIs.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {demoSession} from './demo-session.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const output=path.resolve('.local/demo-recording');fs.mkdirSync(output,{recursive:true});
const demo=await demoSession(),browser=await chromium.launch({headless:true,args:['--mute-audio'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})}),page=await browser.newPage({viewport:{width:1280,height:720},locale:'en-US'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));let stopped=false,loop;
try{
 await page.goto(demo.url);const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>document.querySelector('#project').value==='demo');
 const sample=path.join(demo.home,'captured-layout.png');await frame.locator('.shell').screenshot({path:sample});demo.store.post({requestId:demo.requestId,memberId:'designer',kind:'progress',messageKey:'sample-image',text:'Visual results stay in the conversation, outside folded technical details.',images:[{path:sample,caption:'Captured plugin layout — example data'}]});
 await page.reload();const room=page.frames().find(f=>f!==page.mainFrame());await room.waitForFunction(()=>document.querySelector('#project').value==='demo');
 await room.addStyleTag({content:'#export-path{color:transparent!important;text-shadow:none!important}'});
 await room.locator('#records').evaluate(el=>{el.scrollTop=0;});
 const start=Date.now(),frames=[],chapters=[];
 const caption=async(text,ko)=>{chapters.push({time:(Date.now()-start)/1000,text,ko});await page.locator('#caption').evaluate((el,text)=>el.textContent=text,text);};
 loop=(async()=>{while(!stopped){const at=(Date.now()-start)/1000,file=path.join(output,'frame-'+String(frames.length).padStart(5,'0')+'.jpg');const box=await room.locator('#export-path').isVisible()?await room.locator('#export-path').boundingBox():null;await page.locator('#mask').evaluate((el,box)=>{el.style.display=box?'block':'none';if(box)Object.assign(el.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});},box);await page.screenshot({path:file,type:'jpeg',quality:85});frames.push({time:at,file});await wait(180);}})();
 await caption('Follow the team’s own questions and answers.','담당자들이 직접 남긴 질문과 답변을 한곳에서 확인합니다.');await wait(6000);
 await room.locator('.message-details summary').first().scrollIntoViewIfNeeded();await room.locator('.message-details summary').first().click();await caption('Plain reports first. Open exact work details only when needed.','쉬운 보고를 먼저 보고 필요한 작업 상세만 펼칩니다.');await wait(6000);
 await room.locator('.image-preview').last().scrollIntoViewIfNeeded();await room.locator('.image-preview').last().click();await caption('Click an attached result to view the real image.','첨부된 결과 이미지를 누르면 크게 볼 수 있습니다.');await wait(5000);await room.locator('#close-image').click();
 await room.locator('.audio-preview').first().scrollIntoViewIfNeeded();await room.locator('.audio-preview').first().click();await caption('Audio loads on request, with a manual playback control.','음원은 사용자가 선택할 때 불러오고 직접 재생합니다.');await wait(5000);await room.locator('#close-audio').click();
 await room.locator('#open-menu').click();await room.locator('#ui-language').selectOption('ko');await caption('Switch between Korean and English without changing the conversation.','대화 원문을 바꾸지 않고 한국어와 영어 메뉴를 전환합니다.');await wait(2500);await room.locator('#ui-language').selectOption('en');await wait(2500);
 await room.locator('#check-connection').click();await room.locator('#check-status').filter({hasText:'Checks finished'}).waitFor();await caption('Connection checks explain verified support and remaining limits.','연결 점검으로 확인된 지원과 남은 확인 사항을 구분합니다.');await room.locator('#check-rows').scrollIntoViewIfNeeded();await wait(7000);
 await room.locator('#export-room').click();await room.locator('#export-result').waitFor({state:'visible'});await caption('Back up original posts, images and audio as one local ZIP.','회의 원문·이미지·음원을 하나의 로컬 ZIP으로 백업합니다.');await room.locator('#export-download').scrollIntoViewIfNeeded();await wait(5000);
 const downloadPromise=page.waitForEvent('download');await room.locator('#export-download').click();const download=await downloadPromise;await download.saveAs(path.join(output,'example-meeting.zip'));await wait(3000);
 await room.locator('#close-menu').click();await room.locator('#records').evaluate(el=>{el.scrollTop=0;});await caption('Local checks and exports add no AI calls. Start with the setup guide.','연결 점검과 내보내기는 AI를 호출하지 않습니다. 설치 안내에서 시작하세요.');await wait(Math.max(1000,60000-(Date.now()-start)));
 stopped=true;await loop;fs.writeFileSync(path.join(output,'recording.json'),JSON.stringify({duration:(Date.now()-start)/1000,frames,chapters,context:'Real plugin UI in isolated browser host; synthetic records; no live agents; local path redacted.'},null,2));
 const media=path.resolve('docs/media');fs.mkdirSync(media,{recursive:true});await page.screenshot({path:path.join(media,'demo-preview.png')});
 console.log(JSON.stringify({recording:path.join(output,'recording.json'),frames:frames.length,duration:(Date.now()-start)/1000,liveAI:0}));
}finally{stopped=true;if(loop)await loop.catch(()=>{});await browser.close();await demo.close();}
