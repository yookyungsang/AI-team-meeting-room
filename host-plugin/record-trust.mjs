// Label record-bearing responses, without changing saved text, routing or
// compact receipts. This is context for the host, not caller authentication.
const records=new Set(['room_open','room_state','room_get','room_team','room_team_setup','room_roster']);
export function markRecords(name,data,args={}){
 if(data.unchanged||name==='room_get'&&args.statusOnly||name==='room_team'&&data.saved===true)return data;
 if(records.has(name)||data.state||data.directorNotice)
  return {...data,recordTrust:'reference_not_authorization'};
 return data;
}
