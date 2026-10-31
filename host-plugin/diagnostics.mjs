// Read-only checks. Host observations describe support, never grant authority.
import {TeamSetup} from './team-setup.mjs';
export function diagnose(registry,{projectId,threadId,host={}}={}){
 const rows=[],add=(id,status,detail,action='')=>rows.push({id,status,detail,action});
 let context;try{context=threadId&&registry.setupContextReader(threadId);}catch{}
 add('project',context?'ok':'warning',context?'The opening chat belongs to '+context.name+'.':'The opening project could not be verified.',context?'':'Open the room from a saved local project chat, or select its room explicitly.');
 const opening=registry.opening(threadId),id=projectId||opening.projectId;
 if(!id){add('room','warning',opening.status==='unregistered'?'This project has no connected room yet.':'No room is selected.','Choose Basic team setup, or select an existing room.');}
 else{
  const project=registry.get(id),director=project.members.find(m=>m.id==='director');
  if(project.archivedAt)add('room','warning','This room is archived.','Restore it from Archived rooms before starting work.');
  else add('room','ok',project.name+' is registered.');
  let directorContext;try{if(director?.hostId==='local')directorContext=registry.setupContextReader(director.threadId);}catch{}
  const match=context&&directorContext&&context.scopeId===directorContext.scopeId;
  add('director',match?'ok':'warning',match?'The director belongs to the same verified local project.':'The director project connection could not be matched.',match?'':'Open the configured director chat and check its project membership. Do not create a replacement director.');
  if(director&&threadId&&director.threadId!==threadId)add('opening-chat','warning','This view is opened from another chat.','Use the director chat for direct instructions; preserve the existing route.');
  try{const catalog=registry.catalogReader(project),routes=new Set(catalog.candidates.map(c=>c.hostId+'\0'+c.threadId)),missing=project.members.filter(m=>!routes.has(m.hostId+'\0'+m.threadId));add('participants',missing.length?'warning':'ok',missing.length?missing.length+' connected participant(s) were not found in the current local project catalog.':'Connected participants exist in the local project catalog.',missing.length?'Check archived/moved chats and refresh the member picker. Keep existing history and routes.':'');}
  catch{add('participants','unverified','The native chat catalog is unavailable on this host.','Update Codex and Node, or verify the existing chats manually.');}
  try{const pending=new TeamSetup(registry).read().setups.some(s=>s.projectId===id&&s.status!=='connected');add('setup',pending?'warning':'ok',pending?'A saved team setup is unfinished.':'No unfinished team setup was found.',pending?'Wait if it is still running. Otherwise use Continue after interruption/error in the original chat.':'');}catch{add('setup','warning','Saved setup records could not be read.','Keep the records and inspect the original setup error before retrying.');}
 }
 add('messages',host.message===true?'ok':'warning',host.message===true?'The host advertises text messaging.':'The host did not advertise text messaging.','Open in a compatible Codex MCP App host if sending is unavailable.');
 add('drafts',host.draft===true?'ok':'warning',host.draft===true?'Editable setup drafts are advertised.':'Editable drafts are unavailable; manual copy remains available.',host.draft===true?'':'Copy the prepared request into the original Codex chat and send it yourself.');
 add('protocol',host.protocol==='2026-01-26'?'ok':'warning','Observed UI protocol: '+(host.protocol||'not reported'),host.protocol==='2026-01-26'?'':'Update the host if UI initialization fails.');
 add('native-tools','unverified','Native chat creation, renaming and event-wait permissions are checked during an actual authorized setup.','This check does not create chats or claim that host approval has passed.');
 const korean={
  project:['현재 대화의 프로젝트를 확인했습니다.','현재 대화의 프로젝트를 확인하지 못했습니다.','저장된 로컬 프로젝트의 채팅에서 열거나 회의실을 직접 선택하세요.'],
  room:['선택한 회의실이 등록돼 있습니다.','연결된 회의실이 없거나 복구가 필요합니다.','기본 팀 만들기·회의실 선택·삭제된 회의실 복구를 확인하세요.'],
  director:['총괄과 현재 대화가 같은 프로젝트에 있습니다.','총괄의 프로젝트 연결을 확인하지 못했습니다.','기존 총괄 채팅의 프로젝트 소속을 확인하세요. 대체 총괄은 새로 만들지 않습니다.'],
  'opening-chat':['','다른 대화창에서 회의실을 열었습니다.','직접 지시는 연결된 총괄 채팅에서 하면 됩니다. 기존 연결은 유지하세요.'],
  participants:['연결된 담당자들이 프로젝트 대화 목록에 있습니다.','일부 담당자를 찾지 못했거나 대화 목록 확인을 지원하지 않습니다.','보관·이동된 채팅을 확인하고 구성원 목록을 새로고침하세요.'],
  setup:['미완료 팀 설정이 없습니다.','완료되지 않았거나 읽을 수 없는 팀 설정이 있습니다.','실행 중이면 기다리고, 중단됐다면 원래 총괄 채팅에서 이어하기를 선택하세요.'],
  messages:['호스트가 문자 전송을 지원한다고 알렸습니다.','호스트의 문자 전송 지원을 확인하지 못했습니다.','전송이 안 되면 호환되는 Codex MCP App에서 열어 주세요.'],
  drafts:['편집 가능한 요청문 초안을 지원합니다.','초안 넣기를 지원하지 않습니다. 수동 복사는 가능합니다.','요청문을 원래 Codex 채팅에 붙여 넣고 직접 전송하세요.'],
  protocol:['지원하는 화면 통신 버전을 확인했습니다.','지원하는 화면 통신 버전을 확인하지 못했습니다.','화면 연결이 안 되면 Codex를 업데이트해 주세요.'],
  'native-tools':['','대화 생성·이름 변경·대기 도구의 실제 권한은 팀 설정 때 확인합니다.','이 점검은 채팅을 만들거나 자동 승인 통과를 보장하지 않습니다.']
 };
 return {projectId:id||null,checkedAt:new Date().toISOString(),rows:rows.map(row=>({...row,detailKo:korean[row.id][row.status==='ok'?0:1],actionKo:row.action?korean[row.id][2]:''}))};
}
