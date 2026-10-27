"use client";
import {useEffect,useState} from 'react';
import {canShareFiles,shareFiles,wasCancelled} from '@/lib/native-share';
import {Icon} from './icon';

// Saving and sharing have separate intent and guidance. Browsers cannot target
// the iOS/Android photo library: both native flows use the system share sheet.
export function PhotoActions({files,imageUrl,onBusyChange}:{files:File[];imageUrl?:string;onBusyChange?:(busy:boolean)=>void}){
  const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const [error,setError]=useState('');const [fallback,setFallback]=useState('');
  const single=files.length===1;const file=single?files[0]:null;
  useEffect(()=>{if(imageUrl||!file)return;const url=URL.createObjectURL(file);setFallback(url);return()=>URL.revokeObjectURL(url);},[file,imageUrl]);
  const native=canShareFiles(files);const saveUrl=imageUrl||fallback;
  async function act(intent:'save'|'share'){
    setBusy(true);onBusyChange?.(true);setError('');
    setNotice(intent==='save'?`En el menú del sistema elige «${single?'Guardar imagen':'Guardar imágenes'}» o la opción equivalente de tu dispositivo.`:'Elige la persona o aplicación con la que quieras compartir.');
    try{await shareFiles(files,intent==='save'?'Guardar fotografía':'Compartir recuerdos');}
    catch(err){if(!wasCancelled(err))setError(err instanceof Error?err.message:'No se pudo abrir el menú del sistema.');}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <div className="photo-actions"><div className="save-actions">{native?<button className="primary" disabled={busy} onClick={()=>void act('save')}><Icon name="image"/>{single?'Guardar':'Guardar imágenes'}</button>:single&&saveUrl?<a className="primary" href={saveUrl} target="_blank" rel="noreferrer" onClick={()=>setNotice('En la imagen que se abre, mantenla pulsada y elige «Guardar imagen». En computadora, usa clic derecho.')}><Icon name="image"/>Guardar</a>:<button className="primary" disabled>Guardar imágenes</button>}<button className="secondary" disabled={busy||!native} onClick={()=>void act('share')}><Icon name="share"/>Compartir</button></div><p className="save-guide">{native?`Para guardar en Fotos, selecciona «${single?'Guardar imagen':'Guardar imágenes'}» en el menú que se abre. Para enviar${single?'la':'las'}, usa Compartir.`:'Para guardar, abre la imagen y mantenla pulsada. Este navegador no permite compartir archivos desde aquí.'}</p>{notice&&<p className="save-notice" role="status">{notice}</p>}{error&&<p className="form-error" role="alert">{error}</p>}</div>;
}
