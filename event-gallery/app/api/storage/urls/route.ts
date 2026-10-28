import {authenticated,allowedStorage,privateJSON,fail,StorageError,serviceDB} from '@/lib/server/storage-auth';
import {readR2URL} from '@/lib/server/r2';
export async function POST(request:Request){try{
 const {db,token}=await authenticated(request);const {bucket,paths,provider='google-drive'}=await request.json();
 if(!['r2','google-drive'].includes(provider)||!['event-photos','event-covers'].includes(bucket)||!Array.isArray(paths)||paths.length>100||paths.some(p=>typeof p!=='string'||p.length>180))throw new StorageError('Lista de archivos inválida.');
 await Promise.all(paths.map(path=>allowedStorage(db,path,bucket,provider)));
 if(provider==='r2'){
  const urls=await Promise.all(paths.map(async path=>{const object=await serviceDB().from('r2_objects').select('object_key').eq('bucket',bucket).eq('path',path).single();if(object.error||!object.data)throw new StorageError('Archivo de R2 no encontrado.',404);return readR2URL(object.data.object_key);}));
  return privateJSON({urls});
 }
 return privateJSON({urls:paths.map(path=>`/api/storage/file?${new URLSearchParams({bucket,path})}`)},token);
}catch(error){return fail(error);}}
