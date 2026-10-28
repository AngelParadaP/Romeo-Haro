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

export const eventCategories=['Boda','Cumpleaños','Celebración','Encuentro','Quinceañera','Otros'] as const;
export type EventSort='created-desc'|'created-asc'|'date-asc'|'date-desc'|'name'|'photos';
export function sortEvents(events:GalleryEvent[],sort:EventSort){
  return [...events].sort((a,b)=>{
    if(sort==='name')return a.title.localeCompare(b.title,'es');
    if(sort==='photos')return (b.photoCount??b.photos.length)-(a.photoCount??a.photos.length);
    if(sort==='date-asc'||sort==='date-desc')return (sort==='date-asc'?1:-1)*a.date.localeCompare(b.date);
    return (sort==='created-asc'?1:-1)*(a.createdAt||'').localeCompare(b.createdAt||'');
  });
}
export function monthDays(year:number,month:number){
  const start=new Date(year,month,1,12);const offset=(start.getDay()+6)%7;
  return Array.from({length:42},(_,i)=>{const date=new Date(year,month,1-offset+i,12);return {key:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,day:date.getDate(),inMonth:date.getMonth()===month};});
}
export function cropFromDrag(x:number,y:number,dx:number,dy:number,width:number,height:number,zoom:number){
  const clamp=(n:number)=>Math.min(100,Math.max(0,n));
  return {x:clamp(x-dx/Math.max(width,1)*100/zoom),y:clamp(y-dy/Math.max(height,1)*100/zoom)};
}
export const eventWindowHours=48;
export type ClosingMode='none'|'48h'|'custom';
export function openingFromEventDate(date:string){return date?`${date}T00:00`:'';}
export function defaultClosingMode(event?:GalleryEvent):ClosingMode {
  if(!event)return '48h';
  if(!event.uploadsCloseAt)return 'none';
  return event.uploadsOpenAt&&Date.parse(event.uploadsCloseAt)-Date.parse(event.uploadsOpenAt)===eventWindowHours*3600000?'48h':'custom';
}
export function uploadWindow(opening:string,closing:string,mode:ClosingMode){
  const start=opening?new Date(opening).toISOString():null;
  if(mode==='48h'&&!start)throw new Error('Selecciona la fecha del evento o una apertura para contar las 48 horas.');
  const end=mode==='48h'?new Date(Date.parse(start!)+eventWindowHours*3600000).toISOString():mode==='custom'&&closing?new Date(closing).toISOString():null;
  if(mode==='custom'&&!end)throw new Error('Selecciona la fecha y hora de cierre.');
  if(start&&end&&Date.parse(end)<=Date.parse(start))throw new Error('El cierre debe ser posterior a la apertura.');
  return {start,end};
}
export function isEventActive(event:GalleryEvent,now=Date.now()){
  return event.active&&!(event.archiveAfterClose&&event.uploadsCloseAt&&now>=Date.parse(event.uploadsCloseAt));
}
