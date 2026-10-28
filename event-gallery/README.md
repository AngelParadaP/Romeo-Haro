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
3. Abre **SQL Editor** y ejecuta los archivos de `supabase/migrations/` en orden: primero `202610270001_initial.sql` después `202610270002_fix_event_insert_returning.sql` después `202610270003_guest_experience.sql` después `202610270004_studio_and_categories.sql` y finalmente `202610270005_invitation_text.sql`, cada uno una sola vez en un proyecto nuevo. Se ejecuta en una transacción y crea tablas, funciones, índices, permisos y el bucket privado. Si hay un error, corrígelo antes de volver a ejecutarlo; no omitas partes.
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
- Las portadas nuevas pueden subirse desde el editor y se guardan en el bucket privado `event-covers`. Las portadas anteriores de muestra pueden seguir usando Unsplash. El encuadre horizontal, vertical y zoom se guarda en el evento. Las versiones sustituidas de portadas se conservan en Storage hasta su limpieza administrativa.

## Verificación y estado de entrega

`pnpm test:db` ejecuta la migración real en PostgreSQL embebido (PGlite) con esquemas Auth y Storage simulados. Verifica aislamiento de fotógrafos/eventos, membresías, rutas de subida, reacciones, favoritos privados, archivo y retiro. No reemplaza las pruebas del servicio alojado, CAPTCHA ni el flujo real de Storage.

La integración está preparada en código. En instalaciones nuevas deben ejecutarse las migraciones en orden, añadir el usuario administrador y configurar las variables de la cuenta. En instalaciones existentes se aplican solo las migraciones pendientes. El despliegue en Vercel y la prueba entre dispositivos requieren esos pasos. No se incluyen credenciales ni se afirma que exista un despliegue remoto.

Referencias oficiales:
- https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs
- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/serving/downloads
- https://vercel.com/docs/frameworks/full-stack/nextjs
- https://vercel.com/docs/environment-variables

## Corrección: error RLS al crear un evento

Si el login funciona pero crear un evento devuelve `new row violates row-level security policy for table "events"`, aplica `supabase/migrations/202610270002_fix_event_insert_returning.sql` desde SQL Editor. No repitas la migración inicial ni desactives RLS. Esta corrección permite devolver el ID de una fila recién creada a su fotógrafo; conserva los permisos de invitados y el aislamiento entre propietarios. No requiere un despliegue de Vercel.

## Actualización: invitados, Realtime, descargas y personalización

Para una instalación que ya funciona, aplica **solo** `supabase/migrations/202610270003_guest_experience.sql` en Supabase SQL Editor y luego publica el código nuevo en Vercel. Si no aplicaste la corrección 002, aplícala primero. No repitas la migración 001. El SQL crea el bucket privado de portadas, campos de personalización/horarios y funciones para descargas; también añade `photos` y `events` a la publicación `supabase_realtime` si existe. En Supabase comprueba que ambas tablas estén habilitadas para Realtime. No hay variables nuevas ni necesita una clave de servidor.

- **Sesión del invitado:** Supabase conserva y renueva su sesión en el navegador. El nombre se guarda por evento y UUID del usuario; al refrescar se verifica la sesión y se recupera su nombre sin volver a mostrar el formulario. El navegador debe conservar los datos del sitio y usar el mismo dominio (www y sin www son orígenes diferentes). No se traslada a otro dispositivo. Las sesiones anteriores con nombre global se migran únicamente si el usuario ya era miembro del evento.
- **En vivo:** WebSocket de Supabase Realtime para fotos nuevas y cambios del evento, con suscripciones filtradas por evento y autorizadas por RLS. Se agrupan notificaciones cercanas y se consulta nuevamente la página visible. No se obliga al usuario a abandonar su página actual. Si la conexión falla, se intenta recuperar y hay una consulta de respaldo cada 30 segundos; también se actualiza al volver a la pestaña. No se publican favoritos privados por WebSocket. La marca de Supabase no se muestra en la vista pública.
- **Descargas:** botón por foto y en la vista ampliada; ZIP de toda la galería o de todos los favoritos propios, incluyendo todas las páginas. Las imágenes se consultan desde Storage con la sesión del usuario. La lista de exportación usa paginación por UUID y un corte de fecha obtenido del servidor, de modo que fotos nuevas durante la preparación quedan para la próxima descarga. Los archivos se incluyen sin alterar sus bytes. Una galería grande se divide en paquetes de aproximadamente 100 MB y se muestran enlaces para guardar cada paquete. Puede cancelarse la preparación. Se recomienda preparar archivos grandes desde una computadora; los paquetes se crean en el navegador y necesitan memoria/espacio temporal. Se descargan las imágenes comprimidas existentes, no originales que nunca se almacenaron.
- **Portada:** subir JPG/PNG/WebP, previsualizar, mover el encuadre horizontal/vertical y acercar entre 1× y 3×. Se usa la misma normalización JPEG de las fotos. La portada se guarda privada en `event-covers/USUARIO/EVENTO/ARCHIVO.jpg`; los invitados solo pueden leer la portada de su evento. No se borra automáticamente una versión reemplazada para evitar romper descargas en curso; contabilízala al limpiar Storage.
- **Mensaje:** texto personalizado de hasta 1500 caracteres, con saltos de línea.
- **Búsqueda:** nombre, fecha escrita o rango de fechas Desde/Hasta, combinado con el filtro de activos/archivados.
- **Horario:** apertura opcional y cierre sin límite, en una fecha/hora determinada o 48 horas exactas después de la apertura. Los controles indican la zona horaria del dispositivo del fotógrafo y se almacenan como UTC (`timestamptz`). Los invitados ven esas horas en su propia zona.
- **Sin cron:** PostgreSQL comprueba `now()` en cada autorización de subida a Storage y al insertar los metadatos. Fuera de horario se rechazan cargas incluso si se llama directamente a la API o si el cliente conserva un botón antiguo. La galería, favoritos y descargas siguen disponibles; para bloquear todo el acceso se archiva el evento. Los eventos anteriores conservan su comportamiento sin horarios hasta que se configuren.

Validación adicional: `pnpm test:experience` comprueba identidad por evento, búsqueda, límites horarios, ZIP con todas las páginas, división de archivos y cancelación. `pnpm test:db` prueba las políticas reales con PostgreSQL embebido, incluyendo portadas privadas, descargas y bloqueo de cargas fuera de horario. Los WebSockets, CAPTCHA y Storage alojados deben verificarse después de ejecutar la migración y desplegar.

Prueba de aceptación: entra desde dos navegadores al mismo evento, sube una foto en uno y confirma que aparece en el otro; recarga al invitado y comprueba que no se pide el nombre; marca favoritos y descarga su ZIP; configura un cierre cercano y confirma que se bloquean subidas mientras siguen funcionando la galería y las descargas.

## Diseño, calendario, contacto e invitaciones

En una instalación que ya tiene las migraciones 001–003, ejecuta **solo** `supabase/migrations/202610270004_studio_and_categories.sql` y después despliega el código actualizado. Esta migración amplía las categorías con **Quinceañera** y **Otros**, y crea `studio_profiles` con permisos por fotógrafo. No introduce variables de entorno ni servicios nuevos.

### Contacto del estudio

En **Tu espacio → Contacto del estudio**, configura nombre, correo, WhatsApp con código internacional y dirección. Los datos son opcionales salvo el nombre; la información se comparte con los invitados de todos tus eventos. El botón **Contacto** de la vista pública abre el modal con correo, enlace de WhatsApp y dirección con enlace a mapas. Los enlaces solo se abren al pulsarlos; la app no envía mensajes automáticamente. Los invitados no pueden enumerar los perfiles ni editarlos; la función `event_contact` entrega únicamente el contacto del propietario de un evento al que tienen acceso.

### Invitación con QR

Fotógrafo e invitados pueden compartir el enlace y descargar una **invitación PNG de 1200 × 1600** con nombre del evento, mensaje configurado por el fotógrafo y QR. El código conserva margen blanco para facilitar el escaneo. El botón de compartir abre el menú nativo si existe; siempre queda la opción de copiar el enlace o descargar el PNG. Genera la invitación desde el dominio final antes de imprimirla: una invitación de localhost o preview no abre el evento de producción. No se publica nada automáticamente en WhatsApp u otras apps.

### Guardar en un celular

La web **no puede escribir directamente en la fototeca ni elegir por el usuario el destino del menú nativo**. Al pulsar la flecha de una foto, se prepara la imagen y aparecen botones separados **Guardar** y **Compartir**. En navegadores compatibles, cada pulsación abre el menú del sistema con una explicación de la acción que debe elegirse. El sistema ofrecerá Fotos, Archivos u otras aplicaciones según el dispositivo/navegador. En la foto individual no se ofrecen descarga de archivo ni ZIP. Si el navegador no permite compartir archivos, Guardar abre la imagen para mantenerla pulsada y elegir Guardar imagen (o usar clic derecho en computadora). Cancelar el menú no dispara una descarga automática.

La opción **Guardar fotos en el móvil** prepara toda la selección (galería o favoritos) por grupos de hasta 10 imágenes y aproximadamente 20 MB para abrir el menú nativo sin un ZIP. El usuario avanza y comparte cada grupo. Si el navegador no admite grupos, se ofrecen las imágenes individualmente. Un ZIP puede compartirse/guardarse como archivo si el sistema lo permite, pero **no se importa directamente en Fotos**: hay que extraer sus imágenes o usar la opción sin ZIP. No se garantiza el destino Fotos ni que todas las versiones de iOS/Android ofrezcan las mismas acciones; requiere prueba en un dispositivo real con HTTPS.

### Panel del fotógrafo

- Iconos SVG propios en lugar de símbolos que iOS transforma en emoji.
- Botones con estados de foco, interacción y controles táctiles; interruptor accesible para activar el evento.
- Portada con arrastre mediante mouse o dedo, zoom por rueda/trackpad, controles deslizantes y ajustes con flechas. El zoom tiene límite de 1×–3× y el encuadre queda dentro de 0–100%.
- Categorías en Tu espacio, combinadas con búsquedas por nombre/fecha y estados activo/archivado. Crear desde una categoría seleccionada la propone de forma predeterminada.
- Orden por creación reciente/antigua, fecha ascendente/descendente, nombre o cantidad de fotos.
- Calendario mensual que empieza en lunes, categorías por color, navegación de meses, botón Hoy, agenda de la fecha seleccionada y próximos eventos. En pantallas estrechas se simplifican las celdas y la agenda muestra los detalles. Este calendario vive dentro de la aplicación; no sincroniza con Outlook ni Google Calendar.

Las pruebas de experiencia incluyen ordenación, cuadrícula de calendario, años bisiestos, límites del arrastre y alternativas de Web Share. Las pruebas de PostgreSQL incluyen categorías nuevas y aislamiento de contacto entre fotógrafos/invitados. El menú de Fotos del sistema y el comportamiento de mouse/trackpad deben comprobarse también en los dispositivos de uso real.

## Ajuste: invitación del fotógrafo y acciones individuales

Aplica **solo** `supabase/migrations/202610270005_invitation_text.sql` si ya instalaste las migraciones 001–004, y después despliega el código nuevo. `events.invitation_text` guarda hasta 140 caracteres, con el mensaje predeterminado para eventos existentes. La política RLS del evento permite modificarlo únicamente al fotógrafo autorizado que lo posee.

En **Compartir evento y QR**, el fotógrafo dispone del editor y el botón **Guardar texto**. Ese mensaje persiste entre dispositivos y es el que usan los invitados al descargar/compartir la invitación. En la vista de invitados no se renderizan el editor ni el campo del enlace: solo la invitación y las acciones de copiar/compartir/descargar/abrir. Ocultar el campo no vuelve secreto el enlace: el QR y los botones lo necesitan para funcionar.

Se retiró la estrella decorativa de la invitación y de la marca en la interfaz; la acción de favoritos usa ahora un marcador.

Las fotos individuales usan **Guardar y compartir**, con una guía para elegir la acción dentro del menú nativo. **Guardar no escribe directamente en la fototeca de iOS**: la web debe abrir el menú nativo y el usuario elige Guardar imagen. Compartir abre ese mismo menú para seleccionar un destinatario o aplicación. Los navegadores no permiten preseleccionar esas acciones del sistema. No se ofrece una descarga de archivo o ZIP en el modal individual. Los ZIP siguen disponibles en la galería y favoritos para conjuntos completos.

Al pulsar Guardar fotografía desde la vista ampliada, se cierra el zoom antes de abrir el modal de opciones. Así solo queda un modal de fotografía abierto. La opción móvil por grupos usa también Guardar y compartir; cuando el navegador no admite grupos, ofrece las acciones individuales.

Verificado con PostgreSQL embebido: persistencia, límite de longitud y rechazo de cambios de texto por invitados. Verificado en navegador de prueba: ausencia de editor/campo de enlace para invitados, dos botones individuales y un único modal al pasar del zoom a las opciones. La elección de Guardar imagen en el menú nativo debe comprobarse en iOS/Android real.

## Ajuste de interfaz: acción unificada y desplazamiento móvil

Las fotografías individuales y los grupos vuelven a usar un solo botón **Guardar y compartir** para abrir el menú nativo. El guardado directo en la fototeca continúa dependiendo del sistema. En navegadores que no permiten compartir archivos, se conserva la alternativa de abrir la imagen y guardarla desde su menú contextual. El botón **Mis favoritos** usa el mismo marcador que las tarjetas.

Se limita el rebote fuera del contenido y el desbordamiento horizontal de la página, se usan alturas de viewport dinámicas en los modales y se bloquea el desplazamiento del fondo mientras están abiertos. Al cerrarlos se restaura la posición de lectura; la galería mantiene su desplazamiento normal para recorrer todas las fotografías. Los campos móviles usan 16 px para evitar el zoom automático al escribir. Estos cambios no añaden ninguna migración de base de datos.

Moderación de fotos y álbum curado siguen siendo propuestas, no funciones implementadas por este ajuste.

## Apertura, cierre y archivo automático

Si ya aplicaste 001–005, ejecuta **solo** `supabase/migrations/202610270006_automatic_archive.sql` en el SQL Editor de Supabase y despliega el código actualizado en Vercel. No requiere nuevas variables. Los eventos existentes conservan su configuración; los nuevos proponen apertura a las **00:00 de la fecha del evento, en la zona horaria del dispositivo del fotógrafo**, cierre 48 horas después y archivo automático habilitado. La apertura puede editarse; «Usar fecha del evento» restaura el valor automático. Las 48 horas se cuentan como tiempo transcurrido desde la apertura elegida.

El archivo conserva las fotos y el acceso del propietario, y cierra el acceso de invitados, igual que el archivo manual. Puedes desactivar el archivo automático o elegir otro cierre. La migración instala `pg_cron` cuando está disponible y programa `romeo-archive-expired-events` cada minuto. Comprueba que figure en **Supabase → Integrations → Cron**. Si el SQL muestra que pg_cron no está disponible, habilita Cron y programa `select app_private.archive_expired_events()` cada minuto. La función solo puede ejecutarla el administrador de base de datos/Cron, nunca los invitados ni fotógrafos desde el navegador.

Las políticas RLS retiran el acceso de invitados exactamente al vencer el plazo, aunque el trabajo de Cron todavía no haya actualizado `active`. El panel también reconoce el plazo vencido; Cron persiste el estado archivado. La nueva marca `archive_after_close` queda desactivada en eventos existentes para no cambiar su acceso sin editar sus ajustes.

El login usa centrado adaptable al viewport móvil, márgenes seguros, campos sin desbordamiento y CAPTCHA compacto cuando no cabe el formato flexible. En pantallas bajas permite desplazar el formulario.

## Archivo con consulta durante 30 días (sustituye el cierre inmediato de 006)

Si ya aplicaste las migraciones 001–006, ejecuta **solo** `supabase/migrations/202610270007_archive_read_only.sql` en el SQL Editor de Supabase **antes de desplegar** el código nuevo en Vercel. Si falta 006, aplícala primero. No requiere nuevas variables ni otro trabajo Cron: se conserva el archivo automático existente y la caducidad de consulta la aplican las políticas RLS en cada petición.

- **Activo:** mantiene los permisos y horarios de subida configurados.
- **Archivado:** invitados existentes y nuevos con el enlace pueden consultar y descargar, incluidas sus selecciones previas de favoritos y los ZIP. No pueden subir fotos ni añadir/quitar reacciones o favoritos. El fotógrafo conserva sus permisos.
- **30 días después del archivo:** se cierran las nuevas consultas y descargas de invitados, tanto desde la interfaz como por API/RLS, incluidos originales y portadas en Storage. El propietario conserva acceso. La galería muestra el vencimiento y las tarjetas del estudio indican cuándo terminó la consulta.

Un mes se define aquí como **30 días exactos (720 horas)**. `archived_at` lo registra un trigger de PostgreSQL; el navegador no tiene permiso para modificarlo. Para el archivo automático se usa `uploads_close_at`, incluso si Cron se ejecuta con retraso. Para el manual se usa la hora del servidor al desactivar el evento. Editar el título, portada u otros datos de un evento ya archivado no reinicia el plazo. Reactivar elimina la marca de archivo; para volver a abrir subidas también hay que ajustar un cierre vencido o desactivar su archivo automático.

Los eventos que ya estaban archivados manualmente no tienen fecha histórica recuperable: su plazo comienza al aplicar 007. Los archivados automáticamente toman su fecha de cierre original; si esta fue hace más de 30 días, su consulta ya habrá vencido. «Retirar evento» sigue cerrando inmediatamente todo acceso de invitados, sin esperar los 30 días.

**Retención de archivos:** caducar el acceso no borra imágenes ni libera espacio. Este ajuste deja la eliminación bajo control del fotógrafo/administrador para hacer limpieza después de entregar y respaldar el material. Al limpiar, deben retirarse los objetos de `event-photos` y las portadas de `event-covers` mediante la API de Storage, además de sus registros relacionados; borrar únicamente filas de PostgreSQL no elimina los archivos del bucket. Las URL firmadas ya emitidas pueden funcionar hasta su vencimiento (actualmente hasta 15 minutos); las fotos que alguien ya descargó quedan fuera del control de la web.

La portada de invitados ahora tiene dimensiones y posición absolutas dentro de su contenedor: el navegador móvil usa la altura completa de la portada y respeta `cover_x`, `cover_y` y `cover_zoom`. El formato de pantalla sigue cambiando cuánto se recorta por `object-fit: cover`; conserva el punto de encuadre y el zoom, sin deformar la fotografía. Verificado en navegador a 390 px con encuadre personalizado y en PostgreSQL con autenticación/Storage simulados. También conviene revisar la portada final en el iPhone de uso real.

## Ubicación exacta por enlace de Maps

En **Contacto del estudio → Enlace de Google Maps**, pega el enlace que obtienes en Google Maps mediante **Compartir → Copiar enlace**. Se aceptan enlaces HTTPS de Google Maps (incluidos `maps.app.goo.gl` y `goo.gl/maps`) de hasta 500 caracteres. Es opcional. Los invitados verán **Abrir ubicación en Google Maps** y abrirán directamente ese enlace, sin reconstruir una búsqueda con la dirección.

No requiere migración ni variables nuevas: se reutiliza `studio_profiles.address`. Las direcciones anteriores siguen mostrándose con su búsqueda anterior hasta que el fotógrafo las reemplace; al guardar el contacto, la ubicación debe ser un enlace válido o quedar vacía. Despliega el código actualizado en Vercel y guarda el enlace desde el panel.

## Google Drive como almacenamiento privado

Implementado para una cuenta dedicada y un fotógrafo: nuevas fotos/portadas en Drive, archivos existentes de Supabase compatibles, exportaciones combinadas, conexión OAuth desde **Almacenamiento** y consulta de espacio. Requiere **migración 008, variables de servidor y autorización de la cuenta de Google**; desplegar no basta para conectar. No migra ni elimina archivos existentes y aún no habilita videos.

Sigue [la guía de instalación de Google Drive](docs/google-drive.md) para configurar Google Cloud, Supabase y Vercel. Pruebas de API: `npm run test:drive` con Node 22 o superior.

## Cloudflare R2 (proveedor recomendado para nuevas subidas)

Selecciona `NEXT_PUBLIC_STORAGE_PROVIDER=r2`, aplica **009** después de **008** y configura el bucket privado y las cuatro credenciales `R2_*`, además de la clave de servidor de Supabase. No requiere OAuth ni variables de Google. Se mantiene la lectura de archivos históricos de Supabase y Drive, con los permisos y las descargas existentes.

Sigue [la guía de Cloudflare R2](docs/cloudflare-r2.md). El código no mueve ni elimina automáticamente archivos anteriores. Pruebas: `npm run test:storage` (el alias `test:drive` se conserva para compatibilidad).
