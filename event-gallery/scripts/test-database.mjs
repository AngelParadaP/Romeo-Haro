// Executes the actual migration and RLS under PostgreSQL, with mocked Supabase
// auth/storage schemas. No external credentials or hosted data are touched.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, storage, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text unique);
  alter table storage.objects enable row level security;
  grant select, insert, delete on storage.objects to authenticated;
`);
const migrations = new URL('../supabase/migrations/', import.meta.url);
for (const file of (await readdir(migrations)).filter(file => file.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(file, migrations), 'utf8'));
}
const owner = '10000000-0000-4000-8000-000000000001';
const owner2 = '10000000-0000-4000-8000-000000000002';
const guest = '20000000-0000-4000-8000-000000000001';
const outsider = '20000000-0000-4000-8000-000000000002';
const a = '30000000-0000-4000-8000-000000000001';
const b = '30000000-0000-4000-8000-000000000002';
const photo = '40000000-0000-4000-8000-000000000001';
const path = `${a}/${guest}/${photo}.jpg`;
await db.query('insert into auth.users values ($1),($2),($3),($4)', [owner, owner2, guest, outsider]);
await db.query('insert into public.admin_users values ($1),($2)', [owner, owner2]);
async function as(id) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}
let passed = 0;
async function test(label, run) { await run(); passed++; console.log(`✓ ${label}`); }
await as(owner);
await test('Authorized owner creates event with RETURNING (Supabase insert/select)', async () => {
  const inserted = await db.query("insert into public.events(id,title,date,category,cover) values ($1,'Boda','2026-11-14','Boda','https://example.com/a.jpg') returning id", [a]);
  assert.deepEqual(inserted.rows, [{ id: a }]);
});
await test('New archived events can also return their ID to their owner', async () => {
  const id = '30000000-0000-4000-8000-000000000003';
  const result = await db.query("with created as (insert into public.events(id,title,date,category,cover,active) values ($1,'Borrador','2026-11-14','Boda','https://example.com/a.jpg',false) returning id) select id from created", [id]);
  assert.deepEqual(result.rows, [{ id }]);
});
await as(owner2);
await db.query("insert into public.events(id,title,date,category,cover) values ($1,'Otro evento','2026-11-14','Boda','https://example.com/b.jpg')", [b]);
await test('Photographers cannot edit each other’s events', async () => {
  assert.equal((await db.query("update public.events set title='Intrusión' where id=$1 returning id", [a])).rows.length, 0);
  await assert.rejects(() => db.query('update public.events set owner_id=$1 where id=$2', [owner2, a]));
  await assert.rejects(() => db.query("insert into public.events(owner_id,title,date,category,cover) values ($1,'Ataque','2026-11-14','Boda','https://example.com/a.jpg') returning id", [owner]));
});
await as(guest);
await test('Guest cannot enumerate events, create events or become admin', async () => {
  assert.equal((await db.query('select * from public.events')).rows.length, 0);
  await assert.rejects(() => db.query("insert into public.events(title,date,category,cover) values ('Ataque','2026-11-14','Boda','https://example.com/a.jpg')"));
  await assert.rejects(() => db.query("insert into public.events(title,date,category,cover) values ('Ataque','2026-11-14','Boda','https://example.com/a.jpg') returning id"));
  await assert.rejects(() => db.query('insert into public.admin_users values ($1)', [guest]));
  await assert.rejects(() => db.query('insert into public.event_guests values ($1,$2,now())', [a, guest]));
});
await test('Event link joins exactly one gallery; repeat joins are safe', async () => {
  await db.query('select public.join_event($1)', [a]);
  await db.query('select public.join_event($1)', [a]);
  assert.deepEqual((await db.query('select id from public.events')).rows.map(r => r.id), [a]);
  await assert.rejects(() => db.query('select public.gallery_page($1)', [b]));
});
await test('Upload requires correct event and user folder; metadata requires object', async () => {
  await assert.rejects(() => db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)", [`${b}/${guest}/${photo}.jpg`]));
  await assert.rejects(() => db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)", [`${a}/${owner}/${photo}.jpg`]));
  await assert.rejects(() => db.query('insert into public.photos(id,event_id,author,storage_path) values ($1,$2,$3,$4)', [photo, a, 'Ana', path]));
  await db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)", [path]);
  await db.query('insert into public.photos(id,event_id,author,storage_path) values ($1,$2,$3,$4)', [photo, a, 'Ana', path]);
});
await test('Reactions cannot be impersonated or duplicated', async () => {
  await db.query('insert into public.photo_likes(photo_id) values ($1)', [photo]);
  await assert.rejects(() => db.query('insert into public.photo_likes(photo_id) values ($1)', [photo]));
  await assert.rejects(() => db.query('insert into public.photo_favorites(photo_id,user_id) values ($1,$2)', [photo, outsider]));
  await db.query('insert into public.photo_favorites(photo_id) values ($1)', [photo]);
});
await test('Gallery RPC returns counts, reactions and favorites on server pages', async () => {
  const result = (await db.query('select public.gallery_page($1,1,true) as result', [a])).rows[0].result;
  assert.equal(result.total, 1); assert.equal(result.items[0].liked, true); assert.equal(result.items[0].favorite, true); assert.equal(result.items[0].like_count, 1);
  assert.equal((await db.query('select public.gallery_page($1,2,false) as result', [a])).rows[0].result.items.length, 0);
  await assert.rejects(() => db.query('select public.gallery_page($1,0,false)', [a]));
});
await test('Pagination is performed in PostgreSQL with a stable 12-photo boundary', async () => {
  for (let i = 2; i <= 13; i++) {
    const id = `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const location = `${a}/${guest}/${id}.jpg`;
    await db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)", [location]);
    await db.query('insert into public.photos(id,event_id,author,storage_path) values ($1,$2,$3,$4)', [id, a, 'Ana', location]);
  }
  const first = (await db.query('select public.gallery_page($1,1,false) as result', [a])).rows[0].result;
  const second = (await db.query('select public.gallery_page($1,2,false) as result', [a])).rows[0].result;
  assert.equal(first.total, 13); assert.equal(first.items.length, 12); assert.equal(second.items.length, 1);
  assert.equal(new Set([...first.items, ...second.items].map(p => p.id)).size, 13);
});
await test('Complete download manifest includes other pages and filters private favorites', async () => {
  const snapshot=(await db.query('select public.download_snapshot($1) as cutoff',[a])).rows[0].cutoff;
  const all=(await db.query('select * from public.download_page($1,null,$2,false)',[a,snapshot])).rows;
  assert.equal(all.length,13);
  assert.equal((await db.query('select * from public.download_page($1,$2,$3,false)',[a,all[11].id,snapshot])).rows.length,1);
  assert.equal((await db.query('select * from public.download_page($1,null,$2,true)',[a,snapshot])).rows.length,1);
});
await as(owner);
await test('Photographer can personalize text and crop without changing ownership', async () => {
  const result=await db.query("update public.events set description='Bienvenidos',cover_x=20,cover_y=80,cover_zoom=1.5 where id=$1 returning description,cover_x",[a]);
  assert.equal(result.rows[0].description,'Bienvenidos');assert.equal(result.rows[0].cover_x,20);
  await assert.rejects(()=>db.query('update public.events set cover_zoom=5 where id=$1',[a]));
});
const coverPath=`${owner}/${a}/50000000-0000-4000-8000-000000000001.jpg`;
await test('Private covers are writable only by the event photographer', async()=>{
  await db.query("insert into storage.objects(bucket_id,name) values ('event-covers',$1)",[coverPath]);
  await db.query('update public.events set cover_path=$1 where id=$2',[coverPath,a]);
  await as(owner2);
  await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values ('event-covers',$1)",[`${owner2}/${a}/50000000-0000-4000-8000-000000000002.jpg`]));
  assert.equal((await db.query("select * from storage.objects where bucket_id='event-covers'")).rows.length,0);
});
await as(guest);
await test('Members can view their cover but cannot replace it', async()=>{
  assert.equal((await db.query("select * from storage.objects where bucket_id='event-covers'")).rows.length,1);
  await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values ('event-covers',$1)",[`${guest}/${a}/50000000-0000-4000-8000-000000000003.jpg`]));
});
await as(owner);
await db.query("update public.events set uploads_open_at=now()-interval '49 hours',uploads_close_at=now()-interval '1 hour' where id=$1",[a]);
await as(guest);
await test('Expired upload window blocks Storage and metadata while preserving viewing/downloads',async()=>{
  assert.equal((await db.query('select app_private.can_upload_event($1) as allowed',[a])).rows[0].allowed,false);
  assert.equal((await db.query('select public.gallery_page($1) as result',[a])).rows[0].result.total,13);
  assert.equal((await db.query('select * from public.download_page($1)',[a])).rows.length,13);
  await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)",[`${a}/${guest}/60000000-0000-4000-8000-000000000001.jpg`]));
  const pending='60000000-0000-4000-8000-000000000002';const pendingPath=`${a}/${guest}/${pending}.jpg`;
  await db.exec('reset role');await db.query("insert into storage.objects(bucket_id,name) values ('event-photos',$1)",[pendingPath]);await as(guest);
  await assert.rejects(()=>db.query('insert into public.photos(id,event_id,author,storage_path) values ($1,$2,$3,$4)',[pending,a,'Ana',pendingPath]));
  await db.query('delete from storage.objects where name=$1',[pendingPath]);
});
await as(owner);
await db.query("update public.events set uploads_open_at=now()+interval '1 hour',uploads_close_at=now()+interval '49 hours' where id=$1",[a]);
await as(guest);
await test('Future opening blocks early uploads without hiding the gallery',async()=>{
  assert.equal((await db.query('select app_private.can_upload_event($1) as allowed',[a])).rows[0].allowed,false);
  assert.equal((await db.query('select * from public.events where id=$1',[a])).rows.length,1);
});
await as(owner);await db.query('update public.events set uploads_open_at=null,uploads_close_at=null where id=$1',[a]);
await as(outsider);
await test('Uninvited user cannot read images or react', async () => {
  assert.equal((await db.query('select * from public.photos')).rows.length, 0);
  await assert.rejects(()=>db.query('select * from public.download_page($1)',[a]));
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await assert.rejects(() => db.query('insert into public.photo_likes(photo_id) values ($1)', [photo]));
});
await db.query('select public.join_event($1)', [a]);
await test('Invited user sees likes but not another guest’s favorites', async () => {
  assert.equal((await db.query('select * from public.photo_likes')).rows.length, 1);
  assert.equal((await db.query('select * from public.photo_favorites')).rows.length, 0);
  assert.equal((await db.query('select public.gallery_page($1,1,true) as result', [a])).rows[0].result.total, 0);
  assert.equal((await db.query('delete from public.photo_likes where photo_id=$1 returning *', [photo])).rows.length, 0);
});
await as(owner);
await db.query('update public.events set active=false where id=$1 returning id', [a]);
await as(guest);
await test('Archiving revokes gallery reads, uploads and reactions', async () => {
  assert.equal((await db.query('select * from public.photos')).rows.length, 0);
  await assert.rejects(()=>db.query('select * from public.download_page($1)',[a]));
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  await assert.rejects(() => db.query('select public.join_event($1)', [a]));
  await assert.rejects(() => db.query('insert into public.photo_likes(photo_id) values ($1)', [photo]));
  assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [path])).rows.length, 0);
});
await as(owner);
await test('Owner can read archived gallery and retire event', async () => {
  assert.equal((await db.query('select public.gallery_page($1) as result', [a])).rows[0].result.total, 13);
  assert.equal((await db.query('update public.events set deleted_at=now(), active=false where id=$1 returning id', [a])).rows.length, 1);
  assert.equal((await db.query('select * from public.events where id=$1', [a])).rows.length, 0);
});
await db.exec("reset role; set role anon;");
await test('Unauthenticated API requests cannot read or invoke gallery functions', async () => {
  await assert.rejects(() => db.query('select * from public.events'));
  await assert.rejects(() => db.query('select public.join_event($1)', [a]));
  await assert.rejects(() => db.query('select public.gallery_page($1)', [a]));
});
await db.close();
console.log(`\n${passed} PostgreSQL/RLS integration checks passed (mocked auth/storage).`);
