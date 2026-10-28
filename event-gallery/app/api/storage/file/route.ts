import {authenticated,allowed,fail,serviceDB,StorageError,requireDriveOwner} from '@/lib/server/storage-auth';
import {connection,accessToken,driveFetch,trash} from '@/lib/server/google-drive';
export const maxDuration=60;
export async function GET(request:Request){const url=new URL(request.url);try{
 const {db}=await authenticated(request);const bucket=url.searchParams.get('bucket')||'';const path=url.searchParams.get('path')||'';
 if(path.length>180)throw new StorageError('Archivo inválido.');await allowed(db,path,bucket);
 const record=await serviceDB().from('drive_objects').select('drive_file_id').eq('bucket',bucket).eq('path',path).single();if(record.error||!record.data)throw new StorageError('Fotografía no encontrada.',404);
 const config=await connection();const token=await accessToken(config);const image=await driveFetch(token,`files/${encodeURIComponent(record.data.drive_file_id)}?alt=media`);
 return new Response(image.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline'}});
}catch(error){return fail(error);}}
export async function DELETE(request:Request){try{
 const {user}=await requireDriveOwner(request);const {path}=await request.json();if(typeof path!=='string'||!path.startsWith(`${user.id}/`)||path.length>180)throw new StorageError('Portada inválida.',403);
 const linked=await serviceDB().from('events').select('id').eq('cover_path',path).limit(1);if(linked.error||linked.data?.length)throw new StorageError('Esta portada sigue vinculada a un evento.',409);
 const object=await serviceDB().from('drive_objects').select('drive_file_id').eq('bucket','event-covers').eq('path',path).eq('uploader_id',user.id).single();if(object.error||!object.data)throw new StorageError('Portada no encontrada.',404);
 const config=await connection();const token=await accessToken(config);await trash(token,object.data.drive_file_id);
 const removed=await serviceDB().from('drive_objects').delete().eq('bucket','event-covers').eq('path',path);if(removed.error)throw new Error('registry');
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}catch(error){return fail(error);}}
