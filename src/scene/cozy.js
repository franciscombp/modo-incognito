import * as THREE from "three";

/**
 * LA PALETA COZY DEL SET.
 *
 * El escenario está a propósito en tonos cálidos, apagados y sin textura: es
 * el fondo, no el protagonista. Todo el color saturado se reserva para los
 * personajes (que traen el de su pliego original), y así la gente se lee
 * siempre por encima de los muebles — que es justo lo que hacen las
 * referencias: decorado en pastel, reparto en color.
 *
 * Antes cada superficie llevaba una textura de píxeles generada en un lienzo
 * (el juego imitaba pixel art visto en ángulo). Con personajes 3D esa trama
 * pelea con ellos y ensucia la imagen, así que ahora son colores planos.
 */

/** Superficies del edificio. Los nombres los usan builder.js y furniture.js. */
export const SURFACES = {
  // Suelos
  tileLight: "#ece2d2", // el suelo general, arena cálida
  tileLobby: "#f5efe4", // los pasillos, un punto más claros
  woodFloor: "#d9b48f", // la alfombra de la entrada
  carpetPurple: "#e2d7c6", // base de las moquetas de zona (el color va por vértice)

  // Paredes y volúmenes: gris corporativo, no el beige cálido del resto del
  // decorado — las paredes son oficina de verdad, el mobiliario se queda
  // cozy.
  wallPanel: "#c6c4bf",
  panelLight: "#d2d0ca",

  // Mobiliario
  deskTop: "#f2e7d5",
  deskEdge: "#dcc9ad",
  deskLeg: "#c4a88c",
  fabricDark: "#8fa9b8", // la tapicería de las sillas ya no es gris oscuro
  screen: "#3c4550",
  screenGlow: "#bfd8e0",

  // Vegetación
  woodPot: "#c98b6b",
  leaves: "#7fa86b",

  // Cristal y metal, mucho menos fríos que antes
  glass: "#d8e8ea",
  frame: "#c0b09a",
  metal: "#cbbba6",
};

/** El cielo y la luz. */
export const ATMOSPHERE = {
  skyTop: "#e4dbef", // lavanda suave, como la referencia del camión
  skyBottom: "#f7eee2", // crema cálido a la altura del horizonte
  fog: "#f2e8dc",
};

/**
 * Sillas y detalles se reparten estos acentos en vez de ser todos iguales.
 * Son pocos y emparentados: una silla granate junto a una verde salvia se
 * lee como una oficina con gusto, doce colores distintos se leen como ruido.
 */
export const ACCENTS = ["#8fa9b8", "#c98b7a", "#9dbfa4", "#d9b384", "#a89bc4"];

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
