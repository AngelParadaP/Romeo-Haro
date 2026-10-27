# Romeo Haro · Galerías de eventos

Prototipo local en Next.js 16, React y TypeScript. Ejecuta `npm install` y `npm run dev` desde esta carpeta.

Incluye creación, edición, archivo y eliminación de eventos, búsqueda, filtros, enlace directo por evento, nombre del invitado, carga de JPG/PNG/WebP, selector de cámara móvil, compresión de fotos, galería paginada, ampliación, likes y favoritos por identidad del navegador.

## Límites de esta versión

Los datos se guardan en localStorage. Los eventos y fotografías no se sincronizan entre dispositivos. La identidad del invitado persiste solo en el mismo navegador; borrar sus datos elimina esa identidad. Las portadas de muestra usan imágenes externas de Unsplash. Se aceptan hasta 10 imágenes por carga y 12 MB por imagen; el almacenamiento disponible depende del navegador.

El panel es una demostración sin autenticación. No publicar como plataforma de producción. Pendiente: autenticación del fotógrafo, base de datos y almacenamiento compartido con permisos, portadas personalizadas y QR real. El parámetro `?evento=ID` muestra la vista de invitado, pero no representa una barrera de seguridad.

Para producción se recomienda conservar esta interfaz y conectar Supabase Auth, PostgreSQL y Storage, aplicar políticas RLS por propietario/evento y sesiones verificadas para invitados. Los enlaces empezarán a funcionar entre dispositivos cuando los datos residan en el servidor.
