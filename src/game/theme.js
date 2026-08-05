// El tema visual (data-theme en <html>), recordado entre sesiones — mismo
// patrón que settings.js. El juego y los builders leen SIEMPRE las mismas
// variables del design system (ver src/style/design-system.css); cambiar de
// tema es solo cambiar qué bloque de valores les da `:root[data-theme=…]`.
//
// Añadir un tema son DOS pasos: su bloque `[data-theme="x"]` en la capa 1 de
// design-system.css, y su id en THEMES aquí. Ni un componente se toca.
//
// El tema no es solo la interfaz: también re-tinta el EDIFICIO, porque el
// decorado 3D lee los mismos tokens `--w-*` (ver src/scene/palette.js). Por
// eso `setTheme` avisa a quien tenga que reconstruir el piso.

import { refreshWorldPalette } from "../scene/cozy.js";

const KEY = "modo-incognito:theme:v1";
export const THEMES = ["terminal", "cozy"];
const DEFAULT_THEME = "terminal";

function read() {
  try {
    const stored = localStorage.getItem(KEY);
    return THEMES.includes(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

let current = read();
const listeners = new Set();

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  // El decorado 3D lee los tokens del documento, así que hay que releerlos
  // DESPUÉS de cambiar el atributo — y tirar los materiales cacheados, que
  // llevan el color dentro.
  refreshWorldPalette();
}

/** Aplica el tema guardado. Llamar una vez al arrancar, cuanto antes. */
export function initTheme() {
  apply(current);
}

export function getTheme() {
  return current;
}

export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === current) return;
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* modo privado: no molesta, solo no se recuerda */
  }
  listeners.forEach((fn) => fn(theme));
}

export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
