import {randomUUID} from 'node:crypto';
import {requirePhotographer,serviceDB,privateJSON,fail,StorageError,uuidPattern} from '@/lib/server/storage-auth';
import {deletionManifest,removeStoredItem,type DeleteJob} from '@/lib/server/deletion';
export const maxDuration=60;
export async function GET(request:Request){request.headers.get('authorization');try{
 const {user}=await requirePhotographer(request);const jobs=await serviceDB().from('deletion_jobs').select('id,event_id,photo_id,title,cursor,last_error').eq('owner_id',user.id).order('created_at');if(jobs.error)throw new StorageError('Aplica la migración 010 para habilitar la eliminación completa.',503);
 const retired=await serviceDB().from('events').select('id,title').eq('owner_id',user.id).not('deleted_at','is',null).order('created_at');if(retired.error)throw new Error('database');
 const pendingEvents=new Set(jobs.data.filter(job=>!job.photo_id).map(job=>job.event_id));
 return privateJSON({jobs:jobs.data,retired:retired.data.filter(event=>!pendingEvents.has(event.id))});
}catch(error){return fail(error);}}
export async function POST(request:Request){let claimed:string|undefined;const lease=randomUUID();try{
 const {db,user}=await requirePhotographer(request);const body=await request.json();let jobId=body.jobId;
 if(!jobId){if(!uuidPattern.test(body.eventId||'')||(body.photoId&&!uuidPattern.test(body.photoId)))throw new StorageError('Evento o foto inválidos.');const started=await db.rpc('begin_deletion',{event_token:body.eventId,photo_token:body.photoId||null});if(started.error)throw new StorageError('No se pudo iniciar la eliminación. Comprueba que eres el propietario y que está aplicada la migración 010.',403);jobId=started.data;}
 if(!uuidPattern.test(jobId||''))throw new StorageError('Eliminación inválida.');
 const owner=await serviceDB().from('deletion_jobs').select('owner_id').eq('id',jobId).maybeSingle();if(owner.error)throw new Error('database');if(!owner.data)return privateJSON({jobId,done:true});if(owner.data.owner_id!==user.id)throw new StorageError('Esta eliminación pertenece a otro fotógrafo.',403);
 const result=await serviceDB().rpc('claim_deletion',{job_token:jobId,claim_token:lease});if(result.error)throw new Error('database');const job=result.data?.[0] as DeleteJob|undefined;
 if(!job)return privateJSON({jobId,done:false,waiting:true});claimed=jobId;
 const manifest=job.manifest||await deletionManifest(job);
 if(!job.manifest){const saved=await serviceDB().from('deletion_jobs').update({manifest,last_error:null}).eq('id',jobId).eq('lease_token',lease);if(saved.error)throw new Error('database');}
 let cursor=job.cursor;const began=Date.now();
 while(cursor<manifest.length&&cursor<job.cursor+8&&Date.now()-began<15000){
  await removeStoredItem(manifest[cursor]);cursor++;
  const saved=await serviceDB().from('deletion_jobs').update({cursor,last_error:null}).eq('id',jobId).eq('lease_token',lease);if(saved.error)throw new Error('database');
 }
 if(cursor===manifest.length){const finished=await serviceDB().rpc('finish_deletion',{job_token:jobId,claim_token:lease});if(finished.error){if(finished.error.code==='42P01'&&finished.error.message.includes('drive_objects'))throw new StorageError('Los archivos ya se procesaron, pero falta actualizar la limpieza de la base de datos. Aplica la migración 011 y continúa la limpieza.',503);throw new StorageError(`No se pudo finalizar la base de datos (${finished.error.code||'sin código'}). Se conserva el progreso para reintentar.`,503);}return privateJSON({jobId,done:true,removed:cursor,total:manifest.length});}
 const released=await serviceDB().from('deletion_jobs').update({lease_until:null,lease_token:null}).eq('id',jobId).eq('lease_token',lease);if(released.error)throw new Error('database');
 return privateJSON({jobId,done:false,removed:cursor,total:manifest.length});
}catch(error){
 const message=error instanceof StorageError?error.message:'No se pudo completar la limpieza. Puedes reintentar sin perder el progreso.';
 if(claimed)await serviceDB().from('deletion_jobs').update({last_error:message,lease_until:null,lease_token:null}).eq('id',claimed).eq('lease_token',lease);
 return fail(new StorageError(message,error instanceof StorageError?error.status:503));
}}
