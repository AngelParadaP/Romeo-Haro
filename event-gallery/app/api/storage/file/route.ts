import {readR2URL,deleteR2} from '@/lib/server/r2';
import {authenticated,allowedStorage,fail,serviceDB,StorageError,requireDriveOwner,requirePhotographer} from '@/lib/server/storage-auth';
import {connection,accessToken,driveFetch,trash} from '@/lib/server/google-drive';
export const maxDuration=60;
export async function GET(request:Request){const url=new URL(request.url);try{
 const {db}=await authenticated(request);const bucket=url.searchParams.get('bucket')||'';const path=url.searchParams.get('path')||'';
 const provider=url.searchParams.get('provider')||'google-drive';if(path.length>180||!['r2','google-drive'].includes(provider))throw new StorageError('Archivo inválido.');await allowedStorage(db,path,bucket,provider);
 if(provider==='r2'){const object=await serviceDB().from('r2_objects').select('object_key').eq('bucket',bucket).eq('path',path).single();if(object.error||!object.data)throw new StorageError('Foto no encontrada.',404);return new Response(null,{status:302,headers:{Location:await readR2URL(object.data.object_key),'Cache-Control':'private, no-store'}});}
 const record=await serviceDB().from('drive_objects').select('drive_file_id').eq('bucket',bucket).eq('path',path).single();if(record.error||!record.data)throw new StorageError('Fotografía no encontrada.',404);
 const config=await connection();const token=await accessToken(config);const image=await driveFetch(token,`files/${encodeURIComponent(record.data.drive_file_id)}?alt=media`);
 return new Response(image.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline'}});
}catch(error){return fail(error);}}
export async function DELETE(request:Request){try{
 const {path,provider='google-drive'}=await request.json();if(!['r2','google-drive'].includes(provider))throw new StorageError('Proveedor inválido.');
 const {user}=provider==='r2'?await requirePhotographer(request):await requireDriveOwner(request);if(typeof path!=='string'||!path.startsWith(`${user.id}/`)||path.length>180)throw new StorageError('Portada inválida.',403);
 const linked=await serviceDB().from('events').select('id').eq('cover_path',path).limit(1);if(linked.error||linked.data?.length)throw new StorageError('Esta portada sigue vinculada a un evento.',409);
 const table=provider==='r2'?'r2_objects':'drive_objects';
 const object=await serviceDB().from(table).select(provider==='r2'?'object_key':'drive_file_id').eq('bucket','event-covers').eq('path',path).eq('uploader_id',user.id).single();if(object.error||!object.data)throw new StorageError('Portada no encontrada.',404);
 if(provider==='r2')await deleteR2((object.data as unknown as {object_key:string}).object_key);else{const config=await connection();const token=await accessToken(config);await trash(token,(object.data as unknown as {drive_file_id:string}).drive_file_id);}
 const removed=await serviceDB().from(table).delete().eq('bucket','event-covers').eq('path',path);if(removed.error)throw new Error('registry');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(error){return fail(error);}}
