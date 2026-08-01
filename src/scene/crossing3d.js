import * as THREE from "three";
import { Character3D } from "../entities/character3d.js";
import { WORLD_SCALE as S } from "./config.js";
import { getCameraSettings, subscribeCameraSettings } from "./cameraSettings.js";

// Cruzar la Amazonas con sprites: mismo motor pero ahora con sprites 2D
// de autos, bicis y árboles. Pantalla completa para máximo impacto.
//
// ROWS describe cada carril, de la acera de salida (fila 0) a la puerta (última fila).

const COLS = 5;
const LANE_DEPTH = 2.4 * S;
const ROAD_WIDTH = 13.0 * S; // Ancho para llenar la pantalla de lado a lado
const VEHICLE_WIDTH = 0.85 * S;
const PLAYER_RADIUS = 0.3 * S;
const MOVE_COOLDOWN = 105;
const STEP_DURATION = 0.16; // segundos que tarda en deslizarse de una celda a la siguiente

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

// De día, no de madrugada: el asfalto casi negro de antes desentonaba con el
// cielo claro. Colores más saturados que un gris neutro plano — esta escena
// es la primera que ve cualquiera que abra el juego, no puede leerse apagada.
const ROAD_COLORS = {
  sidewalk: 0xece2d2,
  goal: 0xece2d2,
  car: 0xa2988c,
  bike: 0x93a382,
  median: 0x9dbf88,
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
});

// Los tres pliegos (autos.png, bicis.png, arboles.png) son cuadrículas de
// variantes — un coche/bici/árbol distinto por celda — NO un solo dibujo.
// Antes se mapeaba la textura entera sobre cada plano, así que cada auto en
// pantalla mostraba la hoja completa de 16 coches aplastada en una miniatura.
// Cada pliego mide 1920x1920 y sus celdas, aunque dibujadas a mano y no
// perfectamente iguales, caen dentro de una rejilla pareja: autos y arboles
// en 4x4, bicis en 5x4 (se usa solo la primera columna: 4 diseños de bici,
// el resto de columnas son variantes de pedaleo que no hacen falta en un
// plano estático).
const AUTOS_GRID = { cols: 4, rows: 4 };
const BICIS_GRID = { cols: 5, rows: 4 };
const ARBOLES_GRID = { cols: 4, rows: 4 };

/** UV offset/repeat para la celda (col, row) de una rejilla, 0 = arriba-izq. */
function gridCellUV(texture, { cols, rows }, col, row) {
  const t = texture.clone();
  t.needsUpdate = true;
  t.magFilter = THREE.NearestFilter;
  t.repeat.set(1 / cols, 1 / rows);
  t.offset.set(col / cols, 1 - (row + 1) / rows);
  return t;
}

function randomCell(grid, cols = grid.cols) {
  return { col: Math.floor(Math.random() * cols), row: Math.floor(Math.random() * grid.rows) };
}

// La cámara mira hacia +Z, así que su "derecha" es -X: por eso la columna
// crece hacia -X y la tecla izquierda mueve, de verdad, hacia la izquierda de
// la pantalla. Si algún día se gira la cámara, este signo es lo único a tocar.
function colToX(col) {
  return -(col - (COLS - 1) / 2) * (ROAD_WIDTH / COLS);
}

// ---- Vehículos y árboles, en 3D ----
// Eran planos con una textura recortada de un pliego. Un plano con dibujo
// visto desde una cámara que se mueve delata que es un cartón: no tiene
// grosor, no recibe la luz de la escena y no proyecta sombra. Ahora son
// cuerpos de verdad, montados con primitivas como el resto del juego.

const CAR_COLORS = ["#e0785f", "#e8b45c", "#7fa9c9", "#8fb08a", "#c98bb0", "#e6e0d4"];
const BIKE_COLORS = ["#7fbf8f", "#5fb8c9", "#e8b45c"];

function flat(color) {
  return new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
}

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Un coche: carrocería, cabina, ruedas y faros.
 *
 * Mira a lo largo de X porque los carriles corren en X. Va bajo y ancho, con
 * la cabina retranqueada — es la silueta que hace que se lea como un coche de
 * juguete y no como una caja con ruedas.
 */
function vehicleSprite(kind, dir) {
  const group = new THREE.Group();
  if (kind !== "car") return buildBike(group, dir);

  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const L = 3.1 * S;
  const W = 1.35 * S;
  const H = 0.62 * S;

  const body = box(L, H, W, color, 0, H * 0.5 + 0.16 * S, 0);
  body.geometry.translate(0, 0, 0);
  group.add(body);

  // Cabina más corta y algo hacia atrás, con las ventanas oscuras.
  group.add(box(L * 0.52, H * 0.72, W * 0.86, color, -L * 0.06, H * 1.2 + 0.16 * S, 0));
  group.add(box(L * 0.44, H * 0.42, W * 0.9, "#3c4550", -L * 0.06, H * 1.3 + 0.16 * S, 0));

  // Ruedas: cilindros tumbados sobre el eje Z, que es el eje del coche.
  const wheelGeo = new THREE.CylinderGeometry(0.26 * S, 0.26 * S, 0.16 * S, 12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, flat("#3a3630"));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(sx * L * 0.32, 0.26 * S, sz * W * 0.52);
      group.add(wheel);
    }
  }

  // Faros al frente, según hacia dónde circula el carril.
  for (const sz of [-1, 1]) {
    group.add(box(0.1 * S, 0.14 * S, 0.22 * S, "#fff3d0", dir * L * 0.49, H * 0.6 + 0.16 * S, sz * W * 0.3));
  }
  return group;
}

/** Una bici con su ciclista, que a esta escala es un bulto con casco. */
function buildBike(group, dir) {
  const color = BIKE_COLORS[Math.floor(Math.random() * BIKE_COLORS.length)];
  const wheelGeo = new THREE.TorusGeometry(0.34 * S, 0.06 * S, 6, 14);
  for (const sx of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, flat("#3a3630"));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(sx * 0.52 * S, 0.36 * S, 0);
    group.add(wheel);
  }
  group.add(box(1.0 * S, 0.09 * S, 0.09 * S, color, 0, 0.62 * S, 0));
  group.add(box(0.09 * S, 0.34 * S, 0.09 * S, color, dir * 0.42 * S, 0.78 * S, 0));
  // Ciclista
  group.add(box(0.42 * S, 0.5 * S, 0.34 * S, "#5f7fa8", -dir * 0.1 * S, 1.05 * S, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2 * S, 12, 9), flat("#e8b98f"));
  head.position.set(-dir * 0.05 * S, 1.42 * S, 0);
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22 * S, 12, 8), flat(color));
  helmet.scale.y = 0.6;
  helmet.position.set(-dir * 0.05 * S, 1.5 * S, 0);
  group.add(helmet);
  return group;
}

/** Un árbol: tronco y dos o tres copas, como en la referencia del camión. */
function treeSprite() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1 * S, 0.14 * S, 1.0 * S, 8),
    flat("#a8794f")
  );
  trunk.position.y = 0.5 * S;
  group.add(trunk);

  const greens = ["#7fa86b", "#8fb87a", "#6f9a5e"];
  const blobs = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = (0.44 - i * 0.07 + Math.random() * 0.08) * S;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), flat(greens[i % greens.length]));
    leaf.position.set(
      (Math.random() - 0.5) * 0.4 * S,
      (1.05 + i * 0.34) * S,
      (Math.random() - 0.5) * 0.3 * S
    );
    group.add(leaf);
  }
  return group;
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
export function createCrossing3D(root, playerLook, sheets = {}) {
  // Cromo mínimo en HTML por encima del lienzo 3D: el pie de foto y los
  // botones táctiles no necesitan ser parte de la escena.
  const ui = el("div", "crossing-ui hidden", root);
  const clock = el("div", "crossing-clock", ui);
  clock.textContent = "8:45 a.m.";
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

  // Son las 8:45 de la mañana, no medianoche: cielo claro y luz de sol, no el
  // azul casi negro de antes.
  const SKY = 0xe9dff0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 34 * S, 70 * S);

  scene.add(new THREE.AmbientLight(0xfff4e6, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d4, 1.15);
  key.position.set(10 * S, 30 * S, 6 * S);
  scene.add(key);
  // Relleno desde el lado de la cámara: la fachada de la institución mira hacia -Z y
  // sin esto se veía como un rectángulo negro al fondo de la calle.
  const fill = new THREE.DirectionalLight(0xf0e6ff, 0.75);
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
  // Cada franja mide solo ROAD_WIDTH, así que a los lados —donde antes
  // empezaban los edificios— se veía cielo colándose por el hueco, y detrás
  // de la jugadora (entre la cámara y la primera fila) no había suelo en
  // absoluto. GROUND_WIDTH extiende el terreno hasta que se solapa con los
  // edificios laterales, y una franja extra antes de la fila 0 cubre el
  // tramo que queda a espaldas de la jugadora.
  const GROUND_WIDTH = ROAD_WIDTH * 2.6;
  const roadGroup = new THREE.Group();
  scene.add(roadGroup);

  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(GROUND_WIDTH, LANE_DEPTH * 4),
    new THREE.MeshLambertMaterial({ color: ROAD_COLORS.sidewalk })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0, -LANE_DEPTH * 2);
  roadGroup.add(apron);

  ROWS.forEach((row, i) => {
    const z = i * LANE_DEPTH;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_WIDTH, LANE_DEPTH),
      new THREE.MeshLambertMaterial({ color: ROAD_COLORS[row.kind] })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0, z);
    roadGroup.add(mesh);

    if (row.kind === "car" || row.kind === "bike") {
      // Línea discontinua central del carril, de puro detalle. Se reparte a
      // todo el ancho de la calle (antes se quedaba agrupada en el centro,
      // dejando el resto del carril desnudo).
      const dashColor = row.kind === "bike" ? 0xa8e05f : 0xffffff;
      const dashSpan = ROAD_WIDTH * 0.9;
      const dashCount = Math.round(dashSpan / (1.1 * S));
      for (let d = 0; d < dashCount; d++) {
        const dx = -dashSpan / 2 + (d / (dashCount - 1)) * dashSpan;
        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.5 * S, 0.06 * S),
          new THREE.MeshBasicMaterial({ color: dashColor, transparent: true, opacity: 0.5 })
        );
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(dx, 0.01, z);
        roadGroup.add(dash);
      }
    }
    if (row.kind === "median") {
      // Igual que las líneas: árboles a todo el ancho de la mediana, no solo
      // en el centro, para que la calle ancha no se lea como medio vacía.
      const treeSpan = ROAD_WIDTH * 0.92;
      const treeCount = Math.round(treeSpan / (1.7 * S));
      for (let t = 0; t < treeCount; t++) {
        const dx = -treeSpan / 2 + (t / (treeCount - 1)) * treeSpan;
        const tree = treeSprite();
        tree.position.set(dx, 0.75 * S, z);
        roadGroup.add(tree);
      }
    }
  });

  // ---- El edificio de la institución, al fondo: es lo que da sentido a caminar
  // hacia allá. Con la cámara detrás, es lo único que llena el horizonte.
  const facade = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH * 1.6, 12 * S, 4 * S),
    new THREE.MeshLambertMaterial({ color: 0xd9cbb6 })
  );
  facade.position.set(0, 6 * S, GOAL_ROW * LANE_DEPTH + 3.2 * S);
  roadGroup.add(facade);

  // Ventanas encendidas, en rejilla: el piso 10 ya está trabajando sin ti.
  const windowGeo = new THREE.PlaneGeometry(0.42 * S, 0.3 * S);
  const windowMat = new THREE.MeshBasicMaterial({
    // Sobre fachada clara, una ventana amarilla brillante se lee como un
    // agujero de neón. En una mañana nublada las ventanas son cristal, no luz.
    color: 0x9db4c4,
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

  // ---- Fondo de ciudad, para que no se vea cielo alrededor de la institución ----
  // El edificio de la institución por sí solo, por ancho que sea, se ve al fondo como
  // una caja flotando en cielo abierto por los lados: a esa distancia
  // subtiende pocos grados de cámara. Una franja baja y MUY ancha detrás
  // cierra el horizonte con un perfil de azotea sin competir con la institución.
  const skyline = new THREE.Mesh(
    new THREE.BoxGeometry(ROAD_WIDTH * 6, 9 * S, 3 * S),
    new THREE.MeshLambertMaterial({ color: 0x3a4256 })
  );
  skyline.position.set(0, 4.5 * S, GOAL_ROW * LANE_DEPTH + 7 * S);
  roadGroup.add(skyline);

  // Edificios que flanquean la calle, a los lados, para que la avenida se
  // lea como una calle de ciudad y no como una pista sobre fondo vacío.
  const SIDE_BUILDINGS = [
    { side: -1, z: 1, h: 10, d: 4 },
    { side: -1, z: 4, h: 7, d: 3.4 },
    { side: -1, z: 7.4, h: 12, d: 4.4 },
    { side: 1, z: 0.4, h: 8, d: 3.6 },
    { side: 1, z: 3.6, h: 11, d: 4 },
    { side: 1, z: 7, h: 6.5, d: 3.2 },
  ];
  for (const b of SIDE_BUILDINGS) {
    const bx = b.side * (ROAD_WIDTH / 2 + b.d * S * 0.5 + 0.6 * S);
    const bz = b.z * LANE_DEPTH * (GOAL_ROW / 8);
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(b.d * S, b.h * S, b.d * S),
      new THREE.MeshLambertMaterial({ color: 0xcabca6 })
    );
    building.position.set(bx, (b.h / 2) * S, bz);
    roadGroup.add(building);
    // Un par de ventanas encendidas por edificio, de puro ambiente.
    for (let r = 1; r < b.h - 1; r += 1.4) {
      const w = new THREE.Mesh(windowGeo, windowMat);
      w.position.set(bx + (b.side < 0 ? b.d * S * 0.5 + 0.01 : -b.d * S * 0.5 - 0.01), r * S, bz);
      w.rotation.y = Math.PI / 2;
      roadGroup.add(w);
    }
  }

  // ---- Jugadora: el mismo muñeco que en el piso, de espaldas ----
  // Aquí se le da la dirección del mundo a mano y no una de las cuatro de
  // pantalla: esta escena tiene su propia cámara (por detrás del hombro), así
  // que "norte" no significa lo mismo que en el piso.
  const player = new Character3D(playerLook, { height: 1.45 * S, rig: sheets.playerRig });
  player.setHeading(0, 1); // avanza alejándose de la cámara
  scene.add(player.object);

  // ---- Peatones: la avenida estaba desierta salvo por los coches, y eso la
  // hacía leerse como un tablero en vez de como una calle. Son las mismas
  // variantes de gente que pueblan el piso, caminando por la acera, el
  // parterre y la puerta de la institución. No colisionan con nada: son ambiente.
  const PEDESTRIAN_ROWS = [0, 5, GOAL_ROW];
  const pedestrians = (sheets.crowd ?? [])
    .filter(Boolean)
    .map((look, i) => {
      const row = PEDESTRIAN_ROWS[i % PEDESTRIAN_ROWS.length];
      const dir = i % 2 === 0 ? 1 : -1;
      const sprite = new Character3D(look, { height: 1.4 * S });
      sprite.setHeading(dir, 0);
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
        p.sprite.setHeading(p.dir, 0);
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

  // La jugadora se movía por celdas pero `layoutPlayer` la teleportaba de una
  // a otra sin transición, así que cada paso se veía como un salto en vez de
  // una zancada. Ahora la posición renderizada (`playerPos`) se desliza desde
  // la celda de origen hasta la de destino en STEP_DURATION segundos; la
  // lógica de juego (colisión, meta) sigue usando `playerCell`, que cambia al
  // instante.
  let playerPos = { x: 0, z: 0 };
  let playerFrom = { x: 0, z: 0 };
  let stepElapsed = STEP_DURATION;

  function layoutPlayer() {
    const x = colToX(playerCell.col);
    const z = playerCell.row * LANE_DEPTH;
    playerPos = { x, z };
    playerFrom = { x, z };
    stepElapsed = STEP_DURATION;
    player.setPosition(x, z);
  }

  function spawnFor(rowIndex) {
    const row = ROWS[rowIndex];
    if (row.kind !== "car" && row.kind !== "bike") return;
    const mesh = vehicleSprite(row.kind, row.dir);
    const startX = (row.dir > 0 ? -1 : 1) * (ROAD_WIDTH / 2 + VEHICLE_WIDTH * 2);
    // Altura aumentada para que se vea mejor en pantalla
    mesh.position.set(startX, 0.65 * S, rowIndex * LANE_DEPTH);
    roadGroup.add(mesh);
    vehicles.push({ row: rowIndex, x: startX, dir: row.dir, speed: row.speed, mesh });
  }

  function randomGap(row) {
    const [gMin, gMax] = row.gap;
    return gMin + Math.random() * (gMax - gMin);
  }

  // Cada vehículo se crea con su propia geometría, material y textura
  // clonada (ver vehicleSprite/gridCellUV) — quitarlo de la escena con
  // `.remove()` no libera nada de eso en la GPU. En una partida con muchos
  // reintentos del cruce esto se acumulaba en memoria de vídeo hasta que el
  // juego se ponía lento o se congelaba a medio camino.
  function disposeVehicle(mesh) {
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => disposeMaterial(m));
    else disposeMaterial(mesh.material);
  }

  function disposeMaterial(material) {
    if (!material) return;
    material.map?.dispose();
    material.dispose();
  }

  function resetGame() {
    vehicles.forEach((v) => disposeVehicle(v.mesh));
    vehicles = [];
    playerCell = { row: 0, col: Math.floor(COLS / 2) };
    player.setPose(null);
    player.setHeading(0, 1);
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
    // Direcciones del mundo, no de pantalla: la cámara de esta escena es otra.
    if (dr !== 0) player.setHeading(0, dr > 0 ? 1 : -1);
    else if (dc !== 0) player.setHeading(dc > 0 ? 1 : -1, 0);
    player.setMoving(true);
    // Un poco más que el enfriamiento entre pasos: si encadenas pasos, la
    // animación no se corta entre uno y otro y se ve caminar de verdad.
    stepTimer = 0.34;
    playerFrom = { ...playerPos };
    stepElapsed = 0;
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
      if (gone) disposeVehicle(v.mesh);
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
    if (stepElapsed < STEP_DURATION) {
      stepElapsed = Math.min(STEP_DURATION, stepElapsed + dt);
      const t = stepElapsed / STEP_DURATION;
      const targetX = colToX(playerCell.col);
      const targetZ = playerCell.row * LANE_DEPTH;
      playerPos.x = playerFrom.x + (targetX - playerFrom.x) * t;
      playerPos.z = playerFrom.z + (targetZ - playerFrom.z) * t;
      player.setPosition(playerPos.x, playerPos.z);
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
  function setPlayerLook(look, rig) {
    player.setRecipe(look);
    if (rig !== undefined) player.setRig(rig);
    player.setHeading(0, 1);
  }

  return { scene, camera, play, resize, dispose, getState, setPlayerLook };
}
