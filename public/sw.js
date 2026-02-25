const CACHE_NAME = "cartera-base-v1";

// 🔥 INSTALL (solo instalar, no tocar Firebase)
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// 🔥 ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// 🔥 FETCH (NO interceptar Firebase)
self.addEventListener("fetch", (event) => {

  if (
    event.request.method !== "GET" ||
    event.request.url.includes("firestore") ||
    event.request.url.includes("googleapis")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((res) => {
      return res || fetch(event.request);
    })
  );

});