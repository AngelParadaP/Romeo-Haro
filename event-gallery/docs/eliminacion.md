# Eliminar fotografías y eventos junto con sus archivos

## Activar

Después de las migraciones 001–009, aplica **solo** `supabase/migrations/202610280010_permanent_deletion.sql` en el SQL Editor de Supabase y despliega el código actualizado. La migración debe aplicarse **antes** de usar el nuevo código: las subidas externas también necesitan su protección de admisión.

No se añaden variables ni un Cron. Se reutilizan la clave de servidor de Supabase y las credenciales de cada proveedor que tenga archivos. El almacenamiento debe permitir borrar y enumerar objetos (R2: Object Read & Write limitado al bucket).

## Uso

- Entra como fotógrafo propietario y pulsa la **papelera** de una foto, en su tarjeta o vista ampliada. La confirmación explica que se borrarán el archivo, la foto, sus favoritos y sus reacciones.
- Para un evento, abre **Editar → Eliminar evento y sus archivos** y confirma. Se borran sus fotos, portadas actuales y anteriores, archivos sin vincular que se encuentren en sus carpetas, invitados del evento y registros asociados.
- Los invitados no ven estos controles y tampoco pueden invocar los endpoints. Un fotógrafo no puede eliminar eventos de otro.
- Los eventos retirados con versiones anteriores aparecen como **Eventos retirados con archivos por revisar**. Cada limpieza requiere confirmación; actualizar la app no los elimina automáticamente.

**La eliminación es permanente, no una papelera.** Archivar continúa siendo una función distinta: cierra subidas y deja 30 días de consulta, sin borrar archivos automáticamente.

## Qué ocurre durante la limpieza

1. Se verifica la sesión y la propiedad del evento en PostgreSQL. Se guarda una operación privada y se oculta el elemento inmediatamente; se bloquean nuevas subidas si se trata de un evento.
2. Si había subidas externas en curso, se espera a que terminen. Las admisiones caducan a los 90 segundos para permitir continuar después de una petición interrumpida. El bloqueo del evento y la admisión de nuevas subidas se coordinan con bloqueos de fila.
3. Se prepara un manifiesto de archivos a borrar. En eventos se revisan registros y prefijos físicos de R2 y Supabase, incluidas portadas reemplazadas y subidas huérfanas. Las carpetas están limitadas al UUID del evento y su propietario; no se toca el resto del bucket.
4. Se borran archivos por lotes, guardando el avance tras cada uno. R2 usa DELETE de objetos, Supabase usa la API de Storage y los archivos antiguos de Drive usan eliminación permanente, no envío a la papelera.
5. Solo después de confirmar el borrado de todos los archivos se eliminan los registros. Las claves foráneas eliminan favoritos, reacciones e invitados correspondientes; se retiran los registros privados de almacenamiento, las admisiones y la operación de limpieza terminada.

## Fallos y reintentos

Los servicios de archivos y PostgreSQL no comparten una transacción. Si se pierde conexión o un proveedor falla, la operación conserva su manifiesto y avance; no se anuncia como completa ni se descartan las referencias que faltan por limpiar. Puede haber archivos ya borrados y otros pendientes.

En el panel aparecerá **Continuar limpieza**. Reintenta cuando se restablezca el servicio. Si cerraste el navegador, vuelve al panel para continuar; esta versión no ejecuta trabajos en segundo plano con la página cerrada. Las solicitudes duplicadas reutilizan la operación y los trabajadores usan un bloqueo temporal para evitar procesarla simultáneamente.

Los archivos antiguos de **Google Drive** siguen necesitando la autorización y variables de ese Drive para eliminarlos físicamente. Si se retiraron sus credenciales, la operación quedará pendiente hasta restaurarlas/reconectar la cuenta original. No se finge que fueron borrados ni se eliminan sus referencias a ciegas. Si falta el identificador privado de un archivo, se pide revisión.

Las cuentas de Supabase Auth y el contacto del estudio se conservan porque pueden utilizarse en otros eventos. Los archivos que alguien ya descargó a su dispositivo quedan fuera del control de la aplicación. Borrar un evento tampoco puede eliminar copias que hayas movido manualmente fuera de sus carpetas o a otros servicios no registrados en la app.

## Validación

Las pruebas de PostgreSQL incluyen propiedad, bloqueo de invitados, ocultación inmediata, revocación de acceso, espera de subidas en curso, finalización tras confirmar los archivos y eliminación en cascada. Las pruebas de API simulan errores, reintentos, lotes y descubrimiento de portadas anteriores/archivos huérfanos. No eliminan fotos ni eventos reales.

```sh
npm run test:db
npm run test:storage
npm run test:experience
npm run build
```

## Actualización 011: Drive opcional

Si ya no utilizas Drive y su tabla `drive_objects` fue retirada, aplica **solo** `supabase/migrations/202610280011_optional_drive_cleanup.sql` después de la 010. Después actualiza el código y pulsa **Continuar limpieza**. La migración actualiza la función de finalización; no inicia eliminaciones ni recrea tablas antiguas.

El progreso existente se reutiliza. Una foto cuyo archivo ya fue eliminado solo necesita finalizar sus registros. La enumeración de R2 y Supabase ya no exige que exista la tabla de Drive. Si todavía hay referencias reales a archivos de Drive, la limpieza exige verificarlas y no las descarta silenciosamente. Los errores de la fase final muestran ahora un código de base de datos o el paso de actualización necesario.
