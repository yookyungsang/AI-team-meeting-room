import fs from 'node:fs';
export function renderWidget(){
 const html=fs.readFileSync(new URL('./widget.html',import.meta.url),'utf8'),translations=fs.readFileSync(new URL('./ui-en.json',import.meta.url),'utf8');
 return html.replace('/*ROOM_TRANSLATIONS*/{}',JSON.stringify(JSON.parse(translations)).replace(/</g,'\\u003c'));
}
