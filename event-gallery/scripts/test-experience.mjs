import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { unzipSync } from 'fflate';
const require=createRequire(import.meta.url);
async function loadTS(path){
  const text=await readFile(new URL(path,import.meta.url),'utf8');
  const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from ['"]fflate['"]/g,`from '${pathToFileURL(require.resolve('fflate')).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const {buildPhotoArchives}=await loadTS('../lib/archives.ts');
const {uploadStatus,matchesEvent,rememberGuest,rememberedGuest}=await loadTS('../lib/event-utils.ts');
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
rememberGuest('event-a','user-a','Ana');
assert.equal(rememberedGuest('event-a','user-a'),'Ana');
assert.equal(rememberedGuest('event-b','user-a'),'');
assert.equal(rememberedGuest('event-a','user-b'),'');
store.set('romeo-event-guest:bad','{broken');assert.equal(rememberedGuest('bad','user-a'),'');
console.log('✓ Guest display names persist by event and verified user, never across identities');
const event={id:'a',title:'Ana & Carlos',date:'2026-11-14',active:true};
const open=Date.parse('2026-11-14T12:00:00Z');const close=open+48*3600000;
const scheduled={...event,uploadsOpenAt:new Date(open).toISOString(),uploadsCloseAt:new Date(close).toISOString()};
assert.equal(uploadStatus(scheduled,open-1),'scheduled');assert.equal(uploadStatus(scheduled,open),'open');assert.equal(uploadStatus(scheduled,close-1),'open');assert.equal(uploadStatus(scheduled,close),'closed');
assert.equal(uploadStatus({...event,active:false},open),'closed');assert.equal(uploadStatus(event,open),'open');
console.log('✓ Upload window boundaries include opening and exclude closing exactly 48 hours later');
assert.equal(matchesEvent(event,'carlos','2026-11-01','2026-11-30'),true);assert.equal(matchesEvent(event,'2026-11-14','',''),true);assert.equal(matchesEvent(event,'','2026-11-15',''),false);assert.equal(matchesEvent(event,'','','2026-11-13'),false);
console.log('✓ Search combines names, dates and inclusive date ranges');
async function* files(){for(let i=0;i<13;i++)yield{id:String(i),blob:new Blob([new Uint8Array([i,i+1,i+2])])};}
let progress=0;const archives=await buildPhotoArchives(files(),'test',n=>progress=n,new AbortController().signal,15);
assert.equal(archives.length,3);assert.equal(progress,13);
let total=0;
for(const archive of archives){const entries=unzipSync(new Uint8Array(await(await fetch(archive.url)).arrayBuffer()));for(const[name,bytes]of Object.entries(entries)){const id=Number(name.match(/foto-(\d+)/)[1]);assert.deepEqual([...bytes],[id,id+1,id+2]);total++;}URL.revokeObjectURL(archive.url);}
assert.equal(total,13);console.log('✓ ZIP export includes all 13 files, splits packages and preserves image bytes');
async function* empty(){}assert.deepEqual(await buildPhotoArchives(empty(),'empty',()=>{},new AbortController().signal),[]);
const aborted=new AbortController();aborted.abort();await assert.rejects(()=>buildPhotoArchives(files(),'cancelled',()=>{},aborted.signal));
console.log('✓ Empty exports and cancelled downloads do not produce archives');
