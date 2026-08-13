/**
 * LA BARRA QUE UNE LAS HERRAMIENTAS.
 *
 * Eran cinco páginas sueltas: para pasar del plano a los personajes había que
 * saber la URL o volver atrás en el navegador. Ahora cada una monta esta
 * misma tira y se salta a la de al lado con un clic, que es lo que las
 * convierte en UNA herramienta con pestañas en vez de cinco marcadores.
 *
 * La lista vive AQUÍ y solo aquí: añadir un builder es una línea, y es
 * imposible que una pestaña apunte a algo que ya no existe sin que se vea en
 * las otras cuatro a la vez.
 *
 * Las rutas son RELATIVAS (`../mapas/`) a propósito: el sitio entero cuelga
 * de un subdirectorio en GitHub Pages, y una ruta absoluta rompía justo ahí
 * — el mismo motivo por el que existe `src/data/siteRoot.js`.
 */
export const HERRAMIENTAS = [
  { id: "mapas", nombre: "Plano", que: "Zonas, tareas, escondites" },
  { id: "personajes", nombre: "Personajes", que: "Recetas y poses en 3D" },
  { id: "animaciones", nombre: "Animaciones", que: "Esqueleto y línea de tiempo" },
  { id: "musica", nombre: "Música", que: "Ánimo, tempo y mezcla" },
  { id: "pantallas", nombre: "Pantallas", que: "Storybook de la interfaz" },
  { id: "pruebas", nombre: "Pruebas", que: "Correr las comprobaciones" },
];

/**
 * @param {string} actual id de la herramienta en la que estamos (se marca y
 *   no se enlaza a sí misma).
 */
export function montarNav(actual) {
  for (const host of document.querySelectorAll("[data-creador-nav]")) {
    host.replaceChildren();
    for (const h of HERRAMIENTAS) {
      const a = document.createElement("a");
      a.className = `bar-nav-tab${h.id === actual ? " on" : ""}`;
      a.textContent = h.nombre;
      a.title = h.que;
      a.href = h.id === actual ? "#" : `../${h.id}/`;
      if (h.id === actual) a.setAttribute("aria-current", "page");
      host.appendChild(a);
    }
  }
}
