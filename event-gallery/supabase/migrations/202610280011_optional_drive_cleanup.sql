-- Drive is a legacy provider: R2/Supabase cleanup must work without its table.
-- Keep completion atomic; never discard unconfirmed Drive references if present.
begin;
create or replace function public.finish_deletion(job_token uuid,claim_token uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.deletion_jobs;
begin
 select * into j from public.deletion_jobs where id=job_token and lease_token=claim_token for update;
 if not found then raise exception 'La limpieza no está disponible'; end if;
 if j.manifest is null or j.cursor<jsonb_array_length(j.manifest) then raise exception 'Falta eliminar archivos'; end if;
 if to_regclass('public.drive_objects') is not null then
  declare unconfirmed boolean;
  begin
   execute 'select exists(select 1 from public.drive_objects d where d.event_id=$1 and ($2::uuid is null or (d.bucket=''event-photos'' and d.path in(select storage_path from public.photos where id=$2))) and not exists(select 1 from jsonb_array_elements($3) item where item->>''provider''=''google-drive'' and item->>''key''=d.drive_file_id))'
    into unconfirmed using j.event_id,j.photo_id,j.manifest;
   if unconfirmed then raise exception 'Faltan archivos de Drive por confirmar; conserva sus referencias y revisa el acceso a Drive'; end if;
  end;
 end if;
 if j.photo_id is null then
  delete from public.r2_objects where event_id=j.event_id;
  if to_regclass('public.drive_objects') is not null then
   execute 'delete from public.drive_objects where event_id=$1' using j.event_id;
  end if;
  delete from public.storage_upload_leases where event_id=j.event_id;
  delete from public.events where id=j.event_id and owner_id=j.owner_id;
  delete from public.deletion_jobs where event_id=j.event_id;
 else
  delete from public.r2_objects where bucket='event-photos' and path in(select storage_path from public.photos where id=j.photo_id);
  if to_regclass('public.drive_objects') is not null then
   execute 'delete from public.drive_objects where bucket=''event-photos'' and path in(select storage_path from public.photos where id=$1)' using j.photo_id;
  end if;
  delete from public.photos where id=j.photo_id and event_id=j.event_id;
  delete from public.deletion_jobs where id=j.id;
 end if;
end;
$$;
revoke all on function public.finish_deletion(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finish_deletion(uuid,uuid) to service_role;
commit;
