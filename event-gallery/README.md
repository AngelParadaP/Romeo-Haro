# Romeo Haro · Recuerdos compartidos

Galerías de eventos en Next.js + TypeScript. Interfaz en español, panel del fotógrafo, acceso de invitados por enlace/QR, carga de fotos y cámara móvil, likes, favoritos privados y paginación.

## Arquitectura elegida

- **Vercel** aloja la aplicación Next.js y su dominio HTTPS.
- **Supabase Auth** autentica al fotógrafo con correo/contraseña y crea sesiones anónimas para invitados. Escribir un nombre no sustituye una sesión.
- **Supabase PostgreSQL** guarda eventos, miembros de cada evento, metadatos de fotos, likes y favoritos.
- **Supabase Storage** guarda las imágenes en un bucket privado `event-photos`.

Es un solo proyecto de Supabase, con una base relacional y almacenamiento de archivos separado. No necesitas varias bases ni guardar imágenes en columnas de PostgreSQL. Cada foto tiene un registro y una ruta a su archivo; las imágenes viajan directamente del navegador a Storage, sin pasar por una función de Vercel.

La clave publishable es pública por diseño. Los permisos reales están en las políticas RLS del SQL. **No se usa ni necesita `service_role` o una clave `sb_secret_` en la aplicación.**

## Preparación local

Requiere Node.js 22 o posterior y pnpm 10.28.2. Desde `event-gallery`:

```sh
pnpm install --frozen-lockfile
# Si .env.local todavía no existe:
cp .env.example .env.local
pnpm dev
```

Sin variables de Supabase, `pnpm dev` conserva la demo local anterior. Si configuras Supabase, usa datos remotos y deja de leer los eventos de localStorage. No hay migración automática de datos de muestra. En producción, sin configuración aparece una pantalla para conectar el estudio; no se expone un falso panel funcional.

## 1. Crear el proyecto en Supabase

1. Entra en https://supabase.com/dashboard y crea un proyecto dentro de tu organización. Ejemplo de nombre: `romeo-haro`. Elige una región cercana a tus invitados en México; una región de Estados Unidos cercana suele ser un punto de partida razonable. Guarda la contraseña de la base en tu gestor de contraseñas; la app no la necesita.
2. Espera a que el proyecto esté disponible.
3. Abre **SQL Editor** y ejecuta el contenido completo de `supabase/migrations/202610270001_initial.sql` **una sola vez**, en un proyecto nuevo. Se ejecuta en una transacción y crea tablas, funciones, índices, permisos y el bucket privado. Si hay un error, corrígelo antes de volver a ejecutarlo; no omitas partes.
4. En **Authentication → Sign In / Providers**, habilita Email y **Anonymous Sign-Ins**. Mantén habilitada la creación de nuevos usuarios para permitir las sesiones de los invitados. La aplicación no ofrece registro de fotógrafos y crear una cuenta en Auth nunca concede acceso al panel: ese permiso se controla con `admin_users`. Las cuentas de fotógrafo se crean manualmente en el siguiente paso.
5. En **Authentication → Users → Add user**, crea tu cuenta de fotógrafo con correo y contraseña. Usa la opción de confirmar el correo al crearla, o completa su confirmación antes de iniciar sesión.
6. Copia el **UUID del usuario** creado y ejecuta en SQL Editor:

```sql
insert into public.admin_users(user_id)
values ('REEMPLAZA_POR_EL_UUID_DE_TU_USUARIO')
on conflict do nothing;
```

Tener cuenta no basta para crear eventos: también debe estar en `admin_users`. Esa tabla no puede modificarse desde el navegador. Si más adelante autorizas otro fotógrafo, solo podrá administrar los eventos que le pertenecen.

## 2. Conectar el proyecto local

En **Connect / Project Settings → API**, copia la URL y la clave **publishable**. Las ubicaciones exactas de los menús pueden variar con la versión del dashboard. Completa `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
NEXT_PUBLIC_DEMO_MODE=false
```

También se admite la clave legacy `anon` dentro de `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. No uses el secreto de la base, la clave `service_role` ni `sb_secret_`. `.env.local` se ignora en Git; `.env.example` contiene solo marcadores.

Reinicia el servidor después de cambiar las variables. Comprueba sin imprimir claves:

```sh
pnpm check:env
pnpm typecheck
pnpm test:db
pnpm build
pnpm dev
```

Abre http://localhost:3000, inicia sesión y crea tu primer evento real. Los eventos de demostración no se importan a Supabase.

## 3. Preparar los invitados

El botón **Compartir y QR** genera el enlace exacto y permite descargar un PNG del QR. El botón también está en cada tarjeta de evento. En Supabase, el enlace y QR funcionan entre dispositivos; en demo siguen siendo locales.

El invitado entra por `/?evento=UUID`, escribe su nombre y obtiene una sesión con Supabase Auth. La función `join_event` comprueba que el evento esté activo y crea su membresía. Ese UUID aleatorio funciona como una invitación: quien tenga el enlace puede reenviarlo. Los invitados no tienen un directorio público de eventos ni permisos administrativos. Esta versión no incluye PIN ni contraseña por evento.

Las imágenes se guardan en `event-photos/EVENTO/USUARIO/FOTO.jpg`. El bucket es privado, con permisos por evento; la galería genera URLs firmadas por 15 minutos y las renueva cada 10 minutos mientras está abierta. Archivar un evento impide nuevas lecturas autorizadas y subidas de invitados, aunque una URL firmada ya emitida puede funcionar hasta caducar. Lo ya descargado no se puede revocar.

### Protección de acceso anónimo

Antes de repartir enlaces ampliamente, configura CAPTCHA para reducir altas anónimas automatizadas:

1. Crea un widget Cloudflare Turnstile y autoriza tu dominio final; añade también localhost para pruebas si corresponde.
2. Activa CAPTCHA en Supabase Auth y configura allí el proveedor y su **secret key**.
3. Añade solo la **site key** pública como `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en `.env.local` y Vercel.
4. Reinicia o vuelve a desplegar. El formulario de invitado y el login mostrarán el widget y enviarán su token a Supabase.

Si activas CAPTCHA en Supabase y no configuras la site key en la web, los inicios de sesión fallarán. La app no incluye un CAPTCHA simulado. Los límites de autenticación por IP y los costes de Storage se administran desde Supabase. CAPTCHA no sustituye cuotas de carga por invitado.

## 4. Subir a Vercel

Recomiendo Vercel porque este proyecto ya usa Next.js y su integración es directa. No necesitas Netlify además de Vercel.

1. Sube los cambios del proyecto a tu repositorio `AngelParadaP/Romeo-Haro`. Revisa `git diff` antes de hacer commit y push; no subas `.env.local`.
2. En https://vercel.com/new importa ese repositorio.
3. Selecciona **Root Directory: `event-gallery`**. No uses la raíz del repositorio, que no contiene el `package.json` de la aplicación.
4. Framework: **Next.js**. Selecciona Node.js 22.x o una versión compatible posterior. El proyecto declara pnpm 10.28.2 y trae `pnpm-lock.yaml`.
5. `vercel.json` configura `pnpm install --frozen-lockfile` y `npm run build`. Deja que Vercel use el directorio de salida de Next.js; no uses exportación estática ni un `dist` manual.
6. Añade las variables anteriores en **Environment Variables**. Configura las del proyecto de producción en Production. Para Preview, usa idealmente un proyecto Supabase independiente con la misma migración: un preview conectado a producción puede modificar datos reales.
7. Despliega. Conecta un dominio propio antes de imprimir los QR para tener enlaces estables.
8. En Supabase Auth, configura **Site URL** con la URL final. Añade `http://localhost:3000` a las URLs permitidas de desarrollo y el dominio final donde corresponda. Esta versión usa contraseña; si agregas magic links u OAuth necesitarás implementar su callback y URLs exactas.
9. Si usas Turnstile, autoriza también el dominio de producción y configura su site key en Vercel.
10. Si cambias una variable `NEXT_PUBLIC_`, **redeploy**: Next.js la incorpora al compilar.

Los QR se generan con el dominio desde el que se abre la app. No imprimas un QR creado en localhost o en un preview temporal. No hacen falta claves de Vercel dentro del código.

## 5. Prueba con dos dispositivos

1. En el navegador del fotógrafo: iniciar sesión, crear un evento y descargar su QR.
2. En otro navegador o celular: abrir el enlace, escribir un nombre y subir una foto.
3. En el fotógrafo: abrir la galería y pulsar **Actualizar**. Debe aparecer la foto remota.
4. Dar like y favorito en el invitado. Recargar: ambos deben persistir. En otro invitado, el like es visible y el favorito ajeno no aparece.
5. Crear un segundo evento y verificar que sus fotos no aparecen en el primero.
6. Archivar el primero: el invitado ya no debe poder cargar ni obtener nuevas URLs de sus fotos.
7. Cerrar sesión del fotógrafo y abrir `/`: debe aparecer el login.
8. Probar **Tomar foto** desde el teléfono con HTTPS. El comportamiento del selector de cámara depende del navegador.

## Cómo está organizada la base

| Tabla | Qué guarda |
| --- | --- |
| `admin_users` | UUID de los fotógrafos autorizados; se administra desde SQL Editor. |
| `events` | Propietario, título, fecha, categoría, portada, estado y retiro lógico. |
| `event_guests` | Membresía entre sesión Auth e invitación de evento. |
| `photos` | Evento, autor, nombre visible y ruta del archivo en Storage. |
| `photo_likes` | Un like por foto y sesión; visible a miembros del evento. |
| `photo_favorites` | Un favorito por foto y sesión; solo el usuario puede consultarlo. |

`auth.users` pertenece a Supabase Auth. No guardamos contraseñas en tablas propias. Las claves únicas evitan reacciones duplicadas. RLS comprueba permisos en la base incluso si alguien intenta llamar directamente a su API.

## Imágenes, capacidad y conservación

- Entrada: JPG, PNG o WebP de hasta 12 MB, hasta 10 imágenes por selección. HEIC no está implementado; algunos teléfonos lo convierten automáticamente y otros requieren exportar JPG.
- Se normalizan a JPEG, máximo 1400 px en su lado mayor y calidad 0.75. Se guarda esa versión para compartir, **no el original de alta resolución**.
- Storage admite solo JPEG hasta 3 MB por archivo, también desde llamadas directas a su API. No se almacenan imágenes base64 en PostgreSQL.
- La galería consulta 12 fotos por página desde PostgreSQL y firma solo esas imágenes. No descarga todos los originales para paginar.
- Como estimación: 1,000 imágenes de 500 KB ocupan aproximadamente 500 MB. Verlas o descargarlas consume transferencia adicional. Vigila almacenamiento, transferencia y usuarios activos, no solo el tamaño de la base.
- Antes de un evento real revisa las cuotas y precios vigentes en https://supabase.com/pricing y https://vercel.com/pricing, incluyendo si tu uso comercial requiere un plan distinto. No se contrataron planes de pago desde este proyecto.
- **Retirar evento** es una baja lógica: oculta evento y fotos, y bloquea nuevas visitas, pero conserva sus archivos y registros. Esto evita borrados parciales entre la base y Storage. Los archivos retirados siguen ocupando espacio. La recuperación se hace desde SQL Editor restaurando `deleted_at = null` y el estado deseado.
- La purga definitiva no está automatizada. Para liberar espacio, un administrador elimina primero los objetos del prefijo del evento desde Storage (o su API administrativa), y después el registro del evento desde SQL Editor. No borres filas directamente de `storage.objects`; usa Storage. Define el plazo de conservación con tu cliente antes de subir material real.
- No hay todavía cuotas acumuladas por invitado/evento, moderación, escaneo de archivos, originales descargables, recuperación de favoritos entre dispositivos ni eliminación automática de usuarios anónimos. Configura protección antiabuso y presupuesto antes de abrirlo a público masivo.
- Las portadas siguen usando fotos de ejemplo externas de Unsplash. La subida de portada propia es una ampliación pendiente; las fotos de invitados sí usan el bucket privado.

## Verificación y estado de entrega

`pnpm test:db` ejecuta la migración real en PostgreSQL embebido (PGlite) con esquemas Auth y Storage simulados. Verifica aislamiento de fotógrafos/eventos, membresías, rutas de subida, reacciones, favoritos privados, archivo y retiro. No reemplaza las pruebas del servicio alojado, CAPTCHA ni el flujo real de Storage.

La integración está preparada en código. La migración aún debe ejecutarse en tu proyecto Supabase, añadir tu usuario administrador y configurar las variables de tu cuenta. El despliegue en Vercel y la prueba entre dispositivos requieren esos pasos. No se incluyen credenciales ni se afirma que exista un despliegue remoto.

Referencias oficiales:
- https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/serving/downloads
- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/environment-variables
