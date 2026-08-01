import * as THREE from "three";
import { EXPRESSIONS } from "./face.js";

/**
 * EXPRESIONES PARA UN CUERPO IMPORTADO, AL ESTILO ANIMAL CROSSING.
 *
 * Un `.glb` trae su cara dentro de su propia textura, y esa textura no se
 * puede redibujar sin repintarle la piel entera. Así que la cara no se
 * modela: se PEGA DELANTE. Un plano pequeño colgado del hueso de la cabeza,
 * con fondo transparente, que enseña una celda distinta de una tira de
 * gestos. Cambiar de expresión es mover el recorte — no toca ni la geometría
 * ni el modelo.
 *
 * La tira es `public/models/<id>.faces.png`, con las celdas EN FILA y en el
 * orden de `EXPRESSIONS` (neutral, blink, happy, sad, surprised, annoyed,
 * talk). Se admite una tira más corta: lo que falte cae en la primera celda,
 * así que una imagen de una sola cara ya sirve para empezar.
 */

/** Cuántas celdas se esperan, y en qué orden. */
export const FACE_CELLS = EXPRESSIONS;

/**
 * Dónde va la cara sobre la cabeza, en fracción de la altura del personaje.
 *
 * Son valores de partida pensados para un humanoide de proporciones normales;
 * cada personaje puede afinarlos en su receta con `face: { y, z, size }`. Se
 * miden desde el hueso de la cabeza, no desde el suelo, porque es de ahí de
 * donde cuelga el plano.
 */
const DEFAULTS = { y: 0.075, z: 0.058, size: 0.15 };

/**
 * Monta el plano de la cara y devuelve con qué cambiarle el gesto.
 *
 * Devuelve null si no hay tira o no hay hueso de cabeza: un personaje sin
 * expresiones tiene que seguir funcionando, simplemente sin gesticular.
 */
export function attachFaceSheet(headBone, texture, { height = 1.5, tune = {} } = {}) {
  if (!headBone || !texture) return null;

  const { y, z, size } = { ...DEFAULTS, ...tune };
  const cells = Math.max(1, Math.round(texture.image.width / texture.image.height));

  // El recorte de UNA celda. `repeat.x` es el ancho de celda en coordenadas de
  // textura, y `offset.x` la mueve; así cambiar de gesto es una resta, sin
  // recargar nada.
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / cells, 1);
  texture.offset.set(0, 0);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Sin esto los píxeles de una cara dibujada a mano salen emborronados, que
  // es justo lo contrario de lo que se busca con un gesto de dos trazos.
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    // La cara va PEGADA sobre la piel, y a esa distancia el z-buffer duda: sin
    // el sesgo, el plano parpadea a trozos según el ángulo de cámara.
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size * height, size * height), material);
  mesh.position.set(0, y * height, z * height);
  mesh.renderOrder = 2;
  // Su caja es la de reposo: sin esto la cara desaparece cuando el personaje
  // agacha la cabeza y esa caja sale del encuadre.
  mesh.frustumCulled = false;
  headBone.add(mesh);

  return {
    mesh,
    material,
    texture,
    cells,
    /** Cambia el gesto moviendo el recorte. Un nombre desconocido no hace nada. */
    set(expression) {
      const i = FACE_CELLS.indexOf(expression);
      // Una tira corta no tiene todos los gestos: lo que falte cae en la
      // primera celda, que es la neutra.
      const cell = i >= 0 && i < cells ? i : 0;
      texture.offset.x = cell / cells;
    },
    dispose() {
      headBone.remove(mesh);
      mesh.geometry.dispose();
      texture.dispose();
      material.dispose();
    },
  };
}
