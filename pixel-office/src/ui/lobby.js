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
  const layer = el("div", "lobby-scene hidden", root);

  const doorLeft = el("div", "lobby-door lobby-door-left", layer);
  const doorRight = el("div", "lobby-door lobby-door-right", layer);
  [doorLeft, doorRight].forEach((door) => {
    el("div", "lobby-door-seam", door);
    el("div", "lobby-door-handle", door);
  });

  const sign = el("div", "lobby-sign", layer);
  const signFloor = el("div", "lobby-sign-floor", sign);
  signFloor.textContent = "10";
  const signName = el("div", "lobby-sign-name", sign);
  signName.textContent = "CENTRO DIGITAL";

  const deco = el("div", "lobby-deco", layer);
  el("span", "lobby-plant", deco).textContent = "🪴";
  el("span", "lobby-waiting", deco).textContent = "🧍";
  el("span", "lobby-waiting lobby-waiting-2", deco).textContent = "🧍‍♂️";

  let opening = false;

  function show() {
    opening = false;
    layer.classList.remove("hidden", "open");
    doorLeft.style.transform = "";
    doorRight.style.transform = "";
  }

  /** Abre las puertas con una animación y resuelve cuando termina. */
  function hide() {
    if (opening) return Promise.resolve();
    opening = true;
    return new Promise((resolve) => {
      layer.classList.add("open");
      const done = () => {
        doorLeft.removeEventListener("transitionend", done);
        layer.classList.add("hidden");
        resolve();
      };
      doorLeft.addEventListener("transitionend", done, { once: true });
      // Red de seguridad: si por lo que sea transitionend no llega (pestaña
      // en segundo plano, etc.), no nos quedamos bloqueados para siempre.
      setTimeout(done, 1400);
    });
  }

  return { show, hide };
}
