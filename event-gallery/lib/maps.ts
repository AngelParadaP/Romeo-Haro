// Keep the location in the existing address field; old street addresses still
// work until the photographer replaces them with the exact Maps share link.
export function mapsLink(value:string):string|null {
  try {
    const url=new URL(value.trim());
    if(url.protocol!=='https:'||url.username||url.password||url.port)return null;
    const host=url.hostname.toLowerCase();
    const googleHosts=['google.com','www.google.com','google.com.mx','www.google.com.mx','google.es','www.google.es'];
    const valid=host==='maps.app.goo.gl'&&url.pathname.length>1
      ||host==='goo.gl'&&url.pathname.startsWith('/maps/')
      ||['maps.google.com','maps.google.com.mx','maps.google.es'].includes(host)
      ||googleHosts.includes(host)&&/^\/maps(?:\/|$)/.test(url.pathname);
    return valid?url.href:null;
  } catch { return null; }
}
