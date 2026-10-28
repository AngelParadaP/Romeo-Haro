import {supabase} from './cloud';
export const useGoogleDrive=process.env.NEXT_PUBLIC_STORAGE_PROVIDER==='google-drive';
export async function storageRequest(path:string,options:RequestInit={}){
 const session=await supabase().auth.getSession();if(session.error)throw session.error;const token=session.data.session?.access_token;if(!token)throw new Error('Inicia sesión para acceder al almacenamiento.');
 const response=await fetch(path,{...options,credentials:'same-origin',cache:'no-store',headers:{...options.headers,Authorization:`Bearer ${token}`}});
 if(!response.ok){const error=await response.json().catch(()=>null);throw new Error(error?.error||'No se pudo acceder al almacenamiento.');}return response;
}
export async function driveURLs(bucket:string,paths:string[]):Promise<string[]>{if(!paths.length)return [];const response=await storageRequest('/api/storage/urls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bucket,paths})});return (await response.json()).urls;}
export async function driveUpload(bucket:string,eventId:string,blob:Blob,author=''):Promise<{path:string;id:string}>{const response=await storageRequest(`/api/storage/upload?${new URLSearchParams({bucket,eventId})}`,{method:'POST',headers:{'Content-Type':'image/jpeg','X-Photo-Author':encodeURIComponent(author)},body:blob});return response.json();}
export async function driveDownload(bucket:string,path:string){return (await storageRequest(`/api/storage/file?${new URLSearchParams({bucket,path})}`)).blob();}
