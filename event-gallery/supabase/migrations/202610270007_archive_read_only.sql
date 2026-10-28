begin;
alter table public.events add column archived_at timestamptz;
-- Manual archives had no recorded timestamp: their 30-day window starts now.
-- Automatic archives use the original deadline, never the delayed Cron run.
update public.events set archived_at=case
  when archive_after_close and uploads_close_at<=now() then uploads_close_at
  else now() end where not active;

create function app_private.stamp_event_archive() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.active then new.archived_at=null;
  elsif tg_op='INSERT' then new.archived_at=now();
  elsif old.active then
    new.archived_at=case when new.archive_after_close and new.uploads_close_at<=now()
      then new.uploads_close_at else now() end;
  else new.archived_at=old.archived_at;
  end if;
  return new;
end;
$$;
revoke all on function app_private.stamp_event_archive() from public,anon,authenticated;
create trigger stamp_event_archive before insert or update on public.events
for each row execute function app_private.stamp_event_archive();

-- Pure helpers also handle the interval before Cron persists active=false.
create function app_private.event_archive_time(e public.events) returns timestamptz
language sql stable set search_path='' as $$
  select case when not e.active then e.archived_at
    when e.archive_after_close and e.uploads_close_at<=now() then e.uploads_close_at
    else null end;
$$;
create function app_private.event_guest_readable(e public.events) returns boolean
language sql stable set search_path='' as $$
  select e.deleted_at is null and
    (case when app_private.event_archive_time(e) is null then e.active
      else now()<app_private.event_archive_time(e)+interval '720 hours' end);
$$;
revoke all on function app_private.event_archive_time(public.events),
  app_private.event_guest_readable(public.events) from public,anon,authenticated;

create or replace function app_private.can_access_event(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target and e.deleted_at is null
    and ((e.owner_id=auth.uid() and public.is_admin()) or
      (app_private.event_guest_readable(e) and exists
        (select 1 from public.event_guests g where g.event_id=e.id and g.user_id=auth.uid()))));
$$;
create or replace function public.join_event(event_token uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Inicia una sesión de invitado'; end if;
  if not exists(select 1 from public.events e where e.id=event_token and app_private.event_guest_readable(e))
    then raise exception 'Este evento no está disponible. Su plazo de consulta puede haber finalizado.'; end if;
  insert into public.event_guests(event_id,user_id) values(event_token,auth.uid()) on conflict do nothing;
end;
$$;

create function app_private.can_react_photo(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.photos p join public.events e on e.id=p.event_id
    where p.id=target and app_private.can_access_event(e.id)
      and ((e.owner_id=auth.uid() and public.is_admin())
        or (e.active and app_private.event_archive_time(e) is null)));
$$;
revoke all on function app_private.can_react_photo(uuid) from public,anon;
grant execute on function app_private.can_react_photo(uuid) to authenticated;
alter policy likes_create on public.photo_likes with check(user_id=auth.uid() and app_private.can_react_photo(photo_id));
alter policy likes_remove on public.photo_likes using(user_id=auth.uid() and app_private.can_react_photo(photo_id));
alter policy favorites_create on public.photo_favorites with check(user_id=auth.uid() and app_private.can_react_photo(photo_id));
alter policy favorites_remove on public.photo_favorites using(user_id=auth.uid() and app_private.can_react_photo(photo_id));
commit;
