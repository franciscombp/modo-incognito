import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";
import { iconImage } from "../ui/icons.js";

/**
 * EL ICONO DE ALERTA — la sospecha ya NO vive en la placa de la jugadora,
 * vive SOBRE LA CABEZA de quien sospecha. Literal, como en Sneaky Sasquatch:
 * el ranger que te ve lleva un globo con "!" encima; tú no llevas un
 * medidor de "cuánto te ha visto EL ranger". Cada jefe/secuaz ya tenía su
 * propio `localHeat` (boss.js) para decidir cuándo seguirte — esto es
 * simplemente la primera vez que ESE número se ENSEÑA, en vez de vivir solo
 * puertas adentro empujando el halo y el umbral de seguimiento.
 *
 * Dos estados, dos iconos — nunca los dos a la vez:
 *   AMBAR "?"  — te tiene vista, todavía dudando (equivalente a `playerVisible`
 *                sin llegar a `hot`).
 *   ROJO  "!"  — ya la tiene clara: `redAlert`, en CHASE, o —solo en un
 *                secuaz— su propio `localHeat` cruzó `followThreshold` (el
 *                mismo umbral que lo pone a seguirte de verdad).
 *
 * Sprite en canvas por la misma razón que las medallas de `beacons.js`: el
 * icono tiene que ser el MISMO que usa la interfaz y no hay que mantener dos
 * juegos de iconos. `depthTest:false` a propósito — un globo de alerta que
 * se esconde tras un mueble no alerta de nada.
 */

const CANVAS = 96;
const texCache = new Map();

function bubbleTexture(iconName, ring, glow) {
  const key = `${iconName}|${ring}|${glow}`;
  if (texCache.has(key)) return texCache.get(key);

  const c = document.createElement("canvas");
  c.width = c.height = CANVAS;
  const ctx = c.getContext("2d");
  const mid = CANVAS / 2;

  const halo = ctx.createRadialGradient(mid, mid, CANVAS * 0.15, mid, mid, mid);
  halo.addColorStop(0, `${glow}70`);
  halo.addColorStop(1, `${glow}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  ctx.beginPath();
  ctx.arc(mid, mid, CANVAS * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 20, 32, 0.92)";
  ctx.fill();
  ctx.lineWidth = CANVAS * 0.07;
  ctx.strokeStyle = ring;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);

  const img = iconImage(iconName, { color: glow, size: 64 });
  const pintar = () => {
    const s = CANVAS * 0.4;
    ctx.drawImage(img, mid - s / 2, mid - s / 2, s, s);
    tex.needsUpdate = true;
  };
  if (img.complete && img.naturalWidth) pintar();
  else img.addEventListener("load", pintar, { once: true });

  return tex;
}

const AMBER = { ring: "#ffd454", glow: "#ffe9a8", icon: "help" };
const RED = { ring: "#ff5c5c", glow: "#ffb3b3", icon: "alert" };

/** Un globo de alerta, arrancado apagado. `height` es sobre la CABEZA — por
 *  encima de donde vive el halo (ver `EYE_HEIGHT` en boss.js), para que no
 *  se confundan siendo dos cosas distintas a la misma altura. */
export function createAlertIcon(bodyHeight) {
  const mat = new THREE.SpriteMaterial({
    map: bubbleTexture(RED.icon, RED.ring, RED.glow),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    // OJO: la opacidad va a 1 y el apagado lo hace `visible`. Nació en 0
    // "para fundirlo luego"… y nadie la subía nunca: los globos estuvieron
    // INVISIBLES en pantalla mientras todos los tests miraban `visible` y
    // daban verde. Un material transparente con opacity 0 es un sprite que
    // existe, se actualiza y no pinta un solo píxel.
    opacity: 1,
  });
  const sprite = new THREE.Sprite(mat);
  const size = 0.42 * S;
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 11;
  sprite.userData.alertIcon = {
    baseHeight: bodyHeight + 0.32 * S,
    state: null, // null | "amber" | "red"
    phase: Math.random() * Math.PI * 2,
  };
  sprite.visible = false;
  return sprite;
}

/**
 * Actualiza posición y estado del globo. `state` es null (nada), "amber"
 * (sospecha, sin confirmar) o "red" (te tiene). Cambiar de estado recambia
 * la textura del material — son dos iconos distintos, no una tinta.
 */
export function updateAlertIcon(sprite, x, z, state, t) {
  const d = sprite.userData.alertIcon;
  if (state !== d.state) {
    d.state = state;
    if (state === "amber") sprite.material.map = bubbleTexture(AMBER.icon, AMBER.ring, AMBER.glow);
    else if (state === "red") sprite.material.map = bubbleTexture(RED.icon, RED.ring, RED.glow);
    sprite.material.needsUpdate = true;
  }
  sprite.visible = !!state;
  if (!state) return;
  const bob = Math.sin(t * 3 + d.phase) * 0.05 * S;
  sprite.position.set(x, d.baseHeight + bob, z);
}

// ── EL ZZZ: literalmente "Z, z, z" subiendo ─────────────────────────────
//
// Estuvo siendo un icono de LUNA metido en el mismo disco oscuro que los
// globos de alerta, y no se leía como sueño: se leía como "es de noche".
// El símbolo universal de dormir son las LETRAS, y en cartoon SUBEN y se
// desvanecen — el movimiento es la mitad del chiste. Así que esto no es un
// icono de `ui/icons.js`: es tipografía dibujada en canvas.
//
// (No rompe la regla de "ningún icono es un emoji": no hay emoji por
// ninguna parte, y una Z no depende de la fuente del sistema porque se
// rasteriza aquí con la familia que pidamos, con su contorno.)
const ZZZ_COLOR = "#dbe9ff";
const ZZZ_EDGE = "#0a1420";
const ZZZ_COUNT = 3;

function zTexture() {
  if (zTexture._cache) return zTexture._cache;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.font = `900 ${size * 0.8}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Contorno oscuro grueso: la Z tiene que leerse sobre moqueta clara y
  // sobre pasillo oscuro, igual que el anuncio grande del HUD.
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = ZZZ_EDGE;
  ctx.lineJoin = "round";
  ctx.strokeText("Z", size / 2, size * 0.54);
  ctx.fillStyle = ZZZ_COLOR;
  ctx.fillText("Z", size / 2, size * 0.54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  zTexture._cache = tex;
  return tex;
}

/**
 * Tres Z que salen de la cabeza, suben en diagonal, crecen y se
 * desvanecen — cada una con su fase, así que el chorro es continuo.
 * Devuelve un Group: `main.js` lo añade a la escena igual que un sprite.
 */
export function createSleepIcon(bodyHeight) {
  const group = new THREE.Group();
  group.userData.sleepIcon = { baseHeight: bodyHeight + 0.18 * S };
  for (let i = 0; i < ZZZ_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: zTexture(),
      transparent: true,
      depthWrite: false,
      // Un indicador que se esconde tras un mueble no indica nada — misma
      // razón que las medallas del piso.
      depthTest: false,
      toneMapped: false,
      opacity: 1,
    });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 11;
    // Desfase por Z: la de delante sale primero. Sin esto salen las tres
    // pegadas y parece un solo bloque temblando.
    s.userData.offset = i / ZZZ_COUNT;
    group.add(s);
  }
  group.visible = false;
  return group;
}

/**
 * Anima el chorro. Cada Z recorre un ciclo de 0 a 1: sube ~0.6 unidades de
 * plano, se va hacia la derecha, crece un 60% y se apaga al final.
 */
export function updateSleepIcon(group, x, z, asleep, t) {
  group.visible = !!asleep;
  if (!asleep) return;
  const base = group.userData.sleepIcon.baseHeight;
  group.position.set(x, 0, z);
  for (const s of group.children) {
    const k = (t * 0.55 + s.userData.offset) % 1; // 0→1, ~1.8 s por Z
    const size = (0.16 + k * 0.1) * S;
    s.scale.set(size, size, 1);
    s.position.set(k * 0.22 * S, base + k * 0.6 * S, 0);
    // Entra rápido y se apaga despacio: fundir también la entrada evita
    // que la Z "aparezca" de golpe pegada a la cabeza.
    s.material.opacity = Math.min(1, k * 6) * (1 - k) ** 0.7;
  }
}

// ── LAS CARITAS: el reverso exacto del Zzz ──────────────────────────────
//
// El Zzz dice «esto me está costando»; las caritas dicen «me lo estoy
// pasando bien». Salen mientras te escaqueas —haciendo una actividad o
// aguantándola con el jefe rondando— y cierran el par: los dos globos
// hablan de TU estado (a diferencia de los de alerta, que son de quien te
// mira), suben igual y se desvanecen igual. Que compartan gramática es lo
// que hace que se entiendan sin explicar ninguno.
//
// Se dibuja a mano en vez de tirar de `ui/icons.js` por dos razones: la
// carita de Phosphor YA está en uso como icono del JEFE (sería el mismo
// dibujo para «Gabo» y para «qué bien me lo paso»), y a 20 px un trazo
// fino se pierde — esta va rellena y con contorno, como las Z.
const CARA_COLOR = "#ffe27a";
const CARA_EDGE = "#3a2a08";
const CARA_COUNT = 3;

function caraTexture() {
  if (caraTexture._cache) return caraTexture._cache;
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const mid = size / 2;
  const r = size * 0.36;

  ctx.beginPath();
  ctx.arc(mid, mid, r, 0, Math.PI * 2);
  ctx.fillStyle = CARA_COLOR;
  ctx.fill();
  ctx.lineWidth = size * 0.075;
  ctx.strokeStyle = CARA_EDGE;
  ctx.stroke();

  // Ojos cerrados DE GUSTO (dos arcos), no dos puntos: es lo que separa
  // «contenta» de «mirando fijamente».
  ctx.lineWidth = size * 0.06;
  ctx.lineCap = "round";
  for (const dx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(mid + dx * r * 0.42, mid - r * 0.16, r * 0.24, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  }
  // La sonrisa.
  ctx.beginPath();
  ctx.arc(mid, mid + r * 0.02, r * 0.5, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  caraTexture._cache = tex;
  return tex;
}

/** Tres caritas que suben, con la misma mecánica que el Zzz. */
export function createHappyIcon(bodyHeight) {
  const group = new THREE.Group();
  group.userData.happyIcon = { baseHeight: bodyHeight + 0.18 * S };
  for (let i = 0; i < CARA_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: caraTexture(),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      opacity: 1,
    });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 11;
    s.userData.offset = i / CARA_COUNT;
    group.add(s);
  }
  group.visible = false;
  return group;
}

/**
 * Igual que el Zzz pero al otro lado: las caritas salen hacia la IZQUIERDA
 * y suben un poco más despacio. Que no sean un espejo exacto es a
 * propósito — si los dos globos se movieran idénticos, de reojo darían la
 * misma sensación, y dicen cosas opuestas.
 */
export function updateHappyIcon(group, x, z, contenta, t) {
  group.visible = !!contenta;
  if (!contenta) return;
  const base = group.userData.happyIcon.baseHeight;
  group.position.set(x, 0, z);
  for (const s of group.children) {
    const k = (t * 0.45 + s.userData.offset) % 1;
    const size = (0.15 + k * 0.08) * S;
    s.scale.set(size, size, 1);
    s.position.set(-k * 0.2 * S, base + k * 0.62 * S, 0);
    s.material.opacity = Math.min(1, k * 6) * (1 - k) ** 0.7;
  }
}
