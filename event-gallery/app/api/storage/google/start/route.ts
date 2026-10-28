import {randomBytes,createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {requireDriveOwner,setting,seal,fail,driveEnabled,StorageError} from '@/lib/server/storage-auth';
export async function POST(request:Request){try{
 if(!driveEnabled())throw new StorageError('Activa Google Drive en la configuración del servidor.',503);
 const {user}=await requireDriveOwner(request);const state=randomBytes(32).toString('base64url');const verifier=randomBytes(48).toString('base64url');
 const origin=new URL(setting('APP_URL')).origin;
 if(new URL(request.url).origin!==origin)throw new StorageError('Conecta Google Drive desde el dominio principal configurado en APP_URL.');
 const params=new URLSearchParams({client_id:setting('GOOGLE_DRIVE_CLIENT_ID'),redirect_uri:`${origin}/api/storage/google/callback`,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
 const response=NextResponse.json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`},{headers:{'Cache-Control':'no-store'}});
 response.cookies.set('rh_drive_oauth',seal({state,verifier,userId:user.id,exp:Date.now()+600000}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/storage/google',maxAge:600});return response;
}catch(error){return fail(error);}}
