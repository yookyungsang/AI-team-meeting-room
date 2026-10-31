import fs from 'node:fs';

export const UI_LANGUAGES=['ko','en','ja','zh-Hans','zh-Hant'];
export const translations=Object.fromEntries(UI_LANGUAGES.filter(code=>code!=='ko').map(code=>[code,JSON.parse(fs.readFileSync(new URL('./ui-'+code+'.json',import.meta.url),'utf8'))]));
export const translate=(language,value)=>typeof value==='string'&&Object.hasOwn(translations,language)&&Object.hasOwn(translations[language],value)?translations[language][value]:value;
