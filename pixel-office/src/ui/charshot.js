import * as THREE from "three";
import { Character3D } from "../entities/character3d.js";

/**
 * RETRATOS DEL REPARTO PARA LOS MENÚS, COMO IMAGEN.
 *
 * La pantalla de selección enseñaba una celda del pliego de píxeles: elegías
 * un muñeco pixelado y entrabas a un juego 3D. Peor todavía, quien no tenía
 * pliego (Kiara) salía como una silueta gris — no se veía a quién elegías.
 *
 * Aquí se monta el mismo `Character3D` del piso y se le saca una FOTO. La
 * pantalla de selección es estática: no hace falta un lienzo vivo por tarjeta
 * (serían cinco contextos WebGL para cinco muñecos que no se mueven). Un solo
 * renderer que se usa y se guarda, y cada personaje sale como un `data:` URL
 * que la tarjeta pone de fondo.
 */

const W = 320;
const H = 460;
const HEIGHT = 1.5;

let renderer = null;
let scene = null;
let camera = null;
let failed = false;
const cache = new Map();

function init() {
  if (renderer || failed) return !!renderer;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    failed = true;
    return false;
  }
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xfff4e6, 1.5));
  const key = new THREE.DirectionalLight(0xfff0d4, 1.45);
  key.position.set(-2, 4, 3.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xf0e6ff, 0.7);
  fill.position.set(2.5, 1.5, -2);
  scene.add(fill);

  // Cuerpo entero, de la coronilla a los zapatos, con un dedo de aire.
  camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 30);
  const half = HEIGHT * 0.6;
  const dist = half / Math.tan((camera.fov * Math.PI) / 360) + 0.5;
  camera.position.set(0, HEIGHT * 0.52 + 0.28, dist);
  camera.lookAt(0, HEIGHT * 0.52, 0);
  return true;
}

/**
 * Devuelve un `data:` URL con el muñeco de esa receta, o null si no hay 3D.
 * Se cachea por receta: la pantalla se vuelve a dibujar cada vez que eliges.
 */
export function characterShot(look, pose = null) {
  if (!look || !init()) return null;
  const cacheKey = `${look.id ?? JSON.stringify(look)}::${pose ?? ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const character = new Character3D(look, { height: HEIGHT });
  // Un cuerpo esculpido puede no haber llegado todavía, y esta foto es de una
  // sola vuelta. Sin esto se fotografiaba el vacío Y SE CACHEABA: la tarjeta
  // se quedaba en blanco para siempre, aunque el modelo llegase un segundo
  // después. Devolver null deja que la tarjeta caiga a su pliego mientras.
  if (look.baseModel && !character._built) {
    character.dispose();
    return null;
  }
  character.setHeading(0.4, 1);
  if (pose) character.setPose(pose);
  // La pose y el balanceo de espera entran progresivamente: sin dejar correr
  // unos fotogramas, la foto sale a medio camino y el muñeco parece tieso.
  for (let f = 0; f < 40; f++) character.update(0.05);
  scene.add(character.object);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(character.object);
  character.dispose();

  cache.set(cacheKey, url);
  return url;
}
