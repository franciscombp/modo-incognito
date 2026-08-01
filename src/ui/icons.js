/**
 * ICONOS DIBUJADOS, NO TIPOGRÁFICOS.
 *
 * Aquí no hay emojis a propósito. Un emoji lo dibuja la fuente del sistema:
 * el mismo ☕ es una taza blanca en un iPhone, marrón en Android y plana en
 * Windows, y hay plataformas donde directamente sale un cuadro. Eso no se
 * puede controlar desde el juego, y el estilo cozy se cae en cuanto un icono
 * llega con el color y el trazo de otra parte.
 *
 * Son SVG de trazo, en una rejilla de 24×24 y con `currentColor`, así que
 * heredan el color del sitio donde se pongan y se ven igual en todas partes.
 *
 * Para añadir uno: una entrada más en `PATHS`. Para usarlo: `icon("coffee")`
 * (cadena, para innerHTML) o `iconEl("coffee")` (nodo). Un nombre que no
 * exista avisa por consola y devuelve un hueco — antes de esto, un icono mal
 * escrito era un cuadrito vacío que nadie sabía de dónde salía.
 */

const S = 24;

/** Cada entrada es el contenido de un `<svg viewBox="0 0 24 24">`. */
const PATHS = {
  // --- navegación y menús ---
  play: '<path d="M8 5v14l11-7z"/>',
  star: '<path d="M12 3l2.4 5.6L20 9.3l-4.2 4 1 5.7L12 16.3 7.2 19l1-5.7-4.2-4 5.6-.7z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5l1.3 2.6 2.9-.5.6 2.9 2.6 1.3-1.6 2.5 1.6 2.5-2.6 1.3-.6 2.9-2.9-.5L12 21.5l-1.3-2.6-2.9.5-.6-2.9-2.6-1.3L6.2 12 4.6 9.5l2.6-1.3.6-2.9 2.9.5z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 015.2.9c0 1.8-2.6 2.2-2.6 4"/><circle cx="12" cy="17.6" r="1.1"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  // Antifaz: el juego va de pasar desapercibida.
  incognito: '<path d="M3 10.5h18M6.5 10.5c-.4 3.2.6 5 2.8 5 1.9 0 2.7-1.3 2.7-3.4 0 2.1.8 3.4 2.7 3.4 2.2 0 3.2-1.8 2.8-5"/><path d="M7.5 10.5c1-3 2.6-4.5 4.5-4.5s3.5 1.5 4.5 4.5"/>',

  // --- HUD ---
  diamond: '<path d="M12 3l7 9-7 9-7-9z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.4 2"/>',
  eye: '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2"/><circle cx="12" cy="17" r="1"/>',

  // --- actividades del plano (scenes/*.json -> activities[].icon) ---
  coffee: '<path d="M4 8h12v5.5a4.5 4.5 0 01-4.5 4.5h-3A4.5 4.5 0 014 13.5z"/><path d="M16 9.5h1.6a2.4 2.4 0 010 4.8H16"/><path d="M4 20.5h12"/>',
  chat: '<path d="M4 5.5h16v10H9.5L5.5 19v-3.5H4z"/>',
  movie: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M3 10h18M8 6v4M13 6v4M18 6v4"/>',
  sleep: '<path d="M20 14.5A8.2 8.2 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
  snack: '<path d="M5 9.5h14l-1.2 9.2a1.5 1.5 0 01-1.5 1.3H7.7a1.5 1.5 0 01-1.5-1.3z"/><path d="M8.5 9.5V7a3.5 3.5 0 017 0v2.5"/>',
  stretch: '<circle cx="12" cy="5" r="2"/><path d="M12 8v6M12 14l-3 6M12 14l3 6M5.5 10l6.5 1 6.5-1"/>',
  meeting: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M7 13.5V10M11 13.5V7.5M15 13.5v-2.5M12 17v3M8.5 20h7"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10.5 18.5h3"/>',

  // --- resultado del día ---
  trophy: '<path d="M7 4h10v5a5 5 0 01-10 0z"/><path d="M7 5.5H4.5v1.8A3.2 3.2 0 007.3 10M17 5.5h2.5v1.8A3.2 3.2 0 0116.7 10"/><path d="M12 14v3.5M8.5 20.5h7"/>',
  party: '<path d="M3.5 20.5l5.5-13 8 8z"/><path d="M15 3.5v2M19.5 6l-1.5 1.4M20.5 11h-2"/>',
  door: '<path d="M6 3.5h9a1 1 0 011 1v15a1 1 0 01-1 1H6z"/><circle cx="12.5" cy="12" r="1"/>',
  egg: '<path d="M12 3c3.3 0 6 4.5 6 8.6a6 6 0 11-12 0C6 7.5 8.7 3 12 3z"/>',

  // --- estados y avisos ---
  siren: '<path d="M6 18v-4.5a6 6 0 1112 0V18z"/><path d="M4 18h16M12 3.5V2M4.5 8L3.2 7M19.5 8l1.3-1"/>',
  boss: '<circle cx="12" cy="7" r="3.4"/><path d="M4.8 20.5a7.2 7.2 0 0114.4 0"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.7 2.7 0 015.2.9c0 1.8-2.6 2.2-2.6 4"/><circle cx="12" cy="17.6" r="1.1"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 6.3A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a15 15 0 01-3 3.6M6.4 8.5A15 15 0 002.5 12S6 18 12 18c1 0 1.9-.2 2.7-.4"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  map: '<path d="M9 4.5L3.5 6.8v13L9 17.2l6 2.3 5.5-2.3v-13L15 6.8z"/><path d="M9 4.5v12.7M15 6.8v12.7"/>',
  hand: '<path d="M8.5 11V5.2a1.6 1.6 0 013.2 0V10m0-.5V4.2a1.6 1.6 0 013.2 0V10m0-.2V6.2a1.6 1.6 0 013.2 0V14a6.5 6.5 0 01-6.5 6.5h-.8A6.4 6.4 0 015 15.6l-.6-1.8a1.6 1.6 0 013-1l1.1 2.5"/>',
  plant: '<path d="M8 21h8l-.8-6.5H8.8z"/><path d="M12 14.5V9M12 9c0-2.5-1.6-4.5-4-4.5 0 2.5 1.6 4.5 4 4.5zm0 0c0-2.5 1.6-4.5 4-4.5 0 2.5-1.6 4.5-4 4.5z"/>',
  person: '<circle cx="12" cy="6" r="2.6"/><path d="M12 8.6v7M12 15.6l-2.6 5.4M12 15.6l2.6 5.4M8.4 11h7.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 9.5h17M8 3.5V6.5M16 3.5V6.5"/>',
  stairs: '<path d="M3.5 20.5h4v-4h4v-4h4v-4h4"/>',
  elevator: '<rect x="4.5" y="3.5" width="15" height="17" rx="1.5"/><path d="M12 3.5v17"/><path d="M8.2 9.5L9.9 7l1.7 2.5M12.4 14.5l1.7 2.5 1.7-2.5"/>',
  people: '<circle cx="8.5" cy="8" r="2.8"/><circle cx="16" cy="9" r="2.3"/><path d="M3.5 19a5 5 0 0110 0M14 19a4.3 4.3 0 016.5-3.7"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="1.8"/><path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M18 13h.01M9.5 13h5"/>',
  restroom: '<circle cx="7.5" cy="5" r="1.8"/><path d="M7.5 7.5L5.5 14h1.3v6.5h1.4V14h1.3z"/><circle cx="16.5" cy="5" r="1.8"/><path d="M16.5 7.5L14 15h1.6l.3 5.5h1.2l.3-5.5H19z"/>',

  // --- audio ---
  'volume-x': '<path d="M3 9v6M3 12h4l5-5v16l-5-5H3M20.5 7.5A9 9 0 0120.5 16.5M16 10a6 6 0 010 8"/>',
  'volume-1': '<path d="M3 9v6M3 12h4l5-5v16l-5-5H3M16 10a6 6 0 010 8"/>',
  'volume-2': '<path d="M3 9v6M3 12h4l5-5v16l-5-5H3M16 10a6 6 0 010 8M20.5 7.5A9 9 0 0120.5 16.5"/>',
};

/** Alias, para que el contenido pueda llamarlos como le resulte natural. */
const ALIAS = { cafe: "coffee", pelicula: "movie", dormir: "sleep", comer: "snack", reunion: "meeting" };

/** El SVG como cadena, listo para `innerHTML`. */
export function icon(name, { size = S, className = "px-icon" } = {}) {
  const key = ALIAS[name] ?? name;
  const body = PATHS[key];
  if (!body) {
    console.warn(`[modo-incognito] icono desconocido: "${name}". Hay: ${Object.keys(PATHS).join(", ")}`);
    return "";
  }
  // `stroke-linecap`/`linejoin` redondos y trazo grueso: es lo que hace que
  // peguen con el resto, que es todo formas blandas y sin esquinas duras.
  // `xmlns` SIEMPRE: inline en HTML se puede omitir, pero un SVG servido como
  // imagen suelta (ver `iconImage`) sin él es inválido y NO CARGA — sin error
  // ninguno, simplemente no se dibuja nada.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 24 24" ` +
    `width="${size}" height="${size}" ` +
    `fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`
  );
}

/** El mismo icono como nodo, para cuando no se está montando HTML a mano. */
export function iconEl(name, opts) {
  const span = document.createElement("span");
  span.className = "px-icon-slot";
  span.innerHTML = icon(name, opts);
  return span;
}

/** ¿Existe? Lo usan los datos, que pueden pedir un icono que nadie dibujó. */
export function hasIcon(name) {
  return !!PATHS[ALIAS[name] ?? name];
}

export const ICON_NAMES = Object.keys(PATHS);

const imgCache = new Map();

/**
 * El icono como imagen, para pintarlo en un canvas.
 *
 * Los rótulos del piso son texturas de canvas, y ahí no se puede meter un
 * `<svg>`: se dibujaban con `ctx.fillText` y una fuente de emoji, que es
 * justo lo que hace que el mismo icono salga distinto en cada sistema. Así
 * sale del MISMO dibujo que el resto de la interfaz.
 *
 * Devuelve la imagen aunque todavía no haya cargado (`.complete` dice si ya),
 * porque quien la pide suele estar dibujando en ese momento; para eso está
 * `onload`, que permite repintar y refrescar la textura.
 */
export function iconImage(name, { color = "#4a3f33", size = 64 } = {}) {
  const key = `${name}:${color}:${size}`;
  if (imgCache.has(key)) return imgCache.get(key);
  const svg = icon(name, { size }).replace('stroke="currentColor"', `stroke="${color}"`);
  const img = new Image(size, size);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  imgCache.set(key, img);
  return img;
}
