// Real widget/ZIP/store in an isolated browser host; no native chats or AI.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {demoSession} from './demo-session.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,args:['--mute-audio'],...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const out=path.resolve('.local');fs.mkdirSync(out,{recursive:true});const cases=[];
try{
 for(const width of [420,1280])for(const [locale,language] of [['ko-KR','ko'],['en-US','en'],['ja-JP','ja'],['zh-CN','zh-Hans'],['zh-TW','zh-Hant']]){
  const session=await demoSession({recovery:true});
  try{
   const page=await browser.newPage({locale,viewport:{width,height:1000}});await page.goto(session.url);const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>document.querySelector('#connection').textContent&&!document.querySelector('#check-connection').disabled);
   assert.equal(await frame.locator('#project').inputValue(),'');assert.equal(await frame.locator('html').getAttribute('lang'),language);await frame.locator('#open-menu').click();await frame.locator('#import-panel summary').first().click();await frame.locator('#import-file').setInputFiles(session.backupPath);await frame.locator('#import-preview').waitFor({state:'visible'});assert(await frame.locator('#import-apply').isEnabled());assert(!session.registry.read().projects.some(p=>p.id==='recovery'));
   assert.equal(await frame.locator('#room-menu').evaluate(el=>el.scrollWidth>el.clientWidth),false);await frame.locator('#import-panel').screenshot({path:path.join(out,`backup-preview-${language}-${width}.png`)});
   await frame.locator('#import-apply').click();await frame.waitForFunction(()=>/복구했습니다|Backup restored|復元しました|备份已恢复|備份已還原/.test(document.querySelector('#import-status').textContent));assert(session.registry.read().projects.some(p=>p.id==='recovery'));assert.equal(JSON.parse(fs.readFileSync(session.registry.roomPath('recovery'),'utf8')).paused,true);
   await frame.locator('#close-menu').click();await frame.locator('#project').selectOption('recovery');await frame.locator('#paused').waitFor({state:'visible'});assert.match(await frame.locator('#messages').innerText(),/Preserve 原文 \/ 원문 exactly/);assert.match(await frame.locator('#messages').innerText(),/Original sound caption/);assert.equal(await frame.locator('#messages .message-details').count(),1);
   assert(await frame.locator('#messages img').count()>0);await frame.locator('#open-menu').click();assert.match(await frame.locator('#pause').innerText(),/재개|Resume|再開|恢复|恢復/);if(await frame.locator('#import-panel').getAttribute('open')===null)await frame.locator('#import-panel summary').first().click();await frame.locator('#import-saved-refresh').click();await frame.locator('#import-saved-list button').first().waitFor();await frame.locator('#import-saved-list button').first().click();await frame.locator('#import-preview').waitFor({state:'visible'});assert.equal(await frame.locator('#import-apply').isEnabled(),false);
   const packets=await page.evaluate(()=>window.demoPackets);assert.equal(packets.filter(p=>p.method==='ui/message'||p.method==='openai/message').length,0);assert.equal(packets.filter(p=>p.params?.name==='room_import'&&p.params.arguments.operation==='apply').length,1);cases.push({width,language,realZipUpload:true,explicitPreviewBeforeRestore:true,pausedRecovery:true,originalTextAndMedia:true,noOverwriteReplay:true,modelCalls:0});await page.close();
  }finally{await session.close();}
 }
 fs.writeFileSync(path.join(out,'import-layout-report.json'),JSON.stringify({host:'isolated Chromium, not native Codex',cases},null,2));console.log(JSON.stringify({cases:cases.length,passed:true,modelCalls:0}));
}finally{await browser.close();}
