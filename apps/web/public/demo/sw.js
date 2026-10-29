// Caches the page shell so it opens instantly. The video streams with Range
// requests, which a cached full response would break on Safari, so it stays on the network.
const CACHE = "dalgeurak-demo-v1";
const FILES = ["./", "index.html", "manifest.webmanifest", "poster.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.headers.has("range")) return;
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)));
});
