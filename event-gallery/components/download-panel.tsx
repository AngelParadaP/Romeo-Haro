"use client";
import { useEffect, useRef, useState } from 'react';
import { cloudConfigured } from '@/lib/cloud';
import { collectionFiles } from '@/lib/downloads';
import { buildPhotoArchives, type PreparedArchive } from '@/lib/archives';
import type { Photo } from '@/lib/types';
export function DownloadPanel({ eventId, favorites, localPhotos }: { eventId:string; favorites:boolean; localPhotos:Photo[] }) {
  const [busy,setBusy]=useState(false);const [count,setCount]=useState(0);const [error,setError]=useState('');const [archives,setArchives]=useState<PreparedArchive[]>([]);
  const controller=useRef<AbortController|null>(null);const urls=useRef<PreparedArchive[]>([]);
  useEffect(()=>()=>{controller.current?.abort();for(const item of urls.current)URL.revokeObjectURL(item.url);},[]);
  return <section className="download-panel"><div><button className="secondary" disabled={busy} onClick={async()=>{
    controller.current=new AbortController();setBusy(true);setCount(0);setError('');for(const item of urls.current)URL.revokeObjectURL(item.url);urls.current=[];setArchives([]);
    try{
      const files=collectionFiles(eventId,favorites,cloudConfigured?null:localPhotos,controller.current.signal);
      const result=await buildPhotoArchives(files,`${favorites?'favoritos':'galeria'}-${eventId}`,setCount,controller.current.signal);
      if(controller.current.signal.aborted){for(const item of result)URL.revokeObjectURL(item.url);return;}
      urls.current=result;setArchives(result);if(!result.length)setError('No hay fotografías para descargar.');
    }catch(err){if(!controller.current?.signal.aborted)setError(err instanceof Error?err.message:'No se pudo preparar el ZIP.');}
    finally{setBusy(false);}
  }}>↓ {busy?`Preparando ${count} fotos…`:favorites?'Descargar mis favoritos (ZIP)':'Descargar toda la galería (ZIP)'}</button>{busy&&<button className="back" onClick={()=>controller.current?.abort()}>Cancelar</button>}</div><small>Incluye todas las páginas. Las galerías grandes se dividen en paquetes de aproximadamente 100 MB.</small>{error&&<p role="alert" className="form-error">{error}</p>}{archives.length>0&&<div className="archive-links" role="status">{archives.map(item=><a key={item.url} href={item.url} download={item.name}>↓ {item.name} · {(item.size/1024/1024).toFixed(1)} MB</a>)}</div>}</section>;
}
