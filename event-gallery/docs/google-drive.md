# Google Drive dedicado: instalación

La app conserva Supabase Auth, PostgreSQL, Realtime y los permisos existentes. Google Drive guarda las **nuevas** fotos y portadas cuando se activa. Las fotos anteriores de Supabase se siguen mostrando, descargando y exportando junto a las nuevas; este cambio no las mueve ni las elimina.

Esta versión está pensada para **un fotógrafo y una cuenta de Google dedicada**. No admite aún que cada fotógrafo conecte un Drive diferente. No necesita Google Workspace ni una cuenta de servicio de Google. Los invitados no inician sesión en Google.

## 1. Preparar Supabase

Si ya aplicaste las migraciones 001–007, ejecuta **solo** `supabase/migrations/202610270008_google_drive.sql` en el SQL Editor, **antes de desplegar este código**, incluso si todavía vas a mantener Supabase como proveedor. En instalaciones nuevas, ejecuta todas en orden.

La migración:

- Añade `storage_provider` a fotos y `cover_provider` a eventos, ambos con valor inicial `supabase`.
- Crea `drive_connections` para el token de renovación cifrado y la carpeta raíz.
- Crea `drive_objects` para verificar qué archivos terminó de subir el servidor a Drive. Solo el servidor puede escribir o leer estas dos tablas; los clientes no pueden falsificar archivos ni consultar tokens.
- Actualiza galería y manifiestos de descarga para combinar proveedores. Conserva los permisos y el plazo de consulta de 30 días de la migración 007.

En Supabase → Authentication → Users, copia el **UUID** de tu usuario de fotógrafo; ese usuario debe seguir autorizado en `admin_users`. No es el correo ni el ID de Google.

Obtén la clave **service_role / secret de servidor** del proyecto Supabase. Se configura únicamente como `SUPABASE_SERVICE_ROLE_KEY`; **nunca** como variable `NEXT_PUBLIC_*`. La clave pública actual de la app no cambia.

## 2. Preparar Google Cloud

En https://console.cloud.google.com/ entra con la cuenta dedicada:

1. Crea un proyecto y habilita **Google Drive API** en la biblioteca de APIs.
2. Configura **Google Auth Platform / pantalla de consentimiento OAuth**: nombre de la app, correo de soporte y contacto. Si usas una cuenta Gmail personal, la audiencia será externa. Para probar en modo Testing, añade la cuenta dedicada como usuario de prueba.
3. Solicita únicamente el permiso `https://www.googleapis.com/auth/drive.file`, para archivos creados/autorizados mediante esta app. No habilites acceso completo al Drive.
4. Crea un cliente OAuth de tipo **Aplicación web**.
5. Añade en **URI de redirección autorizados** el origen público final más esta ruta exacta:

   ```text
   https://romeoharofotografia.org/api/storage/google/callback
   ```

   Si usas `www`, añade el URI de `www` y usa ese mismo origen en `APP_URL`. Para pruebas locales puedes añadir `http://localhost:3000/api/storage/google/callback` (o el puerto real que utilices). Las rutas, puertos y HTTPS deben coincidir exactamente. No es un callback de Supabase.
6. Copia Client ID y Client Secret directamente a tus variables locales y a Vercel. No los pegues en chats, código ni capturas.

**Funcionamiento continuo:** los tokens de renovación de una app externa en estado **Testing** con acceso a Drive caducan a los siete días. Usa ese estado para probar; para uso continuo configura la publicación en **Production** y completa los requisitos que Google indique para tu proyecto. Si cambias de Testing a Production, vuelve a conectar desde el panel para obtener una autorización nueva. Production no convierte los archivos de Drive en públicos. El permiso `drive.file` es de alcance limitado/no sensible; los requisitos concretos de consentimiento/verificación los determina Google. Incluso en Production pueden revocarse tokens, por lo que existe la opción de reconectar la misma cuenta.

No crees previamente una carpeta que la app no haya autorizado: al conectar, se crea automáticamente **Romeo Haro · Eventos**, y dentro, carpetas identificadas por el UUID de cada evento. Portadas y fotos tienen nombres diferentes y únicos. No compartas públicamente esa carpeta ni cambies sus permisos.

## 3. Variables de entorno

Usa Node.js **22 o superior** en local y Vercel. Mantén las variables actuales de Supabase y Turnstile y añade:

| Variable | Valor |
| --- | --- |
| `NEXT_PUBLIC_STORAGE_PROVIDER` | `googl`e-drive |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secret/service_role de Supabase, solo servidor |
| `APP_URL` | `https://romeoharofotografia.org` o el origen canónico que realmente uses |
| `GOOGLE_DRIVE_OWNER_ID` | UUID del fotógrafo en Supabase Auth |
| `GOOGLE_DRIVE_CLIENT_ID` | Client ID del cliente OAuth web de Google |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Client Secret del cliente OAuth web de Google |
| `DRIVE_ENCRYPTION_KEY` | 32 bytes aleatorios codificados en base64 |

Genera la última en **tu terminal**:

```sh
openssl rand -base64 32
```

Copia el resultado directamente a `.env.local` y Vercel. No uses una contraseña inventada ni una clave pública. **Conserva el mismo valor después de conectar**: cifra el token guardado y la cookie privada para las imágenes. Si la cambias, deberás reconectar y actualizar las sesiones de la app.

En Vercel configura las variables para **Production**. Los previews no necesitan las claves del Drive de producción; para una demo usa otro proyecto sin credenciales de producción. Como el proveedor es una variable pública de compilación, cambiarlo requiere un despliegue nuevo. No mezcles dominios al conectar: abre el panel desde el origen que pusiste en `APP_URL`.

Comprueba las variables sin imprimir sus valores:

```sh
npm run check:env
npm run build
```

El chequeo exige las variables de Drive solo cuando está seleccionado `google-drive`. Si todavía no lo has configurado, deja `NEXT_PUBLIC_STORAGE_PROVIDER=supabase`. No se cambia a Supabase automáticamente cuando falla Drive: así no se reparten archivos entre proveedores por una desconexión accidental.

## 4. Desplegar y conectar

1. Aplica 008 y despliega el código con las variables nuevas en Vercel.
2. Abre la app desde su dominio canónico e inicia sesión con el fotógrafo cuyo UUID configuraste.
3. Entra en **Almacenamiento → Conectar cuenta dedicada**.
4. Google pedirá que **tú** elijas la cuenta y autorices el permiso. La app usa estado aleatorio, cookie HttpOnly y PKCE para el retorno OAuth.
5. Al volver, el panel mostrará la cuenta y el espacio utilizado/total que informa Google. Este uso incluye Gmail y otros servicios de la cuenta.
6. Prueba una nueva portada, sube una foto como invitado y comprueba ver, ampliar, guardar/compartir, favoritos y ZIP desde otro dispositivo. Confirma que los archivos aparezcan en la carpeta privada de Drive.

El despliegue del código **no conecta por sí solo Google**: necesita tu autorización y las variables anteriores. Hasta conectar, las subidas nuevas a Drive mostrarán un aviso. Las pruebas automatizadas no sustituyen esta primera comprobación con tu cuenta real.

## Seguridad, límites y retención

- Las nuevas subidas siguen pasando por la optimización existente: JPG, PNG o WebP de entrada, convertidas en el navegador a JPG de hasta 1400 px y calidad 0.75; el archivo enviado al servidor debe ser JPG y pesar como máximo **3 MB**. Se verifican tamaño y firma JPEG; no es un escaneo antivirus ni una validación completa de todos los píxeles.
- El servidor valida la sesión con Supabase Auth y comprueba la autorización y hora del evento **antes y después** de subir. Solo después registra el archivo y publica la foto. Un cliente no puede aportar un ID de archivo arbitrario de Google.
- Las fotos se sirven desde `/api/storage/file` con verificación de permisos en cada petición. Las imágenes de la galería usan una cookie cifrada HttpOnly, de mismo origen; las descargas usan la sesión autenticada. No se entregan tokens de Google, enlaces públicos de Drive ni la clave de servidor al navegador. Las respuestas privadas no se cachean públicamente.
- Al archivarse hay 30 días para consultar y descargar; al vencer se rechazan nuevas peticiones. Las imágenes ya descargadas o abiertas quedan en el dispositivo del usuario. No se borran automáticamente originales.
- Las subidas y lecturas pasan por funciones de **Vercel**. Drive no evita el consumo de transferencia y ejecución de Vercel, ni las cuotas de API de Google. Es una integración para uso inicial moderado, no una promesa de tráfico ilimitado o costo cero.
- Esta versión **no admite video**. Vercel limita el cuerpo de las peticiones de funciones a 4.5 MB; el límite de 3 MB deja margen para fotografías. Para video habrá que implementar subida reanudable y procesamiento/miniaturas, sin enviar un archivo grande por esta ruta.
- Para fallos de publicación se intenta enviar a la papelera **solo el archivo recién creado**. Las portadas todavía vinculadas a cualquier evento no se pueden eliminar desde el endpoint de limpieza. Si una petición falla por completo en la red puede quedar algún archivo huérfano, que se debe revisar manualmente.
- Los elementos de la papelera de Drive siguen ocupando espacio hasta su eliminación definitiva. Este ajuste **no incluye un botón de purga de eventos**. Haz respaldo y limpieza manual consciente cuando venza la consulta; borrar solo filas de Supabase no elimina archivos de Google.
- No cambies de cuenta ni de cliente OAuth para una conexión con archivos: los registros existentes apuntan al Drive original. El botón de reconexión acepta la misma cuenta. Para cambiar de proveedor usa `supabase` y despliega; los archivos antiguos de Drive seguirán necesitando su conexión y claves para leerse.

## Pruebas

```sh
npm run test:db
npm run test:experience
npm run test:drive
npm run build
```

`test:db` ejecuta migraciones y RLS con PostgreSQL embebido y Auth/Storage simulados. `test:drive` ejecuta los handlers reales con respuestas HTTP simuladas de Google y Supabase: autorización, cifrado, OAuth/PKCE, publicación, limpieza y acceso privado. No toca una cuenta real.

Referencias oficiales:

- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/protocols/oauth2#expiration
- https://developers.google.com/workspace/drive/api/guides/manage-uploads
- https://vercel.com/docs/functions/limitations
