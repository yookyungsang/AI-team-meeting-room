import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {RoomExport} from '../host-plugin/exports.mjs';
import {crc32,unzipOwn} from '../host-plugin/zip.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';
import {wav} from './audio.fixture.mjs';
import {inspectBackup} from '../host-plugin/imports.mjs';
function fixture(t){
 const base=path.resolve('.local/test-data');fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'export-check-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const registry=new Projects(home,{setupContextReader:id=>{assert(id.startsWith('alpha-')||id.startsWith('beta-'));const project=id.split('-')[0];return {scopeId:project,name:'Fixture '+project,nativeProjectIds:['native-'+project]};},openingReader:(_projects,id)=>({status:id?.startsWith('alpha-')?'selected':'unregistered',...(id?.startsWith('alpha-')?{projectId:'alpha'}:{})}),catalogReader:project=>({candidates:project.members.map(m=>({...m,chatTitle:m.name}))})});
 for(const id of ['alpha','beta'])registry.configure({id,name:'Fixture '+id,members:[{id:'director',name:'Fixture director',role:'총괄 디렉터',threadId:id+'-director',hostId:'local'}]});
 const store=new RoomStore(registry.roomPath('alpha'),registry.get('alpha')),exporter=new RoomExport(registry,store);
 return {home,registry,store,exporter};
}
const call=(f,name,args,threadId='alpha-director')=>handle({method:'tools/call',params:{name,arguments:args,_meta:{thread_id:threadId}}},f.registry);
function post(f){
 const requestId=randomUUID(),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'),image=path.join(f.home,'sample.png'),audio=path.join(f.home,'sample.wav');fs.writeFileSync(image,png);fs.writeFileSync(audio,wav());
 f.store.submit({id:requestId,text:'  Original user request\n\nPreserve this.  ',recipients:['director']});f.store.claim({requestId,memberId:'director'});
 f.store.reply({requestId,memberId:'director',text:'<script>alert(1)</script>\n완료',details:'Exact technical evidence\n<iframe src="https://invalid.example">',images:[{path:image,caption:'<img onerror=bad>'}],audio:[{path:audio,caption:'Audio fixture'}]});return {png,requestId};
}

test('connection check reports scope and host limitations without writes or claiming native authorization',t=>{
 const f=fixture(t),before=fs.readFileSync(f.registry.file),result=call(f,'room_check',{host:{message:true,draft:true,protocol:'2026-01-26'}});
 assert(!result.isError);const rows=result.structuredContent.rows;assert.equal(rows.find(r=>r.id==='director').status,'ok');assert.equal(rows.find(r=>r.id==='native-tools').status,'unverified');assert(rows.every(r=>typeof r.detailKo==='string'));
 const mismatch=call(f,'room_check',{projectId:'alpha',host:{message:false,draft:false}},'beta-open');assert.equal(mismatch.structuredContent.rows.find(r=>r.id==='director').status,'warning');assert.equal(mismatch.structuredContent.rows.find(r=>r.id==='messages').status,'warning');
 assert(fs.readFileSync(f.registry.file).equals(before));assert(!fs.existsSync(f.store.file));assert(!fs.existsSync(path.join(f.home,'team-setups.json')));assert.equal(TOOLS.find(t=>t.name==='room_check').annotations.readOnlyHint,true);
});

test('exports retain one exact room, offline media and source records with independently known CRC and file hashes',t=>{
 const f=fixture(t),{png}=post(f),original=fs.readFileSync(f.store.file),roster=fs.readFileSync(f.registry.file);assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
 const preview=f.exporter.preview();assert.equal(preview.images,1);assert.equal(preview.audio,1);assert(!fs.existsSync(path.join(f.home,'exports')));
 const result=f.exporter.create({projectId:'alpha',exportId:randomUUID()}),entries=new Map(unzipOwn(fs.readFileSync(result.path)).map(e=>[e.name,e.bytes]));
 assert(entries.get('room.json').equals(original));assert.equal(JSON.parse(entries.get('project.json')).id,'alpha');assert(!entries.get('project.json').toString().includes('beta-director'));
 assert(entries.get([...entries.keys()].find(n=>n.startsWith('images/'))).equals(png));assert(entries.has('index.html'));assert(entries.has('meeting.md'));assert(entries.has('manifest.json'));
 const html=entries.get('index.html').toString();assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<iframe'));assert(html.includes('<audio controls'));assert(html.includes('images/'));
 assert(fs.readFileSync(f.store.file).equals(original));assert(fs.readFileSync(f.registry.file).equals(roster));
});

test('the same export ID reuses the original snapshot after later posts, without overwriting another export',t=>{
 const f=fixture(t);post(f);const args={projectId:'alpha',exportId:randomUUID()},first=f.exporter.create(args),bytes=fs.readFileSync(first.path);
 f.store.submit({id:randomUUID(),text:'A later request',recipients:['director']});const again=new RoomExport(f.registry,f.store).create(args);assert.equal(again.replayed,true);assert.equal(again.sha256,first.sha256);assert(fs.readFileSync(first.path).equals(bytes));assert.equal(again.counts.requests,1);
 const newer=f.exporter.create({...args,exportId:randomUUID()});assert.notEqual(newer.path,first.path);assert.equal(newer.counts.requests,2);
});

test('archive bytes and local paths stay in UI metadata; cross-project download and unsafe paths are rejected',t=>{
 const f=fixture(t);post(f);const args={projectId:'alpha',exportId:randomUUID()},created=call(f,'room_export',{...args,operation:'create'});assert(!created.isError);assert.equal(created.structuredContent.path,undefined);assert(created._meta['team-room/exportPath'].endsWith('.zip'));assert(!created.content[0].text.includes(f.home));
 const read=call(f,'room_export',{...args,operation:'download'});assert(read._meta['team-room/exportBytes']);assert.equal(read.structuredContent.data,undefined);assert.equal(call(f,'room_export',{...args,projectId:'beta',operation:'download'}).isError,true);
 assert.throws(()=>f.exporter.create({...args,exportId:'../escape'}));assert.throws(()=>f.exporter.download({...args,exportId:'../escape'}));
});

test('damaged or missing media and corrupted saved archives fail without a partial successful backup',t=>{
 const f=fixture(t);post(f);const image=f.store.read().messages.find(m=>m.images?.length).images[0],file=path.join(f.store.images.directory,image.id),original=fs.readFileSync(file),args={projectId:'alpha',exportId:randomUUID()};
 fs.unlinkSync(file);assert.throws(()=>f.exporter.create(args));assert(!fs.existsSync(path.join(f.home,'exports/alpha',args.exportId+'.zip')));fs.writeFileSync(file,original);
 const created=f.exporter.create(args),bytes=fs.readFileSync(created.path);bytes[40]^=1;fs.writeFileSync(created.path,bytes);assert.throws(()=>f.exporter.create(args));
});

test('export directory junctions cannot redirect writes outside runtime storage',t=>{
 const f=fixture(t),outside=path.join(f.home,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.home,'exports'),'junction');assert.throws(()=>f.exporter.create({projectId:'alpha',exportId:randomUUID()}),/runtime storage/);assert.equal(fs.readdirSync(outside).length,0);
});

function withSecret(f){
 const token='sk-'+'proj-'+('SyntheticFixture9').repeat(4),requestId=randomUUID();
 const text='  Keep original\n'+token+'\n한국어 원문  ';
 f.store.submit({id:requestId,text,recipients:['director']});f.store.claim({requestId,memberId:'director'});
 f.store.reply({requestId,memberId:'director',text:'Done without a pause: '+token,details:'api_key="'+token+'"',images:[{path:path.join(f.home,'sample.png'),caption:token}]});
 return {token,requestId,text};
}
test('suspected secrets never block director completion; only the optional sharing copy is masked',t=>{
 const f=fixture(t),{png}=post(f),{token,requestId,text}=withSecret(f);
 assert.equal(f.store.get(requestId).request.status,'completed');assert.equal(f.store.get(requestId).request.text,text);
 const before=fs.readFileSync(f.store.file),registry=fs.readFileSync(f.registry.file);
 const backup=f.exporter.create({projectId:'alpha',exportId:randomUUID()}),original=new Map(unzipOwn(fs.readFileSync(backup.path)).map(e=>[e.name,e.bytes]));
 assert(original.get('room.json').equals(before));assert(original.get('meeting.md').toString().includes(token));
 const args={projectId:'alpha',exportId:randomUUID(),format:'share'},shared=f.exporter.create(args),entries=new Map(unzipOwn(fs.readFileSync(shared.path)).map(e=>[e.name,e.bytes]));
 assert.equal(shared.redacted,true);assert(shared.secretFindings>=3);assert(!JSON.stringify(shared).includes(token));
 assert(!entries.has('room.json'));assert(!entries.has('project.json'));
 for(const [name,bytes] of entries)if(!name.startsWith('images/')&&!name.startsWith('audio/')){assert(!bytes.toString().includes(token),name);assert(!bytes.toString().includes('alpha-director'),name);}
 assert(entries.get('meeting.md').toString().includes('[REDACTED]'));assert(entries.get([...entries.keys()].find(n=>n.startsWith('images/'))).equals(png));
 assert.throws(()=>inspectBackup(fs.readFileSync(shared.path)),/공유용 사본/);
 assert(fs.readFileSync(f.store.file).equals(before));assert(fs.readFileSync(f.registry.file).equals(registry));
});
test('keep/mask sharing choices are durable, immutable per ID and separate from raw backups',t=>{
 const f=fixture(t);post(f);const {token}=withSecret(f),exportId=randomUUID(),args={projectId:'alpha',exportId,format:'share',redact:false};
 const first=f.exporter.create(args),bytes=fs.readFileSync(first.path);assert.equal(first.redacted,false);
 const entries=new Map(unzipOwn(bytes).map(e=>[e.name,e.bytes]));assert(entries.get('meeting.md').toString().includes(token));
 const again=new RoomExport(f.registry,f.store).create(args);assert.equal(again.replayed,true);assert.equal(again.sha256,first.sha256);
 assert.throws(()=>f.exporter.create({...args,redact:true}),/new export ID/);assert(fs.readFileSync(first.path).equals(bytes));
 const backup=f.exporter.create({projectId:'alpha',exportId});assert.notEqual(backup.path,first.path);assert(inspectBackup(fs.readFileSync(backup.path)));
 const download=f.exporter.download({projectId:'alpha',exportId,format:'share'});assert.equal(download.receipt.format,'share');assert.equal(download.data,bytes.toString('base64'));
 assert.throws(()=>f.exporter.create({...args,exportId:randomUUID(),format:'invalid'}));assert.throws(()=>f.exporter.create({...args,exportId:randomUUID(),redact:'false'}));
});
test('MCP sharing metadata reveals counts and policy, never the detected values or archive bytes',t=>{
 const f=fixture(t);post(f);const {token}=withSecret(f),args={projectId:'alpha',exportId:randomUUID(),format:'share',redact:true};
 const created=call(f,'room_export',{...args,operation:'create'});assert(!created.isError);assert.equal(created.structuredContent.format,'share');assert.equal(created.structuredContent.redacted,true);
 assert(!created.content[0].text.includes(token));assert(!created.content[0].text.includes(f.home));
 const downloaded=call(f,'room_export',{...args,operation:'download'});assert(!downloaded.isError);assert(downloaded._meta['team-room/exportBytes']);assert.equal(downloaded.structuredContent.data,undefined);
 assert.equal(call(f,'room_export',{...args,projectId:'beta',operation:'download'}).isError,true);
});

test('suspected secrets do not add a pause, approval or warning payload to model-facing completion receipts',t=>{
 const f=fixture(t),requestId=randomUUID(),token='sk-'+'proj-'+('SyntheticFixture9').repeat(4),text='원문 '+token;
 const submitted=call(f,'room_submit',{projectId:'alpha',id:requestId,text,recipients:['director']});assert(!submitted.isError);
 const claimed=call(f,'room_claim',{projectId:'alpha',requestId,memberId:'director'});assert(!claimed.isError);
 const replied=call(f,'room_reply',{projectId:'alpha',requestId,memberId:'director',text,details:'api_key="'+token+'"'});assert(!replied.isError);assert.equal(replied.structuredContent.saved,true);
 assert.equal(replied.structuredContent.warning,undefined);assert.equal(replied.structuredContent.secretFindings,undefined);
 assert.equal(f.store.get(requestId).request.status,'completed');assert.equal(f.store.read().paused,false);
 assert.equal(f.store.get(requestId).messages.at(-1).text,text);
});
