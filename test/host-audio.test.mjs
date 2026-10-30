import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Projects} from '../host-plugin/projects.mjs';
import {RoomStore} from '../host-plugin/store.mjs';
import {RoomAudio,MAX_AUDIO_BYTES} from '../host-plugin/audio.mjs';
import {WorkControl} from '../host-plugin/control.mjs';
import {handle,TOOLS} from '../host-plugin/server.mjs';
import {wav} from './audio.fixture.mjs';

function fixture(t){
 const base=fileURLToPath(new URL('../.local/test-data/',import.meta.url));fs.mkdirSync(base,{recursive:true});const home=fs.mkdtempSync(path.join(base,'room-audio-'));t.after(()=>{assert.ok(path.resolve(home).startsWith(path.resolve(base)+path.sep+'room-audio-'));fs.rmSync(home,{recursive:true,force:true});});
 const registry=new Projects(home),members=['director','sound','other'].map(id=>({id,name:'Fixture '+id,role:id,threadId:'fixture-chat-'+id,hostId:'local'}));
 for(const id of ['alpha','beta'])registry.configure({id,name:id,members});
 const store=new RoomStore(registry.roomPath('alpha'),registry.get('alpha')),requestId=randomUUID(),file=path.join(home,'tone.wav');fs.writeFileSync(file,wav());
 store.submit({id:requestId,text:'Synthetic sound task',recipients:['director']});store.claim({requestId,memberId:'director'});store.claim({requestId,memberId:'sound'});
 const audio=[{path:file,caption:'가상 테스트 음원 · 실제 프로젝트 자료 아님'}],args={requestId,memberId:'sound',kind:'progress',messageKey:'sound-1',text:'Synthetic progress',audio};
 const call=(name,input)=>handle({method:'tools/call',params:{name,arguments:{projectId:'alpha',...input}}},registry);
 return {home,registry,store,requestId,file,audio,args,call};
}
test('audio snapshots keep original bytes and compact metadata through progress, final reports and retries',t=>{
 const f=fixture(t),bytes=fs.readFileSync(f.file),posted=f.store.post(f.args),clip=posted.message.audio[0];
 assert.equal(clip.mimeType,'audio/wav');assert.equal(clip.size,bytes.length);assert.ok(!JSON.stringify(f.store.snapshot()).includes(f.file));assert.ok(!JSON.stringify(f.store.get(f.requestId)).includes('audioInputKey'));
 fs.writeFileSync(f.file,wav({frequency:660}));assert.equal(f.store.post(f.args).created,false);assert.equal(f.store.audioFile({requestId:f.requestId,messageId:posted.message.id,audioId:clip.id}).dataUrl,'data:audio/wav;base64,'+bytes.toString('base64'));
 assert.throws(()=>f.store.post({...f.args,audio:[{path:f.file,caption:'changed'}]}),/덮어쓰지/);
 const next=f.store.post({...f.args,messageKey:'sound-2'});assert.notEqual(next.message.audio[0].id,clip.id);
 const final={requestId:f.requestId,memberId:'sound',text:'Final sound',audio:f.audio};const saved=f.store.reply(final);fs.unlinkSync(f.file);assert.equal(f.store.reply(final).id,saved.id);
 assert.throws(()=>f.store.reply({...final,audio:[]}));
});
test('invalid or mixed attachment batches cannot commit a message or copy files',t=>{
 const f=fixture(t),bad=path.join(f.home,'bad.wav'),huge=path.join(f.home,'huge.wav'),wrong=path.join(f.home,'renamed.mp3');fs.writeFileSync(bad,'not audio');fs.writeFileSync(huge,Buffer.alloc(MAX_AUDIO_BYTES+1));fs.copyFileSync(f.file,wrong);
 const baseline=fs.readFileSync(f.store.file);
 for(const audio of [[{path:bad,caption:'bad'}],[{path:huge,caption:'huge'}],[{path:wrong,caption:'wrong type'}],[{path:'relative.wav',caption:'relative'}],[{path:'https://example.invalid/a.mp3',caption:'remote'}],[{path:f.file,caption:''}],Array(4).fill(f.audio[0]),[f.audio[0],{path:bad,caption:'bad'}]])assert.throws(()=>f.store.post({...f.args,audio}));
 assert.throws(()=>f.store.post({...f.args,images:[{path:bad+'.png',caption:'missing image'}]}));
 const image=path.join(f.home,'valid.png'),png=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write('IHDR',12);fs.writeFileSync(image,png);
 assert.throws(()=>f.store.post({...f.args,images:[{path:image,caption:'valid image'}],audio:[{path:bad,caption:'invalid audio'}]}));
 assert.ok(fs.readFileSync(f.store.file).equals(baseline));assert.equal(fs.existsSync(f.store.file+'.audio'),false);assert.equal(fs.existsSync(f.store.file+'.images'),false);
 assert.throws(()=>f.store.post({...f.args,memberId:'outsider'}));
});
test('audio completion survives a handoff to a pending recipient who already requires final audio',t=>{
 const f=fixture(t);f.store.change(state=>state.requests[0].jobs.push({memberId:'other',state:'pending',requireFinalAudio:true}));
 const control=new WorkControl(f.store,f.home),result=control.recover({requestId:f.requestId,memberId:'director',fromMemberId:'sound',toMemberId:'other',confirmedStopped:true,reason:'Synthetic pending receiver',key:'pending-audio'});
 assert.equal(result.requireFinalAudio,true);assert.throws(()=>f.store.reply({requestId:f.requestId,memberId:'other',text:'missing audio'}),/최종 음원/);
});
test('MP3 and audio OGG signatures are recognized while video OGG and broken WAV are rejected',t=>{
 const f=fixture(t),reader=new RoomAudio(path.join(f.home,'audio-fixture'));
 const mp3=Buffer.alloc(417);mp3.set([255,251,144,100]);const ogg=Buffer.alloc(64);ogg.write('OggS');ogg.write('OpusHead',28);
 for(const [ext,bytes,mime] of [['mp3',mp3,'audio/mpeg'],['ogg',ogg,'audio/ogg']]){const file=path.join(f.home,'format.'+ext);fs.writeFileSync(file,bytes);const result=reader.stage(reader.input([{path:file,caption:'signature fixture'}]).items);assert.equal(result[0].mimeType,mime);}
 const video=Buffer.from(ogg);video.fill(0,28);video.write('theora',28);const file=path.join(f.home,'video.ogg');fs.writeFileSync(file,video);assert.throws(()=>reader.stage(reader.input([{path:file,caption:'not audio'}]).items));
 fs.writeFileSync(f.file,wav().subarray(0,48));assert.throws(()=>reader.stage(reader.input(f.audio).items),/잘렸/);
});
test('audio bytes are app-only and scoped to the exact project, request and message',t=>{
 const f=fixture(t),post=f.call('room_post',f.args),message=post.structuredContent.message,clip=message.audio[0];
 assert.equal(post.isError,undefined);assert.equal(TOOLS.find(t=>t.name==='room_audio')._meta.ui.visibility[0],'app');
 const lookup={requestId:f.requestId,messageId:message.id,audioId:clip.id},result=f.call('room_audio',lookup);
 assert.deepEqual(result.content,[]);assert.ok(result._meta['team-room/audioData'].startsWith('data:audio/wav;base64,'));assert.ok(!JSON.stringify(result.structuredContent).includes('base64'));
 for(const invalid of [{...lookup,projectId:'beta'},{...lookup,requestId:randomUUID()},{...lookup,messageId:randomUUID()},{...lookup,audioId:'../escape'},{...lookup,projectId:undefined}])assert.equal(f.call('room_audio',invalid).isError,true);
 fs.writeFileSync(path.join(f.store.file+'.audio',clip.id),'corrupt');assert.equal(f.call('room_audio',lookup).isError,true);
});
test('required final audio must come from its creator and survives recovery without weakening or redispatch',t=>{
 const f=fixture(t),claim={requestId:f.requestId,memberId:'sound',requireFinalAudio:true};assert.equal(f.store.claim(claim).dispatch,false);assert.throws(()=>f.store.claim({...claim,requireFinalAudio:false}));
 assert.equal(f.store.get(f.requestId,{statusOnly:true}).request.jobs.find(j=>j.memberId==='sound').requireFinalAudio,true);
 f.store.post(f.args);f.store.post({...f.args,memberId:'director',messageKey:'director-audio'});
 assert.throws(()=>f.store.reply({requestId:f.requestId,memberId:'sound',text:'No final file'}),/최종 음원/);assert.throws(()=>f.store.reply({requestId:f.requestId,memberId:'director',text:'Accept without creator',audio:f.audio}),/제작자/);
 const control=new WorkControl(f.store,f.home),handoff={requestId:f.requestId,memberId:'director',fromMemberId:'sound',toMemberId:'other',confirmedStopped:true,reason:'Synthetic handoff',key:'audio-handoff'};
 assert.equal(control.recover(handoff).requireFinalAudio,true);assert.equal(control.recover(handoff).dispatch,false);
 const reopened=new RoomStore(f.store.file,f.registry.get('alpha'));assert.throws(()=>reopened.reply({requestId:f.requestId,memberId:'other',text:'Still needs audio'}),/최종 음원/);
 reopened.reply({requestId:f.requestId,memberId:'other',text:'Final audio',audio:f.audio});assert.equal(f.call('room_reply',{requestId:f.requestId,memberId:'director',text:'Integrated'}).structuredContent.saved,true);
});
