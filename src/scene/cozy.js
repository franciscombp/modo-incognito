import * as THREE from "three";
import { loadWorldPalette } from "./palette.js";

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

/**
 * Superficies del edificio. Los nombres los usan builder.js y furniture.js.
 *
 * Ya NO llevan sus colores escritos aquí: los rellena `loadWorldPalette()`
 * desde los tokens `--w-*` del tema (ver src/scene/palette.js). El objeto se
 * MUTA en vez de reasignarse, porque medio motor lo tiene ya importado.
 */
export const SURFACES = {};

/**
 * Sillas y detalles se reparten estos acentos en vez de ser todos iguales.
 * Son pocos y emparentados: una silla granate junto a una verde salvia se
 * lee como una oficina con gusto, doce colores distintos se leen como ruido.
 */
export const ACCENTS = [];

/** El cielo y la luz de reserva. Durante la partida manda el tema del día
 *  (`src/game/themes.js`), que interpola su propio cielo y su niebla. */
export const ATMOSPHERE = {
  skyTop: "#1b2a38",
  skyBottom: "#22323f",
  fog: "#1d2c3a",
};

/**
 * Recarga la paleta del set desde el tema activo y tira los materiales
 * cacheados, que llevan el color dentro. Lo llama `theme.js` al cambiar de
 * tema; hay que reconstruir el piso después para que se vea.
 */
export function refreshWorldPalette() {
  loadWorldPalette(SURFACES, ACCENTS);
  materialCache.clear();
}

const materialCache = new Map();

loadWorldPalette(SURFACES, ACCENTS);

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
  const {
    color,
    vertexColors = false,
    transparent,
    opacity,
    side,
    // Para superficies pegadas a otra (la moqueta sobre el suelo): sin esto
    // los dos planos se pelean por el mismo pixel y aparecen franjas que
    // parpadean al mover la camara.
    polygonOffset,
    polygonOffsetFactor,
    polygonOffsetUnits,
    ...rest
  } = opts;
  void rest; // roughness/metalness de la etapa anterior: ya no aplican

  const hex = color ?? SURFACES[name] ?? "#ded3c2";
  const key = `${hex}|${vertexColors}|${transparent}|${opacity}|${side}|${polygonOffset}|${polygonOffsetFactor}`;
  if (materialCache.has(key)) return materialCache.get(key);

  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(hex),
    vertexColors,
    ...(transparent != null ? { transparent } : {}),
    ...(opacity != null ? { opacity } : {}),
    ...(side != null ? { side } : {}),
    ...(polygonOffset != null ? { polygonOffset } : {}),
    ...(polygonOffsetFactor != null ? { polygonOffsetFactor } : {}),
    ...(polygonOffsetUnits != null ? { polygonOffsetUnits } : {}),
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
