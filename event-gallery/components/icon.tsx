import type { CSSProperties } from 'react';
const paths = {
  sparkle: <><path d="M12 2v20M2 12h20M5 5l14 14M5 19 14-14"/><circle cx="12" cy="12" r="3"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  image:<><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/></>,
  share:<><path d="M12 16V3m-5 5 5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></>,
  download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,
  bookmark:<path d="M6 3h12v19l-6-4-6 4Z"/>,
  heart:<path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z"/>,
  star:<path d="m12 2 3.1 6.3 7 .9-5.1 4.9 1.2 6.9-6.2-3.3-6.2 3.3 1.2-6.9L2 9.2l6.9-.9Z"/>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/></>,
  camera:<><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="4"/></>,
  edit:<><path d="m16 3 5 5-12 12-6 1 1-6ZM14 5l5 5"/></>,
  arrow:<path d="M5 19 19 5M5 5h14v14"/>,
  plus:<path d="M12 4v16M4 12h16"/>,
  close:<path d="m5 5 14 14M5 19 19 5"/>,
  search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
  chevron:<path d="m8 5 7 7-7 7"/>,
  mail:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 7 9-7"/></>,
  phone:<><path d="m5 3 4 1 1 5-3 2a16 16 0 0 0 6 6l2-3 5 1 1 4c-1 5-9 2-14-3S0 4 5 3Z"/></>,
  pin:<><path d="M19 10c0 6-7 12-7 12S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  contact:<><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2m2-15h4m-4 5h4m-3 5h3"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  check:<path d="m4 12 5 5L20 6"/>,
  qr:<><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h3v3h4v4h-7zm7-1v1"/></>,
  trash:<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
  refresh:<><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/></>,
  sort:<><path d="M7 3v18m-4-4 4 4 4-4M15 4h6m-6 5h5m-5 5h4"/></>,
} satisfies Record<string, React.ReactNode>;
export type IconName=keyof typeof paths;
export function Icon({name,size=18,filled=false,style}:{name:IconName;size?:number;filled?:boolean;style?:CSSProperties}){
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style}>{paths[name]}</svg>;
}
