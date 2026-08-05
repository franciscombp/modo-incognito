import * as THREE from "three";
import { WORLD_SCALE as S } from "./config.js";
import { iconImage } from "../ui/icons.js";

/**
 * LAS MEDALLAS: qué se puede hacer en cada sitio, sin leer nada.
 *
 * Antes el piso llevaba RÓTULOS flotando — cajas de texto con el nombre de
 * la zona. Estorbaban más que ayudaban: tapaban el escenario, se solapaban
 * entre ellas y obligaban a leer en mitad de una persecución, que es
 * justo cuando no se puede leer. Y decían lo que ya dice la barra de tarea.
 *
 * En su lugar va una MEDALLA por sitio interactuable: un disco flotando
 * sobre el punto exacto, con el icono de lo que ahí se hace. Se entiende de
 * un vistazo y desde lejos, que es lo que hace falta mientras esquivas al
 * jefe.
 *
 * ── Por qué un disco dibujado en canvas y no geometría ──
 * El icono tiene que ser el MISMO que usa la interfaz (`ui/icons.js`), y esos
 * son SVG. Modelarlos en 3D sería mantener dos juegos de iconos que se
 * separarían al primer cambio. Un canvas con el aro, el relleno y el icono
 * encima sale de una sola fuente y se ve nítido.
 *
 * ── Por qué mira a la cámara ──
 * Un disco plano en el mundo desaparece al verlo de canto. Como medalla
 * colgada, tiene que leerse desde cualquier ángulo, así que se orienta con
 * la cámara cada frame (`sprite`). El precio es que no recibe luz — y es lo
 * que se quiere: es un indicador de interfaz que vive en el mundo, no un
 * objeto del decorado.
 */

/** Qué medalla lleva cada cosa. El color dice la CATEGORÍA de un vistazo. */
export const BEACON_KINDS = {
  // Tarea que hacer: ámbar, el color de "aquí hay algo para ti".
  activity: { ring: "#ffd454", glow: "#ffe9a8", icon: "star" },
  // Sitio donde fingir: verde, el color de estar a salvo.
  safe: { ring: "#7fd8cf", glow: "#c4f0ea", icon: "check" },
  // Escondite: azul apagado, más discreto — es un recurso, no un objetivo.
  hide: { ring: "#8fa8d8", glow: "#c8d6f0", icon: "hide" },
};

const CANVAS = 128;
const texCache = new Map();

/**
 * Dibuja la medalla: aro exterior, disco de fondo y el icono encima.
 *
 * Se cachea por (icono + color): en un piso hay decenas de medallas y la
 * mayoría repiten pareja, así que sin caché se pagaría un canvas y una
 * textura por cada una.
 */
function medalTexture(iconName, ring, glow) {
  const key = `${iconName}|${ring}|${glow}`;
  if (texCache.has(key)) return texCache.get(key);

  const c = document.createElement("canvas");
  c.width = c.height = CANVAS;
  const ctx = c.getContext("2d");
  const mid = CANVAS / 2;

  // Halo suave: es lo que la despega del fondo cuando cae sobre una pared
  // clara o sobre otra medalla.
  const halo = ctx.createRadialGradient(mid, mid, CANVAS * 0.2, mid, mid, mid);
  halo.addColorStop(0, `${glow}66`);
  halo.addColorStop(1, `${glow}00`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, CANVAS, CANVAS);

  // Disco de fondo, oscuro: el icono va en claro encima, y así se lee tanto
  // sobre el suelo oscuro como contra una ventana.
  ctx.beginPath();
  ctx.arc(mid, mid, CANVAS * 0.33, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(10, 20, 32, 0.88)";
  ctx.fill();

  // Aro del color de la categoría.
  ctx.lineWidth = CANVAS * 0.055;
  ctx.strokeStyle = ring;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);

  // OJO: `iconImage` devuelve un ELEMENTO Image ya con su src puesto, no una
  // URL. Asignarlo a `.src` lo convierte en la cadena "[object
  // HTMLImageElement]", la carga falla en silencio y la medalla se queda
  // siendo un disco vacío — que es exactamente lo que pasó.
  const img = iconImage(iconName, { color: glow, size: 64 });
  const pintar = () => {
    const s = CANVAS * 0.34;
    ctx.drawImage(img, mid - s / 2, mid - s / 2, s, s);
    tex.needsUpdate = true;
  };
  // Puede venir ya cargada de la caché de iconos: entonces no habrá `onload`
  // nunca y esperarlo dejaría la medalla vacía para siempre.
  if (img.complete && img.naturalWidth) pintar();
  else img.addEventListener("load", pintar, { once: true });

  return tex;
}

/**
 * Una medalla sobre un punto del piso.
 *
 * `height` es la altura del centro. Por defecto queda por ENCIMA de la
 * cabeza (los personajes miden hasta 1.85): más baja se la come el
 * mobiliario, más alta se despega del sitio al que señala.
 */
export function createBeacon(kind, { x, z, icon, height = 2.05 * S, size = 0.5 * S } = {}) {
  const preset = BEACON_KINDS[kind] ?? BEACON_KINDS.activity;
  const tex = medalTexture(icon ?? preset.icon, preset.ring, preset.glow);

  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    // Se dibuja SOBRE el decorado aunque quede detrás de una mesa: es un
    // indicador, y uno que se esconde tras un mueble no indica nada.
    depthTest: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(size, size, 1);
  sprite.position.set(x, height, z);
  sprite.renderOrder = 10;

  sprite.userData.beacon = {
    baseY: height,
    // Desfases distintos por medalla: con el mismo reloj, el piso entero
    // sube y baja a la vez y parece un salvapantallas.
    phase: Math.random() * Math.PI * 2,
    baseSize: size,
  };
  return sprite;
}

/**
 * Anima el grupo entero: flotan y respiran.
 *
 * El "respirar" (escala) importa tanto como el flotar: a media distancia el
 * movimiento vertical apenas se aprecia, y el latido sí.
 */
export function updateBeacons(group, t) {
  if (!group) return;
  for (const s of group.children) {
    const b = s.userData.beacon;
    if (!b) continue;
    s.position.y = b.baseY + Math.sin(t * 1.6 + b.phase) * 0.06 * S;
    const k = 1 + Math.sin(t * 2.2 + b.phase) * 0.05;
    s.scale.set(b.baseSize * k, b.baseSize * k, 1);
  }
}

/** Apaga la medalla de un sitio ya gastado (una sala que se ocupó, una tarea
 *  hecha): se queda tenue en vez de desaparecer, para que se siga sabiendo
 *  que ahí HABÍA algo. */
export function setBeaconSpent(sprite, spent) {
  if (!sprite) return;
  sprite.material.opacity = spent ? 0.25 : 1;
}
