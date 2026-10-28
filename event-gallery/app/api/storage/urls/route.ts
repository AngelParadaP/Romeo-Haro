import {authenticated,allowed,privateJSON,fail,StorageError} from '@/lib/server/storage-auth';
export async function POST(request:Request){try{
 const {db,token}=await authenticated(request);const {bucket,paths}=await request.json();
 if(!['event-photos','event-covers'].includes(bucket)||!Array.isArray(paths)||paths.length>100||paths.some(p=>typeof p!=='string'||p.length>180))throw new StorageError('Lista de archivos inválida.');
 await Promise.all(paths.map(path=>allowed(db,path,bucket)));
 return privateJSON({urls:paths.map(path=>`/api/storage/file?${new URLSearchParams({bucket,path})}`)},token);
}catch(error){return fail(error);}}
