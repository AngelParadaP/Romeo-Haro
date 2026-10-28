import { supabase } from './cloud';
import {driveDownload} from './storage-client';
import type { Photo } from './types';
import type { ArchiveFile } from './archives';
export function saveBlob(blob: Blob, filename: string) {
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export async function photoBlob(photo: Photo) {
  if(photo.storagePath&&['google-drive','r2'].includes(photo.storageProvider||''))return driveDownload('event-photos',photo.storagePath,photo.storageProvider);
  if(photo.storagePath){const result=await supabase().storage.from('event-photos').download(photo.storagePath);if(result.error)throw result.error;return result.data;}
  const result=await fetch(photo.src);if(!result.ok)throw new Error('No se pudo descargar la fotografía.');return result.blob();
}
export async function* collectionFiles(eventId: string, favorites: boolean, localPhotos: Photo[] | null, signal: AbortSignal): AsyncGenerator<ArchiveFile> {
  if(localPhotos){for(const photo of localPhotos){signal.throwIfAborted();yield {id:photo.id,blob:await photoBlob(photo)};}return;}
  const snapshot=await supabase().rpc('download_snapshot',{event_token:eventId});if(snapshot.error)throw snapshot.error;
  const cutoff=snapshot.data as string;let after: string|null=null;
  for(;;){
    signal.throwIfAborted();
    const result=await supabase().rpc('download_page',{event_token:eventId,after_id:after,cutoff,only_favorites:favorites});
    if(result.error)throw result.error;
    const rows=result.data as {id:string;storage_path:string;storage_provider?:string}[];
    if(!rows.length)return;
    for(const row of rows){signal.throwIfAborted();if(['google-drive','r2'].includes(row.storage_provider||'')){yield {id:row.id,blob:await driveDownload('event-photos',row.storage_path,row.storage_provider)};continue;}const file=await supabase().storage.from('event-photos').download(row.storage_path);if(file.error)throw file.error;yield {id:row.id,blob:file.data};}
    after=rows[rows.length-1].id;
  }
}
