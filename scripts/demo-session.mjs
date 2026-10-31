// Real plugin UI + real local store, synthetic data. Never contacts Codex chats.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {handle} from '../host-plugin/server.mjs';
import {wav} from '../test/audio.fixture.mjs';
export async function demoSession(){
 const base=path.resolve('.local/demo-data');fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'session-')),token=randomUUID();
 const registry=new Projects(home,{openingReader:()=>({status:'selected',projectId:'demo'}),setupContextReader:()=>({scopeId:'demo-native',name:'Example project',nativeProjectIds:['demo-native']}),catalogReader:project=>({scopeId:'demo-native',candidates:project.members.map(m=>({threadId:m.threadId,hostId:m.hostId,chatTitle:m.name}))})});
 registry.configure({id:'demo',name:'Example project',members:[{id:'director',name:'Director',role:'Director',roleType:'director',threadId:'synthetic-director',hostId:'local'},{id:'designer',name:'Designer',role:'Designer',roleType:'designer',threadId:'synthetic-designer',hostId:'local'},{id:'programmer',name:'Programmer',role:'Programmer',roleType:'programmer',threadId:'synthetic-programmer',hostId:'local'},{id:'qa',name:'QA',role:'QA',roleType:'qa',threadId:'synthetic-qa',hostId:'local'}]});
 const store=new RoomStore(registry.roomPath('demo'),registry.get('demo')),requestId=randomUUID();
 store.submit({id:requestId,text:'Make the settings screen easier to read. Keep the existing button actions.',recipients:['director']});store.claim({requestId,memberId:'director'});
 store.claim({requestId,memberId:'designer'});const question=store.post({requestId,memberId:'designer',kind:'question',messageKey:'sample-question',toMemberId:'programmer',text:'Can we put the longer explanation on two lines? Please keep the button size.'});
 store.claim({requestId,memberId:'programmer'});store.post({requestId,memberId:'programmer',kind:'answer',replyTo:question.message.id,messageKey:'sample-answer',toMemberId:'designer',text:'Yes. I will keep the buttons and add space between the sections.'});
 store.post({requestId,memberId:'director',kind:'progress',messageKey:'sample-progress',text:'The layout decision is agreed. The programmer will check the change before handing it to QA.',details:'Example technical handoff\nEditable scope: ui/settings-layout.css\nPreserve existing button actions.\nDeveloper self-check precedes independent QA.\nThese are sample meeting records; no live agents were invoked.'});
 const audio=path.join(home,'example.wav');fs.writeFileSync(audio,wav());store.post({requestId,memberId:'designer',kind:'progress',messageKey:'sample-audio',text:'A short audio attachment can be previewed when needed. Click Play to listen.',audio:[{path:audio,caption:'Synthetic test tone — sample attachment'}]});
 const html=handle({method:'resources/read',params:{uri:'ui://team-room/meeting.html'}},registry).contents[0].text;
 const allowed=new Set(['room_state','room_check','room_export','room_roster','room_image','room_audio','room_projects','room_pause','room_manage','room_team_setup']);
 const server=http.createServer(async(req,res)=>{
  const send=(code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);};
  if(req.method==='GET'&&req.url==='/')return send(200,`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Team Room — recorded example</title><style>body{margin:0;background:#101010;color:#eee;font:14px system-ui}header{height:64px;box-sizing:border-box;padding:10px 24px;border-bottom:1px solid #444}header strong{display:block;font-size:18px}header span{font-size:12px;color:#bbb}iframe{display:block;width:100%;height:calc(100vh - 128px);border:0}footer{height:64px;box-sizing:border-box;padding:16px 24px;background:#222;font-size:18px}#mask{position:absolute;background:#222;color:#ddd;display:none;box-sizing:border-box;padding:8px;z-index:20}</style></head><body><header><strong>Team Meeting Room</strong><span>Real plugin UI · sample data · no live AI · local file path hidden</span></header><iframe title="Team Room" sandbox="allow-scripts allow-same-origin"></iframe><div id="mask">Local backup path · hidden for this demo</div><footer id="caption">Follow the team's own posts in one place.</footer><script>
const frame=document.querySelector('iframe');frame.srcdoc=${JSON.stringify(html).replace(/</g,'\\u003c')};window.demoPackets=[];
window.addEventListener('message',async event=>{if(event.source!==frame.contentWindow)return;const p=event.data;if(!p?.method||p.id===undefined)return;window.demoPackets.push(p);let result={};
try{if(p.method==='ui/initialize')result={protocolVersion:'2026-01-26',hostCapabilities:{message:{text:{}},downloadFile:{},experimental:{'openai/message':{}}},hostContext:{displayMode:'fullscreen',containerDimensions:{height:window.innerHeight-128}}};
else if(p.method==='tools/call'){const reply=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','x-demo-session':${JSON.stringify(token)}},body:JSON.stringify(p)});result=await reply.json();}
else if(p.method==='ui/message')result={isError:true,content:[{type:'text',text:'Demo host: no live AI or chat creation.'}]};
else if(p.method==='ui/download-file'){const resource=p.params.contents[0].resource,binary=atob(resource.blob),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:resource.mimeType})),a=document.createElement('a');a.href=url;a.download='example-meeting.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
frame.contentWindow.postMessage({jsonrpc:'2.0',id:p.id,result},'*');}catch(e){frame.contentWindow.postMessage({jsonrpc:'2.0',id:p.id,error:{code:-32000,message:e.message}},'*');}});
</script></body></html>`,'text/html; charset=utf-8');
  if(req.method!=='POST'||req.url!=='/rpc'||req.headers['x-demo-session']!==token)return send(403,'{}');
  let body='';for await(const chunk of req){body+=chunk;if(body.length>400000)return send(413,'{}');}
  try{const packet=JSON.parse(body);if(!allowed.has(packet.params?.name))return send(403,'{}');send(200,JSON.stringify(handle({method:'tools/call',params:{...packet.params,_meta:{thread_id:'synthetic-director'}}},registry)));}catch{return send(400,'{}');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port,home,registry,store,requestId,async close(){await new Promise(resolve=>server.close(resolve));}};
}
