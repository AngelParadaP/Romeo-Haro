"use client";
import {useEffect,useState} from 'react';
import {cloudConfigured} from '@/lib/cloud';
import {storageRequest,useGoogleDrive} from '@/lib/drive-client';
import {useModalScrollLock} from '@/lib/use-modal-scroll-lock';
import {Icon} from './icon';
type Status={provider:string;connected:boolean;email?:string;error?:string;quota?:{limit?:string;usage?:string;usageInDrive?:string}};
const gb=(bytes?:string)=>`${(Number(bytes||0)/1e9).toLocaleString('es-MX',{maximumFractionDigits:2})} GB`;
export function StorageDialog({onClose}:{onClose:()=>void}){
 useModalScrollLock();const [status,setStatus]=useState<Status|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;if(!cloudConfigured||!useGoogleDrive){Promise.resolve().then(()=>{if(alive)setStatus({provider:cloudConfigured?'supabase':'demo',connected:false});});return()=>{alive=false;};}
 void storageRequest('/api/storage/status').then(r=>r.json()).then(value=>{if(alive)setStatus(value);}).catch(err=>{if(alive)setError(err.message);});return()=>{alive=false;};},[retry]);
 useEffect(()=>{const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy)onClose();};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[onClose,busy]);
 async function connect(){setBusy(true);setError('');try{const response=await storageRequest('/api/storage/google/start',{method:'POST'});const {url}=await response.json();window.location.assign(url);}catch(err){setError(err instanceof Error?err.message:'No se pudo conectar Google Drive.');setBusy(false);}}
 return <div className="overlay" onClick={()=>{if(!busy)onClose();}}><section className="modal storage-dialog" role="dialog" aria-modal="true" aria-labelledby="storage-title" onClick={e=>e.stopPropagation()}><button className="close" disabled={busy} onClick={onClose} aria-label="Cerrar almacenamiento"><Icon name="close"/></button><span className="dialog-emblem"><Icon name="image" size={26}/></span><span className="eyebrow">EL HOGAR DE TUS RECUERDOS</span><h2 id="storage-title">Almacenamiento</h2>
 {error&&<p className="form-error" role="alert">{error}</p>}
 {!status&&!error?<p role="status">Comprobando almacenamiento…</p>:status?.provider==='google-drive'?<><p className="storage-state"><Icon name="image"/>{status.connected?'Google Drive conectado':'Google Drive pendiente de conexión'}</p>{status.email&&<p className="field-help">Cuenta dedicada: {status.email}</p>}{status.quota&&<div className="storage-quota"><b>{gb(status.quota.usage)} utilizados{status.quota.limit?` de ${gb(status.quota.limit)}`:''}</b>{status.quota.limit&&<progress aria-label="Espacio utilizado en Google" max={Number(status.quota.limit)} value={Number(status.quota.usage||0)}/>}<small>Uso total de la cuenta de Google; incluye otros servicios.</small></div>}{status.error&&<p className="form-error" role="alert">{status.error}</p>}<p className="field-help">Al conectar, las nuevas fotos y portadas se guardan en carpetas privadas por evento. Las fotos anteriores de Supabase siguen disponibles.</p><button className="primary" disabled={busy||Boolean(status.error)} onClick={()=>void connect()}>{busy?'Abriendo Google…':status.connected?'Reconectar la misma cuenta':'Conectar cuenta dedicada'}<Icon name="arrow"/></button></>:status&&<p className="field-help">{status.provider==='demo'?'Estás en la demo local. Conecta Supabase y configura Google Drive para usar almacenamiento compartido.':'Tus archivos nuevos se guardan actualmente en Supabase. Sigue la guía de Google Drive del proyecto para activar la cuenta dedicada.'}</p>}
 {error&&<><button className="secondary" onClick={()=>{setError('');setStatus(null);setRetry(value=>value+1);}}>Reintentar</button>{useGoogleDrive&&<button className="primary" disabled={busy} onClick={()=>void connect()}>Reconectar Google Drive</button>}</>}
 <p className="field-help storage-retention">Archivar cierra las subidas y deja 30 días de consulta. No elimina archivos automáticamente. Esta conexión admite fotos JPG optimizadas de hasta 3 MB.</p>
 </section></div>;
}
