begin;
alter table public.photos drop constraint photos_storage_provider_check;
alter table public.photos add constraint photos_storage_provider_check check(storage_provider in ('supabase','google-drive','r2'));
alter table public.events drop constraint events_cover_provider_check;
alter table public.events add constraint events_cover_provider_check check(cover_provider in ('supabase','google-drive','r2'));
create table public.r2_objects (
 bucket text not null check(bucket in ('event-photos','event-covers')),
 path text not null, object_key text not null unique,
 event_id uuid not null, uploader_id uuid not null references auth.users(id),
 size_bytes integer not null check(size_bytes between 1 and 3145728),
 created_at timestamptz not null default now(), primary key(bucket,path),
 check(object_key=bucket||'/'||path)
);
create index r2_objects_event on public.r2_objects(event_id);
alter table public.r2_objects enable row level security;
revoke all on public.r2_objects from public,anon,authenticated;
grant all on public.r2_objects to service_role;
create function app_private.r2_object_exists(target text,kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.r2_objects where path=target and bucket=kind);
$$;
revoke all on function app_private.r2_object_exists(text,text) from public,anon;
grant execute on function app_private.r2_object_exists(text,text) to authenticated;
alter policy photos_create on public.photos with check(author_id=auth.uid() and app_private.can_upload_event(event_id)
 and case storage_provider when 'google-drive' then app_private.drive_object_exists(storage_path,'event-photos')
 when 'r2' then app_private.r2_object_exists(storage_path,'event-photos') else app_private.object_exists(storage_path) end);
create function app_private.validate_r2_cover() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.cover_provider='r2' and (new.cover_path is null or not app_private.r2_object_exists(new.cover_path,'event-covers'))
 then raise exception 'Portada de R2 no verificada'; end if;
 return new;
end;
$$;
revoke all on function app_private.validate_r2_cover() from public,anon,authenticated;
create trigger validate_r2_cover before insert or update of cover_path,cover_provider on public.events
for each row execute function app_private.validate_r2_cover();
create function public.storage_access(target text,kind text,provider text,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select case when provider='google-drive' then public.drive_access(target,kind,writing)
 when provider<>'r2' or auth.uid() is null then false
 when writing then public.drive_access(target,kind,true)
 when kind='event-photos' then exists(select 1 from public.photos p where p.storage_path=target and p.storage_provider='r2' and app_private.can_access_event(p.event_id))
 when kind='event-covers' then app_private.can_read_cover(target) and app_private.r2_object_exists(target,kind)
 else false end;
$$;
revoke all on function public.storage_access(text,text,text,boolean) from public,anon;
grant execute on function public.storage_access(text,text,text,boolean) to authenticated;
commit;
