import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GalleryEvent, Photo } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const cloudConfigured = Boolean(url && publishableKey);
export const demoEnabled = !cloudConfigured && (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_DEMO_MODE === "true");
let client: SupabaseClient | undefined;
export function supabase() {
  if (!url || !publishableKey) throw new Error("Configura las variables de Supabase para conectar la plataforma.");
  return client ??= createClient(url, publishableKey);
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
export async function startSession(eventId: string | null, captchaToken?: string) {
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw new Error("El enlace del evento no es válido. Solicita el enlace publicado al fotógrafo.");
  const db = supabase();
  const { data, error } = await db.auth.getUser();
  // No session is expected on the first visit. Network failures are handled by sign-in/query.
  if (error && data.user) check(error);
  let user = data.user;
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
  let query = supabase().from("events").select("id,title,date,category,cover,active,photos(count)").is("deleted_at", null).order("created_at", { ascending: false });
  if (eventId) query = query.eq("id", eventId);
  else {
    const user = await supabase().auth.getUser(); check(user.error);
    if (!user.data.user) return [];
    query = query.eq("owner_id", user.data.user.id);
  }
  const { data, error } = await query; check(error);
  return (data || []).map(row => ({ ...row, photos: [], photoCount: row.photos?.[0]?.count ?? 0 }));
}
export async function persistEvent(event: GalleryEvent, exists: boolean) {
  const db = supabase();
  const values = { title: event.title, date: event.date, category: event.category, cover: event.cover, active: event.active };
  const query = exists ? db.from("events").update(values).eq("id", event.id) : db.from("events").insert({ ...values, id: event.id });
  const { data, error } = await query.select("id").single(); check(error);
  if (!data) throw new Error("No se pudo guardar el evento.");
}
export async function removeEvent(id: string) {
  // Logical deletion preserves objects for recovery; documented manual retention/cleanup.
  const { data, error } = await supabase().from("events").update({ active: false, deleted_at: new Date().toISOString() }).eq("id", id).select("id").single();
  check(error); if (!data) throw new Error("No se pudo eliminar el evento.");
}
type PhotoRow = { id: string; storage_path: string; author: string; like_count: number; liked: boolean; favorite: boolean };
export async function loadGallery(eventId: string, page: number, favorites: boolean, userId: string): Promise<{ photos: Photo[]; total: number }> {
  const db = supabase();
  const { data, error } = await db.rpc("gallery_page", { event_token: eventId, page_number: page, only_favorites: favorites }); check(error);
  const rows = data.items as PhotoRow[];
  if (!rows.length) return { photos: [], total: data.total };
  const signed = await db.storage.from("event-photos").createSignedUrls(rows.map(row => row.storage_path), 900); check(signed.error);
  return { total: data.total, photos: rows.map((row, i) => {
    const result = signed.data?.[i];
    if (!result?.signedUrl || result.error) throw new Error("No se pudo autorizar una fotografía. Actualiza la galería.");
    return { id: row.id, src: result.signedUrl, author: row.author, likeCount: row.like_count, likes: row.liked ? [userId] : [], favorites: row.favorite ? [userId] : [] };
  }) };
}
export async function uploadPhoto(eventId: string, userId: string, author: string, src: string) {
  const db = supabase(); const id = crypto.randomUUID(); const path = `${eventId}/${userId}/${id}.jpg`;
  const blob = await (await fetch(src)).blob();
  if (blob.size > 3 * 1024 * 1024) throw new Error("La imagen comprimida supera 3 MB.");
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
