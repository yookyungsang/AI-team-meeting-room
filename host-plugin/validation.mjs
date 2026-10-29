import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {check,hash,cleanKey,now} from './control.mjs';

const live=new Map();
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=4000;
const statuses=['passed','failed','blocked','unverified'];
export function parseNUnit(xml){
 const root=xml.match(/<test-run\b([^>]*)>/),attrs={};if(!root||!xml.includes('</test-run>'))return null;
 for(const match of root[1].matchAll(/([\w-]+)=["']([^"']*)["']/g))attrs[match[1]]=match[2];
 const values={total:Number(attrs.total),passed:Number(attrs.passed),failed:Number(attrs.failed),skipped:Number(attrs.skipped||0),inconclusive:Number(attrs.inconclusive||0)};
 if(Object.values(values).some(n=>!Number.isSafeInteger(n)||n<0)||values.total===0||values.passed+values.failed+values.skipped+values.inconclusive!==values.total)return null;
 const cases=[...xml.matchAll(/<test-case\b[^>]*\bresult=["']([^"']+)["']/g)];if(cases.length!==values.total)return null;
 if(cases.some(m=>!['Passed','Failed','Skipped','Inconclusive'].includes(m[1])))return null;
 for(const [result,key] of [['Passed','passed'],['Failed','failed'],['Skipped','skipped'],['Inconclusive','inconclusive']])if(cases.filter(m=>m[1]===result).length!==values[key])return null;
 return {...values,result:attrs.result,passedAll:attrs.result==='Passed'&&values.failed===0&&values.inconclusive===0&&values.skipped===0&&values.passed===values.total};
}
export function consoleErrors(log){return log.split(/\r?\n/).filter(line=>/\berror CS\d+\b|\b(?:[\w.]*Exception):|UnityEngine\.Debug:Log(?:Error|Exception)|Assertion failed|Aborting batchmode due to|Error building Player|Build completed with a result of 'Failed'/i.test(line)).slice(0,50);}
export class Validation{
 constructor(control,{launch=spawn}={}){this.control=control;this.launch=launch;}
 define(args){
  this.control.actor(args,{director:true});check(cleanKey(args.caseId)&&text(args.label)&&args.label.length<=120&&text(args.signature),'고정된 검증 ID, 짧은 설명과 검증 대상을 지정해 주세요.');
  return this.control.change(state=>{
   const id='manual:'+hash(args.signature.trim().toLowerCase()),old=state.cases[id];
   if(old){check(old.alias===args.caseId&&old.label===args.label,'같은 검증 대상을 다른 이름으로 초기화할 수 없습니다.');return {caseId:id,defined:true};}
   check(!Object.values(state.cases).some(c=>c.alias===args.caseId),'검증 ID를 다른 대상에 재사용하지 않습니다.');
   state.cases[id]={id,alias:args.caseId,label:args.label,required:args.required!==false,generation:0,attempts:[],blocked:false};return {caseId:id,defined:true};
  });
 }
 begin(args,definition){
  this.control.actor(args);check(cleanKey(args.key),'재시도에도 같은 실행 요청 키가 필요합니다.');
  return this.control.change(state=>{
   if(definition&&!state.cases[definition.id])state.cases[definition.id]={...definition,required:true,generation:0,attempts:[],blocked:false};
   const caseId=args.caseId||definition?.id,c=Object.hasOwn(state.cases,caseId)?state.cases[caseId]:null;check(c,'총괄이 정의한 검증을 지정해 주세요.');
   const old=c.attempts.find(a=>a.key===args.key);if(old){check(old.requestId===args.requestId&&old.memberId===args.memberId,'같은 실행 키로 요청이나 담당자를 바꿀 수 없습니다.');return {created:false,caseId:c.id,attempt:old};}
   const attempts=c.attempts.filter(a=>a.generation===c.generation),last=attempts.at(-1);
   check(!c.blocked&&!c.waived,'차단된 검증은 총괄의 명시적 재개가 필요합니다.');check(!last||last.status!=='running','이미 실행 중인 검증을 중복 시작하지 않습니다.');check(!last||last.status!=='passed','통과한 검증은 변경 근거 없이 반복하지 않습니다.');
   check(attempts.length<2,'최초 실행과 재시도 1회를 모두 사용했습니다. 총괄에게 보고해 주세요.');if(last)check(text(args.analysis),'재시도 전에 최초 실패의 원인 분석을 기록해 주세요.');
   const attempt={id:randomUUID(),key:args.key,requestId:args.requestId,memberId:args.memberId,generation:c.generation,status:'running',startedAt:now(),...(args.analysis?{analysis:args.analysis}:{}),...(args.leaseId?{leaseId:args.leaseId}:{})};c.attempts.push(attempt);return {created:true,caseId:c.id,attempt};
  });
 }
 result(args,{internal=false}={}){
  if(!internal)this.control.actor(args);check(statuses.includes(args.status)&&text(args.summary),'검증 상태와 결과 설명이 필요합니다.');
  return this.control.change(state=>{
   const c=state.cases[args.caseId],attempt=c?.attempts.find(a=>a.id===args.attemptId);check(attempt,'실제 실행 예약을 지정해 주세요.');
   check(internal||attempt.memberId===args.memberId&&attempt.requestId===args.requestId,'자신의 검증 결과만 기록할 수 있습니다.');check(internal||!attempt.unity,'Unity 자동 실행 결과는 프로세스와 증거 파일로만 판정합니다.');
   const fingerprint=hash(JSON.stringify([args.status,args.summary,args.evidence||[]]));
   if(attempt.status!=='running'){check(attempt.resultKey===fingerprint,'기존 검증 결과를 덮어쓰지 않습니다.');return {saved:true,caseId:c.id,attemptId:attempt.id,status:attempt.status,blocked:c.blocked};}
   Object.assign(attempt,{status:args.status,summary:args.summary,evidence:args.evidence||[],finishedAt:now(),resultKey:fingerprint,...(args.errorKey?{errorKey:args.errorKey}:{})});
   const count=c.attempts.filter(a=>a.generation===c.generation).length;
   c.blocked=args.status==='blocked'||args.status==='unverified'||args.status==='failed'&&count>=2;
   if(attempt.unity){
    if(args.errorKey){state.errorCounts??={};state.errorCounts[args.errorKey]=(state.errorCounts[args.errorKey]||0)+1;if(state.errorCounts[args.errorKey]>=2)c.blocked=true;}
    if(args.status==='blocked'||c.blocked)state.unityBlocked={caseId:c.id,summary:args.summary};
   }
   return {saved:true,caseId:c.id,attemptId:attempt.id,status:attempt.status,blocked:c.blocked,next:c.blocked?'총괄에게 보고하고 명시적인 조치를 기다려 주세요.':args.status==='failed'?'원인 분석 후 필요한 경우 한 번만 재시도할 수 있습니다.':null};
  });
 }
 resume(args){
  this.control.actor(args,{director:true});check(text(args.reason),'수정·환경 조치 또는 검증 예외의 구체적인 근거가 필요합니다.');
  return this.control.change(state=>{const c=state.cases[args.caseId];check(c,'검증 항목을 지정해 주세요.');check(!c.attempts.some(a=>a.status==='running'),'실행 중이거나 상태 미확인인 검증은 먼저 확인해 주세요.');c.decisions??=[];c.decisions.push({at:now(),reason:args.reason,action:args.operation});if(args.operation==='waive'){c.waived=true;c.blocked=false;}else{c.generation++;c.blocked=false;delete c.waived;if(state.unityBlocked?.caseId===c.id)delete state.unityBlocked;const errorKey=c.attempts.at(-1)?.errorKey;if(errorKey&&state.errorCounts)state.errorCounts[errorKey]=0;}return {caseId:c.id,generation:c.generation,waived:!!c.waived};});
 }
 start(args){
  this.control.actor(args);check(['compile','editmode','playmode','build'].includes(args.mode),'지원하는 Unity 검증 모드를 지정해 주세요.');
  const state=this.control.state(),config=state.config,lease=this.control.owned(args);check(config?.unityCli,'승인된 Unity CLI를 먼저 설정해 주세요.');check(lease.targets.some(t=>t.type==='editor'),'이 작업의 @editor 조작권이 필요합니다.');
  check(fs.existsSync(path.join(config.workspaceRoot,'ProjectSettings','ProjectVersion.txt')),'유효한 Unity 프로젝트를 지정해 주세요.');
  check(args.filter===undefined||typeof args.filter==='string'&&args.filter.length<=2000,'테스트 필터를 확인해 주세요.');
  const target=args.target||'StandaloneWindows64';check(['StandaloneWindows64','StandaloneLinux64','StandaloneOSX','WebGL'].includes(target),'지원하는 빌드 대상을 지정해 주세요.');
  const timeout=args.timeoutSeconds??600;check(Number.isInteger(timeout)&&timeout>=10&&timeout<=7200,'실행 제한은 10~7200초입니다.');
  const id='unity:'+hash(JSON.stringify([args.mode,args.filter||'',args.mode==='build'?target:'',!!args.headless]));
  if(state.unityBlocked){const old=state.cases[id]?.attempts.find(a=>a.key===args.key&&a.requestId===args.requestId&&a.memberId===args.memberId);if(old)return {started:false,caseId:id,attemptId:old.id,status:old.status};check(false,'Unity 환경 또는 반복 오류가 차단되어 있습니다. 총괄이 '+state.unityBlocked.caseId+'의 조치와 재개를 기록해야 합니다.');}
  const begun=this.begin({...args,caseId:id},{id,label:'Unity '+args.mode,mode:args.mode});if(!begun.created)return {started:false,caseId:id,attemptId:begun.attempt.id,status:begun.attempt.status};
  const attemptId=begun.attempt.id,runDir=path.join(this.control.home,'validation',this.control.project.id,attemptId);fs.mkdirSync(runDir,{recursive:true});
  const logFile=path.join(runDir,'editor.log'),xmlFile=path.join(runDir,'tests.xml'),outputFile=path.join(runDir,'stdout.json'),errorFile=path.join(runDir,'stderr.log');
  const artifact=path.join(runDir,'build',target==='StandaloneWindows64'?'Game.exe':target==='StandaloneOSX'?'Game.app':target==='WebGL'?'WebGL':'Game');
  const common=['--format','json','--non-interactive','--no-pager','--no-banner','--timeout',String(timeout)];let command;
  if(args.mode==='compile')command=['run',config.workspaceRoot,...common,'--log-file',logFile,'--no-tail',...(args.headless?['--','-nographics']:[])];
  else if(args.mode==='build')command=['build',config.workspaceRoot,...common,'--target',target,'--output-path',artifact,'--log-file',logFile,'--no-tail','--no-provenance'];
  else command=['test',config.workspaceRoot,...common,'--mode',args.mode==='editmode'?'EditMode':'PlayMode','--output',xmlFile,'--retries','0',...(args.filter?['--filter',args.filter]:[]),'--','-logFile',logFile,...(args.headless?['-nographics']:[])];
  const receiptFile=path.join(runDir,'verdict.json');
  this.control.change(s=>{const a=s.cases[id].attempts.find(a=>a.id===attemptId);a.unity={mode:args.mode,runDir,logFile,xmlFile,artifact,command,receiptFile};});
  const finish=(status,summary,errorKey)=>{
   const receipt={caseId:id,attemptId,status,summary,evidence:[runDir],...(errorKey?{errorKey}:{})};
   if(!fs.existsSync(receiptFile))fs.writeFileSync(receiptFile,JSON.stringify(receipt),{flag:'wx'});
   try{return this.result(JSON.parse(fs.readFileSync(receiptFile,'utf8')),{internal:true});}catch{return {pending:true};}
  };
  if(fs.existsSync(path.join(config.workspaceRoot,'Temp','UnityLockfile'))){finish('blocked','프로젝트가 다른 Unity Editor에서 열려 있습니다. 기존 조작권을 인계하고 해당 Editor를 확인해 주세요.');return {started:false,caseId:id,attemptId,status:'blocked',evidence:runDir};}
  let child;try{child=this.launch(config.unityCli,command,{cwd:config.workspaceRoot,shell:false,windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});}catch(error){finish('blocked','Unity CLI를 시작할 수 없습니다: '+error.message);return {started:false,caseId:id,attemptId,status:'blocked'};}
  const output=fs.createWriteStream(outputFile),errors=fs.createWriteStream(errorFile);child.stdout?.pipe(output);child.stderr?.pipe(errors);
  const liveKey=this.control.project.id+':'+attemptId;const run={child,cancelled:false};live.set(liveKey,run);
  const timer=setTimeout(()=>{run.cancelled=true;this.kill(child);},(timeout+15)*1000);timer.unref();
  let finished=false;
  const complete=(code,error)=>{
   if(finished)return;finished=true;clearTimeout(timer);live.delete(liveKey);output.end();errors.end();
   try{
    if(run.cancelled||error){finish('blocked',run.cancelled?'Unity 검증이 취소되거나 제한 시간을 초과했습니다.':'Unity 실행 실패: '+error.message);return;}
    if(fs.existsSync(logFile)&&fs.statSync(logFile).size>16*1024*1024){finish('unverified','Editor 로그가 자동 판정 크기 한도를 넘어 상세 확인이 필요합니다.');return;}
    const log=fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8'):null,diagnostics=consoleErrors(log||'');
    if(code!==0||diagnostics.length){const errorKey=diagnostics.length?hash(diagnostics.map(line=>line.replace(/^.*?(?=error CS\d+)|\(\d+,\d+\)/g,'')).sort().join('\n')):undefined;finish(code===8||diagnostics.length?'failed':'blocked','Unity 종료 코드 '+code+', Console/컴파일 오류 '+diagnostics.length+(diagnostics.length===50?'건 이상':'건')+'. 상세 기록을 확인해 주세요.',errorKey);return;}
    if(log===null){finish('unverified','Unity Editor 로그가 없어 Console 오류 여부를 확인하지 못했습니다.');return;}
    if(!/Initialize engine version|Unity Editor version|Unity version:|Command line arguments:/i.test(log)){finish('unverified','Editor가 실제로 시작된 로그를 확인하지 못했습니다.');return;}
    if(args.mode==='editmode'||args.mode==='playmode'){
     const tests=fs.existsSync(xmlFile)&&fs.statSync(xmlFile).size<=16*1024*1024?parseNUnit(fs.readFileSync(xmlFile,'utf8')):null;
     if(!tests){finish('unverified','완전한 테스트 결과 XML 또는 실행된 테스트를 확인하지 못했습니다.');return;}
     finish(tests.passedAll?'passed':tests.failed?'failed':'unverified','테스트 '+tests.total+'개: 통과 '+tests.passed+', 실패 '+tests.failed+', 건너뜀 '+tests.skipped+'.');
    }else if(args.mode==='build'){
     const exists=fs.existsSync(artifact),stat=exists?fs.statSync(artifact):null,valid=stat?.isFile()?stat.size>0:stat?.isDirectory()?fs.readdirSync(artifact).length>0:false;
     finish(valid?'passed':'unverified',valid?'빌드 종료와 새 산출물, Editor 로그를 확인했습니다. 실제 기기 실행 검증은 별도입니다.':'정상 종료했지만 비어 있지 않은 새 빌드 산출물을 찾지 못했습니다.');
    }
    else finish('passed','Unity Editor 실행·종료와 로그를 확인했으며 감지된 Console/컴파일 오류가 없습니다.');
   }catch(error){try{finish('unverified','증거 판정 중 오류: '+error.message);}catch{}}
  };
  child.once('error',error=>complete(null,error));child.once('close',code=>complete(code));
  output.once('error',error=>{run.cancelled=true;this.kill(child);complete(null,error);});errors.once('error',error=>{run.cancelled=true;this.kill(child);complete(null,error);});
  return {started:true,caseId:id,attemptId,status:'running',evidence:runDir};
 }
 refresh(){
  for(const c of Object.values(this.control.state().cases))for(const a of c.attempts){
   if(a.status!=='running'||!a.unity?.receiptFile||!fs.existsSync(a.unity.receiptFile))continue;
   try{const receipt=JSON.parse(fs.readFileSync(a.unity.receiptFile,'utf8'));if(receipt.caseId===c.id&&receipt.attemptId===a.id)this.result(receipt,{internal:true});}catch{}
  }
 }
 kill(child){
  if(!Number.isInteger(child.pid)||child.pid<=0)return;
  if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{shell:false,windowsHide:true,stdio:'ignore'}).once('error',()=>{});
  else{
   try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}
   const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},2000);timer.unref();
  }
 }
 cancel(args){
  this.control.actor(args,{director:args.operation==='reconcile',active:false});const state=this.control.state(),c=state.cases[args.caseId],a=c?.attempts.find(a=>a.id===args.attemptId);check(a&&a.requestId===args.requestId&&a.status==='running','진행 중인 검증을 지정해 주세요.');check(args.memberId==='director'||args.memberId===a.memberId,'본인 또는 총괄만 중단할 수 있습니다.');
  const run=live.get(this.control.project.id+':'+a.id);
  if(run){run.cancelled=true;this.kill(run.child);return {cancelling:true,attemptId:a.id};}
  check(args.operation==='reconcile'&&args.confirmedStopped===true&&text(args.reason),'서버 재시작 후에는 총괄이 기존 프로세스 중단을 확인해야 합니다.');
  return this.result({caseId:c.id,attemptId:a.id,status:'blocked',summary:'중단 확인 후 복구: '+args.reason,evidence:a.unity?[a.unity.runDir]:[]},{internal:true});
 }
}
