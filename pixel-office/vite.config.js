import { defineConfig } from "vite";
import { resolve } from "node:path";

// Relative asset URLs, so the build works unchanged wherever the Pages
// artifact ends up mounted (currently /modo-incognito/).
//
// `__BUILD_ID__` sella cada build. Vite le pone un hash al JS y al CSS, así
// que esos se refrescan solos, pero lo que vive en `public/` (los JSON de
// contenido, los pliegos) se sirve con su nombre de siempre y el navegador
// —y la CDN de Pages— se lo quedan. Resultado: publicas un cambio de plano y
// el juego sigue cargando el de ayer. Colgando el sello de la URL, cada build
// pide archivos que la caché no ha visto nunca.
//
// El BUILDER es una entrada más, no un archivo suelto en `public/`. Estuvo
// ahí y no funcionaba publicado: `public/` se copia tal cual, sin resolver
// imports, así que había que traerse three de un CDN (y de una versión de
// 2021, incompatible con el motor) y colgar el bundle del juego con su hash
// escrito a mano — hash que Vite regenera en cada build, con lo que la página
// se rompía en el deploy siguiente. Como entrada de verdad, Vite le resuelve
// `three` y el `character3d.js` REAL del motor, que es justo lo que hace que
// el editor no pueda desincronizarse de lo que sale al jugar.
export default defineConfig({
  base: "./",
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? String(Date.now())),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        builder: resolve(import.meta.dirname, "builder/index.html"),
        personajes: resolve(import.meta.dirname, "builder/personajes.html"),
      },
    },
  },
});
