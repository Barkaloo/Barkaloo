const CACHE='barkaloo-v2.14-lilac-grammar-3';
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg','./apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png','./icons/favicon-32.png']);
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('barkaloo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  // Tutor requires its own authenticated network flow; do not return English's offline page.
  if(new URL(e.request.url).pathname.startsWith('/tutor/'))return;
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).catch(async()=>{
    const cache=await caches.open(CACHE);
    const match=await cache.match(e.request,{ignoreSearch:true});
    if(match)return match;
    if(e.request.mode==='navigate')return cache.match('./index.html');
    return Response.error();
  }));
});
