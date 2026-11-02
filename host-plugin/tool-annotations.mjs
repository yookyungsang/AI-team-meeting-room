// Hints describe the broadest operation exposed by each grouped tool. They
// never replace host approval, project routing or the runtime write guards.
// [readOnly, destructive, idempotent, openWorld]
const policy={
 room_open:[false,true,false,true],
 room_state:[false,true,false,true],
 room_view:[false,false,false,false],
 room_submit:[false,false,true,false],
 room_get:[true,false,true,false],
 room_claim:[false,true,false,false],
 room_post:[false,false,true,false],
 room_reply:[false,true,false,false],
 room_fail:[false,true,false,false],
 room_pause:[false,true,false,false],
 room_image:[true,false,true,false],
 room_audio:[true,false,true,false],
 room_projects:[true,false,true,false],
 room_configure:[false,false,true,false],
 room_members:[false,true,false,true],
 room_roster:[false,true,false,true],
 room_team:[false,true,false,false],
 room_team_setup:[false,true,false,true],
 room_work:[false,true,false,true],
 room_validation:[false,true,false,true],
 room_usage:[false,true,false,true],
 room_manage:[false,true,false,false],
 room_check:[true,false,true,true],
 room_export:[false,false,true,false],
 room_import:[false,true,false,true]
};
export function toolAnnotations(name,readOnly){
 const row=Object.hasOwn(policy,name)?policy[name]:null;
 if(!row||row[0]!==readOnly)throw new Error('Review MCP behavior hints for '+name);
 const [readOnlyHint,destructiveHint,idempotentHint,openWorldHint]=row;
 return {readOnlyHint,destructiveHint,idempotentHint,openWorldHint};
}
