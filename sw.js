const CACHE='barkaloo-v3-cloud-1';
const SHELL=['./','./index.html','./manifest.webmanifest','./icon.svg',...Array.from({length:11},(_,i)=>`./app-${String(i).padStart(2,'0')}.b64`),'./app-11a.b64','./app-11b.b64','./app-11c.b64','./app-11d.b64','./app-11e.b64','./app-11f.b64','./app-11g.b64','./app-11h.b64'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});