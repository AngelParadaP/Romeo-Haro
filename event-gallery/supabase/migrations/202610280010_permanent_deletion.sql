begin;
alter table public.photos add column deleted_at timestamptz;
alter policy photos_read on public.photos using(deleted_at is null and app_private.can_access_event(event_id));
create or replace function app_private.can_access_photo(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photos where id=target and deleted_at is null and app_private.can_access_event(event_id));
$$;
create or replace function app_private.can_react_photo(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.photos p join public.events e on e.id=p.event_id
    where p.id=target and p.deleted_at is null and app_private.can_access_event(e.id)
      and ((e.owner_id=auth.uid() and public.is_admin())
        or (e.active and app_private.event_archive_time(e) is null)));
$$;
create or replace function public.drive_access(target text,kind text,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then false
 when kind='event-covers' then case when writing then app_private.can_write_cover(target) else app_private.can_read_cover(target) end
 when kind='event-photos' and writing then
  target ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and split_part(target,'/',2)=auth.uid()::text and app_private.storage_access(target,true)
 when kind='event-photos' then exists(select 1 from public.photos p where p.storage_path=target
  and p.deleted_at is null and p.storage_provider='google-drive' and app_private.can_access_event(p.event_id))
 else false end;
$$;
create or replace function public.storage_access(target text,kind text,provider text,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select case when provider='google-drive' then public.drive_access(target,kind,writing)
 when provider<>'r2' or auth.uid() is null then false
 when writing then public.drive_access(target,kind,true)
 when kind='event-photos' then exists(select 1 from public.photos p where p.storage_path=target and p.deleted_at is null and p.storage_provider='r2' and app_private.can_access_event(p.event_id))
 when kind='event-covers' then app_private.can_read_cover(target) and app_private.r2_object_exists(target,kind)
 else false end;
$$;

-- Admission leases let event cleanup wait for uploads already in flight.
create table public.storage_upload_leases (
 id uuid primary key,event_id uuid not null,uploader_id uuid not null references auth.users(id),
 bucket text not null,path text not null,provider text not null check(provider in ('r2','google-drive')),
 external_key text,expires_at timestamptz not null default now()+interval '90 seconds'
);
alter table public.storage_upload_leases enable row level security;
revoke all on public.storage_upload_leases from public,anon,authenticated;
grant all on public.storage_upload_leases to service_role;
create index storage_upload_leases_event on public.storage_upload_leases(event_id);
create function public.begin_upload_lease(lease_token uuid,event_token uuid,target text,kind text,provider text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.events where id=event_token for update;
 if provider not in ('r2','google-drive') or not public.drive_access(target,kind,true)
  or (kind='event-photos' and split_part(target,'/',1)<>event_token::text)
  or (kind='event-covers' and split_part(target,'/',2)<>event_token::text)
 then raise exception 'La subida no está autorizada'; end if;
 insert into public.storage_upload_leases(id,event_id,uploader_id,bucket,path,provider)
 values(lease_token,event_token,auth.uid(),kind,target,provider);
end;
$$;
revoke all on function public.begin_upload_lease(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.begin_upload_lease(uuid,uuid,text,text,text) to authenticated;
-- A tombstoned photo cannot be downloaded through the legacy Storage API.
create or replace function app_private.storage_access(path text,uploading boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.events e where e.id::text=split_part(path,'/',1)
 and case when uploading then app_private.can_upload_event(e.id) else app_private.can_access_event(e.id)
 and not exists(select 1 from public.photos p where p.storage_path=path and p.deleted_at is not null) end);
$$;
create table public.deletion_jobs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 event_id uuid not null, photo_id uuid, title text not null,
 created_at timestamptz not null default now(), manifest jsonb,
 cursor integer not null default 0 check(cursor>=0), last_error text,
 lease_until timestamptz, lease_token uuid,
 unique nulls not distinct(event_id,photo_id),
 check(manifest is null or jsonb_typeof(manifest)='array')
);
alter table public.deletion_jobs enable row level security;
revoke all on public.deletion_jobs from public,anon,authenticated;
grant all on public.deletion_jobs to service_role;

create function public.begin_deletion(event_token uuid,photo_token uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.events; job uuid;
begin
 select * into e from public.events where id=event_token for update;
 if not found or e.owner_id is distinct from auth.uid() or not public.is_admin() then raise exception 'Solo el fotógrafo propietario puede eliminar'; end if;
 select id into job from public.deletion_jobs where event_id=event_token and photo_id is not distinct from photo_token;
 if job is not null then return job; end if;
 if photo_token is null then
  update public.events set active=false,deleted_at=now() where id=event_token;
 else
  if e.deleted_at is not null then raise exception 'El evento ya se está eliminando'; end if;
  update public.photos set deleted_at=now() where id=photo_token and event_id=event_token;
  if not found then raise exception 'Fotografía no encontrada'; end if;
 end if;
 insert into public.deletion_jobs(owner_id,event_id,photo_id,title) values(auth.uid(),event_token,photo_token,e.title) returning id into job;
 return job;
end;
$$;
revoke all on function public.begin_deletion(uuid,uuid) from public,anon;
grant execute on function public.begin_deletion(uuid,uuid) to authenticated;

create function public.claim_deletion(job_token uuid,claim_token uuid) returns setof public.deletion_jobs
language sql security definer set search_path='' as $$
 update public.deletion_jobs set lease_until=now()+interval '90 seconds',lease_token=claim_token
 where id=job_token and (lease_until is null or lease_until<now())
 and (photo_id is not null or not exists(select 1 from public.storage_upload_leases u where u.event_id=deletion_jobs.event_id and u.expires_at>now())) returning *;
$$;
create function public.finish_deletion(job_token uuid,claim_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.deletion_jobs;
begin
 select * into j from public.deletion_jobs where id=job_token and lease_token=claim_token for update;
 if not found then raise exception 'La limpieza no está disponible'; end if;
 if j.manifest is null or j.cursor<jsonb_array_length(j.manifest) then raise exception 'Falta eliminar archivos'; end if;
 if j.photo_id is null then
  delete from public.r2_objects where event_id=j.event_id;
  delete from public.drive_objects where event_id=j.event_id;
  delete from public.storage_upload_leases where event_id=j.event_id;
  delete from public.events where id=j.event_id and owner_id=j.owner_id;
  delete from public.deletion_jobs where event_id=j.event_id;
 else
  delete from public.r2_objects where bucket='event-photos' and path in(select storage_path from public.photos where id=j.photo_id);
  delete from public.drive_objects where bucket='event-photos' and path in(select storage_path from public.photos where id=j.photo_id);
  delete from public.photos where id=j.photo_id and event_id=j.event_id;
  delete from public.deletion_jobs where id=j.id;
 end if;
end;
$$;
revoke all on function public.claim_deletion(uuid,uuid),public.finish_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_deletion(uuid,uuid),public.finish_deletion(uuid,uuid) to service_role;
commit;
