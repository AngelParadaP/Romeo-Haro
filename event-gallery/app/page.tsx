"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import type { GalleryEvent as Event, Photo } from "@/lib/types";
import { cloudConfigured, demoEnabled, supabase, startSession, loadEvents, persistEvent, removeEvent, loadGallery, uploadPhoto, toggleReaction } from "@/lib/cloud";
import { Access } from "@/components/access";
import { ShareDialog } from "@/components/share-dialog";

const images = ["photo-1519741497674-611481863552", "photo-1511795409834-ef04bbd61622", "photo-1464366400600-7168b8af9bc3"];
const pic = (i: number) => `https://images.unsplash.com/${images[i % 3]}?auto=format&fit=crop&w=1200&q=85`;
const initial: Event[] = [
  { id: "ana-y-carlos", title: "Ana & Carlos", date: "2026-11-14", category: "Boda", cover: pic(0), active: true, photos: [] },
  { id: "una-noche-para-recordar", title: "Una noche para recordar", date: "2026-12-05", category: "Celebración", cover: pic(1), active: true, photos: [] },
  { id: "mesa-compartida", title: "La magia de reunirnos", date: "2026-10-18", category: "Encuentro", cover: pic(2), active: false, photos: [] },
];
const key = "romeo-events-v1";
const dateLabel = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

async function readPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Selecciona imágenes JPG, PNG o WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Cada fotografía debe pesar menos de 12 MB.");
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

export default function Home() {
  const [events, setEvents] = useState<Event[]>(cloudConfigured ? [] : initial);
  const [ready, setReady] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [publicView, setPublicView] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [guestEntry, setGuestEntry] = useState(false);
  const [initError, setInitError] = useState("");
  const [gallery, setGallery] = useState<{ photos: Photo[]; total: number }>({ photos: [], total: 0 });
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [shareEvent, setShareEvent] = useState<Event | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    const route = async () => {
      const id = new URLSearchParams(location.search).get("evento");
      setSelected(id); setPublicView(!!id); setPage(1); setReady(false); setInitError("");
      try {
        if (cloudConfigured) {
          if (id) { setGuestEntry(true); return; }
          const session = await startSession(null);
          if (!alive) return;
          setAdmin(session.admin); setGuestId(session.userId); setEvents(session.events);
        } else if (demoEnabled) {
          const saved = localStorage.getItem(key);
          if (saved) setEvents(JSON.parse(saved));
          let guest = localStorage.getItem("romeo-guest-id");
          if (!guest) { guest = crypto.randomUUID(); localStorage.setItem("romeo-guest-id", guest); }
          setGuestId(guest);
        }
        setName(localStorage.getItem("romeo-guest-name") || "");
        if (alive) setReady(true);
      } catch (err) { if (alive) setInitError(err instanceof Error ? err.message : "No se pudo conectar."); }
    };
    void route(); window.addEventListener("popstate", route);
    return () => { alive = false; window.removeEventListener("popstate", route); };
  }, []);
  useEffect(() => {
    if (!cloudConfigured || !ready || !selected) return;
    let alive = true;
    const fetchPage = async () => {
      setGalleryLoading(true); setGalleryError("");
      try { const result = await loadGallery(selected, page, favoriteOnly, guestId); if (alive) setGallery(result); }
      catch (err) { if (alive) { setGallery({ photos: [], total: 0 }); setGalleryError(err instanceof Error ? err.message : "No se pudo cargar la galería."); } }
      finally { if (alive) setGalleryLoading(false); }
    };
    void fetchPage();
    const timer = setInterval(fetchPage, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [selected, page, favoriteOnly, ready, guestId, refresh]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4500); return () => clearTimeout(t); }, [toast]);
  async function save(next: Event[]) {
    try {
      if (cloudConfigured) {
        const removed = events.find(event => !next.some(item => item.id === event.id));
        if (removed) await removeEvent(removed.id);
        else {
          const changed = next.find(event => events.find(item => item.id === event.id) !== event);
          if (changed) await persistEvent(changed, events.some(item => item.id === changed.id));
        }
        setEvents(next);
      } else { localStorage.setItem(key, JSON.stringify(next)); setEvents(next); }
      return true;
    } catch (err) { setToast(err instanceof Error ? err.message : "No se pudo guardar el cambio."); return false; }
  }
  const current = events.find(e => e.id === selected);
  const update = (event: Event) => save(events.map(e => e.id === event.id ? event : e));
  function openEvent(id: string) { setSelected(id); setFavoriteOnly(false); setPage(1); setGallery({ photos: [], total: 0 }); }
  function share(event: Event) { setShareEvent(event); }
  async function addPhotos(files: FileList | null) {
    if (!files || !current || busy) return;
    if (!name.trim()) { setToast("Escribe tu nombre antes de subir tus fotos."); return; }
    if (files.length > 10) { setToast("Sube hasta 10 fotografías a la vez."); return; }
    setBusy(true);
    try {
      if (cloudConfigured) {
        let completed = 0;
        try {
          for (const file of Array.from(files)) { await uploadPhoto(current.id, guestId, name.trim(), await readPhoto(file)); completed++; }
          setToast(`${completed} fotografías compartidas.`);
        } catch (err) { throw new Error(`${completed} fotografías guardadas. ${err instanceof Error ? err.message : "La carga se interrumpió."}`); }
        finally { setPage(1); setRefresh(value => value + 1); setEvents(await loadEvents(publicView ? selected : null)); }
      } else {
        const photos = await Promise.all(Array.from(files).map(async file => ({ id: crypto.randomUUID(), src: await readPhoto(file), author: name.trim(), likes: [], favorites: [] })));
        if (await update({ ...current, photos: [...photos, ...current.photos] })) { setPage(1); setToast("Tus recuerdos ya están en la galería."); }
      }
    } catch (error) { setToast(error instanceof Error ? error.message : "No se pudo cargar la imagen."); }
    finally { setBusy(false); if (upload.current) upload.current.value = ""; if (camera.current) camera.current.value = ""; }
  }
  async function react(photo: Photo, field: "likes" | "favorites") {
    if (!current || busy) return;
    if (cloudConfigured) {
      setBusy(true);
      try { await toggleReaction(photo.id, field, photo[field].includes(guestId), guestId); setRefresh(value => value + 1); }
      catch (err) { setToast(err instanceof Error ? err.message : "No se pudo guardar la reacción."); }
      finally { setBusy(false); }
      return;
    }
    const values = photo[field].includes(guestId) ? photo[field].filter(id => id !== guestId) : [...photo[field], guestId];
    update({ ...current, photos: current.photos.map(p => p.id === photo.id ? { ...p, [field]: values } : p) });
  }
  const visible = events.filter(e => e.title.toLowerCase().includes(query.toLowerCase()) && (filter === "Todos" || (filter === "Activos" ? e.active : !e.active)));
  const localPhotos = current?.photos.filter(p => !favoriteOnly || p.favorites.includes(guestId)) || [];
  const photos = cloudConfigured ? gallery.photos : localPhotos;
  const photoTotal = cloudConfigured ? gallery.total : photos.length;
  const shownPhotos = cloudConfigured ? photos : photos.slice((page - 1) * 12, page * 12);
  if (!cloudConfigured && !demoEnabled) return <div className="access-shell"><section className="access-card"><h1>Conecta tu estudio</h1><p>Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel y vuelve a desplegar. La demo está desactivada en producción.</p></section></div>;
  if (cloudConfigured && guestEntry) return <Access guest onGuest={async (guestName, captcha) => {
    const session = await startSession(selected, captcha || undefined);
    setGuestId(session.userId); setAdmin(session.admin); setEvents(session.events); setName(guestName);
    try { localStorage.setItem("romeo-guest-name", guestName); } catch {}
    setGuestEntry(false); setReady(true);
  }} />;
  if (cloudConfigured && initError) return <div className="access-shell"><section className="access-card"><h1>No pudimos conectar</h1><p role="alert">{initError}</p><button className="primary" onClick={() => location.reload()}>Reintentar</button></section></div>;
  if (cloudConfigured && !ready) return <div className="access-shell"><p role="status">Conectando con tu estudio…</p></div>;
  if (cloudConfigured && !publicView && !admin) return <Access onLogin={async () => {
    const session = await startSession(null); setAdmin(session.admin); setGuestId(session.userId); setEvents(session.events); setReady(true);
  }} />;
  return <div className="app-shell">
    {!publicView && <aside className="sidebar"><a className="brand" href="/">r<span>h</span><i>✳</i></a><div className="studio">ROMEO HARO<span>ESTUDIO FOTOGRÁFICO</span></div><div className="nav-label">TU ESPACIO</div><button className={!selected ? "nav-item active" : "nav-item"} onClick={() => setSelected(null)}><span>▦</span> Mis eventos <small>{events.length}</small></button><div className="sidebar-note"><span>✧</span><p>Los mejores recuerdos<br />se construyen juntos.</p><small>Crea. Comparte. Revive.</small></div><div className="profile"><b>RH</b><div>Romeo Haro<small>{cloudConfigured ? "Fotógrafo · Conectado" : "Fotógrafo · Demo local"}</small></div><span>⌄</span></div></aside>}
    <div className={publicView ? "workspace public" : "workspace"}>
      <header><span>{publicView ? "ROMEO HARO / RECUERDOS COMPARTIDOS" : "Mi estudio"}{!publicView && <span className="breadcrumb"> / {current ? current.title : "Mis eventos"}</span>}</span><div><span className="local-pill"><i /> {cloudConfigured ? "Supabase conectado" : "Demo local"}</span><span className="avatar">RH</span>{cloudConfigured && !publicView && <button className="logout" onClick={async () => { const result = await supabase().auth.signOut(); if (result.error) setToast(result.error.message); else location.reload(); }}>Salir</button>}</div></header>
      <main>
      {publicView && (!current || !current.active) ? <section className="empty"><h1>Este evento no está disponible</h1><p>Puede estar archivado, eliminado o no estar disponible.</p>{!cloudConfigured && <p>Esta versión de prueba no sincroniza eventos entre dispositivos.</p>}</section> : current ? <>
        {!publicView && <button className="back" onClick={() => setSelected(null)}>← Volver a mis eventos</button>}
        <section className="event-hero" style={{ backgroundImage: `linear-gradient(0deg,rgba(23,29,24,.8),rgba(23,29,24,.08)),url("${current.cover}")` }}><span className="eyebrow">{current.category} · {dateLabel(current.date)}</span><h1>{current.title}</h1><p>Un día especial. Todas las miradas. Un mismo recuerdo.</p>{!publicView && <button className="light-button" onClick={() => share(current)}>▦ Compartir y QR</button>}</section>
        <section className="upload-panel"><div><span className="eyebrow">CADA MIRADA CUENTA</span><h2>Comparte tu parte de la historia.</h2><p>Las fotos que subas serán visibles para quienes accedan al evento.</p></div><div className="upload-actions"><input aria-label="Tu nombre" placeholder="¿Cómo te llamas?" maxLength={60} value={name} onChange={e => { setName(e.target.value); try { localStorage.setItem("romeo-guest-name", e.target.value); } catch {} }} /><div><button className="primary" disabled={busy || !current.active} onClick={() => upload.current?.click()}>↑ {busy ? "Subiendo…" : "Subir fotos"}</button><button className="secondary" disabled={busy || !current.active} onClick={() => camera.current?.click()}>◎ Tomar foto</button></div><input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => addPhotos(e.target.files)} /><input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => addPhotos(e.target.files)} /></div></section>
        <div className="gallery-toolbar"><h2>Los recuerdos <span>{current.photoCount ?? current.photos.length}</span></h2><div className="tabs"><button className={!favoriteOnly ? "chosen" : ""} onClick={() => { setFavoriteOnly(false); setPage(1); }}>Todas las fotos</button><button className={favoriteOnly ? "chosen" : ""} onClick={() => { setFavoriteOnly(true); setPage(1); }}>♡ Mis favoritos</button>{cloudConfigured && <button disabled={galleryLoading} onClick={() => setRefresh(value => value + 1)}>↻ Actualizar</button>}</div></div>
        {cloudConfigured && (galleryLoading || galleryError) ? <section className="empty"><p role={galleryError ? "alert" : "status"}>{galleryError || "Cargando recuerdos…"}</p>{galleryError && <button className="secondary" onClick={() => setRefresh(value => value + 1)}>Reintentar</button>}</section> : photos.length ? <div className="photo-grid">{shownPhotos.map(photo => <article className="photo-card" key={photo.id}><button className="photo-open" onClick={() => setLightbox(photo)}><img src={photo.src} alt={`Recuerdo de ${photo.author}`} /></button><div><span>{photo.author}</span><button aria-label="Me gusta" aria-pressed={photo.likes.includes(guestId)} onClick={() => react(photo, "likes")}>{photo.likes.includes(guestId) ? "♥" : "♡"} {photo.likeCount ?? photo.likes.length}</button><button aria-label="Guardar favorito" aria-pressed={photo.favorites.includes(guestId)} onClick={() => react(photo, "favorites")}>{photo.favorites.includes(guestId) ? "★" : "☆"}</button></div></article>)}</div> : <section className="empty"><span>▧</span><h2>{favoriteOnly ? "Tus favoritos vivirán aquí" : "La primera foto inicia la historia"}</h2><p>{favoriteOnly ? "Marca una fotografía con la estrella para guardarla." : "Sube un recuerdo y dale vida a esta galería."}</p></section>}
        {photoTotal > 12 && <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>← Anterior</button><span>{page} / {Math.ceil(photoTotal / 12)}</span><button disabled={page * 12 >= photoTotal} onClick={() => setPage(page + 1)}>Siguiente →</button></div>}
      </> : <>
        <div className="page-heading"><div><span className="eyebrow">RECUERDOS QUE SE QUEDAN</span><h1>Mis eventos<span>.</span></h1><p>Cada celebración, una historia contada entre todos.</p></div><button className="primary" disabled={!ready} onClick={() => { setEditing(null); setModal(true); }}>＋ Crear evento</button></div>
        <section className="welcome"><div><span className="eyebrow">DETRÁS DE CADA FOTO, UNA HISTORIA</span><h2>Tú creas el momento.<br /><em>Ellos suman su mirada.</em></h2><p>Un espacio para reunir las fotos de todos tus invitados.<br />Crea un evento y deja que los recuerdos lleguen.</p><button onClick={() => { setEditing(null); setModal(true); }}>Comienza una nueva historia <span>↗</span></button></div><div className="welcome-image"><img src={pic(0)} alt="Celebración de una boda al aire libre" /><div className="image-caption">momentos que merecen quedarse <span>✧</span></div></div></section>
        <section className="stats"><div><span>▦</span><p>Total de eventos<b>{events.length.toString().padStart(2, "0")}</b></p></div><div><span>◉</span><p>Eventos activos<b>{events.filter(e => e.active).length.toString().padStart(2, "0")}</b></p></div><div><span>▧</span><p>Fotografías compartidas<b>{events.reduce((n, e) => n + (e.photoCount ?? e.photos.length), 0).toString().padStart(2, "0")}</b></p></div></section>
        <div className="section-heading"><h2>Tus historias <span>{events.length}</span></h2><label className="search">⌕ <input placeholder="Buscar un evento…" aria-label="Buscar un evento" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="list-toolbar"><div className="tabs">{["Todos", "Activos", "Archivados"].map(f => <button className={filter === f ? "chosen" : ""} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div><span>Ordenados por creación</span></div>
        <div className="event-grid">{visible.map(event => <article className="event-card" key={event.id}><button className="event-cover" onClick={() => openEvent(event.id)}><img src={event.cover} alt={event.title} /><span className={event.active ? "status" : "status archived"}><i />{event.active ? "Activo" : "Archivado"}</span><span className="cover-arrow">↗</span></button><div className="event-info"><span className="eyebrow">{event.category}</span><button className="event-title" onClick={() => openEvent(event.id)}>{event.title}</button><p>◷ {dateLabel(event.date)}</p><div className="card-bottom"><span>▧ {event.photoCount ?? event.photos.length} fotografías</span><button aria-label={`Compartir enlace y QR de ${event.title}`} onClick={() => share(event)}>↗</button><button aria-label={`Editar ${event.title}`} onClick={() => { setEditing(event.id); setModal(true); }}>✎</button></div></div></article>)}</div>{!visible.length && <div className="empty"><h2>No hay eventos para mostrar</h2><p>Prueba otra búsqueda o crea una nueva historia.</p></div>}
      </>}
      <footer><span>ROMEO HARO <i>✳</i></span><p>Hecho para vivirlo. Creado para recordarlo.</p><small>{cloudConfigured ? "Galería compartida · Sesión protegida por Supabase" : "Prototipo · Datos guardados en este navegador"}</small></footer>
      </main>
    </div>
    {shareEvent && <ShareDialog id={shareEvent.id} title={shareEvent.title} local={!cloudConfigured} onClose={() => setShareEvent(null)} />}
    {modal && <div className="overlay" onClick={() => setModal(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button className="close" aria-label="Cerrar" onClick={() => setModal(false)}>×</button><span className="eyebrow">UNA NUEVA HISTORIA</span><h2 id="modal-title">{editing ? "Editar evento" : "Crea un momento inolvidable."}</h2><form key={editing || "new"} onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); const data = new FormData(e.currentTarget); const old = events.find(v => v.id === editing); const event: Event = { id: old?.id || crypto.randomUUID(), title: String(data.get("title")).trim(), date: String(data.get("date")), category: String(data.get("category")), cover: old?.cover || pic(events.length), active: data.get("active") === "on", photos: old?.photos || [], photoCount: old?.photoCount }; if (!event.title) { setBusy(false); return; } if (await save(old ? events.map(v => v.id === old.id ? event : v) : [event, ...events])) { setModal(false); setToast(old ? "Evento actualizado." : "Tu nueva historia está lista."); } setBusy(false); }}><label>Nombre del evento<input name="title" required maxLength={100} defaultValue={events.find(e => e.id === editing)?.title} placeholder="Ej. La boda de Ana & Carlos" autoFocus /></label><label>Fecha<input name="date" type="date" required defaultValue={events.find(e => e.id === editing)?.date} /></label><label>Tipo de evento<select name="category" defaultValue={events.find(e => e.id === editing)?.category || "Boda"}><option>Boda</option><option>Cumpleaños</option><option>Celebración</option><option>Encuentro</option></select></label><label className="checkbox"><input type="checkbox" name="active" defaultChecked={events.find(e => e.id === editing)?.active ?? true} /> Evento activo · permitir subir fotografías</label><button className="primary" type="submit" disabled={busy}>{editing ? "Guardar cambios" : "Crear evento"} ↗</button>{editing && <button className="danger" type="button" onClick={async () => { if (busy) return; if (confirm(cloudConfigured ? "¿Retirar este evento? Dejará de ser accesible para invitados. Los archivos se conservan hasta su limpieza en Storage." : "¿Eliminar este evento y todas sus fotos?")) { setBusy(true); if (await save(events.filter(e => e.id !== editing))) { setModal(false); setSelected(null); } setBusy(false); } }}>{cloudConfigured ? "Retirar evento" : "Eliminar evento y sus fotos"}</button>}</form></section></div>}
    {lightbox && <div className="overlay lightbox" role="dialog" aria-label="Fotografía ampliada" onClick={() => setLightbox(null)}><button className="close" aria-label="Cerrar fotografía" onClick={() => setLightbox(null)}>×</button><img src={lightbox.src} alt={`Fotografía de ${lightbox.author}`} /></div>}
    {toast && <div className="toast" role="status">{toast}<button aria-label="Cerrar aviso" onClick={() => setToast("")}>×</button></div>}
  </div>;
}
