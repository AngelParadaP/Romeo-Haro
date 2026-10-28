import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {NextResponse} from 'next/server';
export class StorageError extends Error { constructor(message:string,public status=400){super(message);} }
export const driveEnabled=()=>process.env.NEXT_PUBLIC_STORAGE_PROVIDER==='google-drive';
export function setting(name:string){const value=process.env[name];if(!value)throw new StorageError('Falta configurar el almacenamiento en el servidor.',503);return value;}
function encryptionKey(){const value=Buffer.from(setting('DRIVE_ENCRYPTION_KEY'),'base64');if(value.length!==32)throw new StorageError('La clave de cifrado del almacenamiento no es válida.',503);return value;}
export function seal(value:unknown){const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');}
export function unseal<T>(value:string):T{try{const bytes=Buffer.from(value,'base64url');const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString()) as T;}catch{throw new StorageError('La autorización caducó. Actualiza la página o reconecta Drive.',401);}}
export function serviceDB(){return createClient(setting('NEXT_PUBLIC_SUPABASE_URL'),setting('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
export async function authenticated(request:Request){
 let token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 if(!token){const encoded=request.headers.get('cookie')?.split(';').map(c=>c.trim()).find(c=>c.startsWith('rh_storage='))?.slice(11);if(encoded){const stored=unseal<{token:string;exp:number}>(decodeURIComponent(encoded));if(stored.exp>Date.now())token=stored.token;}}
 if(!token)throw new StorageError('Inicia sesión para acceder al almacenamiento.',401);
 const db=createClient(setting('NEXT_PUBLIC_SUPABASE_URL'),setting('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.getUser(token);if(error||!data.user)throw new StorageError('Tu sesión caducó. Actualiza la página.',401);
 return {db,user:data.user,token};
}
export async function requireDriveOwner(request:Request){const session=await authenticated(request);const admin=await session.db.rpc('is_admin');if(admin.error||!admin.data||session.user.id!==setting('GOOGLE_DRIVE_OWNER_ID'))throw new StorageError('Solo el fotógrafo configurado puede conectar esta cuenta de Drive.',403);return session;}
export function privateJSON(data:unknown,token?:string){const response=NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});if(token)response.cookies.set('rh_storage',seal({token,exp:Date.now()+3600000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/storage',maxAge:3600});return response;}
export function fail(error:unknown){return NextResponse.json({error:error instanceof StorageError?error.message:'No se pudo completar la operación de almacenamiento. Revisa la conexión de Drive e inténtalo de nuevo.'},{status:error instanceof StorageError?error.status:502,headers:{'Cache-Control':'no-store'}});}
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function allowed(db:Awaited<ReturnType<typeof authenticated>>['db'],path:string,bucket:string,writing=false){const result=await db.rpc('drive_access',{target:path,kind:bucket,writing});if(result.error||!result.data)throw new StorageError('No tienes permiso para este archivo o el plazo del evento terminó.',403);}
