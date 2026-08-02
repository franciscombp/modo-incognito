import { icon as svgIcon } from "./icons.js";
// Vestíbulo de ascensores: una segunda "escena" propia para el prólogo de
// cada día. Antes, mientras elegías si esperar/subir/colarte en el
// diálogo del ascensor, el piso ya se veía detrás a través del velo del
// diálogo — como si ya hubieras llegado. Ahora el vestíbulo tapa el lienzo
// del todo (no es una escena 3D, es HTML/CSS encima) hasta que las puertas
// se abren de verdad, con una animación, al cerrar el prólogo.

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function createLobby(root) {
  const layer = el("div", "inc-lobby-scene inc-hidden", root);

  const doorLeft = el("div", "inc-lobby-door inc-lobby-door-left", layer);
  const doorRight = el("div", "inc-lobby-door inc-lobby-door-right", layer);
  [doorLeft, doorRight].forEach((door) => {
    el("div", "inc-lobby-door-seam", door);
    el("div", "inc-lobby-door-handle", door);
  });

  const sign = el("div", "inc-lobby-sign", layer);
  const signFloor = el("div", "inc-lobby-sign-floor", sign);
  signFloor.textContent = "PB";
  const signName = el("div", "inc-lobby-sign-name", sign);
  signName.textContent = "CARGANDO";

  const deco = el("div", "inc-lobby-deco", layer);
  el("span", "inc-lobby-plant", deco).innerHTML = svgIcon("plant", { size: 42 });
  el("span", "inc-lobby-waiting", deco).innerHTML = svgIcon("person", { size: 38 });
  el("span", "inc-lobby-waiting inc-lobby-waiting-2", deco).innerHTML = svgIcon("person", { size: 34 });

  let opening = false;
  let currentFloor = 0;

  function show() {
    opening = false;
    currentFloor = 0;
    signFloor.textContent = "PB";
    signName.textContent = "CARGANDO";
    layer.classList.remove("inc-hidden", "inc-lobby-open");
    doorLeft.style.transform = "";
    doorRight.style.transform = "";
  }

  /** Update elevator progress: 0-100. Animates floor number (PB→10) based on progress. */
  function updateProgress(progress) {
    // Map progress (0-100) to floor (0-10)
    const targetFloor = Math.round((progress / 100) * 10);
    if (targetFloor > currentFloor && targetFloor <= 10) {
      currentFloor = targetFloor;
      signFloor.textContent = currentFloor === 0 ? "PB" : currentFloor.toString();
    }
    signName.textContent = progress >= 100 ? "LISTO" : "CARGANDO";
  }

  /** Abre las puertas con una animación y resuelve cuando termina. */
  function hide() {
    if (opening) return Promise.resolve();
    opening = true;
    return new Promise((resolve) => {
      layer.classList.add("inc-lobby-open");
      const done = () => {
        doorLeft.removeEventListener("transitionend", done);
        layer.classList.add("inc-hidden");
        resolve();
      };
      doorLeft.addEventListener("transitionend", done, { once: true });
      // Red de seguridad: si por lo que sea transitionend no llega (pestaña
      // en segundo plano, etc.), no nos quedamos bloqueados para siempre.
      setTimeout(done, 1400);
    });
  }

  /**
   * Quitar el vestíbulo de golpe, sin abrir puertas ni esperar a nada.
   * Lo usa el reinicio del día: si pierdes el cruce, el vestíbulo se queda
   * puesto con las puertas cerradas (no has llegado), y al reintentar tapaba
   * la avenida entera — parecía que el juego se colgaba en el ascensor.
   */
  function reset() {
    opening = false;
    layer.classList.remove("inc-lobby-open");
    layer.classList.add("inc-hidden");
    doorLeft.style.transform = "";
    doorRight.style.transform = "";
  }

  return { show, hide, reset, updateProgress };
}
