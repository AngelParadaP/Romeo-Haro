"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
export function ShareDialog({ id, title, local, onClose }: { id: string; title: string; local: boolean; onClose: () => void }) {
  const [qr, setQr] = useState(""); const [url, setUrl] = useState(""); const [message, setMessage] = useState("");
  useEffect(() => {
    const link = `${location.origin}/?evento=${encodeURIComponent(id)}`; setUrl(link);
    QRCode.toDataURL(link, { width: 800, margin: 3, errorCorrectionLevel: "M", color: { dark: "#294c3c", light: "#ffffff" } }).then(setQr).catch(() => setMessage("No se pudo generar el QR."));
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler); return () => document.removeEventListener("keydown", handler);
  }, [id, onClose]);
  return <div className="overlay" onClick={onClose}><section className="modal share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={e => e.stopPropagation()}><button className="close" onClick={onClose} aria-label="Cerrar">×</button><span className="eyebrow">INVITA A COMPARTIR</span><h2 id="share-title">{title}</h2><p>Escanea el código y entra directamente al evento.</p>{qr && <img className="qr-image" src={qr} alt={`Código QR para ${title}`} />}<input aria-label="Enlace del evento" readOnly value={url} onFocus={e => e.currentTarget.select()} /><div className="share-actions"><button className="primary" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Enlace copiado."); } catch { setMessage("Selecciona el enlace y cópialo manualmente."); } }}>Copiar enlace</button>{qr && <a className="secondary" href={qr} download={`evento-${id}-qr.png`}>Descargar QR ↓</a>}<a className="secondary" href={url} target="_blank" rel="noreferrer">Abrir evento ↗</a></div>{local && <p className="form-error">Demo local: el enlace y QR solo muestran este evento en este navegador. Conecta Supabase y publica antes de imprimir el código.</p>}<p>Quien tenga este enlace puede entrar y compartirlo.</p>{message && <p role="status">{message}</p>}</section></div>;
}
