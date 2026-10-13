const CACHE_VERSION = "basslayer-v9";   // v9: sin red, solo los datos de la lista (no imágenes ni búsquedas)
const STATIC_ASSETS = ["/", "/offline.html", "/favicon.svg", "/icon-192.png", "/icon-512.png",
  "/fonts/geist-latin-wght-normal.woff2", "/fonts/geist-mono-latin-wght-normal.woff2"];

// El primer render pide el JS y el CSS antes de que el service worker controle la página:
// por eso, al instalarse, se leen del index y se guardan ya, para que la app abra sin red.
async function guardarShell(cache) {
  await cache.addAll(STATIC_ASSETS);
  const html = await (await cache.match("/"))?.text();
  const assets = [...new Set([...(html || "").matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  await cache.addAll(assets).catch(() => {});
}

const SIN_RED = new Set(["/api/events", "/api/bass-news", "/api/festivals", "/api/ciclos", "/api/prices", "/api/news", "/api/finance-news", "/api/semana"]);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then(guardarShell));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;

  // Only cache same-origin requests — prevents cross-origin cache poisoning
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: red primero; si no hay red, la última respuesta guardada. Solo lo que la
  // app necesita para abrir sin red, y nunca lo privado (no-store / private): ni
  // fotos de artista (las cubre la caché HTTP) ni consultas sueltas que se acumulan.
  if (url.pathname.startsWith("/api/")) {
    if (request.method !== "GET" || !SIN_RED.has(url.pathname)) return;
    e.respondWith(
      fetch(request)
        .then((response) => {
          const cc = response.headers.get("cache-control") || "";
          if (response.ok && !/no-store|private/.test(cc)) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || Response.error()))
    );
    return;
  }

  // Navigation requests: network first, fallback to cache
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        // sin red: la página guardada; si nunca se visitó, la app guardada (es una sola página
        // y arma cualquier ruta); la página sin conexión queda para cuando no hay nada guardado
        .catch(() => caches.match(request).then((r) => r || caches.match("/")).then((r) => r || caches.match("/offline.html")))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
