import {checkR2,putR2,deleteR2} from '@/lib/server/r2';
import {requireDriveOwner,requirePhotographer,r2Enabled,privateJSON,fail,driveEnabled,setting,serviceDB,StorageError} from '@/lib/server/storage-auth';
import {connection,accessToken,driveFetch} from '@/lib/server/google-drive';
export async function GET(request:Request){
 if(!request.headers.get('authorization'))return fail(new StorageError('Inicia sesión para consultar el almacenamiento.',401));
 try{
 if(r2Enabled()){await requirePhotographer(request);const registry=await serviceDB().from('r2_objects').select('path').limit(1);if(registry.error)throw new StorageError('Aplica la migración 009 en Supabase.',503);await checkR2();return privateJSON({provider:'r2',connected:true,bucket:setting('R2_BUCKET_NAME')});}
 if(!driveEnabled())return privateJSON({provider:'supabase',connected:false});
 await requireDriveOwner(request);
 const result=await serviceDB().from('drive_connections').select('owner_id').eq('owner_id',setting('GOOGLE_DRIVE_OWNER_ID')).maybeSingle();
 if(result.error)return privateJSON({provider:'google-drive',connected:false,error:'Aplica la migración 008 en Supabase.'});
 if(!result.data)return privateJSON({provider:'google-drive',connected:false});
 const config=await connection();const token=await accessToken(config);const about=await (await driveFetch(token,'about?fields=storageQuota,user(emailAddress)')).json();
 return privateJSON({provider:'google-drive',connected:true,email:config.account_email,quota:about.storageQuota});
}catch(error){return fail(error);}}

// Explicit write test, restricted to the photographer. Never creates a gallery photo.
export async function POST(request:Request){try{
 const {user}=await requirePhotographer(request);if(!r2Enabled())throw new StorageError('La prueba de escritura está disponible para R2.',400);
 const key=`_diagnostics/storage-check-${user.id}.jpg`;const bytes=new Uint8Array(2*1024*1024);bytes.set([255,216,255,224]);bytes.set([255,217],bytes.length-2);
 let uploaded=false;
 try{await putR2(key,new Blob([bytes],{type:'image/jpeg'}));uploaded=true;await deleteR2(key);}
 catch(error){if(!uploaded){try{await deleteR2(key);}catch{ /* The original write error is more useful. */ }}throw error;}
 return privateJSON({provider:'r2',connected:true,writeVerified:true});
}catch(error){return fail(error);}}
