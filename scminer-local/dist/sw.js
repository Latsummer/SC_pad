const CACHE_NAME = "xinghang-assistant-9a9f7f24c637b9fc";
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
  "./site-config.js?v=4972743ebf52",
  "./missions/index.json?v=43a27b58ba80",
  "./missions/blueprint-sources.json?v=539ebccc19c1",
  "./missions/blueprint-source-names.json?v=e9e49f2a0222",
  "./missions.js?v=8c2629e41d30",
  "./missions.css?v=602f9e8af833",
  "./theme.js?v=7c30c0eee6dd",
  "./styles.css?v=f187db5470cf",
  "./app.js?v=3df3430ff4a1",
  "./app-data.js?v=9cd903e439e1",
  "./blueprint-index.js?v=c9dc74ad2466",
  "./blueprints-data.js?v=58aa84465dd2",
  "./blueprint-locale.js?v=803777efdb68",
  "./blueprint-quality-model.js?v=5d610ec7d7c0",
  "./blueprint-quality.js?v=ce7e6394a32a",
  "./blueprints.js?v=b0d582f21906"
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
