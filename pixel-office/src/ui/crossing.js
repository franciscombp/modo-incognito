// Cruzar la Amazonas: un minijuego aparte, al estilo Crossy Road, antes de
// llegar al edificio. No toca el motor 3D en absoluto — es su propio bucle,
// como el vestíbulo de ascensores (lobby.js), pero interactivo.
//
// Editable aquí mismo (no hace falta tocar el bucle): ROWS describe el
// carril de cada fila, de la acera de salida (abajo) a la puerta del
// edificio (arriba); LANE_SPEED y SPAWN_GAP controlan qué tan duro pega
// cada carril.

const COLS = 5;

// kind: "sidewalk"/"goal" son zonas seguras; "median" es el parterre central
// (también segura); "car" y "bike" tienen tráfico. dir: 1 = va hacia la
// derecha, -1 = hacia la izquierda.
const ROWS = [
  { kind: "sidewalk" },
  { kind: "car", dir: 1, speed: 0.16, gap: [1.1, 1.8], icons: ["🚗", "🚙", "🚕"] },
  { kind: "car", dir: 1, speed: 0.22, gap: [1.0, 1.6], icons: ["🚗", "🚌", "🚙"] },
  { kind: "car", dir: 1, speed: 0.19, gap: [1.2, 2.0], icons: ["🚕", "🚗"] },
  { kind: "bike", dir: -1, speed: 0.28, gap: [0.9, 1.5], icons: ["🚲"] },
  { kind: "median" },
  { kind: "bike", dir: 1, speed: 0.28, gap: [0.9, 1.5], icons: ["🚲"] },
  { kind: "car", dir: -1, speed: 0.2, gap: [1.1, 1.8], icons: ["🚗", "🚐"] },
  { kind: "car", dir: -1, speed: 0.24, gap: [1.0, 1.6], icons: ["🚗", "🚙", "🚌"] },
  { kind: "car", dir: -1, speed: 0.17, gap: [1.2, 2.0], icons: ["🚕", "🚗"] },
  { kind: "goal" },
];
const GOAL_ROW = ROWS.length - 1;

// Huecos entre vehículos de un mismo carril, en "anchos de vehículo" — así
// siempre hay por dónde pasar, nunca una pared sólida.
const VEHICLE_WIDTH = 0.16; // fracción del ancho de la calle
const PLAYER_WIDTH = 0.07;
const MOVE_COOLDOWN = 150; // ms entre pasos, para que no se deslice de golpe

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function createCrossing(root) {
  const layer = el("div", "crossing-scene hidden", root);
  const roadEl = el("div", "crossing-road", layer);
  const hint = el("div", "crossing-hint", layer);
  hint.textContent = "CRUZA LA AMAZONAS — WASD / flechas";

  // Fila 0 (la acera de salida) tiene que quedar abajo en pantalla; con
  // flex-direction: column-reverse en .crossing-road (ver CSS), construir
  // en orden 0..N ya las apila así sin necesitar `order` por fila.
  const rowNodes = ROWS.map((row, i) => {
    const rowEl = el("div", `crossing-row crossing-${row.kind}`, roadEl);
    rowEl.dataset.row = i;
    return rowEl;
  });

  // Va dentro de roadEl (no de layer) para que sus porcentajes de posición
  // se midan contra el ancho/alto de la calle, no de toda la pantalla.
  const player = el("div", "crossing-player", roadEl);
  player.textContent = "🏃‍♀️";

  // Botones táctiles, mismo lenguaje que el resto de controles móviles.
  const touchPad = el("div", "crossing-touchpad", layer);
  const btnUp = el("button", "crossing-btn crossing-btn-up", touchPad);
  btnUp.textContent = "▲";
  const midRow = el("div", "crossing-touchpad-row", touchPad);
  const btnLeft = el("button", "crossing-btn", midRow);
  btnLeft.textContent = "◀";
  const btnDown = el("button", "crossing-btn", midRow);
  btnDown.textContent = "▼";
  const btnRight = el("button", "crossing-btn", midRow);
  btnRight.textContent = "▶";

  let running = false;
  let vehicles = []; // { row, x (0..1), dir, speed, icon, el }
  let player_ = { row: 0, col: Math.floor(COLS / 2) };
  let lastMove = 0;
  let rafId = null;
  let resolveFn = null;

  function layout() {
    player.style.left = `${((player_.col + 0.5) / COLS) * 100}%`;
    player.style.bottom = `${((player_.row + 0.5) / ROWS.length) * 100}%`;
  }

  function tryMove(dr, dc) {
    const now = performance.now();
    if (now - lastMove < MOVE_COOLDOWN) return;
    const nr = Math.min(GOAL_ROW, Math.max(0, player_.row + dr));
    const nc = Math.min(COLS - 1, Math.max(0, player_.col + dc));
    if (nr === player_.row && nc === player_.col) return;
    lastMove = now;
    player_.row = nr;
    player_.col = nc;
    layout();
    if (player_.row === GOAL_ROW) finish("safe");
  }

  function onKey(e) {
    if (!running) return;
    const key = e.key.toLowerCase();
    if (key === "arrowup" || key === "w") tryMove(1, 0);
    else if (key === "arrowdown" || key === "s") tryMove(-1, 0);
    else if (key === "arrowleft" || key === "a") tryMove(0, -1);
    else if (key === "arrowright" || key === "d") tryMove(0, 1);
    else return;
    e.preventDefault();
  }
  window.addEventListener("keydown", onKey);
  btnUp.addEventListener("click", () => tryMove(1, 0));
  btnDown.addEventListener("click", () => tryMove(-1, 0));
  btnLeft.addEventListener("click", () => tryMove(0, -1));
  btnRight.addEventListener("click", () => tryMove(0, 1));

  function spawnFor(rowIndex) {
    const row = ROWS[rowIndex];
    if (row.kind !== "car" && row.kind !== "bike") return;
    const icon = row.icons[Math.floor(Math.random() * row.icons.length)];
    const startX = row.dir > 0 ? -VEHICLE_WIDTH : 1 + VEHICLE_WIDTH;
    const v = { row: rowIndex, x: startX, dir: row.dir, speed: row.speed, icon };
    v.el = el("div", `crossing-vehicle crossing-${row.kind}-icon`, rowNodes[rowIndex]);
    v.el.textContent = icon;
    vehicles.push(v);
    const [gMin, gMax] = row.gap;
    v.nextSpawnIn = gMin + Math.random() * (gMax - gMin);
  }

  function resetGame() {
    vehicles.forEach((v) => v.el.remove());
    vehicles = [];
    player_ = { row: 0, col: Math.floor(COLS / 2) };
    layout();
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      // Un par ya en marcha, repartidos por la calle, para que no arranque vacía.
      for (let n = 0; n < 2; n++) {
        spawnFor(i);
        const v = vehicles[vehicles.length - 1];
        v.x = Math.random();
      }
    });
  }

  let lastTime = 0;
  function frame(t) {
    if (!running) return;
    const dt = lastTime ? Math.min(0.05, (t - lastTime) / 1000) : 0;
    lastTime = t;

    vehicles.forEach((v) => {
      v.x += v.dir * v.speed * dt;
      v.el.style.left = `${v.x * 100}%`;
      v.nextSpawnIn -= dt;
    });
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      const rowVehicles = vehicles.filter((v) => v.row === i);
      const ready = rowVehicles.every((v) => v.nextSpawnIn > 0 || Math.abs(v.x - (row.dir > 0 ? 0 : 1)) > 0.15);
      if (rowVehicles.length < 3 && ready && Math.random() < dt * 0.6) spawnFor(i);
    });
    vehicles = vehicles.filter((v) => {
      const gone = v.dir > 0 ? v.x > 1 + VEHICLE_WIDTH : v.x < -VEHICLE_WIDTH;
      if (gone) v.el.remove();
      return !gone;
    });

    // Colisión: solo importa el carril donde está la jugadora ahora mismo.
    const playerX = (player_.col + 0.5) / COLS;
    const hit = vehicles.some(
      (v) => v.row === player_.row && Math.abs(v.x - playerX) < (VEHICLE_WIDTH + PLAYER_WIDTH) / 2
    );
    if (hit) {
      finish("hit");
      return;
    }

    rafId = requestAnimationFrame(frame);
  }

  function finish(outcome) {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (outcome === "hit") player.classList.add("hit");
    setTimeout(() => {
      layer.classList.add("hidden");
      player.classList.remove("hit");
      resolveFn?.(outcome);
      resolveFn = null;
    }, outcome === "hit" ? 650 : 150);
  }

  /** Muestra el cruce y resuelve con "safe" o "hit" al terminar. */
  function play() {
    return new Promise((resolve) => {
      resolveFn = resolve;
      layer.classList.remove("hidden");
      resetGame();
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    });
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    if (rafId) cancelAnimationFrame(rafId);
    layer.remove();
  }

  return { play, dispose };
}
