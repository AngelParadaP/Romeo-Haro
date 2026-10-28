"use client";
import {useEffect,useState} from 'react';
import {storageRequest} from '@/lib/storage-client';
import {deleteResource} from '@/lib/deletions';
type Job={id:string;title:string;photo_id:string|null;last_error:string|null};
export function DeletionJobs({onComplete}:{onComplete:()=>void}){
 const [jobs,setJobs]=useState<Job[]>([]);const [retired,setRetired]=useState<{id:string;title:string}[]>([]);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 useEffect(()=>{let alive=true;const load=()=>{void storageRequest('/api/deletions').then(r=>r.json()).then(data=>{if(alive){setJobs(data.jobs);setRetired(data.retired||[]);}}).catch(()=>{});};load();window.addEventListener('deletion-jobs-changed',load);return()=>{alive=false;window.removeEventListener('deletion-jobs-changed',load);};},[]);
 async function run(tasks:{jobId?:string;eventId?:string}[]){setBusy(true);setMessage('');try{for(const task of tasks)await deleteResource({...task,onProgress:setMessage});onComplete();}catch(error){setMessage(error instanceof Error?error.message:'La limpieza sigue pendiente.');}finally{setBusy(false);}}
 if(!jobs.length&&!retired.length)return null;
 return <section className="deletion-pending" role="status"><div>
  {jobs.length>0&&<><b>Hay {jobs.length} {jobs.length===1?'eliminación pendiente':'eliminaciones pendientes'}</b><p>Los elementos ya están ocultos. Continúa para terminar de borrar sus archivos y registros.</p>{jobs.map(job=><p key={job.id}>{job.photo_id?'Fotografía':'Evento'}: {job.title}{job.last_error?` · ${job.last_error}`:''}</p>)}</>}
  {retired.length>0&&<><b>Eventos retirados con archivos por revisar</b><p>Su eliminación definitiva requiere confirmación.</p>{retired.map(event=><p key={event.id}>{event.title} <button className="text-link" disabled={busy} onClick={()=>{if(confirm(`¿Eliminar permanentemente el evento «${event.title}», sus fotos, portadas y registros? Esta acción no se puede deshacer.`))void run([{eventId:event.id}]);}}>Eliminar archivos y registros</button></p>)}</>}
  {message&&<p>{message}</p>}
 </div>{jobs.length>0&&<button className="secondary" disabled={busy} onClick={()=>void run(jobs.map(job=>({jobId:job.id})))}>{busy?'Eliminando…':'Continuar limpieza'}</button>}</section>;
}
