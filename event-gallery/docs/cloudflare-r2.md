# Activar Cloudflare R2

R2 sustituye a Google Drive para las nuevas fotos y portadas. Supabase conserva las sesiones, eventos, permisos y los 30 días de consulta después del archivo. No hay OAuth, usuarios de prueba ni renovación de permisos de Google para R2.

## 1. Crear el bucket y las credenciales

En Cloudflare → **R2 Object Storage**:

1. Activa R2 si todavía no lo tienes. Revisa las condiciones de facturación que muestre Cloudflare: existe uso gratuito mensual, pero el excedente se cobra.
2. Crea un bucket de clase **Standard**, por ejemplo `romeo-haro-fotos`, con ubicación/jurisdicción global predeterminada.
3. **Mantén desactivado el acceso público** (`r2.dev` y dominios públicos). No necesitas cambiar los DNS de tu web ni mover el dominio desde Hostinger.
4. En **Manage R2 API Tokens**, crea un token con **Object Read & Write** y **Apply to specific buckets only**, seleccionando ese bucket. No necesitas permisos de administrador de toda la cuenta.
5. Copia el **Account ID**, **Access Key ID** y **Secret Access Key**. El Account ID es el identificador de cuenta de 32 caracteres, no la URL del endpoint. Guarda la clave secreta directamente en tus variables de entorno.

## 2. Configurar CORS para ver y descargar desde la web

En el bucket → **Settings → CORS policy**, utiliza los orígenes que realmente uses. Ejemplo:

```json
[
  {
    "AllowedOrigins": [
      "https://romeoharofotografia.org",
      "https://www.romeoharofotografia.org",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Añade el puerto real si desarrollas en otro. No uses comodín para todos los orígenes. CORS no vuelve público el bucket: las imágenes requieren URL firmadas. Las subidas de esta versión pasan por el servidor, por lo que no hace falta permitir PUT desde el navegador.

## 3. Aplicar la migración

En Supabase SQL Editor:

- Si ya aplicaste 001–008, ejecuta **solo** `supabase/migrations/202610280009_cloudflare_r2.sql`.
- Si te quedaste en 007, aplica **008 y después 009**. La 008 crea las columnas de proveedor y manifiestos que reutiliza R2; aplicarla no requiere conectar Google.
- En instalaciones nuevas, aplica todas en orden.

Hazlo antes de desplegar el nuevo código. La migración 009 crea `r2_objects`, un registro privado que solo el servidor puede escribir, y amplía los permisos de galería y las comprobaciones de archivos verificados. No elimina tablas, credenciales ni fotos de Google/Supabase, ni migra archivos existentes.

## 4. Variables en Vercel y local

Mantén las claves públicas de Supabase y Turnstile. Configura estas variables en `.env.local` y **Vercel → Settings → Environment Variables → Production**:

```dotenv
NEXT_PUBLIC_STORAGE_PROVIDER=r2
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_SECRET_O_SERVICE_ROLE_DE_SUPABASE
R2_ACCOUNT_ID=TU_ACCOUNT_ID_DE_32_CARACTERES
R2_BUCKET_NAME=romeo-haro-fotos
R2_ACCESS_KEY_ID=TU_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=TU_SECRET_ACCESS_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` es la misma variable de servidor usada en la integración anterior. Las cuatro `R2_*` y la clave de servidor **no** deben llevar el prefijo `NEXT_PUBLIC_`. No se necesita `APP_URL`, `DRIVE_ENCRYPTION_KEY` ni ninguna variable `GOOGLE_DRIVE_*` para subir o consultar archivos de R2.

Si nunca guardaste archivos en Drive, puedes retirar sus variables antiguas de Vercel y del entorno local. Si ya guardaste fotos o portadas allí, conserva temporalmente esas variables y su autorización: el código mantiene acceso a archivos anteriores de Drive y Supabase. Cambiar el proveedor solo afecta nuevas subidas; no copia los archivos históricos.

Usa Node **24.x** (fijado en package.json), guarda los cambios y despliega otra vez. `NEXT_PUBLIC_STORAGE_PROVIDER` se incorpora durante la compilación; modificar la variable sin desplegar no cambia el proveedor activo. Reinicia también `npm run dev` después de editar `.env.local`.

## 5. Comprobar

1. Abre **Almacenamiento → Comprobar conexión** desde el panel del fotógrafo.
2. La comprobación valida la sesión, la migración y el acceso de lectura al bucket. No sustituye la prueba de escritura siguiente.
3. Sube una foto de prueba como invitado y cambia la portada de un evento. Verifica que aparezcan en R2 bajo `event-photos/` y `event-covers/`.
4. Desde otro dispositivo, comprueba ampliar, guardar/compartir, favoritos y descarga ZIP.

El panel no exige iniciar sesión en Cloudflare: las credenciales ya están en el servidor. El espacio y la facturación se consultan en el dashboard de Cloudflare; la app no muestra una cuota inventada ni calcula el consumo completo de la cuenta.

## Funcionamiento y límites

- Cada foto se optimiza a JPG en el navegador y se limita a **3 MB**. El servidor verifica sesión, permisos del evento, tamaño y firma JPEG antes de subir a R2 y vuelve a verificar permisos antes de publicar la fotografía.
- Se conservan el nombre del invitado, Realtime, favoritos, paginación, ZIP y permisos existentes.
- Las subidas pasan por Vercel; las imágenes y las descargas de R2 se sirven directamente desde el bucket mediante enlaces firmados de **15 minutos**, evitando reenviar sus bytes por Vercel. Sigue habiendo invocaciones de servidor y tráfico de subida en Vercel.
- El bucket es privado. La firma autoriza solo la lectura de un objeto y no incluye la clave secreta. Quien reciba esa URL podrá utilizarla hasta que venza; aunque termine la consulta del evento, una URL ya emitida puede seguir vigente hasta 15 minutos. Las nuevas autorizaciones se bloquean al vencer los 30 días.
- Esta versión no añade video. Habrá que preparar subidas directas/reanudables y validación de video antes de habilitarlo.
- Archivar o caducar el acceso no elimina archivos ni libera espacio. La limpieza de eventos sigue siendo manual tras hacer respaldo. El endpoint de limpieza solo puede retirar portadas huérfanas del fotógrafo; no permite borrar portadas vinculadas a eventos.
- Si ocurre un fallo de publicación, solo se intenta eliminar el objeto nuevo de esa petición. Si no puede confirmarse si la foto quedó registrada, se conserva el objeto para evitar borrar una foto publicada.
- R2 tiene cuotas gratuitas y cobra excedentes; no se promete uso ilimitado ni costo cero. Usa Standard y revisa el consumo en Cloudflare.

## Pruebas locales

```sh
npm run check:env
npm run test:db
npm run test:storage
npm run test:experience
npm run build
```

Las pruebas de RLS usan PostgreSQL embebido; las de API simulan R2, Google y Supabase sin subir archivos reales. La conexión a tu bucket se confirma después de configurar las credenciales.

Referencias oficiales:

- https://developers.cloudflare.com/r2/get-started/s3/
- https://developers.cloudflare.com/r2/api/tokens/
- https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- https://developers.cloudflare.com/r2/buckets/cors/
- https://developers.cloudflare.com/r2/pricing/

## Diagnóstico de una conexión local

Si `.env.local` tiene R2 configurado pero el panel entero muestra «Falta configurar el almacenamiento», puede haber una portada antigua de Drive sin sus claves. Ahora la app usa una portada provisional para ese evento y permite entrar al estudio; edita su portada y sube una nueva para guardarla en R2. Esto no elimina ni cambia la referencia de la portada antigua hasta que guardes una nueva.

`R2_ACCESS_KEY_ID` es el **Access Key ID S3 de 32 caracteres** y `R2_SECRET_ACCESS_KEY` es el **Secret Access Key de 64 caracteres** del mismo par. El token API general de Cloudflare no sirve en esos campos. La app y `npm run check:env` indican el nombre exacto del campo incorrecto sin mostrar su contenido.
