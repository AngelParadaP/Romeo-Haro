import {NextRequest,NextResponse} from 'next/server';
import {setting,unseal,seal,serviceDB,StorageError,fail} from '@/lib/server/storage-auth';
import {googleTokens,driveFetch,folder} from '@/lib/server/google-drive';
export async function GET(request:NextRequest){
 const callbackURL=request.nextUrl;
 const cookie=request.cookies.get('rh_drive_oauth')?.value;
 let origin:string;try{origin=new URL(setting('APP_URL')).origin;}catch(error){return fail(error);}
 let result='error';
 try{
  if(!cookie)throw new StorageError('Autorización ausente.',401);
  const state=unseal<{state:string;verifier:string;userId:string;exp:number}>(cookie);
  if(state.exp<Date.now()||state.state!==callbackURL.searchParams.get('state')||state.userId!==setting('GOOGLE_DRIVE_OWNER_ID'))throw new StorageError('Autorización inválida.',401);
  const code=callbackURL.searchParams.get('code');if(!code)throw new StorageError('Conexión cancelada.');
  const admin=await serviceDB().from('admin_users').select('user_id').eq('user_id',state.userId).maybeSingle();if(admin.error||!admin.data)throw new StorageError('Acceso denegado.',403);
  const tokens=await googleTokens({grant_type:'authorization_code',code,code_verifier:state.verifier,redirect_uri:`${origin}/api/storage/google/callback`});
  if(!tokens.refresh_token||!tokens.scope?.split(' ').includes('https://www.googleapis.com/auth/drive.file'))throw new StorageError('Faltan permisos de Drive.');
  const about=await (await driveFetch(tokens.access_token,'about?fields=user(emailAddress)')).json();
  const old=await serviceDB().from('drive_connections').select('root_folder_id,account_email').eq('owner_id',state.userId).maybeSingle();if(old.error)throw new Error('database');
  // Do not silently switch storage accounts and strand existing event files.
  if(old.data&&old.data.account_email!==about.user.emailAddress)throw new StorageError('Reconecta la misma cuenta dedicada de Drive.');
  const root=old.data?.root_folder_id||await folder(tokens.access_token,'Romeo Haro · Eventos');
  const saved=await serviceDB().from('drive_connections').upsert({owner_id:state.userId,refresh_token_encrypted:seal({refreshToken:tokens.refresh_token}),root_folder_id:root,account_email:about.user.emailAddress,updated_at:new Date().toISOString()});if(saved.error)throw new Error('database');result='connected';
 }catch{ /* Never send OAuth codes, tokens or upstream errors to the browser. */ }
 const response=NextResponse.redirect(`${origin}/?drive=${result}`);response.cookies.set('rh_drive_oauth','',{path:'/api/storage/google',maxAge:0});return response;
}
