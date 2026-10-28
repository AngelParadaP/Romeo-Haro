"use client";
import {useModalScrollLock} from "@/lib/use-modal-scroll-lock";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import type { GalleryEvent } from '@/lib/types';
import { readPhoto } from '@/lib/media';
import {eventCategories,cropFromDrag} from '@/lib/event-utils';
import {Icon} from './icon';

export function CoverImage({ event }: { event: GalleryEvent }) {
  return <img className="cover-image" draggable={false} src={event.cover} alt={event.title} style={{ objectPosition: `${event.coverX ?? 50}% ${event.coverY ?? 50}%`, transform: `scale(${event.coverZoom ?? 1})`, transformOrigin: `${event.coverX ?? 50}% ${event.coverY ?? 50}%` }} />;
}
function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export function EventEditor({ event, defaultCover, defaultCategory="Boda", onClose, onSave, onDelete }: {
  event?: GalleryEvent; defaultCover: string;defaultCategory?:string; onClose: () => void;
  onSave: (event: GalleryEvent, newCover: boolean) => Promise<boolean>; onDelete?: () => Promise<void>;
}) {
  useModalScrollLock();
  const [draft, setDraft] = useState<GalleryEvent>(event || { id: crypto.randomUUID(), title:'', date:'', category:defaultCategory, cover:defaultCover, description:'Un día especial. Todas las miradas. Un mismo recuerdo.', active:true, photos:[],createdAt:new Date().toISOString() });
  const cropElement=useRef<HTMLDivElement>(null);
  const drag=useRef<{pointer:number;x:number;y:number;originX:number;originY:number;width:number;height:number;zoom:number}|null>(null);
  const [dragging,setDragging]=useState(false);
  const [newCover, setNewCover] = useState(false);
  const [opening, setOpening] = useState(localDateTime(event?.uploadsOpenAt));
  const [closing, setClosing] = useState(localDateTime(event?.uploadsCloseAt));
  const [mode, setMode] = useState(event?.uploadsCloseAt ? 'custom' : 'none');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(()=>{const element=cropElement.current;if(!element)return;const wheel=(e:WheelEvent)=>{if(busy)return;e.preventDefault();setDraft(old=>({...old,coverZoom:Math.min(3,Math.max(1,(old.coverZoom??1)-e.deltaY*.002))}));};element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);},[busy]);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function change<K extends keyof GalleryEvent>(key: K, value: GalleryEvent[K]) { setDraft(old => ({ ...old, [key]: value })); }
  return <div className="overlay" onClick={() => { if (!busy) onClose(); }}><section className="modal event-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onClick={e=>e.stopPropagation()}><button className="close" disabled={busy} aria-label="Cerrar" onClick={onClose}><Icon name="close"/></button><span className="eyebrow">TU EVENTO, A TU MANERA</span><h2 id="editor-title">{event ? 'Personalizar evento' : 'Crea una nueva historia.'}</h2>
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
    <div className="form-columns"><label>Fecha del evento<input required type="date" value={draft.date} onChange={e=>change('date',e.target.value)} /></label><label>Tipo<select value={draft.category} onChange={e=>change('category',e.target.value)}>{eventCategories.map(category=><option key={category}>{category}</option>)}</select></label></div>
    <label>Mensaje para tus invitados<textarea maxLength={1500} rows={3} value={draft.description ?? ''} onChange={e=>change('description',e.target.value)} placeholder="Escribe la historia o bienvenida de este evento…" /></label>
    <fieldset><legend>Portada y encuadre</legend><div ref={cropElement} className={`cover-preview crop-interactive ${dragging?'dragging':''}`} tabIndex={0} role="group" aria-label="Encuadre de portada: arrastra para mover; usa las flechas para ajustes finos" onPointerDown={e=>{if(busy||e.button!==0)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});const box=e.currentTarget.getBoundingClientRect();drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,originX:draft.coverX??50,originY:draft.coverY??50,width:box.width,height:box.height,zoom:draft.coverZoom??1};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}} onPointerMove={e=>{const value=drag.current;if(!value||value.pointer!==e.pointerId)return;const next=cropFromDrag(value.originX,value.originY,e.clientX-value.x,e.clientY-value.y,value.width,value.height,value.zoom);setDraft(old=>({...old,coverX:Math.round(next.x),coverY:Math.round(next.y)}));}} onPointerUp={e=>{if(drag.current?.pointer!==e.pointerId)return;drag.current=null;setDragging(false);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;setDragging(false);}} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}} onKeyDown={e=>{if(busy)return;const direction={ArrowLeft:[-2,0],ArrowRight:[2,0],ArrowUp:[0,-2],ArrowDown:[0,2]}[e.key];if(!direction)return;e.preventDefault();setDraft(old=>({...old,coverX:Math.max(0,Math.min(100,(old.coverX??50)+direction[0])),coverY:Math.max(0,Math.min(100,(old.coverY??50)+direction[1]))}));}}><CoverImage event={draft} /><div><b>{draft.title || 'Tu evento'}</b><span>{draft.description}</span></div></div><p className="field-help crop-help"><Icon name="image" size={14}/>Arrastra para encuadrar. Usa la rueda o el trackpad para acercar, y las flechas para ajustar.</p><label>Seleccionar imagen<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{
      const file=e.target.files?.[0]; if(!file) return; setBusy(true); setError('');
      try { const src=await readPhoto(file); setDraft(old=>({...old,cover:src,coverX:50,coverY:50,coverZoom:1}));setNewCover(true); } catch(err) { setError(err instanceof Error ? err.message : 'No se pudo leer la portada.'); } finally {setBusy(false);}
    }} /></label>
    <label>Encuadre horizontal<input type="range" min={0} max={100} value={draft.coverX ?? 50} onChange={e=>change('coverX',Number(e.target.value))} /></label>
    <label>Encuadre vertical<input type="range" min={0} max={100} value={draft.coverY ?? 50} onChange={e=>change('coverY',Number(e.target.value))} /></label>
    <label>Acercamiento · {(draft.coverZoom ?? 1).toFixed(1)}×<input type="range" min={1} max={3} step={0.1} value={draft.coverZoom ?? 1} onChange={e=>change('coverZoom',Number(e.target.value))} /></label></fieldset>
    <fieldset><legend>Horario para subir fotos</legend><p className="field-help">Hora de tu dispositivo: {zone}. La galería seguirá disponible después del cierre.</p><label>Apertura de subidas (opcional)<input type="datetime-local" value={opening} onChange={e=>setOpening(e.target.value)} /></label><label>Cierre<select value={mode} onChange={e=>setMode(e.target.value)}><option value="none">Sin fecha de cierre</option><option value="48h">48 horas después de la apertura</option><option value="custom">Elegir fecha y hora</option></select></label>{mode==='custom' && <label>Fecha y hora de cierre<input required type="datetime-local" value={closing} onChange={e=>setClosing(e.target.value)} /></label>}{mode==='48h' && opening && <p className="field-help">Cierra: {new Date(new Date(opening).getTime()+48*60*60*1000).toLocaleString('es-MX')}</p>}</fieldset>
    <label className="event-toggle"><span><b>Evento activo</b><small>Permite que tus invitados entren a la galería.</small></span><input type="checkbox" role="switch" checked={draft.active} onChange={e=>change('active',e.target.checked)} /><span className="toggle-track" aria-hidden="true"><span/></span></label>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Guardando…' : event ? 'Guardar cambios' : 'Crear evento'}<Icon name="check"/></button>
    {onDelete && <button className="danger" type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await onDelete();}catch(err){setError(err instanceof Error ? err.message : 'No se pudo retirar.');}finally{setBusy(false);}}}>Retirar evento</button>}
  </form></section></div>;
}
