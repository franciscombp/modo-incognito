import * as THREE from "three";
import { cozyMaterial } from "./cozy.js";

// Procedural pixel-art textures. Everything is drawn into small canvases
// (16-48px) and sampled with NearestFilter so it keeps hard pixel edges at
// any zoom, matching the reference art's chunky pixel look. Generating them
// in code keeps the repo free of binary art while the real tilesets are
// still being drawn.

const cache = new Map();

function makeCanvas(size) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  return { canvas, ctx: canvas.getContext("2d") };
}

function toTexture(canvas, repeat = 1) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  return texture;
}

// Deterministic hash-noise so textures look identical between reloads.
function noise(x, y, seed) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function shadeHex(hexColor, amount) {
  const c = new THREE.Color(hexColor);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Speckled loop carpet — used for the open-plan bullpens. */
function carpet(base, fleck, size = 32) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x, y, 3);
      if (n > 0.86) {
        ctx.fillStyle = fleck;
        ctx.fillRect(x, y, 1, 1);
      } else if (n < 0.12) {
        ctx.fillStyle = shadeHex(base, -0.05);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

/** Grid of square floor tiles with grout lines — corridors and lobby. */
function tileFloor(base, grout, tile = 16, size = 32) {
  const { canvas, ctx } = makeCanvas(size);
  for (let ty = 0; ty < size / tile; ty++) {
    for (let tx = 0; tx < size / tile; tx++) {
      // Slight per-tile value variation keeps large floors from banding.
      const v = (noise(tx, ty, 9) - 0.5) * 0.05;
      ctx.fillStyle = shadeHex(base, v);
      ctx.fillRect(tx * tile, ty * tile, tile, tile);
      // Speckle for a polished-stone read.
      for (let i = 0; i < tile * 2; i++) {
        const px = tx * tile + Math.floor(noise(i, ty * 7 + tx, 21) * tile);
        const py = ty * tile + Math.floor(noise(i + 50, tx * 7 + ty, 33) * tile);
        ctx.fillStyle = shadeHex(base, 0.04);
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
  ctx.fillStyle = grout;
  for (let i = 0; i <= size; i += tile) {
    ctx.fillRect(i % size, 0, 1, size);
    ctx.fillRect(0, i % size, size, 1);
  }
  return canvas;
}

/** Horizontal wood grain — desks, meeting tables, the entrance mat. */
function wood(base, size = 32) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    const band = (noise(0, y, 5) - 0.5) * 0.09;
    ctx.fillStyle = shadeHex(base, band);
    ctx.fillRect(0, y, size, 1);
    for (let x = 0; x < size; x++) {
      if (noise(x, y, 11) > 0.93) {
        ctx.fillStyle = shadeHex(base, -0.08);
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }
  return canvas;
}

/** Vertical panel joints — perimeter walls. */
function panelWall(base, size = 32) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 8) {
    ctx.fillStyle = shadeHex(base, -0.03);
    ctx.fillRect(x, 0, 1, size);
    ctx.fillStyle = shadeHex(base, 0.04);
    ctx.fillRect(x + 1, 0, 1, size);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (noise(x, y, 17) > 0.94) {
        ctx.fillStyle = shadeHex(base, 0.03);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

/** Dark fabric — sofas, chairs, cubicle screens. */
function fabric(base, size = 16) {
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x, y, 29);
      if (n > 0.8) {
        ctx.fillStyle = shadeHex(base, 0.05);
        ctx.fillRect(x, y, 1, 1);
      } else if (n < 0.2) {
        ctx.fillStyle = shadeHex(base, -0.05);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  return canvas;
}

const RECIPES = {
  carpetPurple: () => toTexture(carpet("#8d8496", "#a99fb6"), 6),
  carpetOrange: () => toTexture(carpet("#a89078", "#c0a88e"), 6),
  carpetRed: () => toTexture(carpet("#7d5250", "#9c6a67"), 6),
  carpetNeutral: () => toTexture(carpet("#9a9086", "#b3a89c"), 6),
  tileLight: () => toTexture(tileFloor("#b4b8bf", "#9a9ea6"), 3),
  tileLobby: () => toTexture(tileFloor("#b6bac1", "#9aa0a8"), 3),
  tileUtility: () => toTexture(tileFloor("#8f97a3", "#767d88", 8), 3),
  woodDesk: () => toTexture(wood("#c2a882"), 1),
  woodTable: () => toTexture(wood("#8a6b45"), 1),
  woodFloor: () => toTexture(wood("#94795c"), 4),
  wallPanel: () => toTexture(panelWall("#5c616b"), 2),
  panelLight: () => toTexture(panelWall("#b9c0cb"), 2),
  fabricDark: () => toTexture(fabric("#2f3238"), 1),
  fabricScreen: () => toTexture(fabric("#7d7290"), 1),
  fabricCounter: () => toTexture(fabric("#8f96a1"), 1),
  fabricSofa: () => toTexture(fabric("#d9a441"), 1),
  woodPot: () => toTexture(wood("#a5764f"), 1),
  woodLight: () => toTexture(wood("#a2957f"), 1),
};

export function getTexture(name) {
  if (!cache.has(name)) {
    const recipe = RECIPES[name];
    if (!recipe) throw new Error(`Unknown texture "${name}"`);
    cache.set(name, recipe());
  }
  return cache.get(name);
}

/**
 * El material de una superficie del set.
 *
 * Ya NO devuelve la textura de píxeles de arriba: devuelve un color plano de
 * la paleta cozy (ver scene/cozy.js). Las tramas existían para que el 3D
 * pasara por pixel art visto en ángulo; con personajes 3D delante, esa trama
 * pelea con ellos y ensucia la imagen.
 *
 * Se mantiene el nombre y la firma porque builder.js y furniture.js llaman
 * aquí desde una veintena de sitios, y porque los NOMBRES de superficie
 * ("tileLight", "woodPot"...) siguen describiendo bien qué es cada cosa.
 * `color` sigue mandando sobre la paleta, igual que antes mandaba sobre la
 * textura. Las recetas de textura se quedan por si algún día vuelve a hacer
 * falta una superficie con trama (el suelo del cruce, por ejemplo).
 */
export function texturedMaterial(name, opts = {}) {
  return cozyMaterial(name, opts);
}
