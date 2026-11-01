// The same deterministic factory runs locally in the server and embedded UI.
// Findings contain positions/types only; never retain or report matched values.
export function createSecretTools(){
 const placeholder=value=>/^(?:your[_ -]?(?:api[_ -]?)?(?:key|token|password|secret)|example|placeholder|redacted|changeme|replace[_ -]?me|undefined|null|true|false|x+|\*+|<[^>]+>|\$\{[^}]+\})$/i.test(value.trim());
 function find(value){
  const text=typeof value==='string'?value:'',ranges=[];
  const add=(start,end,kind)=>{if(end>start)ranges.push({start,end,kind});};
  const patterns=[
   ['api_key',/\bsk-(?:proj-|svcacct-|ant-api\d{2}-)?[A-Za-z0-9_-]{24,}\b/g],
   ['access_token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/g],
   ['api_key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
   ['api_key',/\bAIza[A-Za-z0-9_-]{35}\b/g],
   ['access_token',/\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g],
   ['access_token',/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g]
  ];
  for(const [kind,pattern] of patterns)for(const m of text.matchAll(pattern))add(m.index,m.index+m[0].length,kind);
  const pem=/-----BEGIN ((?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY|PGP PRIVATE KEY BLOCK)-----/g;
  let m;while((m=pem.exec(text))){const endMarker='-----END '+m[1]+'-----',at=text.indexOf(endMarker,pem.lastIndex),end=at<0?text.length:at+endMarker.length;add(m.index,end,'private_key');pem.lastIndex=end;}
  const bearer=/\bBearer[ \t]+([A-Za-z0-9._~+/-]{16,}={0,2})/g;
  for(const m of text.matchAll(bearer))if(!placeholder(m[1]))add(m.index+m[0].indexOf(m[1]),m.index+m[0].length,'access_token');
  const binding=/(?:^|[\s{,])["']?(api[_-]?key|access[_-]?token|client[_-]?secret|password|passwd|secret[_-]?key)["']?\s*[:=]\s*(?:(["'])([^"'\r\n]{8,})\2|([A-Za-z0-9_+/=-]{12,}))/gi;
  for(const m of text.matchAll(binding)){
   const value=m[3]??m[4];if(placeholder(value)||!m[3]&&!/[\d+/=]/.test(value))continue;
   const start=m.index+m[0].lastIndexOf(value);add(start,start+value.length,'credential');
  }
  const uri=/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?|https?):\/\/([^\s/:@]+:[^\s/@]+)@/gi;
  for(const m of text.matchAll(uri)){const start=m.index+m[0].indexOf('://')+3;add(start,start+m[1].length,'credential');}
  ranges.sort((a,b)=>a.start-b.start||b.end-a.end);
  const merged=[];for(const r of ranges){const last=merged.at(-1);if(last&&r.start<last.end){last.end=Math.max(last.end,r.end);if(last.kind!==r.kind)last.kind='credential';}else merged.push({...r});}
  return merged;
 }
 function redact(value,ranges=find(value)){
  if(typeof value!=='string')return value;
  let at=0,result='';for(const r of ranges){result+=value.slice(at,r.start)+'[REDACTED]';at=r.end;}return result+value.slice(at);
 }
 return {find,redact};
}
export const secretText=createSecretTools();
