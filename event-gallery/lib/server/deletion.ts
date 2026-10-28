import 'server-only';
import {serviceDB,StorageError,setting} from './storage-auth';
import {deleteR2,listR2} from './r2';
import {deleteDriveFile,driveEventFolders} from './google-drive';
export type DeleteItem={provider:'supabase'|'r2'|'google-drive';bucket:string;path:string;key?:string};
export type DeleteJob={id:string;owner_id:string;event_id:string;photo_id:string|null;title:string;manifest:DeleteItem[]|null;cursor:number;last_error:string|null};
async function records(table:string,eventId:string){const all:Record<string,string>[]=[];for(let offset=0;;offset+=500){const result=await serviceDB().from(table).select('*').eq('event_id',eventId).order(table==='photos'?'id':'path').range(offset,offset+499);if(result.error){if(table==='drive_objects'&&['PGRST205','42P01'].includes(result.error.code))return all;throw new StorageError(`No se pudieron enumerar los registros de ${table} (${result.error.code||'sin código'}). La limpieza queda pendiente.`,503);}all.push(...result.data);if(result.data.length<500)return all;}}
async function supabaseFiles(bucket:string,prefix:string):Promise<string[]>{const files:string[]=[];for(let offset=0;;offset+=100){const result=await serviceDB().storage.from(bucket).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(result.error)throw new StorageError('No se pudieron enumerar los archivos de Supabase. La limpieza queda pendiente.',503);for(const entry of result.data){const path=`${prefix}/${entry.name}`;if(entry.id)files.push(path);else files.push(...await supabaseFiles(bucket,path));}if(result.data.length<100)return files;}}
export async function deletionManifest(job:DeleteJob):Promise<DeleteItem[]>{
 const admin=serviceDB();const items:DeleteItem[]=[];
 if(job.photo_id){
  const result=await admin.from('photos').select('storage_path,storage_provider').eq('id',job.photo_id).eq('event_id',job.event_id).maybeSingle();if(result.error)throw new StorageError('No se pudo localizar la fotografía.',503);
  if(result.data){const row=result.data;const provider=row.storage_provider as DeleteItem['provider'];let key:string|undefined;
   if(provider!=='supabase'){const record=await admin.from(provider==='r2'?'r2_objects':'drive_objects').select('*').eq('bucket','event-photos').eq('path',row.storage_path).maybeSingle();if(record.error||!record.data)throw new StorageError('Falta el registro del archivo. La eliminación requiere revisión.',503);key=provider==='r2'?record.data.object_key:record.data.drive_file_id;}
   items.push({provider,bucket:'event-photos',path:row.storage_path,key});
  }
 }else{
  const event=await admin.from('events').select('cover_path,cover_provider').eq('id',job.event_id).eq('owner_id',job.owner_id).single();if(event.error)throw new StorageError('No se pudo comprobar el evento para limpiar sus archivos.',503);
  for(const [table,provider] of [['r2_objects','r2'],['drive_objects','google-drive']] as const){for(const row of await records(table,job.event_id))items.push({provider,bucket:row.bucket,path:row.path,key:provider==='r2'?row.object_key:row.drive_file_id});}
  const leases=await admin.from('storage_upload_leases').select('*').eq('event_id',job.event_id);if(leases.error)throw new StorageError('No se pudieron revisar las subidas pendientes.',503);
  for(const lease of leases.data){if(lease.external_key)items.push({provider:lease.provider,bucket:lease.bucket,path:lease.path,key:lease.external_key});}
  for(const row of await records('photos',job.event_id)){
   const provider=row.storage_provider as DeleteItem['provider'];
   if(provider==='supabase')items.push({provider,bucket:'event-photos',path:row.storage_path});
   else if(provider==='r2')items.push({provider,bucket:'event-photos',path:row.storage_path,key:`event-photos/${row.storage_path}`});
   else if(!items.some(item=>item.provider==='google-drive'&&item.bucket==='event-photos'&&item.path===row.storage_path))throw new StorageError('Falta el identificador de una foto antigua de Drive. La limpieza requiere revisión.',503);
  }
  if(event.data.cover_path&&event.data.cover_provider==='r2')items.push({provider:'r2',bucket:'event-covers',path:event.data.cover_path,key:`event-covers/${event.data.cover_path}`});
  if(event.data.cover_path&&event.data.cover_provider==='google-drive'&&!items.some(item=>item.provider==='google-drive'&&item.bucket==='event-covers'&&item.path===event.data.cover_path))throw new StorageError('Falta el identificador de la portada antigua de Drive. La limpieza requiere revisión.',503);
  // Enumerate physical prefixes too, including superseded covers and unlinked uploads.
  for(const [bucket,prefix] of [['event-photos',job.event_id],['event-covers',`${job.owner_id}/${job.event_id}`]]){
   for(const path of await supabaseFiles(bucket,prefix))items.push({provider:'supabase',bucket,path});
   if(process.env.R2_ACCOUNT_ID&&process.env.R2_ACCESS_KEY_ID&&process.env.R2_SECRET_ACCESS_KEY&&process.env.R2_BUCKET_NAME){for(const key of await listR2(`${bucket}/${prefix}/`))items.push({provider:'r2',bucket,path:key.slice(bucket.length+1),key});}
  }
  // The current cover must be represented even if its registry/prefix is incomplete.
  if(event.data.cover_path&&event.data.cover_provider==='supabase')items.push({provider:'supabase',bucket:'event-covers',path:event.data.cover_path});
  if(items.some(item=>item.provider==='google-drive')||leases.data.some(lease=>lease.provider==='google-drive')){
   if(job.owner_id!==setting('GOOGLE_DRIVE_OWNER_ID'))throw new StorageError('La cuenta antigua de Drive debe reconectarse para terminar la limpieza.',503);
   for(const id of await driveEventFolders(job.event_id))items.push({provider:'google-drive',bucket:'event-folder',path:id,key:id});
  }
 }
 const unique=new Map<string,DeleteItem>();for(const item of items)unique.set(`${item.provider}/${item.bucket}/${item.key||item.path}`,item);return [...unique.values()];
}
export async function removeStoredItem(item:DeleteItem){
 if(item.provider==='r2'){if(!item.key)throw new StorageError('Archivo de R2 sin identificar.',503);await deleteR2(item.key);}
 else if(item.provider==='google-drive'){if(!item.key)throw new StorageError('Archivo de Drive sin identificar.',503);await deleteDriveFile(item.key);}
 else{const result=await serviceDB().storage.from(item.bucket).remove([item.path]);if(result.error)throw new StorageError('No se pudo borrar un archivo de Supabase. La eliminación queda pendiente.',503);}
}
