-- Run after migrations 001 and 002. Existing events remain open without a schedule.
begin;
alter table public.events
  add column description text not null default 'Un día especial. Todas las miradas. Un mismo recuerdo.' check (char_length(description) <= 1500),
  add column cover_path text,
  add column cover_x integer not null default 50 check (cover_x between 0 and 100),
  add column cover_y integer not null default 50 check (cover_y between 0 and 100),
  add column cover_zoom numeric not null default 1 check (cover_zoom between 1 and 3),
  add column uploads_open_at timestamptz,
  add column uploads_close_at timestamptz,
  add constraint valid_upload_window check (uploads_open_at is null or uploads_close_at is null or uploads_close_at > uploads_open_at),
  add constraint cover_owner_path check (cover_path is null or cover_path ~ ('^' || owner_id::text || '/' || id::text || '/[0-9a-f-]{36}\.jpg$'));
grant update(description, cover_path, cover_x, cover_y, cover_zoom, uploads_open_at, uploads_close_at) on public.events to authenticated;

-- Enforced both by Storage INSERT and photo metadata INSERT, using server time.
create or replace function app_private.can_upload_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events where id = target and active and deleted_at is null
    and (uploads_open_at is null or now() >= uploads_open_at)
    and (uploads_close_at is null or now() < uploads_close_at))
    and app_private.can_access_event(target);
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', false, 3145728, array['image/jpeg']);
create function app_private.can_write_cover(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() and split_part(path, '/', 1) = auth.uid()::text
    and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and not exists (select 1 from public.events e where e.id::text = split_part(path, '/', 2)
      and (e.owner_id <> auth.uid() or e.deleted_at is not null));
$$;
create function app_private.can_read_cover(path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (public.is_admin() and split_part(path, '/', 1) = auth.uid()::text)
    or exists (select 1 from public.events e where e.cover_path = path and app_private.can_access_event(e.id));
$$;
revoke all on function app_private.can_write_cover(text), app_private.can_read_cover(text) from public, anon;
grant execute on function app_private.can_write_cover(text), app_private.can_read_cover(text) to authenticated;
create policy covers_read on storage.objects for select to authenticated
  using (bucket_id = 'event-covers' and app_private.can_read_cover(name));
create policy covers_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'event-covers' and app_private.can_write_cover(name));
create policy covers_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'event-covers' and public.is_admin() and split_part(name, '/', 1) = auth.uid()::text);

-- Establish the export boundary using the database clock, not the device clock.
create function public.download_snapshot(event_token uuid) returns timestamptz
language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app_private.can_access_event(event_token) then raise exception 'Evento no disponible'; end if;
  return now();
end;
$$;
revoke all on function public.download_snapshot(uuid) from public, anon;
grant execute on function public.download_snapshot(uuid) to authenticated;

-- Keyset pagination for complete downloads across all gallery pages.
create function public.download_page(event_token uuid, after_id uuid default null, cutoff timestamptz default now(), only_favorites boolean default false)
returns table(id uuid, storage_path text) language plpgsql stable security invoker set search_path = '' as $$
begin
  if not app_private.can_access_event(event_token) then raise exception 'Evento no disponible'; end if;
  return query select p.id, p.storage_path from public.photos p
    where p.event_id = event_token and p.created_at <= cutoff
      and (after_id is null or p.id > after_id)
      and (not only_favorites or exists (select 1 from public.photo_favorites f where f.photo_id = p.id and f.user_id = auth.uid()))
    order by p.id limit 100;
end;
$$;
revoke all on function public.download_page(uuid, uuid, timestamptz, boolean) from public, anon;
grant execute on function public.download_page(uuid, uuid, timestamptz, boolean) to authenticated;

-- Supabase supplies this publication. Embedded test databases do not.
do $$
declare table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['photos', 'events'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
commit;
