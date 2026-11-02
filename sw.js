const CACHE='barkaloo-v2.4-standalone-2';
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(['./','./index.html','./manifest.webmanifest','./icon.svg']);
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('barkaloo-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(fetch(e.request).catch(async()=>{
    const cache=await caches.open(CACHE);
    const match=await cache.match(e.request,{ignoreSearch:true});
    if(match)return match;
    if(e.request.mode==='navigate')return cache.match('./index.html');
    return Response.error();
  }));
});
