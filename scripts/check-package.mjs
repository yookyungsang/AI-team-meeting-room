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
assert.equal(portable.name,'team-room');assert.equal(compat.name,'team-room');
assert.equal(pkg.license,'MIT');assert.equal(read('LICENSE'),read('host-plugin/LICENSE'));
const marketplace=json('.agents/plugins/marketplace.json');
assert.equal(marketplace.name,'team-room-local');
assert(marketplace.plugins.some(p=>p.name==='team-room'&&p.source.path==='./host-plugin'));
const presentation=portable.extensions['com.openai'].interface;
for(const field of ['logo','composerIcon']){
 const relative=presentation[field];
 assert.equal(relative,compat.interface[field],field+' differs between plugin formats.');
 assert.match(relative,/^\.\/assets\/[a-z\d-]+\.png$/,field+' must reference a packaged PNG asset.');
 const bytes=fs.readFileSync(path.join(root,'host-plugin',relative));
 assert(bytes.length>=33&&bytes.length<=5*1024*1024,field+' size must be at most 5 MiB.');
 assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),field+' must be a PNG.');
 assert.equal(bytes.toString('ascii',12,16),'IHDR',field+' needs a PNG header.');
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
 assert(width===height&&width>=48&&width<=4096,field+' must be square and 48–4096 pixels.');
}
for(const file of ['host-plugin/.mcp.json','host-plugin/mcp.json']){
 const servers=json(file).mcpServers;assert.deepEqual(Object.keys(servers),['team-room']);
 assert.equal(servers['team-room'].command,'node');
 assert.match(servers['team-room'].args[0],/\$\{(?:CODEX_)?PLUGIN_ROOT\}\/server\.mjs$/);
}
assert(read('host-plugin/widget.html').includes("appInfo:{name:'team-room',version:'"+pkg.version+"'}"),'UI version differs.');
const guides=['SETUP.ko.md','SETUP.en.md',...['ko','en','ja','zh-Hans','zh-Hant'].map(language=>'USER_GUIDE.'+language+'.md')];
for(const file of guides)assert(read('host-plugin/'+file).includes(pkg.version),file+' needs the current version.');
for(const file of ['README.md','README.ko.md',...guides.map(f=>'host-plugin/'+f)]){
 const text=read(file);assert(text.includes('codex plugin add team-room@team-room-local'),file+' needs the current install selector.');
 assert(!text.includes('jyfood-room@jyfood-local'),file+' must link the migration guide instead of presenting the old selector.');
 assert(text.includes('MIGRATION.md'),file+' needs an existing-install migration link.');
}
const migration=read('host-plugin/MIGRATION.md');
assert(migration.includes('codex plugin remove jyfood-room@jyfood-local'));
assert(migration.includes('codex plugin add team-room@team-room-local'));
assert(migration.includes('TEAM_ROOM_HOME')&&migration.includes('~/.codex/team-room'));
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
 assert(!/(?:^|\/)(?:rooms|validation|exports|imports|node_modules|\.local|\.git)(?:\/|$)|(?:\.lock|\.next|\.log)$|(?:^|\/)\.env(?:\.|$)/.test(file),'Unexpected package data: '+file);
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
console.log('Package '+pkg.version+': identity, versions, branding assets, MIT text, runtime exclusions and '+links+' local document links pass.');
