import * as THREE from "three";

/**
 * LA PALETA DEL SET: TECH RETROFUTURISTA, SOBRIA.
 *
 * Dirección de arte nueva (adiós a los cafés/cremas de la etapa cozy): la
 * oficina es fría y tecnológica — porcelana, grafito, azules de acero — y
 * TODO el color saturado se reserva para los personajes y los acentos
 * puntuales (sillas, pantallas), como en Animal Crossing u Overcooked: el
 * decorado es legible y contenido, la gente es la que brilla.
 *
 * Sigue siendo color plano sin textura: con muñecos 3D encima, cualquier
 * trama pelea con ellos y ensucia la imagen.
 */

/** Superficies del edificio. Los nombres los usan builder.js y furniture.js. */
export const SURFACES = {
  // Suelos: porcelana fría, pasillos un punto más claros.
  tileLight: "#e2e6ec",
  tileLobby: "#eef1f5",
  woodFloor: "#aeb8c9", // la alfombra de la entrada, acero suave
  carpetPurple: "#d4dae4", // base de las moquetas de zona (el color va por vértice)

  // Paredes y volúmenes: hormigón claro azulado, oficina tech de verdad.
  wallPanel: "#c3c9d4",
  panelLight: "#d3d8e1",

  // Mobiliario: superficies blancas de laboratorio, patas de grafito.
  deskTop: "#f0f2f6",
  deskEdge: "#c5cbd6",
  deskLeg: "#4b515e",
  fabricDark: "#5a9fb0", // tapicería teal — el acento del set
  screen: "#232833",
  screenGlow: "#7fe3f0",

  // Vegetación: el único verde orgánico, para que respire.
  woodPot: "#8b93a3",
  leaves: "#6fae76",

  // Cristal y metal fríos, como toca en este set.
  glass: "#cfe3ec",
  frame: "#8f97a6",
  metal: "#aab2c0",
};

/** El cielo y la luz. */
export const ATMOSPHERE = {
  skyTop: "#bfcbec", // azul lavanda frío, cielo de mañana tech
  skyBottom: "#eef2f8",
  fog: "#e6ebf3",
};

/**
 * Sillas y detalles se reparten estos acentos en vez de ser todos iguales.
 * Son pocos y emparentados: una silla granate junto a una verde salvia se
 * lee como una oficina con gusto, doce colores distintos se leen como ruido.
 */
export const ACCENTS = ["#59a8c9", "#e0736b", "#5fbf9a", "#e2b45c", "#8f83d6"];

const materialCache = new Map();

/**
 * Un material plano del set.
 *
 * Mantiene la firma que tenía `texturedMaterial` para que builder.js y
 * furniture.js no cambien: acepta `color` (que manda sobre el de la paleta) y
 * `vertexColors`. Los ajustes de material físico (roughness, metalness) se
 * descartan sin ruido — este material es Lambert, plano y barato, y Three
 * avisaría por consola por cada propiedad que no conoce.
 */
export function cozyMaterial(name, opts = {}) {
  const { color, vertexColors = false, transparent, opacity, side, ...rest } = opts;
  void rest; // roughness/metalness de la etapa anterior: ya no aplican

  const hex = color ?? SURFACES[name] ?? "#ded3c2";
  const key = `${hex}|${vertexColors}|${transparent}|${opacity}|${side}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(hex),
    vertexColors,
    ...(transparent != null ? { transparent } : {}),
    ...(opacity != null ? { opacity } : {}),
    ...(side != null ? { side } : {}),
  });
  materialCache.set(key, material);
  return material;
}

/**
 * El fondo: un degradado vertical en vez del negro de antes.
 *
 * Con fondo negro el piso flotaba en el vacío y la escena se leía nocturna y
 * fría por mucho que se calentaran las luces. Es un lienzo de 2x64 estirado,
 * que es lo más barato que hay y no se nota que no es un cielo de verdad.
 */
export function skyTexture(top = ATMOSPHERE.skyTop, bottom = ATMOSPHERE.skyBottom) {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
