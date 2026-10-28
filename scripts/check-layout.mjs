// Optional real-browser regression. No real host, account, chats or model calls.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const modulePath=process.env.PLAYWRIGHT_MODULE;
const {chromium}=await import(modulePath?pathToFileURL(modulePath).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const output=path.join(root,'.local');fs.mkdirSync(output,{recursive:true});
const report={host:'isolated Chromium harness, not Codex',cases:[]};
async function mount(page,html,width){
 await page.setViewportSize({width,height:1000});
 await page.setContent('<!doctype html><html><body style="margin:0"><iframe title="Test meeting" style="display:block;border:0;width:100%;height:1000px"></iframe></body></html>');
 await page.evaluate(html=>{
  window.packets=[];
  const iframe=document.querySelector('iframe');
  window.addEventListener('message',event=>{
   if(event.source!==iframe.contentWindow)return;
   const p=event.data;window.packets.push(p);
   if(p.method==='ui/notifications/size-changed' && p.params.height)iframe.style.height=p.params.height+'px';
   if(p.id===undefined||!p.method)return;
   let result={};
   if(p.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostCapabilities:{message:{text:{}}},hostContext:{displayMode:'fullscreen',containerDimensions:{height:1000}}};
   if(p.method==='tools/call')result={structuredContent:{project:null,projects:[],members:[],requests:[],messages:[],paused:true}};
   event.source.postMessage({jsonrpc:'2.0',id:p.id,result},'*');
  });
  iframe.srcdoc=html;
 },html);
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
 for(const width of [1280,420]){
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
  await page.screenshot({path:path.join(output,`layout-${width}.png`)});
  await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({jsonrpc:'2.0',id:'teardown-fixture',method:'ui/resource-teardown',params:{}},'*'));
  await page.waitForFunction(()=>window.packets.some(p=>p.id==='teardown-fixture'&&p.result));
  const calls=await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call').length);
  await page.waitForTimeout(4200);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='tools/call').length),calls);
  assert.equal(await frame.evaluate(()=>document.body.hidden),true);
  assert.equal(await page.evaluate(()=>window.packets.filter(p=>p.method==='ui/message').length),0);
  report.cases.push({width,transitions:20,heights,layout,teardown:'acknowledged; no polling for 4.2 seconds',modelMessages:0});
  await page.close();
 }
 fs.writeFileSync(path.join(output,'layout-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
