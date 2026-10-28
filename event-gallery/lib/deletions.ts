import {storageRequest} from './storage-client';
export function notifyDeletionJobs(){window.dispatchEvent(new Event('deletion-jobs-changed'));}
export async function deleteResource({eventId,photoId,jobId,onProgress}:{eventId?:string;photoId?:string;jobId?:string;onProgress?:(text:string)=>void}){
 let next=jobId;
 try{for(;;){const response=await storageRequest('/api/deletions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next?{jobId:next}:{eventId,photoId})});const result=await response.json();next=result.jobId;notifyDeletionJobs();if(result.done)return;
 onProgress?.(result.waiting?'Esperando a la limpieza en curso…':`Eliminando archivos: ${result.removed} de ${result.total}…`);await new Promise(resolve=>setTimeout(resolve,result.waiting?1500:150));}}
 finally{notifyDeletionJobs();}
}
