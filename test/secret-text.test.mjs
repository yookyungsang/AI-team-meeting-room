import test from 'node:test';
import assert from 'node:assert/strict';
import {secretText,createSecretTools} from '../host-plugin/secret-text.mjs';
import vm from 'node:vm';

const sample=prefix=>prefix+('SyntheticFixture9').repeat(4);
test('local detector finds supported tokens, key blocks and explicit credentials without returning values',()=>{
 const values=[sample('sk-'+'proj-'),sample('gh'+'p_'),'AK'+'IA'+'A1B2C3D4E5F6G7H8','AI'+'za'+'a'.repeat(35),sample('xox'+'b-'),'eyJ'+('a'.repeat(15))+'.'+('b'.repeat(15))+'.'+('c'.repeat(25)),'-----BEGIN '+'PRIVATE KEY-----\n'+sample('fixture-')+'\n-----END PRIVATE KEY-----'];
 for(const value of values){const findings=secretText.find(value);assert(findings.length);assert(!JSON.stringify(findings).includes(value));assert(!secretText.redact(value).includes(value));}
 const auth=sample('fixture-');for(const input of ['Authorization: Bearer '+auth,'api_key="'+auth+'"','password="correct horse fixture battery"','postgres://fixture-user:fixture-password@localhost/db']){
  const ranges=secretText.find(input);assert.equal(ranges.length,1);const masked=secretText.redact(input,ranges);assert(masked.includes('[REDACTED]'));assert(!masked.includes(input.slice(ranges[0].start,ranges[0].end)));
 }
});
test('redaction preserves surrounding Unicode, source text and untouched ordinary code/examples',()=>{
 const value=sample('sk-'+'proj-'),text='😀 앞 공백  \n'+value+'\n뒤 원문  ',expected='😀 앞 공백  \n[REDACTED]\n뒤 원문  ';
 assert.equal(secretText.redact(text),expected);assert(text.includes(value));
 for(const input of ['public class DoorKey {}','api_key="YOUR_API_KEY"','password="changeme"','apiKey: process.env.API_KEY','const apiKey = readConfiguration();','-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----','Assets/Keys/store.png','정산 금액과 본점 배분을 수정했습니다.']){assert.equal(secretText.find(input).length,0,input);assert.equal(secretText.redact(input),input);}
});
test('overlaps redact the whole key once and incomplete private keys remain detectable',()=>{
 const token=sample('sk-'+'proj-'),text='api_key="'+token+'"';assert.equal(secretText.find(text).length,1);assert.equal(secretText.redact(text),'api_key="[REDACTED]"');
 const partial='before\n-----BEGIN '+'OPENSSH PRIVATE KEY-----\nunfinished fixture';assert.equal(secretText.redact(partial),'before\n[REDACTED]');
 assert.equal(secretText.find(null).length,0);assert.equal(secretText.redact(undefined),undefined);
});
test('embedded browser factory matches server behavior without dependencies or model calls',()=>{
 const browser=vm.runInNewContext('('+createSecretTools.toString()+')()');
 const text='안내 '+sample('sk-'+'proj-')+' end';assert.equal(JSON.stringify(browser.find(text)),JSON.stringify(secretText.find(text)));assert.equal(browser.redact(text),secretText.redact(text));
 const long=('ordinary paragraph\n'.repeat(10000))+sample('gh'+'p_');assert.equal(secretText.find(long).length,1);
});
