"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {Icon} from "./icon";
import { supabase } from "@/lib/cloud";

type TurnstileAPI = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileAPI } }

function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    if (!loaded || !siteKey || !container.current || !window.turnstile) return;
    const id = window.turnstile.render(container.current, { sitekey: siteKey, theme: "light", callback: onToken, "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    return () => window.turnstile?.remove(id);
  }, [loaded, siteKey, onToken]);
  if (!siteKey) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setLoaded(true)} /><div ref={container} /></>;
}

export function Access({ guest = false, onGuest, onLogin }: { guest?: boolean; onGuest?: (name: string, captcha: string) => Promise<void>; onLogin?: () => Promise<void> }) {
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="access-shell"><section className="access-card"><a className="brand" href="/">r<span>h</span><i><Icon name="sparkle" size={30}/></i></a><span className="eyebrow">{guest ? "RECUERDOS COMPARTIDOS" : "TU ESTUDIO, TU ESPACIO"}</span><h1>{guest ? "Cada mirada cuenta." : "Bienvenido de nuevo."}</h1><p>{guest ? "Entra al evento para ver las fotos y compartir tus recuerdos. Quienes tengan el enlace podrán ver las imágenes." : "Inicia sesión con la cuenta de fotógrafo autorizada en Supabase."}</p><form onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    try {
      if (guest) await onGuest?.(String(form.get("name")).trim(), token);
      else {
        const result = await supabase().auth.signInWithPassword({ email: String(form.get("email")).trim(), password: String(form.get("password")), options: { captchaToken: token || undefined } });
        if (result.error) throw result.error;
        const admin = await supabase().rpc("is_admin");
        if (admin.error) throw admin.error;
        if (!admin.data) { await supabase().auth.signOut(); throw new Error("Tu cuenta no tiene acceso al estudio. Añade su UUID a admin_users desde Supabase."); }
        await onLogin?.();
      }
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo iniciar sesión."); setToken(""); setAttempt(value => value + 1); }
    finally { setBusy(false); }
  }}>
    {guest ? <label>Tu nombre<input name="name" required maxLength={60} placeholder="¿Cómo te llamas?" autoComplete="name" /></label> : <><label>Correo electrónico<input name="email" type="email" autoComplete="username" required /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required /></label></>}
    <Captcha key={attempt} onToken={setToken} />
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="primary" disabled={busy || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !token)}>{busy ? "Conectando…" : guest ? "Entrar al evento" : "Entrar a mi estudio"}<Icon name="arrow"/></button>
  </form><small>{guest ? "Tu sesión y tus favoritos se conservan en este navegador." : "Las cuentas de fotógrafo se crean y autorizan desde Supabase."}</small></section></div>;
}
