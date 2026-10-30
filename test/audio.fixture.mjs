// Synthetic PCM tone for isolated storage and browser tests, never user audio.
export function wav({seconds=1,frequency=440}={}){
 const rate=22050,count=Math.round(rate*seconds),bytes=Buffer.alloc(44+count*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++)bytes.writeInt16LE(Math.round(Math.sin(2*Math.PI*frequency*i/rate)*3276),44+i*2);return bytes;
}
