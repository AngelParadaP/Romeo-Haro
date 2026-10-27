export type Photo = { id: string; src: string; author: string; likes: string[]; favorites: string[]; likeCount?: number };
export type GalleryEvent = { id: string; title: string; date: string; category: string; cover: string; active: boolean; photos: Photo[]; photoCount?: number };
