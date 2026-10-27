-- Apply after 004. The existing events_edit policy still restricts changes
-- to the authorized photographer who owns the event.
begin;
alter table public.events add column invitation_text text not null
  default 'Te invitamos a compartir tus mejores recuerdos.'
  check (char_length(trim(invitation_text)) between 1 and 140);
grant update(invitation_text) on public.events to authenticated;
commit;
