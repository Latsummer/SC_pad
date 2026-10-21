const CACHE_NAME = "xinghang-assistant-e82552f26a476f96";
const APP_SHELL = [
  "./",
  "./index.html",
  "./blueprints.html",
  "./styles.css",
  "./missions.html",
  "./missions.css",
  "./missions.js",
  "./missions.js?v=blueprint-sources-1",
  "./missions/index.json",
  "./missions/blueprint-sources.json",
  "./theme.js",
  "./app.js",
  "./blueprints.js",
  "./blueprint-quality.js",
  "./app-data.js",
  "./blueprints-data.js",
  "./blueprint-index.js",
  "./blueprint-locale.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon.svg?v=xinghang-2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/apple-touch-icon.png?v=xinghang-2",
  "./blueprint-quality-model.js",
  "./styles.css?v=4794d58f4459",
  "./app.js?v=404e3ef9bb51",
  "./app-data.js?v=2c2c3b7a586e",
  "./blueprint-index.js?v=b34bcdc532f8",
  "./blueprints-data.js?v=c1dcd5acaa40",
  "./blueprint-locale.js?v=803777efdb68",
  "./blueprint-quality-model.js?v=5d610ec7d7c0",
  "./blueprint-quality.js?v=1c56104124ea",
  "./blueprints.js?v=9c031791e6b1"
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (new URL(event.request.url).origin === self.location.origin && response.ok) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      }))
  );
});
