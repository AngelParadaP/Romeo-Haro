import type { GalleryEvent } from './types';
export function uploadStatus(event: GalleryEvent, now = Date.now()): 'open' | 'scheduled' | 'closed' {
  if (!event.active || (event.uploadsCloseAt && now >= Date.parse(event.uploadsCloseAt))) return 'closed';
  if (event.uploadsOpenAt && now < Date.parse(event.uploadsOpenAt)) return 'scheduled';
  return 'open';
}
export function matchesEvent(event: GalleryEvent, query: string, from: string, until: string) {
  const text = `${event.title} ${event.date} ${new Date(event.date+'T12:00:00').toLocaleDateString('es-MX')}`.toLowerCase();
  return text.includes(query.toLowerCase().trim()) && (!from || event.date >= from) && (!until || event.date <= until);
}
export function eventGuestKey(eventId: string) { return `romeo-event-guest:${eventId}`; }
export function rememberGuest(eventId: string, userId: string, name: string) {
  try { localStorage.setItem(eventGuestKey(eventId), JSON.stringify({ userId, name })); } catch { /* Storage restrictions do not prevent entering. */ }
}
export function rememberedGuest(eventId: string, userId: string) {
  try { const stored = JSON.parse(localStorage.getItem(eventGuestKey(eventId)) || 'null'); return stored?.userId === userId && typeof stored?.name === 'string' ? stored.name.trim() : ''; } catch { return ''; }
}
