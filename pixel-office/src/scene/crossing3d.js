import * as THREE from "three";
import { CharacterSprite } from "../entities/sprite.js";
import { WORLD_SCALE as S } from "./config.js";
import { cameraDirection } from "./iso.js";
import { getCameraSettings, subscribeCameraSettings } from "./cameraSettings.js";

// Cruzar la Amazonas, en 3D: mismo motor, misma cámara oblicua y los mismos
// sprites de personaje que el resto del juego — un escenario aparte, no una
// superposición de HTML. Editable aquí mismo: ROWS describe cada carril de
// la acera de salida (fila 0) a la puerta del edificio (última fila).

const COLS = 5;
const LANE_DEPTH = 2.4 * S;
const ROAD_WIDTH = 5.2 * S;
const VEHICLE_WIDTH = 0.85 * S;
const PLAYER_RADIUS = 0.3 * S;
const MOVE_COOLDOWN = 150;

// Huecos generosos a propósito: es un chiste sobre que te despidan, no un
// examen de reflejos — la caminata debe ganarse con lectura de tráfico, no
// con pixel-perfect timing.
const ROWS = [
  { kind: "sidewalk" },
  { kind: "car", dir: 1, speed: 2.4 * S, gap: [2.0, 2.9], colors: [0xe6483f, 0x45a0e0, 0xf2c744] },
  { kind: "car", dir: 1, speed: 2.9 * S, gap: [1.9, 2.7], colors: [0xe6483f, 0xe8e8e8, 0x45a0e0] },
  { kind: "car", dir: 1, speed: 2.6 * S, gap: [2.1, 3.0], colors: [0xf2c744, 0xe6483f] },
  { kind: "bike", dir: -1, speed: 3.4 * S, gap: [1.7, 2.4], colors: [0xa8e05f, 0x45e0d0] },
  { kind: "median" },
  { kind: "bike", dir: 1, speed: 3.4 * S, gap: [1.7, 2.4], colors: [0xa8e05f, 0x45e0d0] },
  { kind: "car", dir: -1, speed: 2.7 * S, gap: [2.0, 2.9], colors: [0x8b5cf6, 0xe8e8e8] },
  { kind: "car", dir: -1, speed: 3.0 * S, gap: [1.9, 2.7], colors: [0xe6483f, 0x45a0e0, 0xf2c744] },
  { kind: "car", dir: -1, speed: 2.4 * S, gap: [2.1, 3.0], colors: [0xf2c744, 0x8b5cf6] },
  { kind: "goal" },
];
const GOAL_ROW = ROWS.length - 1;

const ROAD_COLORS = {
  sidewalk: 0x3b4152,
  goal: 0x3b4152,
  car: 0x26272c,
  bike: 0x2e3a2c,
  median: 0x234029,
};

function colToX(col) {
  return (col - (COLS - 1) / 2) * (ROAD_WIDTH / COLS);
}

/** Pixel-art carrito/bici dibujado a mano en un canvas — sin archivos que subir. */
function vehicleTexture(kind, color) {
  const w = kind === "bike" ? 14 : 22;
  const h = 14;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const hex = `#${color.toString(16).padStart(6, "0")}`;

  if (kind === "bike") {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(1, 8, 4, 4);
    ctx.fillRect(9, 8, 4, 4);
    ctx.fillStyle = hex;
    ctx.fillRect(4, 6, 6, 2);
    ctx.fillRect(6, 3, 2, 5);
    ctx.fillStyle = "#e8c9a0";
    ctx.fillRect(6, 1, 3, 3);
  } else {
    ctx.fillStyle = hex;
    ctx.fillRect(1, 4, 20, 6);
    ctx.fillRect(5, 1, 12, 4);
    ctx.fillStyle = "#9fd8f2";
    ctx.fillRect(6, 2, 4, 3);
    ctx.fillRect(12, 2, 4, 3);
    ctx.fillStyle = "#111";
    ctx.fillRect(3, 9, 4, 4);
    ctx.fillRect(15, 9, 4, 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function createCrossing3D(root, playerSheet) {
  // Cromo mínimo en HTML por encima del lienzo 3D: el pie de foto y los
  // botones táctiles no necesitan ser parte de la escena.
  const ui = el("div", "crossing-ui hidden", root);
  const hint = el("div", "crossing-hint", ui);
  hint.textContent = "CRUZA LA AMAZONAS — WASD / flechas";
  const touchPad = el("div", "crossing-touchpad", ui);
  const btnUp = el("button", "crossing-btn crossing-btn-up", touchPad);
  btnUp.textContent = "▲";
  const midRow = el("div", "crossing-touchpad-row", touchPad);
  const btnLeft = el("button", "crossing-btn", midRow);
  btnLeft.textContent = "◀";
  const btnDown = el("button", "crossing-btn", midRow);
  btnDown.textContent = "▼";
  const btnRight = el("button", "crossing-btn", midRow);
  btnRight.textContent = "▶";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151f);

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff2d6, 1.05);
  key.position.set(10 * S, 30 * S, 6 * S);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(getCameraSettings().fov, 1, 0.5 * S, 300 * S);
  const camTarget = new THREE.Vector3(0, 0, 0);
  const unsubscribe = subscribeCameraSettings((s) => {
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  });

  function placeCamera() {
    const dir = cameraDirection();
    const distance = 10 * S;
    camera.position.set(camTarget.x + dir.x * distance, dir.y * distance, camTarget.z + dir.z * distance);
    camera.lookAt(camTarget.x, 0.6 * S, camTarget.z);
  }

  // ---- Calle: una franja ancha por fila, apiladas a lo largo de Z ----
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);
  ROWS.forEach((row, i) => {
    const z = i * LANE_DEPTH;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, LANE_DEPTH),
      new THREE.MeshLambertMaterial({ color: ROAD_COLORS[row.kind] })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, z);
    roadGroup.add(mesh);

    if (row.kind === "car" || row.kind === "bike") {
      // Línea discontinua central del carril, de puro detalle.
      const dashColor = row.kind === "bike" ? 0xa8e05f : 0xffffff;
      for (let d = -2; d <= 2; d++) {
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5 * S, 0.06 * S),
          new THREE.MeshBasicMaterial({ color: dashColor, transparent: true, opacity: 0.5 })
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(d * 0.9 * S, 0.01, z);
        roadGroup.add(dash);
      }
    }
    if (row.kind === "median") {
      for (const dx of [-1.6, 0, 1.6]) {
        const tree = new THREE.Mesh(
          new THREE.ConeGeometry(0.5 * S, 1.1 * S, 6),
          new THREE.MeshLambertMaterial({ color: 0x3f7a4a })
        );
        tree.position.set(dx * S, 0.55 * S, z);
        roadGroup.add(tree);
      }
    }
    if (row.kind === "goal") {
      const door = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1 * S, 1.8 * S),
        new THREE.MeshBasicMaterial({ color: 0x8a5a32 })
      );
      door.position.set(ROAD_WIDTH / 2 - 1.2 * S, 0.9 * S, z + LANE_DEPTH * 0.3);
      roadGroup.add(door);
    }
  });

  // ---- Jugadora: mismo sprite que en el piso ----
  const player = new CharacterSprite(playerSheet, { height: 1.45 * S });
  scene.add(player.object);

  let vehicles = [];
  let nextSpawnByRow = ROWS.map(() => 0);
  let playerCell = { row: 0, col: Math.floor(COLS / 2) };
  let lastMove = 0;
  let running = false;
  let resolveFn = null;
  let rafId = null;
  let lastTime = 0;

  function layoutPlayer() {
    player.setPosition(colToX(playerCell.col), playerCell.row * LANE_DEPTH);
  }

  function spawnFor(rowIndex) {
    const row = ROWS[rowIndex];
    if (row.kind !== "car" && row.kind !== "bike") return;
    const color = row.colors[Math.floor(Math.random() * row.colors.length)];
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: vehicleTexture(row.kind, color), transparent: true, toneMapped: false })
    );
    const scale = row.kind === "bike" ? 0.9 * S : 1.3 * S;
    sprite.scale.set(scale * (row.kind === "bike" ? 1 : 1.4), scale, 1);
    sprite.scale.x *= row.dir > 0 ? 1 : -1; // mira hacia donde avanza
    const startX = (row.dir > 0 ? -1 : 1) * (ROAD_WIDTH / 2 + VEHICLE_WIDTH);
    sprite.position.set(startX, 0.4 * S, rowIndex * LANE_DEPTH);
    roadGroup.add(sprite);
    const v = { row: rowIndex, x: startX, dir: row.dir, speed: row.speed, sprite };
    vehicles.push(v);
  }

  function randomGap(row) {
    const [gMin, gMax] = row.gap;
    return gMin + Math.random() * (gMax - gMin);
  }

  function resetGame() {
    vehicles.forEach((v) => v.sprite.parent?.remove(v.sprite));
    vehicles = [];
    playerCell = { row: 0, col: Math.floor(COLS / 2) };
    layoutPlayer();
    camTarget.set(0, 0, 0);
    placeCamera();
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      // Un vehículo ya en marcha, repartido por la calle, para que el
      // carril no arranque completamente vacío.
      spawnFor(i);
      vehicles[vehicles.length - 1].x = (Math.random() - 0.5) * ROAD_WIDTH;
      vehicles[vehicles.length - 1].sprite.position.x = vehicles[vehicles.length - 1].x;
      nextSpawnByRow[i] = randomGap(row);
    });
  }

  function tryMove(dr, dc) {
    const now = performance.now();
    if (now - lastMove < MOVE_COOLDOWN) return;
    const nr = Math.min(GOAL_ROW, Math.max(0, playerCell.row + dr));
    const nc = Math.min(COLS - 1, Math.max(0, playerCell.col + dc));
    if (nr === playerCell.row && nc === playerCell.col) return;
    lastMove = now;
    playerCell.row = nr;
    playerCell.col = nc;
    layoutPlayer();
    if (playerCell.row === GOAL_ROW) finish("safe");
  }

  function onKey(e) {
    if (!running) return;
    const key_ = e.key.toLowerCase();
    if (key_ === "arrowup" || key_ === "w") tryMove(1, 0);
    else if (key_ === "arrowdown" || key_ === "s") tryMove(-1, 0);
    else if (key_ === "arrowleft" || key_ === "a") tryMove(0, -1);
    else if (key_ === "arrowright" || key_ === "d") tryMove(0, 1);
    else return;
    e.preventDefault();
  }
  window.addEventListener("keydown", onKey);
  btnUp.addEventListener("click", () => tryMove(1, 0));
  btnDown.addEventListener("click", () => tryMove(-1, 0));
  btnLeft.addEventListener("click", () => tryMove(0, -1));
  btnRight.addEventListener("click", () => tryMove(0, 1));

  function frame(t) {
    if (!running) return;
    const dt = lastTime ? Math.min(0.05, (t - lastTime) / 1000) : 0;
    lastTime = t;

    vehicles.forEach((v) => {
      v.x += v.dir * v.speed * dt;
      v.sprite.position.x = v.x;
    });
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      nextSpawnByRow[i] -= dt;
      if (nextSpawnByRow[i] > 0) return;
      const rowVehicles = vehicles.filter((v) => v.row === i);
      if (rowVehicles.length >= 2) return;
      spawnFor(i);
      nextSpawnByRow[i] = randomGap(row);
    });
    vehicles = vehicles.filter((v) => {
      const gone = v.dir > 0 ? v.x > ROAD_WIDTH / 2 + VEHICLE_WIDTH : v.x < -ROAD_WIDTH / 2 - VEHICLE_WIDTH;
      if (gone) v.sprite.parent?.remove(v.sprite);
      return !gone;
    });

    // Colisión: mismo carril y solape lateral.
    const playerX = colToX(playerCell.col);
    const hit = vehicles.some(
      (v) => v.row === playerCell.row && Math.abs(v.x - playerX) < (VEHICLE_WIDTH + PLAYER_RADIUS * 2) / 2
    );
    if (hit) {
      finish("hit");
      return;
    }

    // Cámara: sigue la fila de la jugadora con suavizado.
    // La cámara mira un poco más adelante que la jugadora, no encima de
    // ella, para que se vea venir el tráfico en vez de solo lo ya cruzado.
    const lookAheadRow = Math.min(GOAL_ROW, playerCell.row + 1.5);
    camTarget.z += (lookAheadRow * LANE_DEPTH - camTarget.z) * Math.min(1, dt * 4);
    placeCamera();
    player.update(dt);

    rafId = requestAnimationFrame(frame);
    render?.(scene, camera);
  }

  let render = null;

  function finish(outcome) {
    if (!running) return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    const delay = outcome === "hit" ? 550 : 150;
    setTimeout(() => {
      ui.classList.add("hidden");
      resolveFn?.(outcome);
      resolveFn = null;
    }, delay);
  }

  /** `renderFn(scene, camera)` — normalmente pixels.render de main.js. */
  function play(renderFn) {
    render = renderFn;
    ui.classList.remove("hidden");
    return new Promise((resolve) => {
      resolveFn = resolve;
      resetGame();
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    });
  }

  function resize(aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    window.removeEventListener("keydown", onKey);
    if (rafId) cancelAnimationFrame(rafId);
    unsubscribe?.();
  }

  placeCamera();
  // Introspección de solo lectura — la usan las comprobaciones en tools/
  // para decidir con criterio cuándo es seguro avanzar, en vez de darle a
  // la tecla a ciegas.
  function getState() {
    return {
      row: playerCell.row,
      col: playerCell.col,
      goalRow: GOAL_ROW,
      vehicles: vehicles.map((v) => ({ row: v.row, x: v.x, dir: v.dir })),
    };
  }

  return { scene, camera, play, resize, dispose, getState };
}
