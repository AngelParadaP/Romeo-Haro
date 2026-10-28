import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GalleryEvent, Photo, StudioContact, StorageProvider } from "./types";
import {driveURLs,driveUpload,uploadProvider,storageRequest} from "./storage-client";
import {mapsLink} from "./maps";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && publishableKey);
export const demoEnabled = !cloudConfigured && (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_MODE === "true");
let client: SupabaseClient | undefined;
export function supabase() {
  if (!url || !publishableKey) throw new Error("Configura las variables de Supabase para conectar la plataforma.");
  return client ??= createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
// Reuse stored sessions, but validate the user with Auth before restoring the event.
// A network failure must not replace an existing guest with a new anonymous identity.
export async function existingUser() {
  const db=supabase();
  const stored=await db.auth.getSession();check(stored.error);
  if(!stored.data.session)return null;
  const verified=await db.auth.getUser();check(verified.error);
  return verified.data.user;
}
export async function startSession(eventId: string | null, captchaToken?: string) {
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw new Error("El enlace del evento no es válido. Solicita el enlace publicado al fotógrafo.");
  const db = supabase();
  let user = await existingUser();
  if (!user && eventId) {
    const response = await db.auth.signInAnonymously({ options: { captchaToken } });
    check(response.error); user = response.data.user;
  }
  if (!user) return { userId: "", admin: false, events: [] as GalleryEvent[] };
  const admin = await db.rpc("is_admin"); check(admin.error);
  if (eventId) { const joined = await db.rpc("join_event", { event_token: eventId }); check(joined.error); }
  return { userId: user.id, admin: Boolean(admin.data), events: await loadEvents(eventId) };
}
export async function loadEvents(eventId: string | null = null): Promise<GalleryEvent[]> {
  let query = supabase().from("events").select("id,created_at,title,date,category,cover,active,description,invitation_text,cover_path,cover_provider,cover_x,cover_y,cover_zoom,uploads_open_at,uploads_close_at,archive_after_close,archived_at,photos(count)").is("deleted_at", null).order("created_at", { ascending: false });
  if (eventId) query = query.eq("id", eventId);
  else {
    const user = await supabase().auth.getUser(); check(user.error);
    if (!user.data.user) return [];
    query = query.eq("owner_id", user.data.user.id);
  }
  const { data, error } = await query; check(error);
  return Promise.all((data || []).map(async row => {
    let cover = row.cover;
    if (row.cover_path&&['google-drive','r2'].includes(row.cover_provider)) {
      [cover]=await driveURLs('event-covers',[row.cover_path],row.cover_provider);
    } else if (row.cover_path) {
      const signed = await supabase().storage.from("event-covers").createSignedUrl(row.cover_path, 900); check(signed.error);
      if (!signed.data?.signedUrl) throw new Error("No se pudo cargar la portada del evento.");
      cover = signed.data.signedUrl;
    }
    return { id: row.id, createdAt: row.created_at, title: row.title, date: row.date, category: row.category, active: row.active, cover,
      description: row.description, invitationText:row.invitation_text, coverPath: row.cover_path, coverProvider:row.cover_provider, coverX: row.cover_x, coverY: row.cover_y, coverZoom: Number(row.cover_zoom),
      archivedAt:row.archived_at, archiveAfterClose:row.archive_after_close, uploadsOpenAt: row.uploads_open_at, uploadsCloseAt: row.uploads_close_at, photos: [], photoCount: row.photos?.[0]?.count ?? 0 };
  }));
}
export async function persistEvent(event: GalleryEvent, exists: boolean) {
  const db = supabase();
  const values = { title: event.title, date: event.date, category: event.category, cover: event.coverPath ? "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=85" : event.cover, active: event.active,
    invitation_text:event.invitationText ?? 'Te invitamos a compartir tus mejores recuerdos.',
    description: event.description ?? "Un día especial. Todas las miradas. Un mismo recuerdo.", cover_path: event.coverPath || null, cover_provider:event.coverProvider||"supabase",
    cover_x: event.coverX ?? 50, cover_y: event.coverY ?? 50, cover_zoom: event.coverZoom ?? 1,
    archive_after_close:Boolean(event.archiveAfterClose&&event.uploadsCloseAt), uploads_open_at: event.uploadsOpenAt || null, uploads_close_at: event.uploadsCloseAt || null };
  const query = exists ? db.from("events").update(values).eq("id", event.id) : db.from("events").insert({ ...values, id: event.id });
  const { data, error } = await query.select("id,archived_at").single(); check(error);
  if (!data) throw new Error("No se pudo guardar el evento.");
  return data.archived_at as string|null;
}
export async function removeEvent(id: string) {
  // Logical deletion preserves objects for recovery; documented manual retention/cleanup.
  const { data, error } = await supabase().from("events").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", id).select("id").single();
  check(error); if (!data) throw new Error("No se pudo eliminar el evento.");
}
type PhotoRow = { id: string; storage_path: string; storage_provider:StorageProvider; author: string; like_count: number; liked: boolean; favorite: boolean };
export async function loadGallery(eventId: string, page: number, favorites: boolean, userId: string): Promise<{ photos: Photo[]; total: number }> {
  const db = supabase();
  const { data, error } = await db.rpc("gallery_page", { event_token: eventId, page_number: page, only_favorites: favorites }); check(error);
  const rows = data.items as PhotoRow[];
  if (!rows.length) return { photos: [], total: data.total };
  const legacy=rows.filter(row=>!['google-drive','r2'].includes(row.storage_provider));
  const signed=legacy.length?await db.storage.from("event-photos").createSignedUrls(legacy.map(row=>row.storage_path),900):null;
  if(signed)check(signed.error);
  const urls=new Map<string,string>();
  legacy.forEach((row,i)=>{const result=signed?.data?.[i];if(!result?.signedUrl||result.error)throw new Error("No se pudo autorizar una fotografía.");urls.set(row.storage_path,result.signedUrl);});
  for(const provider of ['google-drive','r2']){const external=rows.filter(row=>row.storage_provider===provider);const links=await driveURLs('event-photos',external.map(row=>row.storage_path),provider);external.forEach((row,i)=>urls.set(row.storage_path,links[i]));}
  return {total:data.total,photos:rows.map(row=>({id:row.id,storagePath:row.storage_path,storageProvider:row.storage_provider,src:urls.get(row.storage_path)!,author:row.author,likeCount:row.like_count,likes:row.liked?[userId]:[],favorites:row.favorite?[userId]:[]}))};
}
export async function uploadPhoto(eventId: string, userId: string, author: string, src: string) {
  const db = supabase(); const id = crypto.randomUUID(); const path = `${eventId}/${userId}/${id}.jpg`;
  const blob = await (await fetch(src)).blob();
  if (blob.size > 3 * 1024 * 1024) throw new Error("La imagen comprimida supera 3 MB.");
  if(uploadProvider!=="supabase"){await driveUpload('event-photos',eventId,blob,author);return;}
  const uploaded = await db.storage.from("event-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }); check(uploaded.error);
  const inserted = await db.from("photos").insert({ id, event_id: eventId, author_id: userId, author, storage_path: path });
  if (inserted.error) {
    await db.storage.from("event-photos").remove([path]);
    check(inserted.error);
  }
}
export async function toggleReaction(photoId: string, field: "likes" | "favorites", active: boolean, userId: string) {
  const query = supabase().from(field === "likes" ? "photo_likes" : "photo_favorites");
  const { error } = active ? await query.delete().eq("photo_id", photoId).eq("user_id", userId) : await query.upsert({ photo_id: photoId, user_id: userId }, { onConflict: "photo_id,user_id", ignoreDuplicates: true });
  check(error);
}

export async function uploadCover(eventId: string, userId: string, src: string) {
  const path = `${userId}/${eventId}/${crypto.randomUUID()}.jpg`;
  const blob = await (await fetch(src)).blob();
  if (blob.size > 3 * 1024 * 1024) throw new Error("La portada comprimida supera 3 MB.");
  if(uploadProvider!=="supabase")return (await driveUpload('event-covers',eventId,blob)).path;
  const result = await supabase().storage.from("event-covers").upload(path, blob, { contentType: "image/jpeg" }); check(result.error);
  return path;
}
export async function discardCover(path: string) {
  if(uploadProvider!=="supabase"){await storageRequest("/api/storage/file",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({path,provider:uploadProvider})});return;}
  const result = await supabase().storage.from("event-covers").remove([path]); check(result.error);
}

export async function loadStudio(eventId?: string):Promise<StudioContact|null>{
  if(eventId){const result=await supabase().rpc('event_contact',{event_token:eventId});check(result.error);return result.data;}
  const user=await existingUser();if(!user)throw new Error('Inicia sesión para editar el estudio.');
  const result=await supabase().from('studio_profiles').select('name,email,whatsapp,address').eq('owner_id',user.id).maybeSingle();check(result.error);return result.data;
}
export async function saveStudio(contact:StudioContact){
  if(contact.address.trim()&&!mapsLink(contact.address))throw new Error("Pega un enlace HTTPS de Google Maps para la ubicación del estudio.");
  const user=await existingUser();if(!user)throw new Error('Inicia sesión para guardar el contacto.');
  // Preserve ownership. Do not UPDATE owner_id via an upsert.
  const existing=await supabase().from('studio_profiles').select('owner_id').eq('owner_id',user.id).maybeSingle();check(existing.error);
  const result=existing.data?await supabase().from('studio_profiles').update(contact).eq('owner_id',user.id).select('owner_id').single():await supabase().from('studio_profiles').insert({...contact,owner_id:user.id}).select('owner_id').single();check(result.error);
}
