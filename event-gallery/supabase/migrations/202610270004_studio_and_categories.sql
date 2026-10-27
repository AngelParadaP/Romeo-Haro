begin;
alter table public.events drop constraint events_category_check;
alter table public.events add constraint events_category_check
  check (category in ('Boda','Cumpleaños','Celebración','Encuentro','Quinceañera','Otros'));

create table public.studio_profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Romeo Haro' check (char_length(trim(name)) between 1 and 100),
  email text not null default '' check (char_length(email) <= 254 and (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^\+?[0-9]{8,15}$'),
  address text not null default '' check (char_length(address) <= 500)
);
alter table public.studio_profiles enable row level security;
revoke all on public.studio_profiles from anon, authenticated;
grant select, insert on public.studio_profiles to authenticated;
grant update(name,email,whatsapp,address) on public.studio_profiles to authenticated;
create policy studio_read on public.studio_profiles for select to authenticated
  using (owner_id = auth.uid() and public.is_admin());
create policy studio_insert on public.studio_profiles for insert to authenticated
  with check (owner_id = auth.uid() and public.is_admin());
create policy studio_edit on public.studio_profiles for update to authenticated
  using (owner_id = auth.uid() and public.is_admin()) with check (owner_id = auth.uid() and public.is_admin());

-- Guests only receive contact details of the photographer of their own event.
create function public.event_contact(event_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not app_private.can_access_event(event_token) then raise exception 'Evento no disponible'; end if;
  select jsonb_build_object('name',s.name,'email',s.email,'whatsapp',s.whatsapp,'address',s.address)
  into result from public.studio_profiles s join public.events e on e.owner_id=s.owner_id where e.id=event_token;
  return result;
end;
$$;
revoke all on function public.event_contact(uuid) from public, anon;
grant execute on function public.event_contact(uuid) to authenticated;
commit;
