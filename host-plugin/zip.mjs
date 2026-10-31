// Small ZIP writer: stored entries, UTF-8 names, CRC32, no runtime dependency.
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const safe=name=>typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.\/-]*$/.test(name)&&!name.split('/').some(p=>p==='..'||p==='.'||!p);
export function zip(entries){
 if(entries.length>10000)throw new Error('Too many archive entries.');
 const data=[],directory=[];let offset=0;
 for(const {name,bytes} of entries){
  if(!safe(name)||!Buffer.isBuffer(bytes))throw new Error('Invalid archive entry.');
  const label=Buffer.from(name),crc=crc32(bytes),header=Buffer.alloc(30),central=Buffer.alloc(46);
  header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x21,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(bytes.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(label.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(0x21,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(bytes.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(label.length,28);central.writeUInt32LE(offset,42);
  data.push(header,label,bytes);directory.push(central,label);offset+=header.length+label.length+bytes.length;
 }
 const tail=Buffer.alloc(22),index=Buffer.concat(directory);tail.writeUInt32LE(0x06054b50);tail.writeUInt16LE(entries.length,8);tail.writeUInt16LE(entries.length,10);tail.writeUInt32LE(index.length,12);tail.writeUInt32LE(offset,16);
 return Buffer.concat([...data,index,tail]);
}
export function unzipOwn(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<22||bytes.readUInt32LE(bytes.length-22)!==0x06054b50)throw new Error('Incomplete archive.');
 const tail=bytes.length-22,count=bytes.readUInt16LE(tail+10),centralOffset=bytes.readUInt32LE(tail+16),centralSize=bytes.readUInt32LE(tail+12);
 if(!count||count>10000||bytes.readUInt16LE(tail+4)||bytes.readUInt16LE(tail+6)||bytes.readUInt16LE(tail+8)!==count||bytes.readUInt16LE(tail+20)||centralOffset+centralSize!==tail)throw new Error('Invalid archive directory.');
 const entries=[],names=new Set();let at=0;
 while(at+30<=centralOffset&&bytes.readUInt32LE(at)===0x04034b50){
  const size=bytes.readUInt32LE(at+18),length=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),start=at+30+length+extra,end=start+size,name=bytes.toString('utf8',at+30,at+30+length);
  if(!safe(name)||names.has(name)||bytes.readUInt16LE(at+4)!==20||bytes.readUInt16LE(at+6)!==0x800||bytes.readUInt16LE(at+8)!==0||extra||size!==bytes.readUInt32LE(at+22)||end>centralOffset||entries.length>=count)throw new Error('Invalid stored archive.');
  const body=bytes.subarray(start,end);if(crc32(body)!==bytes.readUInt32LE(at+14))throw new Error('Archive CRC mismatch.');
  names.add(name);entries.push({name,bytes:body,offset:at});at=end;
 }
 if(at!==centralOffset||entries.length!==count)throw new Error('Incomplete archive.');
 for(const entry of entries){
  if(at+46>tail||bytes.readUInt32LE(at)!==0x02014b50)throw new Error('Invalid archive directory.');
  const length=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),end=at+46+length+extra+comment;
  if(end>tail||extra||comment||bytes.readUInt16LE(at+4)!==20||bytes.readUInt16LE(at+6)!==20||bytes.readUInt16LE(at+8)!==0x800||bytes.readUInt16LE(at+10)||bytes.readUInt16LE(at+34)||bytes.readUInt32LE(at+38)||bytes.readUInt32LE(at+42)!==entry.offset||bytes.readUInt32LE(at+16)!==crc32(entry.bytes)||bytes.readUInt32LE(at+20)!==entry.bytes.length||bytes.readUInt32LE(at+24)!==entry.bytes.length||bytes.toString('utf8',at+46,at+46+length)!==entry.name)throw new Error('Archive directory does not match its entries.');
  at=end;
 }
 if(at!==tail)throw new Error('Invalid archive directory.');
 return entries.map(({name,bytes})=>({name,bytes}));
}
