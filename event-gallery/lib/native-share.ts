export function canShareFiles(files:File[]){
  try{return typeof navigator!=='undefined'&&typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files});}catch{return false;}
}
export async function shareFiles(files:File[],title:string){
  if(!canShareFiles(files))throw new Error('Tu navegador no permite compartir estos archivos. Puedes descargarlos.');
  await navigator.share({files,title});
}
export function wasCancelled(error:unknown){return error instanceof Error&&error.name==='AbortError';}
