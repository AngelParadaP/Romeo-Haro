import 'server-only';
import {AwsClient} from 'aws4fetch';
import {setting,StorageError} from './storage-auth';
function client(){
 const accessKeyId=setting('R2_ACCESS_KEY_ID');const secretAccessKey=setting('R2_SECRET_ACCESS_KEY');
 if(!/^[a-f0-9]{32}$/i.test(accessKeyId))throw new StorageError('R2_ACCESS_KEY_ID no tiene el formato esperado. Copia el Access Key ID de las credenciales S3 de R2, no el token general de Cloudflare.',503);
 if(!/^[a-f0-9]{64}$/i.test(secretAccessKey))throw new StorageError('R2_SECRET_ACCESS_KEY no tiene el formato esperado. Copia el Secret Access Key del mismo par de credenciales S3 de R2.',503);
 return new AwsClient({accessKeyId,secretAccessKey,service:'s3',region:'auto'});
}
function objectURL(key=''){
 const account=setting('R2_ACCOUNT_ID');const bucket=setting('R2_BUCKET_NAME');
 if(!/^[a-f0-9]{32}$/i.test(account)||!/^[-a-z0-9.]{3,63}$/.test(bucket))throw new StorageError('Revisa el Account ID y el nombre del bucket de R2.',503);
 return `https://${account}.r2.cloudflarestorage.com/${bucket}${key?'/'+key.split('/').map(encodeURIComponent).join('/'):''}`;
}
async function send(method:string,key:string,body?:Blob){
 const request=await client().sign(objectURL(key),{method,body,headers:body?{'Content-Type':'image/jpeg','Cache-Control':'private, no-store'}:undefined});
 const response=await fetch(request,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw new StorageError(response.status===403?'R2 rechazó las credenciales o los permisos del bucket.':'No se pudo completar la operación en R2.',502);
 return response;
}
export async function putR2(key:string,body:Blob){await send('PUT',key,body);}
export async function deleteR2(key:string){await send('DELETE',key);}
export async function readR2URL(key:string){const url=new URL(objectURL(key));url.searchParams.set('X-Amz-Expires','900');return (await client().sign(url,{method:'GET',aws:{signQuery:true}})).url;}
export async function checkR2(){const url=new URL(objectURL());url.searchParams.set('list-type','2');url.searchParams.set('max-keys','1');const request=await client().sign(url,{method:'GET'});const response=await fetch(request,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new StorageError('No se pudo acceder al bucket de R2. Revisa su nombre y el token con permisos de lectura y escritura.',503);}
