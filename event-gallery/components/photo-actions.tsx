"use client";
import {useEffect,useState} from 'react';
import {canShareFiles,shareFiles,wasCancelled} from '@/lib/native-share';
import {Icon} from './icon';

// One action opens the system menu. Browsers cannot select a photo-library
// destination on behalf of the user.
export function PhotoActions({files,imageUrl,onBusyChange}:{files:File[];imageUrl?:string;onBusyChange?:(busy:boolean)=>void}){
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [error,setError]=useState('');const [fallback,setFallback]=useState('');
  const single=files.length===1;const file=single?files[0]:null;
  useEffect(()=>{if(imageUrl||!file)return;const url=URL.createObjectURL(file);setFallback(url);return()=>URL.revokeObjectURL(url);},[file,imageUrl]);
  const native=canShareFiles(files);const saveUrl=imageUrl||fallback;
  async function act(){
    setBusy(true);onBusyChange?.(true);setError('');
    setNotice(`Elige «${single?'Guardar imagen':'Guardar imágenes'}» para conservar${single?'la':'las'} en Fotos, o selecciona una aplicación para compartir.`);
    try{await shareFiles(files,'Mis recuerdos');}
    catch(err){if(!wasCancelled(err))setError(err instanceof Error?err.message:'No se pudo abrir el menú del sistema.');}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <div className="photo-actions"><div className="save-actions">{native?<button className="primary" disabled={busy} onClick={()=>void act()}><Icon name="share"/>Guardar y compartir</button>:single&&saveUrl?<a className="primary" href={saveUrl} target="_blank" rel="noreferrer" onClick={()=>setNotice('En la imagen que se abre, mantenla pulsada y elige «Guardar imagen». En computadora, usa clic derecho.')}><Icon name="image"/>Guardar</a>:<button className="primary" disabled>Guardar y compartir</button>}</div><p className="save-guide">{native?`Para guardar en Fotos, selecciona «${single?'Guardar imagen':'Guardar imágenes'}» en el menú que se abre. También puedes elegir una aplicación para compartir.`:'Para guardar, abre la imagen y mantenla pulsada. Este navegador no permite compartir archivos desde aquí.'}</p>{notice&&<p className="save-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
