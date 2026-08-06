/**
 * ICONOS DIBUJADOS, NO TIPOGRÁFICOS.
 *
 * Aquí no hay emojis a propósito. Un emoji lo dibuja la fuente del sistema:
 * el mismo ☕ es una taza blanca en un iPhone, marrón en Android y plana en
 * Windows, y hay plataformas donde directamente sale un cuadro. Eso no se
 * puede controlar desde el juego, y el estilo cozy se cae en cuanto un icono
 * llega con el color y el trazo de otra parte.
 *
 * Son los SVG de Phosphor (peso "regular", `@phosphor-icons/core`),
 * importados como texto en build time con el sufijo `?raw` de Vite — cero
 * red en tiempo de ejecución, cero dependencia de un CDN que se puede caer.
 * Todos heredan `currentColor`, así que se ven igual en cualquier sitio
 * donde se pongan.
 *
 * Para añadir uno: bajar su SVG de `node_modules/@phosphor-icons/core/assets/regular/`,
 * importarlo aquí y sumar la entrada a `RAW`. Para usarlo: `icon("coffee")`
 * (cadena, para innerHTML) o `iconEl("coffee")` (nodo). Un nombre que no
 * exista avisa por consola y devuelve un hueco — antes de esto, un icono mal
 * escrito era un cuadrito vacío que nadie sabía de dónde salía.
 */

import play from "@phosphor-icons/core/assets/regular/play.svg?raw";
import star from "@phosphor-icons/core/assets/regular/star.svg?raw";
import grid from "@phosphor-icons/core/assets/regular/squares-four.svg?raw";
import gear from "@phosphor-icons/core/assets/regular/gear.svg?raw";
import help from "@phosphor-icons/core/assets/regular/question.svg?raw";
import back from "@phosphor-icons/core/assets/regular/caret-left.svg?raw";
import next from "@phosphor-icons/core/assets/regular/caret-right.svg?raw";
import lock from "@phosphor-icons/core/assets/regular/lock-key.svg?raw";
// Antifaz de sol: el juego va de pasar desapercibida.
import incognito from "@phosphor-icons/core/assets/regular/sunglasses.svg?raw";
import diamond from "@phosphor-icons/core/assets/regular/diamond.svg?raw";
import clock from "@phosphor-icons/core/assets/regular/clock.svg?raw";
import eye from "@phosphor-icons/core/assets/regular/eye.svg?raw";
import alert from "@phosphor-icons/core/assets/regular/warning.svg?raw";
import coffee from "@phosphor-icons/core/assets/regular/coffee.svg?raw";
import chat from "@phosphor-icons/core/assets/regular/chat-circle.svg?raw";
import movie from "@phosphor-icons/core/assets/regular/film-strip.svg?raw";
import sleep from "@phosphor-icons/core/assets/regular/moon.svg?raw";
import snack from "@phosphor-icons/core/assets/regular/popcorn.svg?raw";
import stretch from "@phosphor-icons/core/assets/regular/person-arms-spread.svg?raw";
import meeting from "@phosphor-icons/core/assets/regular/presentation.svg?raw";
import windowIcon from "@phosphor-icons/core/assets/regular/app-window.svg?raw";
import phone from "@phosphor-icons/core/assets/regular/phone.svg?raw";
import trophy from "@phosphor-icons/core/assets/regular/trophy.svg?raw";
import party from "@phosphor-icons/core/assets/regular/confetti.svg?raw";
import door from "@phosphor-icons/core/assets/regular/door.svg?raw";
import egg from "@phosphor-icons/core/assets/regular/egg.svg?raw";
import siren from "@phosphor-icons/core/assets/regular/siren.svg?raw";
import boss from "@phosphor-icons/core/assets/regular/smiley.svg?raw";
import search from "@phosphor-icons/core/assets/regular/magnifying-glass.svg?raw";
import question from "@phosphor-icons/core/assets/regular/question.svg?raw";
import hide from "@phosphor-icons/core/assets/regular/eye-slash.svg?raw";
import check from "@phosphor-icons/core/assets/regular/check.svg?raw";
import map from "@phosphor-icons/core/assets/regular/map-trifold.svg?raw";
import hand from "@phosphor-icons/core/assets/regular/hand-palm.svg?raw";
import plant from "@phosphor-icons/core/assets/regular/plant.svg?raw";
import person from "@phosphor-icons/core/assets/regular/person.svg?raw";
import calendar from "@phosphor-icons/core/assets/regular/calendar-blank.svg?raw";
import stairs from "@phosphor-icons/core/assets/regular/stairs.svg?raw";
import elevator from "@phosphor-icons/core/assets/regular/elevator.svg?raw";
import people from "@phosphor-icons/core/assets/regular/users.svg?raw";
import keyboard from "@phosphor-icons/core/assets/regular/keyboard.svg?raw";
import restroom from "@phosphor-icons/core/assets/regular/toilet.svg?raw";
import volumeX from "@phosphor-icons/core/assets/regular/speaker-x.svg?raw";
import volume1 from "@phosphor-icons/core/assets/regular/speaker-low.svg?raw";
import volume2 from "@phosphor-icons/core/assets/regular/speaker-high.svg?raw";
import plus from "@phosphor-icons/core/assets/regular/plus.svg?raw";
import minus from "@phosphor-icons/core/assets/regular/minus.svg?raw";
import pause from "@phosphor-icons/core/assets/regular/pause.svg?raw";

const S = 24;

/** Nombre lógico → contenido de `<path>` YA EXTRAÍDO del SVG de Phosphor
 * (ver `stripBody`, más abajo): así `icon()` monta un único wrapper propio
 * con el tamaño y la clase que le pidan en vez de anidar un `<svg>` dentro
 * de otro. */
const RAW = {
  // --- navegación y menús ---
  play,
  star,
  grid,
  gear,
  help,
  back,
  next,
  lock,
  incognito,

  // --- HUD ---
  diamond,
  clock,
  eye,
  alert,

  // --- actividades del plano (scenes/*.json -> activities[].icon) ---
  coffee,
  chat,
  movie,
  sleep,
  snack,
  stretch,
  meeting,
  window: windowIcon,
  phone,

  // --- resultado del día ---
  trophy,
  party,
  door,
  egg,

  // --- estados y avisos ---
  siren,
  boss,
  plus,
  minus,
  pause,
  search,
  question,
  hide,
  check,
  map,
  hand,
  plant,
  person,
  calendar,
  stairs,
  elevator,
  people,
  keyboard,
  restroom,

  // --- audio ---
  "volume-x": volumeX,
  "volume-1": volume1,
  "volume-2": volume2,
};

/** Le saca a un SVG de Phosphor lo de dentro de `<svg ...>…</svg>`: el
 * wrapper (viewBox, fill) lo pone `icon()` una sola vez, con el tamaño y la
 * clase que toquen en cada sitio. */
function stripBody(svgSource) {
  const match = svgSource.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  return match ? match[1] : svgSource;
}

const BODY = Object.fromEntries(Object.entries(RAW).map(([name, src]) => [name, stripBody(src)]));

/** Alias, para que el contenido pueda llamarlos como le resulte natural. */
const ALIAS = { cafe: "coffee", pelicula: "movie", dormir: "sleep", comer: "snack", reunion: "meeting" };

/** El SVG como cadena, listo para `innerHTML`. */
export function icon(name, { size = S, className = "px-icon" } = {}) {
  const key = ALIAS[name] ?? name;
  const body = BODY[key];
  if (!body) {
    console.warn(`[modo-incognito] icono desconocido: "${name}". Hay: ${Object.keys(BODY).join(", ")}`);
    return "";
  }
  // `xmlns` SIEMPRE: inline en HTML se puede omitir, pero un SVG servido como
  // imagen suelta (ver `iconImage`) sin él es inválido y NO CARGA — sin error
  // ninguno, simplemente no se dibuja nada. Phosphor dibuja con `fill`, no
  // con trazo — su rejilla nativa es 256×256, así que el viewBox se hereda
  // de eso, no del 24×24 de antes.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" viewBox="0 0 256 256" ` +
    `width="${size}" height="${size}" fill="currentColor" ` +
    `aria-hidden="true" focusable="false">${body}</svg>`
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
  return !!BODY[ALIAS[name] ?? name];
}

export const ICON_NAMES = Object.keys(BODY);

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
  const svg = icon(name, { size }).replace('fill="currentColor"', `fill="${color}"`);
  const img = new Image(size, size);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  imgCache.set(key, img);
  return img;
}
