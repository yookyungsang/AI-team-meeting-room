import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const MAX_IMAGE_BYTES=8*1024*1024;
const check=(value,message)=>{if(!value)throw new Error(message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function mime(bytes){
 if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR')return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=13&&['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6)))return 'image/gif';
 if(bytes.length>=16&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
 throw new Error('PNG, JPEG, GIF, WebP 이미지 파일만 첨부할 수 있습니다.');
}
function readBounded(file){
 let fd;
 try{
  fd=fs.openSync(file,'r');const stat=fs.fstatSync(fd);
  check(stat.isFile()&&stat.size>0&&stat.size<=MAX_IMAGE_BYTES,'이미지는 파일당 8 MiB 이하여야 합니다.');
  const buffer=Buffer.alloc(stat.size+1);let count=0,n;
  while(count<buffer.length&&(n=fs.readSync(fd,buffer,count,buffer.length-count,null))>0)count+=n;
  check(count===stat.size,'이미지 파일이 읽는 중에 바뀌었습니다. 새 파일로 다시 게시해 주세요.');
  return buffer.subarray(0,count);
 }catch(error){if(error.code)throw new Error('이미지 파일을 읽을 수 없습니다. 서버에서 접근 가능한 로컬 파일을 지정해 주세요.');throw error;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
export class RoomImages {
 constructor(directory){this.directory=directory;}
 input(images){
  if(images===undefined)return {items:[],key:undefined};
  check(Array.isArray(images)&&images.length<=4,'한 발언에 이미지는 최대 4개까지 첨부할 수 있습니다.');
  const items=images.map(image=>{
   check(image&&typeof image==='object'&&!Array.isArray(image)&&Object.keys(image).every(key=>['path','caption'].includes(key)),'이미지 항목 형식을 확인해 주세요.');
   check(typeof image.path==='string'&&image.path.length<=2000&&path.isAbsolute(image.path)&&!/^\\\\/.test(image.path)&&/\.(png|jpe?g|gif|webp)$/i.test(image.path),'이미지의 절대 로컬 파일 경로가 필요합니다.');
   check(typeof image.caption==='string'&&image.caption.trim()&&image.caption.length<=300,'이미지 설명을 1~300자로 작성해 주세요.');
   return {path:path.resolve(image.path),caption:image.caption.trim()};
  });
  return {items,key:items.length?hash(JSON.stringify(items)):undefined};
 }
 capture(items){
  // Validate the entire batch before writing a single image. Bytes never go in room JSON.
  const staged=items.map(item=>{const bytes=readBounded(item.path);return {bytes,id:hash(bytes),mimeType:mime(bytes),caption:item.caption,size:bytes.length};});
  if(staged.length)fs.mkdirSync(this.directory,{recursive:true});
  return staged.map(({bytes,...image})=>{
   const file=path.join(this.directory,image.id);
   try{fs.writeFileSync(file,bytes,{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;check(hash(readBounded(file))===image.id,'저장된 이미지가 손상되었습니다.');}
   return image;
  });
 }
 read(image){
  check(typeof image?.id==='string'&&/^[0-9a-f]{64}$/.test(image.id),'이미지 ID를 확인해 주세요.');
  const bytes=readBounded(path.join(this.directory,image.id));
  check(hash(bytes)===image.id&&mime(bytes)===image.mimeType,'저장된 이미지가 손상되었습니다.');
  return `data:${image.mimeType};base64,${bytes.toString('base64')}`;
 }
}
