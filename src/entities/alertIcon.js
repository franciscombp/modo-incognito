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

// ── EL ZZZ: dormida se ve, no solo se siente en los mandos muertos ──────
// Mismo dibujo que un globo de alerta (lo lleva encima el jefe; esto lo
// lleva encima la jugadora), pero es SU estado, no el de quien la mira: no
// hay color de peligro, es sueño, así que va en un azul apagado, propio.
const SLEEP = { ring: "#8fa8d8", glow: "#c8d6f0", icon: "sleep" };

export function createSleepIcon(bodyHeight) {
  const mat = new THREE.SpriteMaterial({
    map: bubbleTexture(SLEEP.icon, SLEEP.ring, SLEEP.glow),
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
  const size = 0.4 * S;
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 11;
  sprite.userData.sleepIcon = {
    baseHeight: bodyHeight + 0.32 * S,
    phase: Math.random() * Math.PI * 2,
  };
  sprite.visible = false;
  return sprite;
}

/** A diferencia del globo de alerta, este solo tiene encendido/apagado — no
 *  hace falta un segundo icono, dormida es dormida. */
export function updateSleepIcon(sprite, x, z, asleep, t) {
  sprite.visible = !!asleep;
  if (!asleep) return;
  const d = sprite.userData.sleepIcon;
  const bob = Math.sin(t * 2.4 + d.phase) * 0.06 * S;
  sprite.position.set(x, d.baseHeight + bob, z);
}
