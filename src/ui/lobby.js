import { icon as svgIcon } from "./icons.js";
// Vestíbulo de ascensores: una segunda "escena" propia para el prólogo de
// cada día. Antes, mientras elegías si esperar/subir/colarte en el
// diálogo del ascensor, el piso ya se veía detrás a través del velo del
// diálogo — como si ya hubieras llegado. Ahora el vestíbulo tapa el lienzo
// del todo (no es una escena 3D, es HTML/CSS encima) hasta que las puertas
// se abren de verdad, con una animación, al cerrar el prólogo.
//
// La carga se disfraza SEGÚN CÓMO ELIJAS SUBIR (setMode). En ascensor, el
// cartel es la pantalla del ascensor: piso que avanza y "SUBIENDO"
// titilando, con su coletilla si te colaste. Por las gradas no hay puertas
// que valgan: se ve el hueco de la escalera y el cartel de cada rellano,
// uno por piso, cada uno con su chiste.

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

/** Qué dice la pantalla del ascensor mientras sube, según cómo entraste. */
const RIDE_LINES = {
  wait: "SUBIENDO · MÚSICA DE ASCENSOR",
  cut: "SUBIENDO · NO MIRES A NADIE",
  default: "SUBIENDO",
};

/** El cartel de cada rellano, para quien sube a pie. Uno por piso. */
const STAIR_SIGNS = [
  ["PB", "Recepción · huele a café ajeno"],
  ["2", "Finanzas · no hagas contacto visual"],
  ["3", "Legal · un silencio sospechoso"],
  ["4", "Nadie sabe qué hay en el piso 4"],
  ["5", "Gimnasio corporativo · sin estrenar"],
  ["6", "Salas creativas · pufs vacíos"],
  ["7", "La vending lleva caída desde 2023"],
  ["8", "Aquí vive el aire acondicionado"],
  ["9", "Casi. Tus piernas opinan lo contrario"],
  ["10", "Célula Gris · llegaste. Disimula"],
];

export function createLobby(root) {
  const layer = el("div", "inc-lobby-scene inc-hidden", root);

  const doorLeft = el("div", "inc-lobby-door inc-lobby-door-left", layer);
  const doorRight = el("div", "inc-lobby-door inc-lobby-door-right", layer);
  [doorLeft, doorRight].forEach((door) => {
    el("div", "inc-lobby-door-seam", door);
    el("div", "inc-lobby-door-handle", door);
  });

  // El hueco de la escalera, solo visible en modo gradas.
  const stairs = el("div", "inc-lobby-stairs", layer);
  el("div", "inc-lobby-stairs-steps", stairs);
  el("div", "inc-lobby-stairs-rail", stairs);

  const sign = el("div", "inc-lobby-sign", layer);
  const signFloor = el("div", "inc-lobby-sign-floor", sign);
  const signName = el("div", "inc-lobby-sign-name", sign);
  const signJoke = el("div", "inc-lobby-sign-joke", sign);

  let opening = false;
  let currentFloor = 0;
  let mode = "elevator"; // "elevator" | "stairs"
  let rideLine = RIDE_LINES.default;

  function paintFloor() {
    if (mode === "stairs") {
      const [num, joke] = STAIR_SIGNS[Math.min(currentFloor, STAIR_SIGNS.length - 1)];
      signFloor.textContent = num;
      signName.textContent = currentFloor >= 10 ? "PISO 10" : "SUBIENDO A PIE";
      signJoke.textContent = joke;
    } else {
      signFloor.innerHTML =
        (currentFloor === 0 ? "PB" : String(currentFloor)) +
        `<span class="inc-lobby-sign-up">${svgIcon("next", { size: 20 })}</span>`;
      signName.textContent = currentFloor >= 10 ? "PISO 10 · PUERTAS ABRIENDO" : rideLine;
      signJoke.textContent = "";
    }
    signName.classList.toggle("inc-lobby-blink", currentFloor < 10);
  }

  function show() {
    opening = false;
    currentFloor = 0;
    setMode(null);
    layer.classList.remove("inc-hidden", "inc-lobby-open", "inc-lobby-fade");
    doorLeft.style.transform = "";
    doorRight.style.transform = "";
    paintFloor();
  }

  /**
   * Cómo se llega hoy: la elección del prólogo ("wait"/"stairs"/"cut").
   * Con "stairs" desaparecen las puertas y se sube por el hueco de la
   * escalera; el resto son sabores de la pantalla del ascensor.
   */
  function setMode(choice) {
    mode = choice === "stairs" ? "stairs" : "elevator";
    rideLine = RIDE_LINES[choice] ?? RIDE_LINES.default;
    layer.classList.toggle("inc-lobby--stairs", mode === "stairs");
    paintFloor();
  }

  /** Avance de la carga (0-100), traducido a pisos PB→10. */
  function updateProgress(progress) {
    const targetFloor = Math.round((progress / 100) * 10);
    if (targetFloor > currentFloor && targetFloor <= 10) {
      currentFloor = targetFloor;
      paintFloor();
    } else if (progress >= 100 && currentFloor < 10) {
      currentFloor = 10;
      paintFloor();
    }
  }

  /**
   * Salida animada, y resuelve cuando termina: puertas que se abren en
   * ascensor, fundido en las gradas (a pie no hay puertas que abrir — llegas
   * al rellano y ya estás dentro).
   */
  function hide() {
    if (opening) return Promise.resolve();
    opening = true;
    return new Promise((resolve) => {
      const done = () => {
        doorLeft.removeEventListener("transitionend", done);
        layer.classList.add("inc-hidden");
        layer.classList.remove("inc-lobby-fade");
        resolve();
      };
      if (mode === "stairs") {
        layer.classList.add("inc-lobby-fade");
        setTimeout(done, 850);
        return;
      }
      layer.classList.add("inc-lobby-open");
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
    layer.classList.remove("inc-lobby-open", "inc-lobby-fade");
    layer.classList.add("inc-hidden");
    doorLeft.style.transform = "";
    doorRight.style.transform = "";
  }

  return { show, hide, reset, updateProgress, setMode };
}
