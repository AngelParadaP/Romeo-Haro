"use client";
import {useModalScrollLock} from "@/lib/use-modal-scroll-lock";
/* eslint-disable @next/next/no-img-element */
import { useEffect,useState } from 'react';
import {photoBlob} from '@/lib/downloads';
import type {Photo} from '@/lib/types';
import {Icon} from './icon';
import {PhotoActions} from './photo-actions';
export function FileSaveDialog({photo,onClose}:{photo:Photo;onClose:()=>void}){
  useModalScrollLock();
  const [file,setFile]=useState<File|null>(null);const [url,setUrl]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;let objectURL='';photoBlob(photo).then(blob=>{if(!alive)return;objectURL=URL.createObjectURL(blob);setUrl(objectURL);setFile(new File([blob],`foto-${photo.id}.jpg`,{type:'image/jpeg'}));}).catch(err=>{if(alive)setError(err instanceof Error?err.message:'No se pudo preparar la foto.');});return()=>{alive=false;if(objectURL)URL.revokeObjectURL(objectURL);};},[photo]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[busy,onClose]);
  return <div className="overlay" onClick={()=>{if(!busy)onClose();}}><section className="modal file-save" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={e=>e.stopPropagation()}><button className="close icon-button" disabled={busy} onClick={onClose} aria-label="Cerrar opciones de fotografía"><Icon name="close"/></button><span className="eyebrow">LLÉVATE ESTE RECUERDO</span><h2 id="save-title">Tu fotografía</h2>{url&&<img src={url} alt={`Fotografía de ${photo.author}`}/>} {!file&&!error&&<p role="status">Preparando fotografía…</p>}{error&&<p className="form-error" role="alert">{error}</p>}{file&&<PhotoActions files={[file]} imageUrl={url} onBusyChange={setBusy}/>}</section></div>;
}
