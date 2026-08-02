// Dónde está la RAÍZ del sitio, vista desde la página que está corriendo
// ahora mismo — no desde dónde vive el módulo que pregunta.
//
// `import.meta.env.BASE_URL` (= "./", ver `base` en vite.config.js) y
// `import.meta.url` cambian de significado según si el código corre suelto
// (`npm run dev`, cada archivo en su ruta de `src/`) o empaquetado (build,
// todo metido en `assets/`) — cualquiera de los dos rompe en el otro modo,
// o en un builder anidado, o bajo el subdirectorio de GitHub Pages. Lo único
// que es SIEMPRE cierto en los dos modos es la forma de la URL de la página:
// la raíz del juego vive en `index.html`, y cada builder vive exactamente
// dos carpetas por debajo, en `creador/<nombre>/index.html`. Contar eso en
// `location.pathname` da la ruta correcta sin que importe si el sitio
// cuelga de un dominio propio o de `usuario.github.io/repo/`.
export function siteRoot() {
  return location.pathname.includes("/creador/") ? "../../" : "./";
}
