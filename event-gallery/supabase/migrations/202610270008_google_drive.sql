begin;
-- Only the server may access OAuth credentials and Drive's physical identifiers.
create table public.drive_connections (
 owner_id uuid primary key references auth.users(id),
 refresh_token_encrypted text not null, root_folder_id text not null,
 account_email text not null, updated_at timestamptz not null default now()
);
create table public.drive_objects (
 bucket text not null check(bucket in ('event-photos','event-covers')),
 path text not null, drive_file_id text not null unique,
 event_id uuid not null, uploader_id uuid not null references auth.users(id),
 size_bytes integer not null check(size_bytes between 1 and 3145728),
 created_at timestamptz not null default now(), primary key(bucket,path)
);
create index drive_objects_event on public.drive_objects(event_id);
alter table public.drive_connections enable row level security;
alter table public.drive_objects enable row level security;
revoke all on public.drive_connections,public.drive_objects from public,anon,authenticated;
grant all on public.drive_connections,public.drive_objects to service_role;
grant select on public.admin_users,public.events,public.photos to service_role;
alter table public.photos add column storage_provider text not null default 'supabase' check(storage_provider in ('supabase','google-drive'));
alter table public.events add column cover_provider text not null default 'supabase' check(cover_provider in ('supabase','google-drive'));
grant update(cover_provider) on public.events to authenticated;

create function app_private.drive_object_exists(target text,kind text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.drive_objects where path=target and bucket=kind);
$$;
revoke all on function app_private.drive_object_exists(text,text) from public,anon;
grant execute on function app_private.drive_object_exists(text,text) to authenticated;
alter policy photos_create on public.photos with check(author_id=auth.uid() and app_private.can_upload_event(event_id)
 and case storage_provider when 'google-drive' then app_private.drive_object_exists(storage_path,'event-photos')
 else app_private.object_exists(storage_path) end);

create function app_private.validate_drive_cover() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.cover_provider='google-drive' and (new.cover_path is null or not app_private.drive_object_exists(new.cover_path,'event-covers'))
 then raise exception 'Portada de Drive no verificada'; end if;
 return new;
end;
$$;
revoke all on function app_private.validate_drive_cover() from public,anon,authenticated;
create trigger validate_drive_cover before insert or update of cover_path,cover_provider on public.events
for each row execute function app_private.validate_drive_cover();

-- Execute as the actual Supabase user, never as service_role.
create function public.drive_access(target text,kind text,writing boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then false
 when kind='event-covers' then case when writing then app_private.can_write_cover(target) else app_private.can_read_cover(target) end
 when kind='event-photos' and writing then
  target ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and split_part(target,'/',2)=auth.uid()::text and app_private.storage_access(target,true)
 when kind='event-photos' then exists(select 1 from public.photos p where p.storage_path=target
  and p.storage_provider='google-drive' and app_private.can_access_event(p.event_id))
 else false end;
$$;
revoke all on function public.drive_access(text,text,boolean) from public,anon;
grant execute on function public.drive_access(text,text,boolean) to authenticated;
create or replace function public.gallery_page(event_token uuid, page_number integer default 1, only_favorites boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if page_number < 1 or page_number > 100000 then raise exception 'Página inválida'; end if;
  if not app_private.can_access_event(event_token) then raise exception 'Evento no disponible'; end if;
  with filtered as (
    select p.* from public.photos p where p.event_id = event_token
      and (not only_favorites or exists (select 1 from public.photo_favorites f where f.photo_id = p.id and f.user_id = auth.uid()))
  ), paged as (
    select * from filtered order by created_at desc, id desc limit 12 offset ((page_number - 1) * 12)
  )
  select jsonb_build_object('total', (select count(*) from filtered), 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'storage_provider', p.storage_provider, 'author', p.author,
      'like_count', (select count(*) from public.photo_likes l where l.photo_id = p.id),
      'liked', exists (select 1 from public.photo_likes l where l.photo_id = p.id and l.user_id = auth.uid()),
      'favorite', exists (select 1 from public.photo_favorites f where f.photo_id = p.id and f.user_id = auth.uid()))
      order by p.created_at desc, p.id desc) from paged p), '[]'::jsonb)) into result;
  return result;
end;
$$;


drop function public.download_page(uuid,uuid,timestamptz,boolean);
create function public.download_page(event_token uuid, after_id uuid default null, cutoff timestamptz default now(), only_favorites boolean default false)
returns table(id uuid, storage_path text, storage_provider text) language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app_private.can_access_event(event_token) then raise exception 'Evento no disponible'; end if;
  return query select p.id, p.storage_path, p.storage_provider from public.photos p
    where p.event_id = event_token and p.created_at <= cutoff
      and (after_id is null or p.id > after_id)
      and (not only_favorites or exists (select 1 from public.photo_favorites f where f.photo_id = p.id and f.user_id = auth.uid()))
    order by p.id limit 100;
end;
$$;
revoke all on function public.download_page(uuid, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.download_page(uuid, uuid, timestamptz, boolean) to authenticated;


commit;
