-- Run once in the SQL Editor of a new Supabase project.
begin;
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null check (char_length(trim(title)) between 1 and 100),
  date date not null,
  category text not null check (category in ('Boda', 'Cumpleaños', 'Celebración', 'Encuentro')),
  cover text not null check (char_length(cover) <= 2048 and cover ~ '^https://'),
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.event_guests (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create table public.photos (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  author text not null check (char_length(trim(author)) between 1 and 60),
  storage_path text not null unique,
  created_at timestamptz not null default now(),
  check (storage_path = event_id::text || '/' || author_id::text || '/' || id::text || '.jpg')
);
create table public.photo_likes (
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (photo_id, user_id)
);
create table public.photo_favorites (
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (photo_id, user_id)
);
create index events_owner on public.events(owner_id, created_at desc);
create index photos_event_page on public.photos(event_id, created_at desc, id desc);
create index guests_user on public.event_guests(user_id, event_id);
create index favorites_user on public.photo_favorites(user_id, photo_id);

alter table public.admin_users enable row level security;
alter table public.events enable row level security;
alter table public.event_guests enable row level security;
alter table public.photos enable row level security;
alter table public.photo_likes enable row level security;
alter table public.photo_favorites enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
create function app_private.owns_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = target and owner_id = auth.uid()
    and deleted_at is null) and public.is_admin();
$$;
create function app_private.can_access_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = target and e.deleted_at is null
    and ((e.owner_id = auth.uid() and public.is_admin()) or
      (e.active and exists (select 1 from public.event_guests g where g.event_id = e.id and g.user_id = auth.uid()))));
$$;
create function app_private.can_upload_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = target and active and deleted_at is null)
    and app_private.can_access_event(target);
$$;
create function app_private.can_access_photo(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photos where id = target and app_private.can_access_event(event_id));
$$;
-- Possession of the unguessable event UUID grants membership, never admin access.
-- Do not expose an event index to guests. Links can be forwarded: this is not password protection.
create function public.join_event(event_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia una sesión de invitado'; end if;
  if not exists (select 1 from public.events where id = event_token and active and deleted_at is null)
    then raise exception 'Este evento no está disponible'; end if;
  insert into public.event_guests(event_id, user_id) values (event_token, auth.uid()) on conflict do nothing;
end;
$$;

create policy events_read on public.events for select to authenticated
  using (app_private.can_access_event(id));
create policy events_create on public.events for insert to authenticated
  with check (public.is_admin() and owner_id = auth.uid() and deleted_at is null);
create policy events_edit on public.events for update to authenticated
  using (app_private.owns_event(id)) with check (public.is_admin() and owner_id = auth.uid());
create policy guests_read_self on public.event_guests for select to authenticated
  using (user_id = auth.uid());
create policy photos_read on public.photos for select to authenticated
  using (app_private.can_access_event(event_id));

-- Only associate a photo with an object already uploaded into its exact path.
create function app_private.object_exists(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects where bucket_id = 'event-photos' and name = path);
$$;
create policy photos_create on public.photos for insert to authenticated
  with check (author_id = auth.uid() and app_private.can_upload_event(event_id)
    and app_private.object_exists(storage_path));
create policy likes_read on public.photo_likes for select to authenticated
  using (app_private.can_access_photo(photo_id));
create policy likes_create on public.photo_likes for insert to authenticated
  with check (user_id = auth.uid() and app_private.can_access_photo(photo_id));
create policy likes_remove on public.photo_likes for delete to authenticated
  using (user_id = auth.uid() and app_private.can_access_photo(photo_id));
create policy favorites_read on public.photo_favorites for select to authenticated
  using (user_id = auth.uid() and app_private.can_access_photo(photo_id));
create policy favorites_create on public.photo_favorites for insert to authenticated
  with check (user_id = auth.uid() and app_private.can_access_photo(photo_id));
create policy favorites_remove on public.photo_favorites for delete to authenticated
  using (user_id = auth.uid() and app_private.can_access_photo(photo_id));

-- Read one page on the server; private favorites are never returned for other users.
create function public.gallery_page(event_token uuid, page_number integer default 1, only_favorites boolean default false)
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
    select jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'author', p.author,
      'like_count', (select count(*) from public.photo_likes l where l.photo_id = p.id),
      'liked', exists (select 1 from public.photo_likes l where l.photo_id = p.id and l.user_id = auth.uid()),
      'favorite', exists (select 1 from public.photo_favorites f where f.photo_id = p.id and f.user_id = auth.uid()))
      order by p.created_at desc, p.id desc) from paged p), '[]'::jsonb)) into result;
  return result;
end;
$$;

-- Storage permissions use the same membership rules. No public bucket or service-role key.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-photos', 'event-photos', false, 3145728, array['image/jpeg']);
create function app_private.storage_access(path text, uploading boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id::text = split_part(path, '/', 1)
    and case when uploading then app_private.can_upload_event(e.id) else app_private.can_access_event(e.id) end);
$$;
create policy event_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'event-photos' and app_private.storage_access(name));
create policy event_objects_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'event-photos' and app_private.storage_access(name, true)
    and split_part(name, '/', 2) = auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
-- Only unlinked uploads can be removed by their uploader (failed insert cleanup).
create function app_private.object_linked(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.photos where storage_path = path);
$$;
create policy event_objects_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'event-photos' and split_part(name, '/', 2) = auth.uid()::text
    and not app_private.object_linked(name));

revoke all on public.admin_users, public.events, public.event_guests, public.photos,
  public.photo_likes, public.photo_favorites from anon, authenticated;
grant select, insert on public.events to authenticated;
grant update(title, date, category, cover, active, deleted_at) on public.events to authenticated;
grant select on public.event_guests to authenticated;
grant select, insert on public.photos to authenticated;
grant select, insert, delete on public.photo_likes, public.photo_favorites to authenticated;
revoke all on function public.is_admin(), public.join_event(uuid), public.gallery_page(uuid, integer, boolean) from public, anon;
grant execute on function public.is_admin(), public.join_event(uuid), public.gallery_page(uuid, integer, boolean) to authenticated;
revoke all on all functions in schema app_private from public, anon;
grant execute on all functions in schema app_private to authenticated;
commit;
