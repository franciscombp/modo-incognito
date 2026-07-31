import * as THREE from "three";
import { CharacterSprite } from "../entities/sprite.js";
import { WORLD_SCALE as S } from "./config.js";
import { getCameraSettings, subscribeCameraSettings } from "./cameraSettings.js";

// Cruzar la Amazonas con sprites: mismo motor pero ahora con sprites 2D
// de autos, bicis y árboles. Pantalla completa para máximo impacto.
//
// ROWS describe cada carril, de la acera de salida (fila 0) a la puerta (última fila).

const COLS = 5;
const LANE_DEPTH = 2.4 * S;
const ROAD_WIDTH = 5.2 * S;
const VEHICLE_WIDTH = 0.85 * S;
const PLAYER_RADIUS = 0.3 * S;
const MOVE_COOLDOWN = 105;

// Cámara: detrás de la jugadora y algo elevada, mirando calle adelante.
const CAM_BACK = 9.6 * S;
const CAM_HEIGHT = 6.2 * S;
const CAM_AHEAD = 2.6 * S;
const CAM_SIDE_FOLLOW = 0.45;

// Huecos generosos a propósito: es un chiste sobre que te despidan, no un
// examen de reflejos — la caminata debe ganarse con lectura de tráfico, no
// con pixel-perfect timing. Si vuelves a tocar estos números, corre
// `npm run check:crossing`: mide con un bot cuántos intentos de cada diez
// llegan al otro lado, y por debajo de 7 el día 1 se vuelve un muro.
const ROWS = [
  { kind: "sidewalk" },
  { kind: "car", dir: 1, speed: 1.8 * S, gap: [2.9, 4.1], colors: [0xe6483f, 0x45a0e0, 0xf2c744] },
  { kind: "car", dir: 1, speed: 2.1 * S, gap: [2.7, 3.8], colors: [0xe6483f, 0xe8e8e8, 0x45a0e0] },
  { kind: "car", dir: 1, speed: 1.9 * S, gap: [3.0, 4.2], colors: [0xf2c744, 0xe6483f] },
  { kind: "bike", dir: -1, speed: 2.5 * S, gap: [2.4, 3.4], colors: [0xa8e05f, 0x45e0d0] },
  { kind: "median" },
  { kind: "bike", dir: 1, speed: 2.5 * S, gap: [2.4, 3.4], colors: [0xa8e05f, 0x45e0d0] },
  { kind: "car", dir: -1, speed: 2.0 * S, gap: [2.9, 4.1], colors: [0x8b5cf6, 0xe8e8e8] },
  { kind: "car", dir: -1, speed: 2.2 * S, gap: [2.7, 3.8], colors: [0xe6483f, 0x45a0e0, 0xf2c744] },
  { kind: "car", dir: -1, speed: 1.8 * S, gap: [3.0, 4.2], colors: [0xf2c744, 0x8b5cf6] },
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

// Carga de texturas sprite
const textureLoader = new THREE.TextureLoader();
let autosTexture = null;
let bicisTexture = null;
let arbolesTexture = null;

// Precarga de texturas
Promise.all([
  textureLoader.loadAsync(`${import.meta.env.BASE_URL}sprites/autos.png`).catch(() => null),
  textureLoader.loadAsync(`${import.meta.env.BASE_URL}sprites/bicis.png`).catch(() => null),
  textureLoader.loadAsync(`${import.meta.env.BASE_URL}sprites/arboles.png`).catch(() => null),
]).then(([a, b, ab]) => {
  autosTexture = a;
  bicisTexture = b;
  arbolesTexture = ab;
  if (autosTexture) autosTexture.magFilter = THREE.NearestFilter;
  if (bicisTexture) bicisTexture.magFilter = THREE.NearestFilter;
  if (arbolesTexture) arbolesTexture.magFilter = THREE.NearestFilter;
});

// La cámara mira hacia +Z, así que su "derecha" es -X: por eso la columna
// crece hacia -X y la tecla izquierda mueve, de verdad, hacia la izquierda de
// la pantalla. Si algún día se gira la cámara, este signo es lo único a tocar.
function colToX(col) {
  return -(col - (COLS - 1) / 2) * (ROAD_WIDTH / COLS);
}

// ---- Vehículos: Sprites 2D para autos y bicis ----
// Los sprites cargados de autos.png, bicis.png son planos texturizados
// que mantienen altura fija mientras se mueven.

/**
 * Crea un sprite de vehículo (auto o bici) con textura sprite.
 * Los sprites son planos con texturas que se ven desde la cámara frontal.
 */
function vehicleSprite(kind, dir) {
  const isAuto = kind === "car";
  const texture = isAuto ? autosTexture : bicisTexture;

  // Fallback: si no cargó la textura, usar geometría simple de color
  if (!texture) {
    const height = isAuto ? 0.7 * S : 1.2 * S;
    const width = isAuto ? 2.0 * S : 0.6 * S;
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshLambertMaterial({
      color: isAuto ? 0x4a90e2 : 0x2ecc71,
      transparent: true,
      alphaTest: 0.5,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (dir < 0) mesh.scale.x = -1;
    return mesh;
  }

  // Con textura: plano que muestra el sprite
  const height = isAuto ? 0.8 * S : 1.3 * S;
  const width = (texture.image.width / texture.image.height) * height;

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  // Voltear sprite para dirección opuesta
  if (dir < 0) mesh.scale.x = -1;

  return mesh;
}

/**
 * Crea un sprite de árbol o arbusto para la mediana.
 */
function treeSprite() {
  if (!arbolesTexture) {
    // Fallback: cono simple
    const geometry = new THREE.ConeGeometry(0.5 * S, 1.5 * S, 8);
    const material = new THREE.MeshLambertMaterial({ color: 0x2d5016 });
    return new THREE.Mesh(geometry, material);
  }

  // Con textura
  const height = 1.5 * S;
  const width = (arbolesTexture.image.width / arbolesTexture.image.height) * height;

  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshLambertMaterial({
    map: arbolesTexture,
    transparent: true,
    alphaTest: 0.3,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

/**
 * `sheets` trae la hoja de acciones de la jugadora (para la pose de susto al
 * ser atropellada) y un puñado de hojas de compañeros para poblar las aceras.
 */
export function createCrossing3D(root, playerSheet, sheets = {}) {
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
  scene.fog = new THREE.Fog(0x11151f, 26 * S, 60 * S);

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xfff2d6, 1.05);
  key.position.set(10 * S, 30 * S, 6 * S);
  scene.add(key);
  // Relleno desde el lado de la cámara: la fachada del banco mira hacia -Z y
  // sin esto se veía como un rectángulo negro al fondo de la calle.
  const fill = new THREE.DirectionalLight(0xbcd4ff, 0.75);
  fill.position.set(-4 * S, 12 * S, -20 * S);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(getCameraSettings().fov, 1, 0.5 * S, 300 * S);
  const camTarget = new THREE.Vector3(0, 0, 0);
  const unsubscribe = subscribeCameraSettings((s) => {
    camera.fov = s.fov;
    camera.updateProjectionMatrix();
  });

  /** Detrás del hombro y mirando calle adelante — nunca de lado. */
  function placeCamera() {
    const x = camTarget.x * CAM_SIDE_FOLLOW;
    camera.position.set(x, CAM_HEIGHT, camTarget.z - CAM_BACK);
    camera.lookAt(x, 1.0 * S, camTarget.z + CAM_AHEAD);
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
      for (const dx of [-2.0, -1.1, 1.1, 2.0]) {
        const tree = treeSprite();
        tree.position.set(dx * S, 0.75 * S, z);
        roadGroup.add(tree);
      }
    }
  });

  // ---- El edificio del banco, al fondo: es lo que da sentido a caminar
  // hacia allá. Con la cámara detrás, es lo único que llena el horizonte.
  const facade = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH * 1.6, 12 * S, 4 * S),
    new THREE.MeshLambertMaterial({ color: 0x2a3347 })
  );
  facade.position.set(0, 6 * S, GOAL_ROW * LANE_DEPTH + 3.2 * S);
  roadGroup.add(facade);

  // Ventanas encendidas, en rejilla: el piso 10 ya está trabajando sin ti.
  const windowGeo = new THREE.PlaneGeometry(0.42 * S, 0.3 * S);
  const windowMat = new THREE.MeshBasicMaterial({
    color: 0xf2c744,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  for (let r = 0; r < 8; r++) {
    for (let c = -3; c <= 3; c++) {
      if ((r + c) % 3 === 0) continue; // algunas apagadas, para que no sea una cuadrícula muerta
      const w = new THREE.Mesh(windowGeo, windowMat);
      w.position.set(c * 0.95 * S, (1.9 + r * 1.25) * S, GOAL_ROW * LANE_DEPTH + 1.19 * S);
      roadGroup.add(w);
    }
  }

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6 * S, 1.9 * S),
    new THREE.MeshBasicMaterial({ color: 0x8a5a32, side: THREE.DoubleSide })
  );
  door.position.set(0, 0.95 * S, GOAL_ROW * LANE_DEPTH + 1.19 * S);
  roadGroup.add(door);

  // ---- Jugadora: mismo sprite que en el piso, de espaldas ----
  const player = new CharacterSprite(playerSheet, { height: 1.45 * S, rig: sheets.playerRig });
  player.setFacing("north"); // avanza alejándose de la cámara
  if (sheets.playerAction) player.setActionSheet(sheets.playerAction);
  scene.add(player.object);

  // ---- Peatones: la avenida estaba desierta salvo por los coches, y eso la
  // hacía leerse como un tablero en vez de como una calle. Son los mismos
  // sprites de compañeros del piso, caminando por la acera, el parterre y la
  // puerta del banco. No colisionan con nada: son ambiente.
  const PEDESTRIAN_ROWS = [0, 5, GOAL_ROW];
  const pedestrians = (sheets.crowd ?? [])
    .filter(Boolean)
    .map((sheet, i) => {
      const row = PEDESTRIAN_ROWS[i % PEDESTRIAN_ROWS.length];
      const dir = i % 2 === 0 ? 1 : -1;
      const sprite = new CharacterSprite(sheet, { height: 1.4 * S });
      sprite.setFacing(dir > 0 ? "east" : "west");
      sprite.setMoving(true);
      scene.add(sprite.object);
      return {
        sprite,
        row,
        dir,
        speed: (0.7 + Math.random() * 0.5) * S,
        x: (Math.random() - 0.5) * ROAD_WIDTH * 0.85,
        // Los del parterre andan un poco desplazados en z, para que no vayan
        // todos por la misma línea exacta.
        dz: (Math.random() - 0.5) * 0.7 * S,
      };
    });

  function updatePedestrians(dt) {
    // Se dan la vuelta antes del borde del asfalto: si no, se les veía
    // caminando sobre el fondo negro, fuera de la calle.
    const limit = ROAD_WIDTH * 0.44;
    pedestrians.forEach((p) => {
      p.x += p.dir * p.speed * dt;
      if (p.x > limit || p.x < -limit) {
        p.dir *= -1;
        p.sprite.setFacing(p.dir > 0 ? "east" : "west");
      }
      p.sprite.setPosition(p.x, p.row * LANE_DEPTH + p.dz);
      p.sprite.update(dt);
    });
  }

  let vehicles = [];
  let nextSpawnByRow = ROWS.map(() => 0);
  let playerCell = { row: 0, col: Math.floor(COLS / 2) };
  let lastMove = 0;
  let stepTimer = 0; // ráfaga corta de animación de caminar tras cada paso
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
    const mesh = vehicleSprite(row.kind, row.dir);
    const startX = (row.dir > 0 ? -1 : 1) * (ROAD_WIDTH / 2 + VEHICLE_WIDTH * 2);
    mesh.position.set(startX, 0.6 * S, rowIndex * LANE_DEPTH);
    roadGroup.add(mesh);
    vehicles.push({ row: rowIndex, x: startX, dir: row.dir, speed: row.speed, mesh });
  }

  function randomGap(row) {
    const [gMin, gMax] = row.gap;
    return gMin + Math.random() * (gMax - gMin);
  }

  function resetGame() {
    vehicles.forEach((v) => v.mesh.parent?.remove(v.mesh));
    vehicles = [];
    playerCell = { row: 0, col: Math.floor(COLS / 2) };
    player.setPose(null);
    player.setFacing("north");
    player.setMoving(false);
    stepTimer = 0;
    layoutPlayer();
    camTarget.set(0, 0, 0);
    placeCamera();
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      // Un vehículo ya en marcha, repartido por la calle, para que el
      // carril no arranque completamente vacío.
      spawnFor(i);
      const v = vehicles[vehicles.length - 1];
      v.x = (Math.random() - 0.5) * ROAD_WIDTH;
      v.mesh.position.x = v.x;
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
    // Mirar hacia donde se dio el paso. Avanzar es "north" (de espaldas a la
    // cámara); la columna crece hacia -X, o sea hacia la derecha de pantalla.
    if (dr > 0) player.setFacing("north");
    else if (dr < 0) player.setFacing("south");
    else if (dc > 0) player.setFacing("east");
    else if (dc < 0) player.setFacing("west");
    player.setMoving(true);
    // Un poco más que el enfriamiento entre pasos: si encadenas pasos, la
    // animación no se corta entre uno y otro y se ve caminar de verdad.
    stepTimer = 0.34;
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
      v.mesh.position.x = v.x;
    });
    ROWS.forEach((row, i) => {
      if (row.kind !== "car" && row.kind !== "bike") return;
      nextSpawnByRow[i] -= dt;
      if (nextSpawnByRow[i] > 0) return;
      // Un vehículo por carril a la vez. Con dos, el segundo entraba mientras
      // aún cruzabas el hueco del primero y no había forma de leer el carril.
      if (vehicles.some((v) => v.row === i)) return;
      spawnFor(i);
      nextSpawnByRow[i] = randomGap(row);
    });
    vehicles = vehicles.filter((v) => {
      const limit = ROAD_WIDTH / 2 + VEHICLE_WIDTH * 2;
      const gone = v.dir > 0 ? v.x > limit : v.x < -limit;
      if (gone) v.mesh.parent?.remove(v.mesh);
      return !gone;
    });

    // Colisión: mismo carril y solape lateral.
    const playerX = colToX(playerCell.col);
    const hit = vehicles.some(
      (v) => v.row === playerCell.row && Math.abs(v.x - playerX) < (VEHICLE_WIDTH + PLAYER_RADIUS * 2) / 2
    );
    if (hit) {
      // El medio segundo antes de cortar a la pantalla de despido se aprovecha
      // para la pose de susto de su propia hoja de acciones.
      player.setMoving(false);
      player.setPose("scared");
      finish("hit");
      return;
    }

    // Cámara: sigue a la jugadora con suavizado, siempre por detrás.
    camTarget.z += (playerCell.row * LANE_DEPTH - camTarget.z) * Math.min(1, dt * 4);
    camTarget.x += (playerX - camTarget.x) * Math.min(1, dt * 6);
    placeCamera();

    if (stepTimer > 0) {
      stepTimer -= dt;
      if (stepTimer <= 0) player.setMoving(false);
    }
    player.update(dt);
    updatePedestrians(dt);

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
      document.body.classList.remove("crossing-open");
      resolveFn?.(outcome);
      resolveFn = null;
    }, delay);
  }

  /** `renderFn(scene, camera)` — normalmente pixels.render de main.js. */
  function play(renderFn) {
    render = renderFn;
    ui.classList.remove("hidden");
    // Crossing ocupa pantalla completa
    document.body.classList.add("crossing-open");
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
    document.body.classList.remove("crossing-open");
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
      // El encuadre, para poder comprobar que la cámara mira de verdad hacia
      // adelante y por detrás de la jugadora (ver tools/check-crossing.mjs).
      camera: {
        z: camera.position.z,
        y: camera.position.y,
        playerZ: playerCell.row * LANE_DEPTH,
      },
    };
  }

  /** Cambiar de personaje jugable sin rehacer la escena. */
  function setPlayerSheet(sheet, actionSheet, rig) {
    player.setSheet(sheet);
    if (rig !== undefined) player.setRig(rig);
    if (actionSheet) player.setActionSheet(actionSheet);
    player.setFacing("north");
  }

  return { scene, camera, play, resize, dispose, getState, setPlayerSheet };
}
