import fs from 'node:fs';
import {translations} from './i18n.mjs';
import {createSecretTools} from './secret-text.mjs';
export function renderWidget(){
 const html=fs.readFileSync(new URL('./widget.html',import.meta.url),'utf8');
 return html.replace('/*ROOM_TRANSLATIONS*/{}',JSON.stringify(translations).replace(/</g,'\\u003c')).replace('/*ROOM_SECRET_TEXT*/null',()=> '('+createSecretTools.toString()+')()');
}
