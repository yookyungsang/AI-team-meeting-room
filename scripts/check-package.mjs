// Read-only package checks. No dependencies, network, AI, native chats or runtime data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const pkg=json('package.json'),portable=json('host-plugin/plugin.json'),compat=json('host-plugin/.codex-plugin/plugin.json');
assert.match(pkg.version,/^\d+\.\d+\.\d+$/,'Use the same x.y.z release version in each manifest.');
assert.equal(portable.version,pkg.version,'Portable plugin version differs.');
assert.equal(compat.version,pkg.version,'Codex plugin version differs.');
assert.equal(portable.name,'jyfood-room');assert.equal(compat.name,'jyfood-room');
assert.equal(pkg.license,'MIT');assert.equal(read('LICENSE'),read('host-plugin/LICENSE'));
const marketplace=json('.agents/plugins/marketplace.json');
assert.equal(marketplace.name,'jyfood-local');
assert(marketplace.plugins.some(p=>p.name==='jyfood-room'&&p.source.path==='./host-plugin'));
for(const file of ['host-plugin/.mcp.json','host-plugin/mcp.json']){
 const servers=json(file).mcpServers;assert.deepEqual(Object.keys(servers),['team-room']);
 assert.equal(servers['team-room'].command,'node');
 assert.match(servers['team-room'].args[0],/\$\{(?:CODEX_)?PLUGIN_ROOT\}\/server\.mjs$/);
}
assert(read('host-plugin/widget.html').includes("appInfo:{name:'team-room',version:'"+pkg.version+"'}"),'UI version differs.');
for(const file of ['SETUP.ko.md','SETUP.en.md','USER_GUIDE.ko.md','USER_GUIDE.en.md'])assert(read('host-plugin/'+file).includes(pkg.version),file+' needs the current version.');
assert(fs.existsSync(path.join(root,'docs/releases/v'+pkg.version+'.md')),'Add release notes for the current version.');

const files=[];
function walk(relative){
 for(const entry of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){
  const name=path.posix.join(relative,entry.name);assert(!entry.isSymbolicLink(),'Do not package symlinks: '+name);
  if(entry.isDirectory())walk(name);else files.push(name);
 }
}
walk('host-plugin');
const runtimeNames=new Set(['projects.json','work-control.json','usage-ledger.json','team-setups.json','team-menu.json','.codex-global-state.json','state_5.sqlite']);
for(const file of files){
 assert(!runtimeNames.has(path.posix.basename(file)),'Runtime data must stay outside the package: '+file);
 assert(!/(?:^|\/)(?:rooms|validation|exports|node_modules|\.local|\.git)(?:\/|$)|(?:\.lock|\.next|\.log)$|(?:^|\/)\.env(?:\.|$)/.test(file),'Unexpected package data: '+file);
}
walk('docs');files.push('README.md','README.ko.md');
let links=0;
for(const file of files.filter(f=>f.endsWith('.md'))){
 const text=read(file);
 for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
  const target=match[1];if(/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target))continue;
  const relative=decodeURIComponent(target.split('#')[0]);if(!relative)continue;
  const dest=path.resolve(root,path.dirname(file),relative);
  assert(dest.startsWith(root)&&fs.existsSync(dest),'Broken local link in '+file+': '+target);links++;
 }
}
console.log('Package '+pkg.version+': identity, versions, MIT text, runtime exclusions and '+links+' local document links pass.');
