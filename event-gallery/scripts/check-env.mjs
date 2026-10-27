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
process.exitCode = failed ? 1 : 0;
