export type StorageProvider='supabase'|'google-drive'|'r2';
export type Photo = { id: string; src: string; author: string; likes: string[]; favorites: string[]; likeCount?: number; storagePath?: string; storageProvider?:StorageProvider };
export type GalleryEvent = {
  id: string; createdAt?:string; title: string; date: string; category: string; cover: string; active: boolean; photos: Photo[]; photoCount?: number;
  invitationText?:string; description?: string; coverPath?: string | null; coverProvider?:StorageProvider; coverUnavailable?:boolean; coverX?: number; coverY?: number; coverZoom?: number;
  archivedAt?:string | null; archiveAfterClose?:boolean; uploadsOpenAt?: string | null; uploadsCloseAt?: string | null;
};
export type StudioContact = { name:string; email:string; whatsapp:string; address:string };
