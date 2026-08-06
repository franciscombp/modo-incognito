import { iconEl } from "./icons.js";

/**
 * EL LIENZO FIJO — la parte de JS.
 *
 * El CSS ya hace lo gordo: `#app` mide 1920×1080 y se escala entero con
 * `transform: scale(var(--ui-scale))` (ver el bloque «EL LIENZO FIJO» del
 * design system). Aquí va lo que el CSS no puede:
 *
 * 1. LA ESCALA COMO NÚMERO. El renderer 3D la necesita para dimensionar su
 *    buffer a resolución REAL — escalado con el resto del lienzo se vería
 *    borroso en cualquier pantalla densa. Y los gestos de cámara (orbitar,
 *    pellizcar) miden deltas en píxeles de PANTALLA: sin dividir por la
 *    escala, la sensibilidad cambiaría según el monitor.
 *
 * 2. LA CORTINA DE ORIENTACIÓN. En iPhone/Safari no existe la API de
 *    bloqueo de orientación ni la de pantalla completa para elementos, así
 *    que la cortina no es un plan B: es la única herramienta. Vive FUERA
 *    del lienzo (sobre el viewport real) y pausa el juego mientras está
 *    puesta.
 *
 * 3. PANTALLA COMPLETA + BLOQUEO APAISADO, pedidos en el primer gesto —
 *    ambas API exigen gesto de usuario. Donde no existan (iOS), fallan en
 *    silencio y manda la cortina.
 */

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** La escala actual del lienzo (0–n). La lee quien mide en px de pantalla. */
export function stageScale() {
  return Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
}

/**
 * Escribe la escala en `--ui-scale` como NÚMERO. El token existía como
 * `calc(min(100vw/1920, 100vh/1080))` — pero eso es una LONGITUD (px), y
 * `scale()` exige un número: el transform entero quedaba inválido y el
 * lienzo salía sin escalar ni centrar. Dividir longitud entre longitud en
 * calc() es demasiado reciente para apoyarse en ello, así que el número lo
 * pone JS y el CSS solo lo consume.
 */
export function applyStageScale() {
  document.documentElement.style.setProperty("--ui-scale", String(stageScale()));
}

/**
 * Monta la vigilancia del lienzo. `onCover(covered)` avisa cuando la
 * cortina entra o sale, para pausar/reanudar el juego.
 */
export function createStage({ onCover = null } = {}) {
  applyStageScale();
  window.addEventListener("resize", applyStageScale);
  window.addEventListener("orientationchange", applyStageScale);
  // ── La cortina, sobre el body: fuera del lienzo a propósito ──
  const guard = document.createElement("div");
  guard.className = "inc-rotate-guard";
  const icon = document.createElement("div");
  icon.className = "inc-rotate-guard-icon";
  icon.appendChild(iconEl("phone"));
  guard.appendChild(icon);
  const title = document.createElement("div");
  title.className = "inc-rotate-guard-title";
  title.textContent = "ROTACIÓN DE PERSONAL EN CURSO";
  guard.appendChild(title);
  const sub = document.createElement("div");
  sub.className = "inc-rotate-guard-sub";
  sub.textContent = "Gira el teléfono: el Piso 10 solo atiende en horizontal.";
  guard.appendChild(sub);
  document.body.appendChild(guard);

  // Solo molesta en táctil: un monitor vertical de escritorio es raro pero
  // legítimo, y ahí las bandas negras ya resuelven.
  const isTouch = matchMedia("(pointer: coarse)").matches;
  let covered = false;

  function refresh() {
    const portrait = window.innerHeight > window.innerWidth;
    const next = isTouch && portrait;
    if (next === covered) return;
    covered = next;
    guard.classList.toggle("on", covered);
    onCover?.(covered);
  }

  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", refresh);
  refresh();

  // ── Pantalla completa + bloqueo, al primer gesto ──
  // Una sola vez: insistir en cada toque pelearía con el usuario que salió
  // de pantalla completa a propósito.
  let asked = false;
  async function goFullscreen() {
    if (asked || !isTouch) return;
    asked = true;
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } catch {
      /* iOS: no existe para elementos; manda la cortina */
    }
    try {
      await screen.orientation?.lock?.("landscape");
    } catch {
      /* solo funciona dentro de pantalla completa, y no en iOS */
    }
  }
  window.addEventListener("pointerdown", goFullscreen, { once: true });

  return {
    get scale() {
      return stageScale();
    },
    get covered() {
      return covered;
    },
  };
}
