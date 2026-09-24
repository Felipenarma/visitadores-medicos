// Service worker mínimo para instalar la app como PWA.
// No cachea la API (los datos siempre deben venir de red, ya que cambian
// constantemente). Solo guarda el "cascarón" de la app (HTML/JS/CSS) para
// que la carga sea instantánea y para que abrir la app sin señal muestre
// algo en vez de una pantalla en blanco.

const CACHE_NAME = 'narma-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nunca cachear llamadas a la API: siempre deben ir a la red.
  if (url.pathname.startsWith('/api/')) return;

  // Solo manejar el propio origen (no CDNs externos como unpkg/leaflet).
  if (url.origin !== self.location.origin) return;

  // Network-first con fallback a caché, para que las actualizaciones del
  // sitio lleguen de inmediato y solo se use caché si no hay conexión.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
