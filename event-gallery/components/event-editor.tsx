"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import type { GalleryEvent } from '@/lib/types';
import { readPhoto } from '@/lib/media';

export function CoverImage({ event }: { event: GalleryEvent }) {
  return <img className="cover-image" src={event.cover} alt={event.title} style={{ objectPosition: `${event.coverX ?? 50}% ${event.coverY ?? 50}%`, transform: `scale(${event.coverZoom ?? 1})`, transformOrigin: `${event.coverX ?? 50}% ${event.coverY ?? 50}%` }} />;
}
function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export function EventEditor({ event, defaultCover, onClose, onSave, onDelete }: {
  event?: GalleryEvent; defaultCover: string; onClose: () => void;
  onSave: (event: GalleryEvent, newCover: boolean) => Promise<boolean>; onDelete?: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<GalleryEvent>(event || { id: crypto.randomUUID(), title:'', date:'', category:'Boda', cover:defaultCover, description:'Un día especial. Todas las miradas. Un mismo recuerdo.', active:true, photos:[] });
  const [newCover, setNewCover] = useState(false);
  const [opening, setOpening] = useState(localDateTime(event?.uploadsOpenAt));
  const [closing, setClosing] = useState(localDateTime(event?.uploadsCloseAt));
  const [mode, setMode] = useState(event?.uploadsCloseAt ? 'custom' : 'none');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function change<K extends keyof GalleryEvent>(key: K, value: GalleryEvent[K]) { setDraft(old => ({ ...old, [key]: value })); }
  return <div className="overlay" onClick={() => { if (!busy) onClose(); }}><section className="modal event-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onClick={e=>e.stopPropagation()}><button className="close" disabled={busy} aria-label="Cerrar" onClick={onClose}>×</button><span className="eyebrow">TU EVENTO, A TU MANERA</span><h2 id="editor-title">{event ? 'Personalizar evento' : 'Crea una nueva historia.'}</h2>
  <form onSubmit={async e=>{
    e.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const open = opening ? new Date(opening).toISOString() : null;
      if (mode === '48h' && !open) throw new Error('Selecciona la fecha y hora de apertura para contar las 48 horas.');
      const close = mode === '48h' ? new Date(Date.parse(open!) + 48*60*60*1000).toISOString() : mode === 'custom' && closing ? new Date(closing).toISOString() : null;
      if (mode === 'custom' && !close) throw new Error('Selecciona la fecha y hora de cierre.');
      if (open && close && Date.parse(close) <= Date.parse(open)) throw new Error('El cierre debe ser posterior a la apertura.');
      if (await onSave({ ...draft, title: draft.title.trim(), uploadsOpenAt: open, uploadsCloseAt: close }, newCover)) onClose();
    } catch(err) { setError(err instanceof Error ? err.message : 'No se pudo guardar el evento.'); }
    finally { setBusy(false); }
  }}>
    <label>Nombre del evento<input required maxLength={100} value={draft.title} onChange={e=>change('title',e.target.value)} autoFocus /></label>
    <div className="form-columns"><label>Fecha del evento<input required type="date" value={draft.date} onChange={e=>change('date',e.target.value)} /></label><label>Tipo<select value={draft.category} onChange={e=>change('category',e.target.value)}><option>Boda</option><option>Cumpleaños</option><option>Celebración</option><option>Encuentro</option></select></label></div>
    <label>Mensaje para tus invitados<textarea maxLength={1500} rows={3} value={draft.description ?? ''} onChange={e=>change('description',e.target.value)} placeholder="Escribe la historia o bienvenida de este evento…" /></label>
    <fieldset><legend>Portada y encuadre</legend><div className="cover-preview"><CoverImage event={draft} /><div><b>{draft.title || 'Tu evento'}</b><span>{draft.description}</span></div></div><label>Seleccionar imagen<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0]; if(!file) return; setBusy(true); setError('');
      try { const src=await readPhoto(file); setDraft(old=>({...old,cover:src,coverX:50,coverY:50,coverZoom:1}));setNewCover(true); } catch(err) { setError(err instanceof Error ? err.message : 'No se pudo leer la portada.'); } finally {setBusy(false);}
    }} /></label>
    <label>Encuadre horizontal<input type="range" min={0} max={100} value={draft.coverX ?? 50} onChange={e=>change('coverX',Number(e.target.value))} /></label>
    <label>Encuadre vertical<input type="range" min={0} max={100} value={draft.coverY ?? 50} onChange={e=>change('coverY',Number(e.target.value))} /></label>
    <label>Acercamiento · {(draft.coverZoom ?? 1).toFixed(1)}×<input type="range" min={1} max={3} step={0.1} value={draft.coverZoom ?? 1} onChange={e=>change('coverZoom',Number(e.target.value))} /></label></fieldset>
    <fieldset><legend>Horario para subir fotos</legend><p className="field-help">Hora de tu dispositivo: {zone}. La galería seguirá disponible después del cierre.</p><label>Apertura de subidas (opcional)<input type="datetime-local" value={opening} onChange={e=>setOpening(e.target.value)} /></label><label>Cierre<select value={mode} onChange={e=>setMode(e.target.value)}><option value="none">Sin fecha de cierre</option><option value="48h">48 horas después de la apertura</option><option value="custom">Elegir fecha y hora</option></select></label>{mode==='custom' && <label>Fecha y hora de cierre<input required type="datetime-local" value={closing} onChange={e=>setClosing(e.target.value)} /></label>}{mode==='48h' && opening && <p className="field-help">Cierra: {new Date(new Date(opening).getTime()+48*60*60*1000).toLocaleString('es-MX')}</p>}</fieldset>
    <label className="checkbox"><input type="checkbox" checked={draft.active} onChange={e=>change('active',e.target.checked)} /> Evento activo</label>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Guardando…' : event ? 'Guardar cambios ↗' : 'Crear evento ↗'}</button>
    {onDelete && <button className="danger" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await onDelete();}catch(err){setError(err instanceof Error ? err.message : 'No se pudo retirar.');}finally{setBusy(false);}}}>Retirar evento</button>}
  </form></section></div>;
}
