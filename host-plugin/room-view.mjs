import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {transaction,check,hash} from './control.mjs';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const empty=()=>({version:1,scopes:{},intents:{}});
const freshFor=120000;
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validState(state){
 return state?.version===1&&object(state.scopes)&&object(state.intents)
  &&Object.entries(state.scopes).every(([key,row])=>/^[0-9a-f]{64}$/.test(key)&&object(row)&&uuid(row.id)&&uuid(row.owner)&&uuid(row.intentId)&&['reserved','released'].includes(row.status))
  &&Object.entries(state.intents).every(([key,row])=>uuid(key)&&object(row)&&/^[0-9a-f]{64}$/.test(row.scope)&&Number.isFinite(row.createdAt)&&['new','consumed','blocked'].includes(row.status)&&(!row.instanceId||uuid(row.instanceId))&&(!row.priorViewId||uuid(row.priorViewId))&&(row.confirmed===undefined||row.confirmed===true));
}

// This is a conservative display guard, never native tab discovery or work
// authorization. Occupancy does NOT expire: a background/restored tab may still
// exist. Unknown outcomes need an explicit human reconciliation, not a timer.
export class RoomView {
 constructor(home,{clock=Date.now}={}){this.file=path.join(home,'room-views.json');this.clock=clock;}
 change(action){
  if(fs.existsSync(this.file))check(fs.statSync(this.file).size<=2*1024*1024,'회의실 열기 기록을 확인할 수 없습니다. 기존 탭을 확인해 주세요.');
  return transaction(this.file,empty,state=>{
   check(validState(state),'회의실 열기 기록 형식을 확인해 주세요.');
   return action(state);
  });
 }
 issue(scope){
  check(typeof scope==='string'&&scope.length>0&&scope.length<=1000,'회의실 열기 범위를 확인해 주세요.');
  return this.change(state=>{
   const ids=Object.keys(state.intents);
   // Removed tickets are unknown/expired forever, never regenerated on read.
   for(const id of ids.slice(0,Math.max(0,ids.length-255)))delete state.intents[id];
   const id=randomUUID();state.intents[id]={scope:hash(scope),createdAt:this.clock(),status:'new'};
   return {id};
  });
 }
 execute(args){
  check(uuid(args.intentId)&&uuid(args.instanceId),'회의실 열기 요청을 확인해 주세요.');
  check(['claim','confirm','release'].includes(args.operation),'지원하지 않는 회의실 표시 작업입니다.');
  if(args.operation!=='claim')check(uuid(args.viewId),'이전 회의실 표시 기록을 확인해 주세요.');
  if(args.operation==='confirm')check(args.confirmedNoTab===true,'기존 회의실 탭이 없음을 직접 확인한 뒤 다시 열어 주세요.');
  return this.change(state=>{
   const intent=state.intents[args.intentId];
   if(!intent)return {status:'expired'};
   const slot=state.scopes[intent.scope];
   if(args.operation==='release'){
    if(slot?.id!==args.viewId||slot.owner!==args.instanceId||slot.intentId!==args.intentId)return {status:'superseded'};
    slot.status='released';return {status:'released'};
   }
   if(args.operation==='claim'){
    if(intent.status!=='new')return {status:'consumed'};
    intent.status='consumed';intent.instanceId=args.instanceId;
    const age=this.clock()-intent.createdAt;
    if(!Number.isFinite(age)||age<0||age>freshFor)return {status:'expired'};
    if(slot&&slot.status!=='released'){
     intent.status='blocked';intent.priorViewId=slot.id;
     return {status:'uncertain',viewId:slot.id};
    }
   }else{
    if(intent.confirmed||intent.instanceId!==args.instanceId)return {status:'consumed'};
    const own=slot?.owner===args.instanceId&&slot?.intentId===args.intentId;
    if(slot?.id!==args.viewId||!(intent.status==='blocked'&&intent.priorViewId===args.viewId||intent.status==='consumed'&&own))return {status:'superseded'};
    intent.status='consumed';intent.confirmed=true;
   }
   check(Object.hasOwn(state.scopes,intent.scope)||Object.keys(state.scopes).length<2048,'회의실 표시 기록이 많아 자동으로 열지 않았습니다.');
   const viewId=randomUUID();
   state.scopes[intent.scope]={id:viewId,owner:args.instanceId,intentId:args.intentId,status:'reserved'};
   return {status:'open',viewId};
  });
 }
}

// Native project membership is preferred so sibling chats and a room connected
// after initial setup use the same display scope. A caller-selected room stays
// explicit; unavailable native metadata never guesses a project from cwd.
export function roomViewScope(registry,project,threadId){
 const director=project?.members.find(m=>m.id==='director');
 const nativeThread=project?(director?.hostId==='local'?director.threadId:null):threadId;
 if(nativeThread){try{const context=registry.setupContextReader(nativeThread);if(typeof context?.scopeId==='string'&&context.scopeId)return 'native:'+context.scopeId;}catch{}return null;}
 if(project)return 'room:'+project.id;
 return null;
}
