// Print configuration status, never credentials.
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const buildMode = process.argv.includes('--build');
const anyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
let failed = false;
for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  const value = process.env[name];
  const ok = Boolean(value && !/YOUR_PROJECT|REPLACE_ME/.test(value));
  console.log(`${ok ? '✓' : '✗'} ${name}: ${ok ? 'configurada' : 'falta configurar'}`);
  if (!ok && (!buildMode || anyConfigured)) failed = true;
}
if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try { if (new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).protocol !== 'https:') throw new Error(); }
  catch { console.log('✗ La URL de Supabase debe ser una URL HTTPS válida.'); failed = true; }
}
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
// Accept legacy anon JWTs, but reject secret/service_role credentials.
if (key.startsWith('sb_secret_')) { console.log('✗ Usa la clave publishable, nunca una clave secret.'); failed = true; }
if (key.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    if (payload.role !== 'anon') { console.log('✗ La clave JWT debe tener el rol anon, nunca service_role.'); failed = true; }
  } catch { console.log('✗ La clave JWT no es válida.'); failed = true; }
}
console.log(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? '✓ Turnstile configurado en la web; revisa también su secreto en Supabase.' : '○ Turnstile no configurado. Recomendado antes de repartir enlaces públicos.');
if (buildMode && !anyConfigured) console.log('○ Build de preparación: la pantalla de conexión se mostrará en producción.');
if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') console.log('○ Modo demo habilitado sin Supabase. Desactívalo para producción.');
if(process.env.NEXT_PUBLIC_STORAGE_PROVIDER && !['supabase','google-drive'].includes(process.env.NEXT_PUBLIC_STORAGE_PROVIDER)) { console.log('✗ NEXT_PUBLIC_STORAGE_PROVIDER debe ser supabase o google-drive.');failed=true; }
if(process.env.NEXT_PUBLIC_STORAGE_PROVIDER==='google-drive'){
 for(const name of ['SUPABASE_SERVICE_ROLE_KEY','APP_URL','GOOGLE_DRIVE_OWNER_ID','GOOGLE_DRIVE_CLIENT_ID','GOOGLE_DRIVE_CLIENT_SECRET','DRIVE_ENCRYPTION_KEY']){
  const ok=Boolean(process.env[name]);console.log(`${ok?'✓':'✗'} ${name}: ${ok?'configurada':'falta configurar'}`);if(!ok)failed=true;
 }
 if(process.env.DRIVE_ENCRYPTION_KEY&&Buffer.from(process.env.DRIVE_ENCRYPTION_KEY,'base64').length!==32){console.log('✗ DRIVE_ENCRYPTION_KEY debe contener 32 bytes en base64.');failed=true;}
 if(process.env.APP_URL){try{const url=new URL(process.env.APP_URL);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||!(url.protocol==='https:'||(url.protocol==='http:'&&url.hostname==='localhost')))throw new Error();}catch{console.log('✗ APP_URL debe ser un origen HTTPS (o http://localhost para desarrollo).');failed=true;}}
 if(process.env.GOOGLE_DRIVE_OWNER_ID&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(process.env.GOOGLE_DRIVE_OWNER_ID)){console.log('✗ GOOGLE_DRIVE_OWNER_ID debe ser el UUID de Supabase Auth.');failed=true;}
}
process.exitCode = failed ? 1 : 0;
