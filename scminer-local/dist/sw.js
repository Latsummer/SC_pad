const CACHE_NAME = "xinghang-assistant-402d25a989f25be7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./blueprints.html",
  "./missions.html",
  "./manifest.webmanifest",
  "./icons/icon.svg?v=xinghang-2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png?v=xinghang-2",
  "./missions/index.json?v=7b1f3b50b3ff",
  "./missions/blueprint-sources.json?v=643f365edb18",
  "./missions.js?v=2945c17e333a",
  "./missions.css?v=33a0a59744e6",
  "./theme.js?v=7c30c0eee6dd",
  "./styles.css?v=01c63f72d4eb",
  "./app.js?v=404e3ef9bb51",
  "./app-data.js?v=2c2c3b7a586e",
  "./blueprint-index.js?v=b34bcdc532f8",
  "./blueprints-data.js?v=b4393f5a4cfb",
  "./blueprint-locale.js?v=803777efdb68",
  "./blueprint-quality-model.js?v=5d610ec7d7c0",
  "./blueprint-quality.js?v=1c56104124ea",
  "./blueprints.js?v=9a74240059c9"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// App pages and content-versioned resources belong to this worker release.
// Never wait for the network when this exact release is already cached.
self.addEventListener("fetch", (event) => {
  const request=event.request;
  if(request.method!=="GET") return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  const scope=new URL(self.registration.scope);
  if(!url.pathname.startsWith(scope.pathname)) return;
  const relative=url.pathname.slice(scope.pathname.length);
  const page=request.mode==='navigate' && ['', 'index.html','blueprints.html','missions.html'].includes(relative);
  const immutable=/^[a-f0-9]{12}$/.test(url.searchParams.get('v') || '') || /details-[a-f0-9]+-[a-f0-9]+\.json$/.test(relative);
  const key=page?new URL(relative || 'index.html',scope).href:request;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(key);
    if(cached && (page || immutable)) return cached;
    try {
      const response=await fetch(request);
      if(response.ok) event.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
      return response;
    } catch(error) {
      if(cached) return cached;
      // A missing mission page must not silently become the mineral home page.
      return Response.error();
    }
  })());
});
