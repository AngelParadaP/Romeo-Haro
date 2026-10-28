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
const {uploadStatus,matchesEvent,rememberGuest,rememberedGuest,sortEvents,monthDays,cropFromDrag,openingFromEventDate,defaultClosingMode,uploadWindow,isEventActive,canGuestView,eventArchivedAt,guestAccessUntil,archiveConsultationMs}=await loadTS('../lib/event-utils.ts');
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

const ordered=[{...event,id:'b',title:'Zeta',date:'2026-12-01',createdAt:'2026-01-01',photos:[],photoCount:3},{...event,id:'a',title:'Ana',date:'2026-11-01',createdAt:'2026-02-01',photos:[],photoCount:8}];
for(const sort of ['created-desc','date-asc','name','photos'])assert.equal(sortEvents(ordered,sort)[0].id,'a');
for(const sort of ['created-asc','date-desc'])assert.equal(sortEvents(ordered,sort)[0].id,'b');
assert.equal(ordered[0].id,'b');
console.log('✓ Event ordering handles creation, dates, names and photo counts without mutating the source');
const days=monthDays(2026,9);assert.equal(days.length,42);assert.equal(days[0].key,'2026-09-28');assert.equal(days.filter(day=>day.inMonth).length,31);assert.equal(monthDays(2028,1).filter(day=>day.inMonth).length,29);
assert.equal(new Set(days.map(day=>day.key)).size,42);
console.log('✓ Calendar uses Monday-first six-week grids, month boundaries and leap years');
assert.deepEqual(cropFromDrag(50,50,100,-100,200,200,1),{x:0,y:100});assert.deepEqual(cropFromDrag(50,50,100,0,200,200,2),{x:25,y:50});assert.deepEqual(cropFromDrag(50,50,1000,-1000,200,200,1),{x:0,y:100});
console.log('✓ Pointer crop stays within the image and accounts for zoom');
const {canShareFiles,wasCancelled}=await loadTS('../lib/native-share.ts');
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});assert.equal(canShareFiles([]),false);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{share:async()=>{},canShare:()=>true}});assert.equal(canShareFiles([new File(['test'],'test.jpg',{type:'image/jpeg'})]),true);
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{share:async()=>{},canShare:()=>{throw new Error('blocked');}}});assert.equal(canShareFiles([]),false);assert.equal(wasCancelled(new DOMException('cancelled','AbortError')),true);
console.log('✓ Native saving falls back when file sharing is unavailable or blocked and recognizes cancellation');

assert.equal(openingFromEventDate('2026-11-14'),'2026-11-14T00:00');assert.equal(openingFromEventDate(''),'');
assert.equal(defaultClosingMode(),'48h');assert.equal(defaultClosingMode(event),'none');
const window48=uploadWindow('2026-11-14T00:00','','48h');
assert.equal(Date.parse(window48.end)-Date.parse(window48.start),48*3600000);
assert.equal(defaultClosingMode({...event,uploadsOpenAt:window48.start,uploadsCloseAt:window48.end}),'48h');
const manual=uploadWindow('2026-11-14T18:30','','48h');assert.equal(Date.parse(manual.end)-Date.parse(manual.start),48*3600000);
assert.throws(()=>uploadWindow('','','48h'));assert.throws(()=>uploadWindow('2026-11-14T18:30','2026-11-14T17:00','custom'));
assert.equal(isEventActive({...event,archiveAfterClose:true,uploadsCloseAt:window48.end},Date.parse(window48.end)-1),true);
assert.equal(isEventActive({...event,archiveAfterClose:true,uploadsCloseAt:window48.end},Date.parse(window48.end)),false);
assert.equal(isEventActive({...event,archiveAfterClose:false,uploadsCloseAt:window48.end},Date.parse(window48.end)),true);
console.log('✓ Event date seeds editable opening, new events default to 48h and archive exactly at deadline');

const archived={...event,active:false,archivedAt:'2026-10-27T15:30:00Z'};
const expires=Date.parse(archived.archivedAt)+archiveConsultationMs;
assert.equal(canGuestView(archived,expires-1),true);assert.equal(canGuestView(archived,expires),false);
assert.equal(uploadStatus(archived,expires-1),'closed');
assert.equal(guestAccessUntil(archived),'2026-11-26T15:30:00.000Z');
const automatic={...scheduled,archiveAfterClose:true};
assert.equal(eventArchivedAt(automatic,close-1),null);assert.equal(eventArchivedAt(automatic,close),scheduled.uploadsCloseAt);
assert.equal(canGuestView(automatic,close+archiveConsultationMs-1),true);assert.equal(canGuestView(automatic,close+archiveConsultationMs),false);
assert.equal(canGuestView({...event,active:false},open),false);
assert.equal(canGuestView({...archived,active:true},expires),true);
console.log('✓ Manual and automatic archives allow 30 days of read-only consultation with exact expiry boundaries');

// Regression: one legacy cover must not prevent opening every event after an R2 switch.
const cloudSource=ts.transpileModule(await readFile(new URL('../lib/cloud.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const cloudModule={exports:{}};
const eventRows=[
 {id:'legacy-drive',title:'Legacy',cover:'https://example.test/fallback.jpg',cover_path:'owner/event/legacy.jpg',cover_provider:'google-drive',photos:[{count:1}]},
 {id:'new-r2',title:'New',cover:'https://example.test/fallback.jpg',cover_path:'owner/event/new.jpg',cover_provider:'r2',photos:[{count:2}]},
 {id:'old-supabase',title:'Old',cover:'https://example.test/fallback.jpg',cover_path:'owner/event/old.jpg',cover_provider:'supabase',photos:[{count:3}]}
];
const eventQuery={select(){return this;},is(){return this;},order(){return this;},eq(){return this;},then(resolve){return Promise.resolve({data:eventRows,error:null}).then(resolve);}};
const cloudDB={from(){return eventQuery;},auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.test/supabase.jpg'},error:null})})}};
// The stub client needs only nonempty public configuration; restore the environment afterward.
const priorURL=process.env.NEXT_PUBLIC_SUPABASE_URL,priorKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.test';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
// cloud.ts captures public configuration at module initialization.
new Function('require','module','exports',cloudSource)(specifier=>{
 if(specifier==='@supabase/supabase-js')return {createClient:()=>cloudDB};
 if(specifier==='./maps'||specifier==='./deletions')return {};
 if(specifier==='./storage-client')return {driveURLs:async(bucket,paths,provider)=>{if(provider==='google-drive')throw new Error('Falta configurar DRIVE_ENCRYPTION_KEY');return ['https://example.test/r2.jpg'];}};
 throw new Error(`Unexpected test import ${specifier}`);
},cloudModule,cloudModule.exports);
try{
 const loaded=await cloudModule.exports.loadEvents();assert.equal(loaded.length,3);
 assert.equal(loaded[0].cover,eventRows[0].cover);assert.equal(loaded[0].coverUnavailable,true);assert.equal(loaded[0].coverPath,eventRows[0].cover_path);assert.equal(loaded[0].coverProvider,'google-drive');
 assert.equal(loaded[1].cover,'https://example.test/r2.jpg');assert.equal(loaded[1].coverUnavailable,false);
 assert.equal(loaded[2].cover,'https://example.test/supabase.jpg');assert.equal(loaded[2].coverUnavailable,false);
}finally{if(priorURL===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=priorURL;if(priorKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=priorKey;}
console.log('✓ An unavailable legacy Drive cover cannot block R2/Supabase events or erase its original storage reference');
