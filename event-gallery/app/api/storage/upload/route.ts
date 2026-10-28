import {randomUUID} from 'node:crypto';
import {authenticated,allowedStorage,driveEnabled,r2Enabled,fail,privateJSON,serviceDB,setting,StorageError,uuidPattern} from '@/lib/server/storage-auth';
import {putR2,deleteR2} from '@/lib/server/r2';
import {connection,accessToken,eventFolder,uploadJPEG,trash} from '@/lib/server/google-drive';
export const maxDuration=60;
export async function POST(request:Request){let uploaded:string|undefined;let token:string|undefined;let path:string|undefined;let bucket:string|undefined;let registered=false;let uncertainPublication=false;const provider=r2Enabled()?'r2':'google-drive';let uploadLease:string|undefined;let safeToRelease=false;const registryTable=provider==='r2'?'r2_objects':'drive_objects';
 try{
  if(!driveEnabled()&&!r2Enabled())throw new StorageError('El almacenamiento externo no está activado.',503);
  const {db,user}=await authenticated(request);const url=new URL(request.url);bucket=url.searchParams.get('bucket')||'';const eventId=url.searchParams.get('eventId')||'';
  if(!uuidPattern.test(eventId)||!['event-photos','event-covers'].includes(bucket))throw new StorageError('Destino de subida inválido.');
  const id=randomUUID();path=bucket==='event-photos'?`${eventId}/${user.id}/${id}.jpg`:`${user.id}/${eventId}/${id}.jpg`;
  await allowedStorage(db,path,bucket,provider,true);
  if(provider==='google-drive'){
  const ownerId=setting('GOOGLE_DRIVE_OWNER_ID');
  if(bucket==='event-covers'&&user.id!==ownerId)throw new StorageError('Este Drive pertenece a otro fotógrafo.',403);
  if(bucket==='event-photos'){const event=await db.from('events').select('owner_id').eq('id',eventId).single();if(event.error||event.data?.owner_id!==ownerId)throw new StorageError('El evento no usa esta cuenta de Drive.',403);}
  }
  let author='';try{author=decodeURIComponent(request.headers.get('x-photo-author')||'');}catch{throw new StorageError('Nombre inválido.');}
  author=author.trim();if(bucket==='event-photos'&&(!author||author.length>60))throw new StorageError('Escribe tu nombre (hasta 60 caracteres).');
  if(request.headers.get('content-type')?.split(';')[0]!=='image/jpeg')throw new StorageError('Solo se aceptan fotografías JPG optimizadas.');
  const max=3*1024*1024;if(Number(request.headers.get('content-length'))>max)throw new StorageError('La imagen supera 3 MB.',413);
  const reader=request.body?.getReader();if(!reader)throw new StorageError('Falta la fotografía.');let size=0;const chunks:Uint8Array[]=[];
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max){await reader.cancel();throw new StorageError('La imagen supera 3 MB.',413);}chunks.push(next.value);}
  const bytes=Buffer.concat(chunks);if(bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||bytes.at(-2)!==255||bytes.at(-1)!==217)throw new StorageError('La imagen JPG no es válida.');
  const admission=await db.rpc('begin_upload_lease',{lease_token:id,event_token:eventId,target:path,kind:bucket,provider});if(admission.error)throw new StorageError('No se pudo autorizar la subida. Comprueba la migración 010 y el horario del evento.',409);uploadLease=id;
  if(provider==='r2'){uploaded=`${bucket}/${path}`;await putR2(uploaded,new Blob([bytes],{type:'image/jpeg'}));}
  else{const config=await connection();token=await accessToken(config);const parent=await eventFolder(token,config.root_folder_id,eventId);uploaded=await uploadJPEG(token,parent,`${bucket==='event-covers'?'portada':'foto'}-${id}.jpg`,new Blob([bytes],{type:'image/jpeg'}));}
  const tracked=await serviceDB().from('storage_upload_leases').update({external_key:uploaded}).eq('id',uploadLease);if(tracked.error)throw new Error('upload-lease');
  // Recheck the database clock after a slow upload. Never publish after closure.
  await allowedStorage(db,path,bucket,provider,true);
  const registry=await serviceDB().from(registryTable).insert({bucket,path,...(provider==='r2'?{object_key:uploaded}:{drive_file_id:uploaded}),event_id:eventId,uploader_id:user.id,size_bytes:bytes.length});if(registry.error)throw new Error('registry');registered=true;safeToRelease=true;
  if(bucket==='event-photos'){
   const inserted=await db.from('photos').insert({id,event_id:eventId,author_id:user.id,author,storage_path:path,storage_provider:provider});if(inserted.error){
    // A lost HTTP response does not prove the INSERT was rolled back.
    const confirmed=await serviceDB().from('photos').select('id').eq('id',id).maybeSingle();
    if(confirmed.error){uncertainPublication=true;throw new StorageError('No pudimos confirmar la publicación. Actualiza la galería antes de volver a subir esta foto.',503);}
    if(!confirmed.data)throw new StorageError('El evento cerró o no se pudo registrar la foto. Inténtalo de nuevo.',409);
   }
  }
  return privateJSON({id,path,provider});
 }catch(error){
  // Only files created by this request are eligible for failure cleanup.
  if(uploaded&&!uncertainPublication&&(provider==='r2'||token)){try{if(provider==='r2')await deleteR2(uploaded);else await trash(token!,uploaded);safeToRelease=true;if(registered&&path&&bucket)await serviceDB().from(registryTable).delete().eq('path',path).eq('bucket',bucket);}catch{/* Leave the registry for administrative recovery if cleanup fails. */}}
  return fail(error);
 }finally{if(uploadLease&&safeToRelease){try{await serviceDB().from('storage_upload_leases').delete().eq('id',uploadLease);}catch{ /* Expired leases are included in event cleanup. */ }}}
}
