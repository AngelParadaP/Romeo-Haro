import {requireDriveOwner,privateJSON,fail,driveEnabled,setting,serviceDB,StorageError} from '@/lib/server/storage-auth';
import {connection,accessToken,driveFetch} from '@/lib/server/google-drive';
export async function GET(request:Request){
 if(!request.headers.get('authorization'))return fail(new StorageError('Inicia sesión para consultar el almacenamiento.',401));
 try{
 if(!driveEnabled())return privateJSON({provider:'supabase',connected:false});
 await requireDriveOwner(request);
 const result=await serviceDB().from('drive_connections').select('owner_id').eq('owner_id',setting('GOOGLE_DRIVE_OWNER_ID')).maybeSingle();
 if(result.error)return privateJSON({provider:'google-drive',connected:false,error:'Aplica la migración 008 en Supabase.'});
 if(!result.data)return privateJSON({provider:'google-drive',connected:false});
 const config=await connection();const token=await accessToken(config);const about=await (await driveFetch(token,'about?fields=storageQuota,user(emailAddress)')).json();
 return privateJSON({provider:'google-drive',connected:true,email:config.account_email,quota:about.storageQuota});
}catch(error){return fail(error);}}
