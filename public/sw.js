// Service worker de Modo Incógnito.
//
// Cachea SOLO los cuerpos .glb: son lo único que pesa de verdad (varios MB
// por personaje) y no cambian casi nunca — una descarga y a jugar. TODO lo
// demás (motor, datos, estilos) va SIEMPRE a la red, a propósito: se
// publica varias veces al día y un motor cacheado significaría jugar con el
// build de ayer sin enterarse.
//
// La clave de caché es la URL SIN query: los .glb van sellados con ?v=BUILD
// (ver vite.config.js) y sin normalizar, cada build re-descargaría los
// mismos bytes. Si algún día un modelo cambia de contenido, se sube la
// versión de CACHE y listo.
const CACHE = "inc-models-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpia versiones viejas del caché de modelos.
      for (const key of await caches.keys()) {
        if (key.startsWith("inc-models-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.endsWith(".glb")) return; // el resto ni se toca: red normal

  const key = new Request(url.origin + url.pathname);
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(key, res.clone());
      return res;
    })()
  );
});
