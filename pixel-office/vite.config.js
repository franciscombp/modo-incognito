import { defineConfig } from "vite";

// Relative asset URLs, so the build works unchanged wherever the Pages
// artifact ends up mounted (currently /modo-incognito/).
//
// `__BUILD_ID__` sella cada build. Vite le pone un hash al JS y al CSS, así
// que esos se refrescan solos, pero lo que vive en `public/` (los JSON de
// contenido, los pliegos) se sirve con su nombre de siempre y el navegador
// —y la CDN de Pages— se lo quedan. Resultado: publicas un cambio de plano y
// el juego sigue cargando el de ayer. Colgando el sello de la URL, cada build
// pide archivos que la caché no ha visto nunca.
export default defineConfig({
  base: "./",
  define: {
    __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? String(Date.now())),
  },
});
