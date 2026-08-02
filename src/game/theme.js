// El tema visual (data-theme en <html>), recordado entre sesiones — mismo
// patrón que settings.js. El juego y los builders leen SIEMPRE las mismas
// variables del design system (ver src/style/design-system.css); cambiar de
// tema es solo cambiar qué bloque de valores les da `:root[data-theme=…]`.
//
// "pixel" está declarado a propósito aunque su bloque de CSS esté vacío
// todavía: da soporte a ambos temas desde ya, así que llenarlo más tarde no
// pide tocar ni este archivo ni ningún componente.

const KEY = "modo-incognito:theme:v1";
export const THEMES = ["cozy", "pixel"];
const DEFAULT_THEME = "cozy";

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
