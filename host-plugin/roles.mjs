// Static policy references, not a model runtime or a permission system.
const common='references/role-guidance.md#공통-기본-지침';
export const ROLE_TYPES=['director','planner','designer','programmer','qa','sound','custom'];
const definitions={
 director:{label:'총괄 디렉터',note:'공통 지침 + 총괄 운영 지침',refs:['references/collaboration-policy.md#총괄-운영-전문']},
 planner:{label:'기획자',note:'공통 지침 + 기획자 지침',refs:['references/role-guidance.md#기획자']},
 designer:{label:'디자이너',note:'공통 지침 + 디자이너 지침',refs:['references/design-collaboration.md']},
 programmer:{label:'프로그래머',note:'공통 지침 + 프로그래머 협업 지침',refs:['references/collaboration-policy.md#프로그래머-병렬-협업-전문']},
 qa:{label:'QA',note:'공통 지침 + QA 오류 대응 지침',refs:['references/collaboration-policy.md#qa-오류-대응-전문']},
 sound:{label:'효과음 담당자',note:'공통 지침 + 효과음 협업 지침',refs:['references/sound-collaboration.md']},
 custom:{label:'직접 입력',note:'공통 기본 지침 + 실제 배정 조건',refs:[]}
};
const aliases=new Map([
 ['기획자','planner'],['planner','planner'],['디자이너','designer'],['designer','designer'],
 ['프로그래머','programmer'],['프로그래머 1','programmer'],['프로그래머 2','programmer'],['programmer','programmer'],['programmer1','programmer'],['programmer2','programmer'],
 ['qa','qa'],['qa 담당자','qa'],['효과음','sound'],['효과음 담당자','sound'],['sound','sound']
]);
export function roleTypeOf(member){
 if(member.id==='director')return 'director';
 if(ROLE_TYPES.includes(member.roleType)&&member.roleType!=='director')return member.roleType;
 return aliases.get(String(member.role||'').trim().replace(/\s+/g,' ').toLowerCase())||'custom';
}
export function validateRoleType(member){
 if(member.roleType===undefined)return;
 if(!ROLE_TYPES.includes(member.roleType))throw new Error('목록에 있는 역할 종류를 선택하거나 custom으로 직접 입력해 주세요.');
 if((member.id==='director')!==(member.roleType==='director'))throw new Error('총괄 역할 종류는 기존 director에게만 고정됩니다.');
}
export const roleCatalog=()=>ROLE_TYPES.map(id=>({id,label:definitions[id].label,note:definitions[id].note}));
export function roleGuidance(type){
 const selected=ROLE_TYPES.includes(type)?type:'custom';
 return {roleType:selected,common,references:definitions[selected].refs};
}
