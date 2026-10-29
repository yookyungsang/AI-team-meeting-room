import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../host-plugin/store.mjs';
import {Projects} from '../host-plugin/projects.mjs';
import {handle} from '../host-plugin/server.mjs';
import {MAX_IMAGE_BYTES} from '../host-plugin/images.mjs';

// Synthetic single-pixel PNG, never a conversation screenshot or real asset.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
function setup(t){
 const base=path.resolve('.local/test-data');fs.mkdirSync(base,{recursive:true});
 const dir=fs.mkdtempSync(path.join(base,'images-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const registry=new Projects(path.join(dir,'runtime'));
 for(const id of ['alpha','beta'])registry.configure({id,name:id,members:[{id:'director',name:'Fixture director',role:'총괄',threadId:id+'-fixture',hostId:'local'},{id:'creator',name:'Fixture creator',role:'디자이너',threadId:id+'-creator-fixture',hostId:'local'}]});
 const store=new RoomStore(registry.roomPath('alpha'),registry.get('alpha')),requestId=randomUUID();
 store.submit({id:requestId,text:'이미지 작업',recipients:['director']});store.claim({requestId,memberId:'director'});
 const file=path.join(dir,'preview.png');fs.writeFileSync(file,png);
 const images=[{path:file,caption:'작업 중 시안'}];
 const args={requestId,memberId:'director',kind:'progress',messageKey:'preview-1',text:'현재 시안을 확인해 주세요.',images};
 return {dir,registry,store,requestId,file,images,args};
}
test('progress and final images are immutable snapshots with lightweight public metadata',t=>{
 const {store,args,file,requestId,images}=setup(t),post=store.post(args),image=post.message.images[0];
 assert.equal(store.get(requestId).request.status,'processing');
 const lookup={requestId,messageId:post.message.id,imageId:image.id};
 assert.equal(store.image(lookup).dataUrl,'data:image/png;base64,'+png.toString('base64'));
 fs.writeFileSync(file,Buffer.from('file changed after posting'));
 assert.equal(store.post(args).created,false);assert.equal(store.image(lookup).image.id,image.id);
 fs.unlinkSync(file);assert.equal(store.post(args).created,false,'storage retry must not depend on the old source still existing');
 assert.throws(()=>store.post({...args,images:[]}));
 assert.throws(()=>store.post({...args,images:[{...images[0],caption:'changed caption'}]}));
 const publicData=JSON.stringify(store.snapshot());assert.ok(!publicData.includes(file));assert.ok(!publicData.includes('base64'));assert.ok(!publicData.includes('imageInputKey'));
 fs.writeFileSync(file,png);
 const finalArgs={requestId,memberId:'director',text:'최종 결과입니다.',images};
 const final=store.reply(finalArgs);fs.unlinkSync(file);
 assert.equal(store.reply(finalArgs).id,final.id);assert.equal(store.get(requestId).request.status,'completed');
 assert.equal(store.get(requestId).messages.filter(m=>m.images?.length).length,2);
});
test('image attachment rejects invalid batches before committing messages or files',t=>{
 const {store,args,dir,file,requestId}=setup(t);
 const bad=path.join(dir,'bad.png');fs.writeFileSync(bad,'<svg onload="alert(1)"></svg>');
 const huge=path.join(dir,'huge.png');fs.writeFileSync(huge,Buffer.alloc(MAX_IMAGE_BYTES+1));
 const count=store.get(requestId).messages.length;
 for(const images of [[{path:bad,caption:'unsafe'}],[{path:huge,caption:'too large'}],[{path:'../preview.png',caption:'relative'}],[{path:'https://example.invalid/file.png',caption:'remote'}],[{path:file,caption:''}],Array(5).fill({path:file,caption:'too many'}),[{path:file,caption:'valid'},{path:bad,caption:'invalid'}]])assert.throws(()=>store.post({...args,images}));
 assert.equal(store.get(requestId).messages.length,count);assert.equal(fs.existsSync(store.file+'.images'),false);
 assert.throws(()=>store.post({...args,memberId:'outsider'}));assert.equal(fs.existsSync(store.file+'.images'),false);
});
test('image reads require exact project, request and message and keep bytes in UI-only metadata',t=>{
 const {store,args,registry,requestId}=setup(t);
 const call=(name,arguments_)=>handle({method:'tools/call',params:{name,arguments:arguments_}},registry);
 const posted=call('room_post',{...args,projectId:'alpha'});assert.notEqual(posted.isError,true);
 const message=posted.structuredContent.message,image=message.images[0];
 const lookup={projectId:'alpha',requestId,messageId:message.id,imageId:image.id};
 const result=call('room_image',lookup);assert.deepEqual(result.content,[]);assert.equal(result.structuredContent.image.mimeType,'image/png');
 assert.equal(result._meta['team-room/imageData'],'data:image/png;base64,'+png.toString('base64'));
 assert.ok(!JSON.stringify(result.structuredContent).includes('base64'));
 for(const invalid of [{...lookup,projectId:'beta'},{...lookup,requestId:randomUUID()},{...lookup,messageId:randomUUID()},{...lookup,imageId:'../escape'},{...lookup,projectId:undefined}])assert.equal(call('room_image',invalid).isError,true);
 fs.writeFileSync(path.join(store.file+'.images',image.id),'corrupt');assert.equal(call('room_image',lookup).isError,true);
});
test('required final images must be attached by their creator, not replaced by a preview or director post',t=>{
 const {store,registry,requestId,images,file}=setup(t);
 const call=(name,args)=>handle({method:'tools/call',params:{name,arguments:{projectId:'alpha',requestId,...args}}},registry);
 const claimed=call('room_claim',{memberId:'creator',requireFinalImage:true});assert.equal(claimed.structuredContent.dispatch,true);
 assert.equal(claimed.structuredContent.job.requireFinalImage,true);
 assert.equal(call('room_post',{memberId:'creator',kind:'progress',messageKey:'creator-preview',text:'중간 시안입니다.',images}).isError,undefined);
 assert.equal(call('room_post',{memberId:'director',kind:'progress',messageKey:'director-preview',text:'참고 화면입니다.',images}).isError,undefined);
 for(const extra of [{},{images:[]}])assert.equal(call('room_reply',{memberId:'creator',text:'첨부 없이 완료',...extra}).isError,true);
 assert.equal(call('room_reply',{memberId:'director',text:'담당자 첨부를 대신해 완료',images}).isError,true);
 assert.equal(store.get(requestId).request.jobs.find(j=>j.memberId==='creator').state,'reserved');
 const final={memberId:'creator',text:'완성 이미지입니다.',images};
 assert.equal(call('room_reply',{...final,images:[{path:file+'.missing.png',caption:'missing'}]}).isError,true);
 const completed=call('room_reply',final);assert.equal(completed.structuredContent.memberId,'creator');
 fs.unlinkSync(file);assert.equal(call('room_reply',final).structuredContent.messageId,completed.structuredContent.messageId);
 assert.equal(call('room_reply',{memberId:'director',text:'담당자의 완성 이미지를 확인했습니다.'}).structuredContent.saved,true);
 const state=store.get(requestId);assert.equal(state.request.status,'completed');
 assert.ok(state.messages.find(m=>m.authorId==='creator'&&m.kind==='final').images.length);
 assert.equal(state.messages.find(m=>m.authorId==='director'&&m.kind==='final').images,undefined);
});
test('image completion requirements persist, cannot be weakened and never trigger redispatch',t=>{
 const {store,registry,requestId}=setup(t),args={requestId,memberId:'creator'};
 assert.equal(store.claim(args).dispatch,true);
 assert.equal(store.claim({...args,requireFinalImage:true}).dispatch,false);
 const reopened=new RoomStore(store.file,registry.get('alpha'));
 assert.equal(reopened.claim({...args,requireFinalImage:true}).dispatch,false);
 assert.equal(reopened.get(requestId,{statusOnly:true}).request.jobs.find(j=>j.memberId==='creator').requireFinalImage,true);
 assert.throws(()=>reopened.claim({...args,requireFinalImage:false}),/해제하지 않습니다/);
 assert.throws(()=>reopened.claim({...args,requireFinalImage:'true'}),/참 또는 거짓/);
 assert.throws(()=>reopened.reply({...args,text:'이미지 없는 완료'}),/최종 이미지/);
 reopened.post({...args,kind:'blocker',messageKey:'image-blocked',text:'최종 이미지 파일 접근이 차단되었습니다.'});
 reopened.fail({...args,reason:'최종 이미지 파일 접근 불가'});
 assert.throws(()=>reopened.reply({requestId,memberId:'director',text:'차단을 무시한 성공'}),/누락되거나 차단/);
 reopened.fail({requestId,memberId:'director',reason:'완료 이미지 차단을 사용자에게 보고'});
 assert.equal(reopened.get(requestId).request.status,'failed');
 assert.throws(()=>reopened.claim({...args,requireFinalImage:true,memberId:'director'}),/이미 끝나거나 인계/);
});
