"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryEvent as Event, Photo } from "@/lib/types";
import { cloudConfigured, demoEnabled, supabase, startSession, existingUser, loadEvents, persistEvent, removeEvent, loadGallery, uploadPhoto, toggleReaction, uploadCover, discardCover } from "@/lib/cloud";
import { Access } from "@/components/access";
import { readPhoto } from "@/lib/media";
import { rememberGuest, rememberedGuest, uploadStatus, matchesEvent, eventCategories, sortEvents, type EventSort } from "@/lib/event-utils";
import { EventEditor, CoverImage } from "@/components/event-editor";
import { DownloadPanel } from "@/components/download-panel";
import {Icon} from "@/components/icon";
import {ContactDialog} from "@/components/contact-dialog";
import {FileSaveDialog} from "@/components/file-save-dialog";
import {EventCalendar} from "@/components/event-calendar";
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


export default function Home() {
  const [events, setEvents] = useState<Event[]>(cloudConfigured ? [] : initial);
  const [ready, setReady] = useState(false);
  const [guestId, setGuestId] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [publicView, setPublicView] = useState(false);
  const [view,setView]=useState<'list'|'calendar'>('list');
  const [category,setCategory]=useState('all');
  const [order,setOrder]=useState<EventSort>('created-desc');
  const [contactOpen,setContactOpen]=useState(false);
  const [savingPhoto,setSavingPhoto]=useState<Photo|null>(null);
  const closeContact=useCallback(()=>setContactOpen(false),[]);
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateUntil, setDateUntil] = useState("");
  const [now, setNow] = useState(0);
  const [realtime, setRealtime] = useState("connecting");
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
  const closeShare = useCallback(()=>setShareEvent(null),[]);
  const galleryKey = useRef("");
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    const route = async () => {
      const id = new URLSearchParams(location.search).get("evento");
      setSelected(id); setPublicView(!!id); setPage(1); setReady(false); setInitError("");
      try {
        if (cloudConfigured) {
          if (id) {
            const existing = await existingUser();
            let savedName = existing ? rememberedGuest(id, existing.id) : "";
            // Migrate the previous global display name only for an existing membership.
            if(!savedName && existing){
              let legacy="";try{legacy=localStorage.getItem("romeo-guest-name")?.trim()||"";}catch{}
              if(legacy){const membership=await supabase().from("event_guests").select("event_id").eq("event_id",id).eq("user_id",existing.id).maybeSingle();if(membership.data){savedName=legacy;rememberGuest(id,existing.id,legacy);}}
            }
            if (!savedName) { if (alive) setGuestEntry(true); return; }
            const session = await startSession(id);
            if (!alive) return;
            setName(savedName);setAdmin(session.admin);setGuestId(session.userId);setEvents(session.events);setGuestEntry(false);setReady(true);return;
          }
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
  useEffect(() => { setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer); }, []);
  useEffect(() => {
    if (!cloudConfigured || !ready || !selected) return;
    let disposed=false;let debounce: ReturnType<typeof setTimeout> | undefined;
    const changed=()=>{
      clearTimeout(debounce);debounce=setTimeout(()=>{
        if(disposed)return;
        setRefresh(value=>value+1);
        void loadEvents(selected).then(result=>{if(!disposed)setEvents(old=>publicView?result:result.length?old.map(event=>event.id===selected?result[0]:event):old.filter(event=>event.id!==selected));}).catch(()=>{});
      },350);
    };
    setRealtime("connecting");
    const channel=supabase().channel(`event-${selected}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'photos',filter:`event_id=eq.${selected}`},changed)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'events',filter:`id=eq.${selected}`},changed)
      .subscribe(status=>{if(disposed)return;setRealtime(status==='SUBSCRIBED'?'live':'reconnecting');if(status==='SUBSCRIBED')changed();});
    const wake=()=>{if(document.visibilityState==='visible')changed();};window.addEventListener('online',changed);document.addEventListener('visibilitychange',wake);
    // Fallback if a network blocks WebSockets; also discovers event archival/deletion.
    const poll=setInterval(changed,30000);
    return()=>{disposed=true;clearTimeout(debounce);clearInterval(poll);void supabase().removeChannel(channel);window.removeEventListener('online',changed);document.removeEventListener('visibilitychange',wake);};
  },[selected,ready,publicView]);
  useEffect(() => {
    if (!cloudConfigured || !ready || !selected) return;
    let alive = true;
    const key=`${selected}-${page}-${favoriteOnly}`;
    const showLoading=galleryKey.current!==key;galleryKey.current=key;
    const fetchPage = async () => {
      if(showLoading)setGalleryLoading(true); setGalleryError("");
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
    if (uploadStatus(current) !== "open") { setToast("La carga de fotografías no está abierta en este momento."); return; }
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
  function downloadOne(photo:Photo){setSavingPhoto(photo);}
  const visible = sortEvents(events.filter(e => matchesEvent(e, query, dateFrom, dateUntil) && (category==='all'||e.category===category) && (filter === "Todos" || (filter === "Activos" ? e.active : !e.active))),order);
  const localPhotos = current?.photos.filter(p => !favoriteOnly || p.favorites.includes(guestId)) || [];
  const photos = cloudConfigured ? gallery.photos : localPhotos;
  const photoTotal = cloudConfigured ? gallery.total : photos.length;
  const shownPhotos = cloudConfigured ? photos : photos.slice((page - 1) * 12, page * 12);
  if (!cloudConfigured && !demoEnabled) return <div className="access-shell"><section className="access-card"><h1>Conecta tu estudio</h1><p>Configura NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel y vuelve a desplegar. La demo está desactivada en producción.</p></section></div>;
  if (cloudConfigured && guestEntry) return <Access guest onGuest={async (guestName, captcha) => {
    const session = await startSession(selected, captcha || undefined);
    setGuestId(session.userId); setAdmin(session.admin); setEvents(session.events); setName(guestName);
    if(selected)rememberGuest(selected,session.userId,guestName);
    setGuestEntry(false); setReady(true);
  }} />;
  if (cloudConfigured && initError) return <div className="access-shell"><section className="access-card"><h1>No pudimos conectar</h1><p role="alert">{initError}</p><button className="primary" onClick={() => location.reload()}>Reintentar</button></section></div>;
  if (cloudConfigured && !ready) return <div className="access-shell"><p role="status">Conectando con tu estudio…</p></div>;
  if (cloudConfigured && !publicView && !admin) return <Access onLogin={async () => {
    const session = await startSession(null); setAdmin(session.admin); setGuestId(session.userId); setEvents(session.events); setReady(true);
  }} />;
  return <div className="app-shell">
    {!publicView && <aside className="sidebar"><a className="brand" href="/">r<span>h</span><i><Icon name="sparkle" size={30}/></i></a><div className="studio">ROMEO HARO<span>ESTUDIO FOTOGRÁFICO</span></div><div className="nav-label">TU ESPACIO</div><button className={!selected&&view==='list'&&category==='all'?'nav-item active':'nav-item'} onClick={()=>{setSelected(null);setView('list');setCategory('all');}}><Icon name="grid"/>Mis eventos<small>{events.length}</small></button><button className={!selected&&view==='calendar'?'nav-item active':'nav-item'} onClick={()=>{setSelected(null);setView('calendar');}}><Icon name="calendar"/>Calendario</button><button className="nav-item" onClick={()=>setContactOpen(true)}><Icon name="contact"/>Contacto del estudio</button><div className="nav-label category-label">TIPO DE EVENTO</div><div className="category-nav">{eventCategories.map((type,i)=><button key={type} className={!selected&&view==='list'&&category===type?'nav-category active':'nav-category'} onClick={()=>{setSelected(null);setView('list');setCategory(type);}}><i className={`category-${i}`}/><span>{type}</span><small>{events.filter(event=>event.category===type).length}</small></button>)}</div><div className="sidebar-note"><span><Icon name="sparkle" size={28}/></span><p>Los mejores recuerdos<br />se construyen juntos.</p><small>Crea. Comparte. Revive.</small></div><div className="profile"><b>RH</b><div>Romeo Haro<small>{cloudConfigured ? "Fotógrafo · Conectado" : "Fotógrafo · Demo local"}</small></div><span><Icon name="chevron" size={14} style={{transform:"rotate(90deg)"}}/></span></div></aside>}
    <div className={publicView ? "workspace public" : `workspace ${!selected&&view==='calendar'?'calendar-mode':''}`}>
      <header><span>{publicView ? "ROMEO HARO / RECUERDOS COMPARTIDOS" : "Mi estudio"}{!publicView && <span className="breadcrumb"> / {current ? current.title : view==='calendar'?'Calendario':category==='all'?'Mis eventos':category}</span>}</span><div>{!publicView && <span className="local-pill"><i /> {cloudConfigured ? "Estudio conectado" : "Demo local"}</span>}{publicView&&<button className="secondary guest-contact" onClick={()=>setContactOpen(true)}><Icon name="contact"/>Contacto</button>}<span className="avatar">RH</span>{cloudConfigured && !publicView && <button className="logout" onClick={async () => { const result = await supabase().auth.signOut(); if (result.error) setToast(result.error.message); else location.reload(); }}>Salir</button>}</div></header>
      <main>
      {publicView && (!current || !current.active) ? <section className="empty"><h1>Este evento no está disponible</h1><p>Puede estar archivado, eliminado o no estar disponible.</p>{!cloudConfigured && <p>Esta versión de prueba no sincroniza eventos entre dispositivos.</p>}</section> : current ? <>
        {!publicView && <button className="back" onClick={() => setSelected(null)}><Icon name="chevron" style={{transform:"rotate(180deg)"}}/>Volver a mis eventos</button>}
        <section className="event-hero" ><div className="event-picture"><CoverImage event={current} /></div><span className="eyebrow">{current.category} · {dateLabel(current.date)}</span><h1>{current.title}</h1><p className="event-description">{current.description ?? "Un día especial. Todas las miradas. Un mismo recuerdo."}</p><button className="light-button" onClick={() => share(current)}><Icon name="qr"/>Compartir evento y QR</button></section>
        <section className="upload-panel"><div><span className="eyebrow">CADA MIRADA CUENTA</span><h2>Comparte tu parte de la historia.</h2><p>Las fotos que subas serán visibles para quienes accedan al evento.</p><p className="upload-schedule">{uploadStatus(current,now)==='closed'?'La carga de fotos está cerrada. Puedes seguir viendo y descargando recuerdos.':uploadStatus(current,now)==='scheduled'?`Las subidas abren el ${new Date(current.uploadsOpenAt!).toLocaleString('es-MX')}`:current.uploadsCloseAt?`Puedes subir fotos hasta el ${new Date(current.uploadsCloseAt).toLocaleString('es-MX')}`:'La carga de fotos está abierta.'}</p></div><div className="upload-actions"><input aria-label="Tu nombre" placeholder="¿Cómo te llamas?" maxLength={60} value={name} onChange={e => { setName(e.target.value); if(cloudConfigured)rememberGuest(current.id,guestId,e.target.value);else try { localStorage.setItem("romeo-guest-name", e.target.value); } catch {} }} /><div><button className="primary" disabled={busy || uploadStatus(current,now)!=="open"} onClick={() => upload.current?.click()}><Icon name="upload"/>{busy ? "Subiendo…" : "Subir fotos"}</button><button className="secondary" disabled={busy || uploadStatus(current,now)!=="open"} onClick={() => camera.current?.click()}><Icon name="camera"/>Tomar foto</button></div><input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={e => addPhotos(e.target.files)} /><input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => addPhotos(e.target.files)} /></div></section>
        <div className="gallery-toolbar"><h2>Los recuerdos <span>{current.photoCount ?? current.photos.length}</span></h2><div className="tabs"><button className={!favoriteOnly ? "chosen" : ""} onClick={() => { setFavoriteOnly(false); setPage(1); }}>Todas las fotos</button><button className={favoriteOnly ? "chosen" : ""} onClick={() => { setFavoriteOnly(true); setPage(1); }}><Icon name="heart"/>Mis favoritos</button>{cloudConfigured && <button disabled={galleryLoading} onClick={() => setRefresh(value => value + 1)}><Icon name="refresh" size={14}/>Actualizar</button>}{cloudConfigured&&<small className="live-state" role="status">{realtime==="live"?"● En vivo":"Reconectando…"}</small>}</div></div><DownloadPanel key={`${current.id}-${favoriteOnly}`} eventId={current.id} favorites={favoriteOnly} localPhotos={localPhotos} />
        {cloudConfigured && (galleryLoading || galleryError) ? <section className="empty"><p role={galleryError ? "alert" : "status"}>{galleryError || "Cargando recuerdos…"}</p>{galleryError && <button className="secondary" onClick={() => setRefresh(value => value + 1)}>Reintentar</button>}</section> : photos.length ? <div className="photo-grid">{shownPhotos.map(photo => <article className="photo-card" key={photo.id}><button className="photo-open" onClick={() => setLightbox(photo)}><img src={photo.src} alt={`Recuerdo de ${photo.author}`} /></button><div><span>{photo.author}</span><button disabled={busy} aria-label="Me gusta" aria-pressed={photo.likes.includes(guestId)} onClick={() => react(photo, "likes")}><Icon name="heart" filled={photo.likes.includes(guestId)} size={17}/> {photo.likeCount ?? photo.likes.length}</button><button disabled={busy} aria-label="Guardar favorito" aria-pressed={photo.favorites.includes(guestId)} onClick={() => react(photo, "favorites")}><Icon name="star" filled={photo.favorites.includes(guestId)} size={17}/></button><button aria-label={`Descargar foto de ${photo.author}`} onClick={()=>downloadOne(photo)}><Icon name="download" size={17}/></button></div></article>)}</div> : <section className="empty"><span><Icon name="image" size={22}/></span><h2>{favoriteOnly ? "Tus favoritos vivirán aquí" : "La primera foto inicia la historia"}</h2><p>{favoriteOnly ? "Marca una fotografía con la estrella para guardarla." : "Sube un recuerdo y dale vida a esta galería."}</p></section>}
        {photoTotal > 12 && <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}><Icon name="chevron" size={14} style={{transform:"rotate(180deg)"}}/>Anterior</button><span>{page} / {Math.ceil(photoTotal / 12)}</span><button disabled={page * 12 >= photoTotal} onClick={() => setPage(page + 1)}>Siguiente<Icon name="chevron" size={14}/></button></div>}
      </> : <>
        <div className="page-heading"><div><span className="eyebrow">RECUERDOS QUE SE QUEDAN</span><h1>{view==='calendar'?'Calendario':category==='all'?'Mis eventos':category}<span>.</span></h1><p>{view==='calendar'?'Cada fecha, una nueva historia por contar.':'Cada celebración, una historia contada entre todos.'}</p></div><button className="primary" disabled={!ready} onClick={() => { setEditing(null); setModal(true); }}><Icon name="plus"/>Crear evento</button></div>
        <section className="welcome"><div><span className="eyebrow">DETRÁS DE CADA FOTO, UNA HISTORIA</span><h2>Tú creas el momento.<br /><em>Ellos suman su mirada.</em></h2><p>Un espacio para reunir las fotos de todos tus invitados.<br />Crea un evento y deja que los recuerdos lleguen.</p><button onClick={() => { setEditing(null); setModal(true); }}>Comienza una nueva historia <span><Icon name="arrow"/></span></button></div><div className="welcome-image"><img src={pic(0)} alt="Celebración de una boda al aire libre" /><div className="image-caption">momentos que merecen quedarse <span><Icon name="sparkle" size={28}/></span></div></div></section>
        <section className="stats"><div><span><Icon name="grid" size={22}/></span><p>Total de eventos<b>{events.length.toString().padStart(2, "0")}</b></p></div><div><span><Icon name="calendar" size={22}/></span><p>Eventos activos<b>{events.filter(e => e.active).length.toString().padStart(2, "0")}</b></p></div><div><span><Icon name="image" size={22}/></span><p>Fotografías compartidas<b>{events.reduce((n, e) => n + (e.photoCount ?? e.photos.length), 0).toString().padStart(2, "0")}</b></p></div></section>
        <div className="section-heading"><h2>Tus historias <span>{events.length}</span></h2><label className="search"><Icon name="search" size={17}/><input placeholder="Buscar por nombre o fecha…" aria-label="Buscar un evento" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="date-filters"><label>Desde<input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></label><label>Hasta<input type="date" value={dateUntil} min={dateFrom} onChange={e=>setDateUntil(e.target.value)} /></label>{(dateFrom||dateUntil)&&<button onClick={()=>{setDateFrom("");setDateUntil("");}}>Limpiar fechas ×</button>}</div><div className="list-toolbar"><div className="tabs">{["Todos", "Activos", "Archivados"].map(f => <button className={filter === f ? "chosen" : ""} key={f} onClick={() => setFilter(f)}>{f}</button>)}</div><div className="list-controls"><label className="order-control"><Icon name="sort" size={15}/><select aria-label="Ordenar eventos" value={order} onChange={e=>setOrder(e.target.value as EventSort)}><option value="created-desc">Creación: más recientes</option><option value="created-asc">Creación: más antiguos</option><option value="date-asc">Fecha: próximos primero</option><option value="date-desc">Fecha: más recientes</option><option value="name">Nombre: A–Z</option><option value="photos">Más fotografías</option></select></label><div className="view-switch" aria-label="Vista de eventos"><button aria-label="Ver tarjetas" aria-pressed={view==='list'} onClick={()=>setView('list')}><Icon name="grid"/></button><button aria-label="Ver calendario" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}><Icon name="calendar"/></button></div></div></div>
        {view==='calendar'?<EventCalendar events={visible} onOpen={openEvent}/>:<><div className="event-grid">{visible.map(event => <article className="event-card" key={event.id}><button className="event-cover" onClick={() => openEvent(event.id)}><CoverImage event={event} /><span className={event.active ? "status" : "status archived"}><i />{event.active ? "Activo" : "Archivado"}</span><span className="cover-arrow"><Icon name="arrow" size={14}/></span></button><div className="event-info"><span className="eyebrow">{event.category}</span><button className="event-title" onClick={() => openEvent(event.id)}>{event.title}</button><p><Icon name="calendar" size={13}/>{dateLabel(event.date)}</p><div className="card-bottom"><span><Icon name="image" size={14}/>{event.photoCount ?? event.photos.length} fotografías</span><button aria-label={`Compartir enlace y QR de ${event.title}`} onClick={() => share(event)}><Icon name="share" size={16}/></button><button aria-label={`Editar ${event.title}`} onClick={() => { setEditing(event.id); setModal(true); }}><Icon name="edit" size={16}/></button></div></div></article>)}</div>{!visible.length && <div className="empty"><h2>No hay eventos para mostrar</h2><p>Prueba otra búsqueda o crea una nueva historia.</p></div>}</>}
      </>}
      <footer><span>ROMEO HARO <i><Icon name="sparkle" size={30}/></i></span><p>Hecho para vivirlo. Creado para recordarlo.</p><small>{publicView ? "Recuerdos compartidos" : cloudConfigured ? "Galería compartida" : "Prototipo · Datos guardados en este navegador"}</small></footer>
      </main>
    </div>
    {contactOpen&&<ContactDialog eventId={publicView?selected??undefined:undefined} editing={!publicView} onClose={closeContact}/>}
    {savingPhoto&&<FileSaveDialog photo={savingPhoto} onClose={()=>setSavingPhoto(null)}/>}
    {shareEvent && <ShareDialog id={shareEvent.id} title={shareEvent.title} local={!cloudConfigured} onClose={closeShare} />}
    {modal && <EventEditor event={events.find(event=>event.id===editing)} defaultCover={pic(events.length)} defaultCategory={category==='all'?'Boda':category} onClose={()=>setModal(false)} onSave={async(event,newCover)=>{
      let path: string|undefined;
      try{
        if(cloudConfigured&&newCover){path=await uploadCover(event.id,guestId,event.cover);event={...event,coverPath:path};}
        const old=events.find(item=>item.id===event.id);
        const saved=await save(old?events.map(item=>item.id===event.id?event:item):[event,...events]);
        if(!saved){if(path)await discardCover(path);return false;}
        setToast(old?'Evento actualizado.':'Tu nueva historia está lista.');return true;
      }catch(err){if(path)await discardCover(path).catch(()=>{});throw err;}
    }} onDelete={editing?async()=>{
      if(!confirm(cloudConfigured?'¿Retirar este evento? Los archivos se conservan hasta su limpieza en Storage.':'¿Eliminar el evento y sus fotos?'))return;
      if(await save(events.filter(event=>event.id!==editing))){setModal(false);setSelected(null);}
    }:undefined} />}
    {lightbox && <div className="overlay lightbox" role="dialog" aria-label="Fotografía ampliada" onClick={() => setLightbox(null)}><button className="close" aria-label="Cerrar fotografía" onClick={() => setLightbox(null)}><Icon name="close"/></button><img src={lightbox.src} alt={`Fotografía de ${lightbox.author}`} /><button className="lightbox-download secondary" onClick={e=>{e.stopPropagation();void downloadOne(lightbox);}}><Icon name="download"/>Guardar fotografía</button></div>}
    {toast && <div className="toast" role="status">{toast}<button aria-label="Cerrar aviso" onClick={() => setToast("")}><Icon name="close"/></button></div>}
  </div>;
}
