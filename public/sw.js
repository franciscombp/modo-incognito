// Service worker de Modo Incógnito.
//
// ── QUÉ HACE, EN TRES FRASES ─────────────────────────────────────────
// Los cuerpos .glb se cachean una vez y para siempre (son los megas de
// verdad y casi nunca cambian). TODO lo demás se va cacheando al usarse,
// así que el juego FUNCIONA SIN RED una vez visitado. Y cuando hay red y
// sale un build nuevo, este worker NO lo impone: avisa a la página, que
// enseña la nota de «nueva versión» y actualiza cuando la jugadora quiera.
//
// ── CÓMO SE VERSIONA ─────────────────────────────────────────────────
// main.js registra `sw.js?v=BUILD_ID`. Ese query hace dos trabajos:
// 1. Un build nuevo cambia la URL del script → el navegador lo trata como
//    worker NUEVO y dispara el flujo de actualización (updatefound), que
//    es la señal de la nota de versión. Sin esto, un sw.js de bytes
//    idénticos jamás avisaría de nada.
// 2. `self.location.search` nos da el BUILD_ID aquí dentro, y con él se
//    nombra la caché de app: cada versión estrena caché y `activate`
//    barre las anteriores. La de modelos queda FUERA del versionado — un
//    .glb de 7 MB no se re-descarga porque cambió un CSS.
//
// ── POR QUÉ NO HAY skipWaiting AUTOMÁTICO ────────────────────────────
// El worker nuevo espera en `waiting` hasta que la página mande
// SKIP_WAITING (la jugadora tocó la nota) o hasta que se cierren todas
// las pestañas. Activarse solo a mitad de partida significaría mezclar
// motor viejo con datos nuevos en caliente.

const BUILD = new URLSearchParams(self.location.search).get("v") ?? "dev";
const MODEL_CACHE = "inc-models-v1";
const APP_CACHE = `inc-app-${BUILD}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // El cascarón mínimo para arrancar offline: la portada. El resto
      // (JS hasheado, datos, sprites) cae en caché al primer uso.
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(["./"]).catch(() => {
        /* sin red durante la instalación: se llenará al navegar */
      });
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        const stale =
          (key.startsWith("inc-app-") && key !== APP_CACHE) ||
          (key.startsWith("inc-models-") && key !== MODEL_CACHE);
        if (stale) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Los cuerpos: caché aparte, clave sin query (el ?v= de los .glb es un
  // sello de build, no un contenido distinto — sin normalizar, cada build
  // re-descargaría los mismos megas).
  if (url.pathname.endsWith(".glb")) {
    const key = new Request(url.origin + url.pathname);
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODEL_CACHE);
        const hit = await cache.match(key);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(key, res.clone());
        return res;
      })()
    );
    return;
  }

  // Navegaciones (la portada): RED PRIMERO, porque es el único documento
  // sin hash y quedarse con el de ayer significaría jugar el build viejo
  // sin saberlo. Sin red, sale el cacheado — eso ES el modo offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put("./", res.clone());
          return res;
        } catch {
          return (await cache.match("./")) ?? (await cache.match(req)) ?? Response.error();
        }
      })()
    );
    return;
  }

  // Lo hasheado (/assets/): CACHÉ PRIMERO. El hash en el nombre lo hace
  // inmutable — un acierto jamás es un archivo desactualizado.
  if (url.pathname.includes("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // El resto (datos, sprites, manifest…): RED PRIMERO, caché de respaldo.
  //
  // No es solo prudencia con los sellos ?v=: ir a caché primero aquí ROMPÍA
  // LAS HERRAMIENTAS. Los checks de tools/ reescriben datos interceptando
  // la red (check-retry reactiva el cruce parcheando dia-1.json al vuelo
  // con page.route), y un JSON servido desde caché nunca pasa por esa
  // intercepción: el check veía el día sin cruce y moría esperando la
  // tarjeta de derrota. Con red-primero, online se comporta EXACTO igual
  // que sin service worker — la caché solo habla cuando no hay red.
  event.respondWith(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) ?? Response.error();
      }
    })()
  );
});
