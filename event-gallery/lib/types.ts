export type Photo = { id: string; src: string; author: string; likes: string[]; favorites: string[]; likeCount?: number; storagePath?: string };
export type GalleryEvent = {
  id: string; createdAt?:string; title: string; date: string; category: string; cover: string; active: boolean; photos: Photo[]; photoCount?: number;
  description?: string; coverPath?: string | null; coverX?: number; coverY?: number; coverZoom?: number;
  uploadsOpenAt?: string | null; uploadsCloseAt?: string | null;
};
export type StudioContact = { name:string; email:string; whatsapp:string; address:string };
