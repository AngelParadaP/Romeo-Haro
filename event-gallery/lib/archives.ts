import { Zip, ZipPassThrough } from 'fflate';
export type ArchiveFile = { id: string; blob: Blob };
export type PreparedArchive = { name: string; url: string; size: number; blob:Blob };
export async function buildPhotoArchives(files: AsyncIterable<ArchiveFile>, label: string, onProgress: (count: number) => void, signal: AbortSignal, partLimit = 100*1024*1024): Promise<PreparedArchive[]> {
  const archives: PreparedArchive[] = [];
  let zip: Zip, chunks: BlobPart[], size=0, count=0, inPart=0, zipError: Error | null=null;
  let finished: (()=>void) | undefined; let rejected: ((error:Error)=>void) | undefined;
  const reset=()=>{
    chunks=[];size=0;inPart=0;zipError=null;
    zip=new Zip((error,data,final)=>{if(error){zipError=error;rejected?.(error);return;}chunks.push(new Uint8Array(data).buffer);if(final)finished?.();});
  };
  const finish=async()=>{
    if(!inPart)return;
    if(zipError)throw zipError;
    await new Promise<void>((resolve,reject)=>{finished=resolve;rejected=reject;zip.end();});
    const blob=new Blob(chunks,{type:'application/zip'});
    archives.push({name:`${label}-${String(archives.length+1).padStart(2,'0')}.zip`,url:URL.createObjectURL(blob),size:blob.size,blob});
    finished=undefined;rejected=undefined;
  };
  reset();
  try {
    for await(const file of files){
      signal.throwIfAborted();
      if(inPart && size+file.blob.size>partLimit){await finish();reset();}
      const data=new Uint8Array(await file.blob.arrayBuffer());signal.throwIfAborted();
      const entry=new ZipPassThrough(`foto-${file.id}.jpg`);zip!.add(entry);entry.push(data,true);
      if(zipError)throw zipError;
      size+=data.byteLength;inPart++;count++;onProgress(count);
    }
    signal.throwIfAborted();await finish();signal.throwIfAborted();return archives;
  }catch(error){for(const archive of archives)URL.revokeObjectURL(archive.url);throw error;}
}
