-- Existing events keep their current access rules until the photographer opts in.
begin;
alter table public.events add column archive_after_close boolean not null default false;
alter table public.events add constraint archive_requires_deadline check (not archive_after_close or uploads_close_at is not null);
grant update(archive_after_close) on public.events to authenticated;
create index events_pending_archive on public.events(uploads_close_at)
  where archive_after_close and active and deleted_at is null;

-- Guest access expires at the deadline even between scheduled job executions.
create or replace function app_private.can_access_event(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = target and e.deleted_at is null
    and ((e.owner_id = auth.uid() and public.is_admin()) or
      (e.active and (not e.archive_after_close or e.uploads_close_at > now())
        and exists (select 1 from public.event_guests g where g.event_id=e.id and g.user_id=auth.uid()))));
$$;
create or replace function public.join_event(event_token uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Inicia una sesión de invitado'; end if;
  if not exists (select 1 from public.events where id=event_token and active and deleted_at is null
    and (not archive_after_close or uploads_close_at > now()))
    then raise exception 'Este evento no está disponible'; end if;
  insert into public.event_guests(event_id,user_id) values(event_token,auth.uid()) on conflict do nothing;
end;
$$;

-- Only a database administrator / Cron can execute the global archive worker.
create function app_private.archive_expired_events() returns bigint
language plpgsql security definer set search_path = '' as $$
declare affected bigint;
begin
  update public.events set active=false
    where archive_after_close and active and deleted_at is null and uploads_close_at<=now();
  get diagnostics affected=row_count;
  return affected;
end;
$$;
revoke all on function app_private.archive_expired_events() from public,anon,authenticated;

-- Supabase provides pg_cron. Embedded test databases may not include it.
do $install$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $schedule$select cron.schedule('romeo-archive-expired-events','* * * * *','select app_private.archive_expired_events()')$schedule$;
  else
    raise notice 'pg_cron no está disponible. El acceso caduca por RLS; instala Cron y programa archive_expired_events para persistir el archivo automático.';
  end if;
end;
$install$;
commit;
