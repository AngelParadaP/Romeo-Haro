-- Apply after 202610270001_initial.sql, including on existing projects.
-- INSERT ... RETURNING also evaluates the SELECT policy. A STABLE helper
-- querying events cannot see the new row in the current statement snapshot.
-- Authorize the photographer from the row itself; keep guest access unchanged.
begin;
alter policy events_read on public.events
using (
  (owner_id = (select auth.uid()) and deleted_at is null and (select public.is_admin()))
  or app_private.can_access_event(id)
);
commit;
