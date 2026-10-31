import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UI_LANGUAGES,translations,translate} from '../host-plugin/i18n.mjs';
import {renderWidget} from '../host-plugin/ui.mjs';

test('all packaged dictionaries cover the same authored UI and diagnostic labels with no Korean fallback',()=>{
 const html=fs.readFileSync(new URL('../host-plugin/widget.html',import.meta.url),'utf8');
 const diagnostics=fs.readFileSync(new URL('../host-plugin/diagnostics.mjs',import.meta.url),'utf8');
 const keys=Object.keys(translations.en).sort();assert(keys.length>=391);
 const authored=[...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map(m=>m[1]);
 const diagnosticKeys=[...diagnostics.matchAll(/'([^'\n]*[가-힣][^'\n]*)'/g)].map(m=>m[1]);
 for(const language of UI_LANGUAGES.filter(l=>l!=='ko')){
  const dictionary=translations[language];assert.deepEqual(Object.keys(dictionary).sort(),keys);
  for(const key of [...authored,...diagnosticKeys])assert(Object.hasOwn(dictionary,key),language+' missing '+key);
  for(const value of Object.values(dictionary)){assert.equal(typeof value,'string');assert(value.trim());assert(!/[가-힣]/.test(value),language+' contains Korean fallback');}
 }
 for(const value of ['unrecognized literal','constructor','__proto__','toString'])assert.equal(translate('ja',value),value);assert.equal(translate('zh-Hant',42),42);
 assert.equal(renderWidget().includes('/*ROOM_TRANSLATIONS*/'),false);assert.match(html,/<option value="zh-Hans">简体中文<\/option>/);assert.match(html,/<option value="zh-Hant">繁體中文<\/option>/);
});
