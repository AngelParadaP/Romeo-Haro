"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect,useState } from 'react';
import {canShareFiles,shareFiles,wasCancelled} from '@/lib/native-share';
import {photoBlob,saveBlob} from '@/lib/downloads';
import type {Photo} from '@/lib/types';
import {Icon} from './icon';
export function FileSaveDialog({photo,onClose}:{photo:Photo;onClose:()=>void}){
  const [file,setFile]=useState<File|null>(null);const [url,setUrl]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let alive=true;let objectURL='';photoBlob(photo).then(blob=>{if(!alive)return;objectURL=URL.createObjectURL(blob);setUrl(objectURL);setFile(new File([blob],`foto-${photo.id}.jpg`,{type:'image/jpeg'}));}).catch(err=>{if(alive)setError(err instanceof Error?err.message:'No se pudo preparar la foto.');});return()=>{alive=false;if(objectURL)URL.revokeObjectURL(objectURL);};},[photo]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)onClose();};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[busy,onClose]);
  return <div className="overlay" onClick={()=>{if(!busy)onClose();}}><section className="modal file-save" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={e=>e.stopPropagation()}><button className="close icon-button" disabled={busy} onClick={onClose} aria-label="Cerrar descarga"><Icon name="close"/></button><span className="eyebrow">LLÉVATE ESTE RECUERDO</span><h2 id="save-title">Guarda tu fotografía</h2>{url&&<img src={url} alt={`Fotografía de ${photo.author}`}/>}<p>En iPhone o Android, abre el menú del sistema y elige guardar la imagen si está disponible.</p>{!file&&!error&&<p role="status">Preparando fotografía…</p>}{error&&<p className="form-error" role="alert">{error}</p>}{file&&<div className="save-actions">{canShareFiles([file])&&<button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await shareFiles([file],'Mi recuerdo');}catch(err){if(!wasCancelled(err))setError(err instanceof Error?err.message:'No se pudo compartir.');}finally{setBusy(false);}}}><Icon name="share"/>Guardar o compartir</button>}<button className="secondary" disabled={busy} onClick={()=>saveBlob(file,file.name)}><Icon name="download"/>Descargar archivo</button></div>}</section></div>;
}
