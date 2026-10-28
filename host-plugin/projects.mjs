import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
export const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
const label=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function validateProject(input){
 check(validId(input?.id),'프로젝트 ID는 영문 소문자로 시작하는 64자 이내 식별자여야 합니다.');
 check(label(input.name,120),'프로젝트 이름을 확인해 주세요.');
 check(input.workspacePath===undefined||label(input.workspacePath,1000),'작업 폴더를 확인해 주세요.');
 check(Array.isArray(input.members)&&input.members.length>=1&&input.members.length<=20,'참여자는 총괄을 포함해 1~20명이어야 합니다.');
 const members=input.members.map(m=>{
  check(validId(m.id)&&m.id!=='user','참여자 ID를 확인해 주세요.');
  check(label(m.name,80)&&label(m.role,80),'참여자 이름과 역할을 확인해 주세요.');
  check(label(m.threadId,160)&&label(m.hostId,160),'실제 기존 대화 ID와 호스트가 필요합니다.');
  return {id:m.id,name:m.name.trim(),role:m.role.trim(),threadId:m.threadId,hostId:m.hostId};
 });
 check(members.filter(m=>m.id==='director').length===1,'director 역할의 총괄이 한 명 필요합니다.');
 check(new Set(members.map(m=>m.id)).size===members.length,'참여자 ID는 중복될 수 없습니다.');
 check(new Set(members.map(m=>m.hostId+'\0'+m.threadId)).size===members.length,'한 대화를 여러 담당자로 중복 연결하지 않습니다.');
 return {id:input.id,name:input.name.trim(),...(input.workspacePath?{workspacePath:input.workspacePath}:{}),members};
}
export class Projects {
 constructor(home){this.home=path.resolve(home);this.file=path.join(this.home,'projects.json');}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,projects:[]};}
 list(){return this.read().projects.map(p=>({id:p.id,name:p.name,directorName:p.members.find(m=>m.id==='director').name}));}
 get(id){check(validId(id),'명시적인 프로젝트 ID가 필요합니다.');const p=this.read().projects.find(p=>p.id===id);check(p,'연결되지 않은 프로젝트입니다.');return p;}
 roomPath(id){check(validId(id),'잘못된 프로젝트 ID입니다.');return path.join(this.home,'rooms',id+'.json');}
 configure(input){
  const project=validateProject(input);fs.mkdirSync(this.home,{recursive:true});
  const lock=this.file+'.lock',temp=this.file+'.'+randomUUID()+'.next';let fd;
  try{fd=fs.openSync(lock,'wx');}catch{throw new Error('프로젝트 연결 저장 중입니다. 같은 설정으로 다시 확인해 주세요.');}
  try{
   const state=this.read(),old=state.projects.find(p=>p.id===project.id);
   // A room's routing never changes under an in-flight or historical request.
   if(old){check(JSON.stringify(old)===JSON.stringify(project),'기존 연결은 덮어쓰지 않습니다. 다른 연결은 새 프로젝트 ID로 등록해 주세요.');return {created:false,project};}
   state.projects.push(project);fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,this.file);
   return {created:true,project};
  }finally{fs.closeSync(fd);fs.unlinkSync(lock);if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
}
