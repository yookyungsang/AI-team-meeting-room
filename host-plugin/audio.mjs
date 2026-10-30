import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const MAX_AUDIO_BYTES=8*1024*1024;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function mime(bytes){
 if(bytes.length>=44&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE'){
  let fmt=false,data=false;
  for(let offset=12;offset+8<=bytes.length;){
   const name=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4);check(offset+8+size<=bytes.length,'WAV 파일이 잘렸습니다.');
   if(name==='fmt '){check(size>=16&&[1,3,65534].includes(bytes.readUInt16LE(offset+8))&&bytes.readUInt16LE(offset+10)>0&&bytes.readUInt32LE(offset+12)>0,'지원되는 WAV 음원 형식을 확인해 주세요.');fmt=true;}
   if(name==='data'&&size>0)data=true;
   offset+=8+size+(size%2);
  }
  check(fmt&&data,'WAV 음원 데이터가 필요합니다.');return 'audio/wav';
 }
 if(bytes.length>=35&&bytes.toString('ascii',0,4)==='OggS'&&bytes[4]===0){
  const headers=bytes.subarray(27,128);if(headers.includes(Buffer.from('OpusHead'))||headers.includes(Buffer.from('\x01vorbis','binary')))return 'audio/ogg';
 }
 let offset=0;
 if(bytes.length>=10&&bytes.toString('ascii',0,3)==='ID3'){
  check(bytes.subarray(6,10).every(b=>b<128),'MP3 태그 형식을 확인해 주세요.');
  offset=10+bytes[6]*2097152+bytes[7]*16384+bytes[8]*128+bytes[9]+(bytes[5]&16?10:0);
 }
 if(bytes.length>=offset+4&&bytes[offset]===255&&(bytes[offset+1]&224)===224&&(bytes[offset+1]&24)!==8&&(bytes[offset+1]&6)!==0&&(bytes[offset+2]&240)!==0&&(bytes[offset+2]&240)!==240&&(bytes[offset+2]&12)!==12)return 'audio/mpeg';
 throw new Error('WAV, MP3, OGG 음원 파일만 첨부할 수 있습니다.');
}
function readBounded(file){
 let fd;
 try{
  fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);check(stat.isFile()&&stat.size>0&&stat.size<=MAX_AUDIO_BYTES,'음원은 파일당 8 MiB 이하여야 합니다.');
  const bytes=Buffer.alloc(stat.size+1);let count=0,n;
  while(count<bytes.length&&(n=fs.readSync(fd,bytes,count,bytes.length-count,null))>0)count+=n;
  check(count===stat.size,'음원이 읽는 중 바뀌었습니다. 새 게시물로 다시 첨부해 주세요.');return bytes.subarray(0,count);
 }catch(error){if(error.code)throw new Error('서버에서 접근 가능한 로컬 음원 파일을 지정해 주세요.');throw error;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
export class RoomAudio{
 constructor(directory){this.directory=directory;}
 input(audio){
  if(audio===undefined)return {items:[],key:undefined};
  check(Array.isArray(audio)&&audio.length<=3,'한 발언에 음원은 최대 3개까지 첨부할 수 있습니다.');
  const items=audio.map(item=>{
   check(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).every(k=>['path','caption'].includes(k)),'음원 항목 형식을 확인해 주세요.');
   check(typeof item.path==='string'&&item.path.length<=2000&&path.isAbsolute(item.path)&&!/^\\\\/.test(item.path)&&/\.(wav|mp3|ogg)$/i.test(item.path),'WAV, MP3, OGG 음원의 절대 로컬 경로가 필요합니다.');
   check(typeof item.caption==='string'&&item.caption.trim()&&item.caption.length<=300,'음원 설명을 1~300자로 작성해 주세요.');
   return {path:path.resolve(item.path),caption:item.caption.trim()};
  });
  return {items,key:items.length?hash(JSON.stringify(items)):undefined};
 }
 stage(items){return items.map(item=>{const bytes=readBounded(item.path),mimeType=mime(bytes);check({'.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[path.extname(item.path).toLowerCase()]===mimeType,'음원의 확장자와 실제 형식이 다릅니다.');return {bytes,id:hash(bytes),mimeType,caption:item.caption,size:bytes.length};});}
 save(staged){
  if(staged.length)fs.mkdirSync(this.directory,{recursive:true});
  return staged.map(({bytes,...audio})=>{const file=path.join(this.directory,audio.id);try{fs.writeFileSync(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;check(hash(readBounded(file))===audio.id,'저장된 음원이 손상되었습니다.');}return audio;});
 }
 read(audio){
  check(typeof audio?.id==='string'&&/^[0-9a-f]{64}$/.test(audio.id),'음원 ID를 확인해 주세요.');const bytes=readBounded(path.join(this.directory,audio.id));
  check(hash(bytes)===audio.id&&mime(bytes)===audio.mimeType,'저장된 음원이 손상되었습니다.');return `data:${audio.mimeType};base64,${bytes.toString('base64')}`;
 }
}
