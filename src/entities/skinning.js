import * as THREE from "three";

/**
 * ESQUELETO Y SKINNING PROCEDURAL.
 *
 * Los personajes pasan de ser un montón de piezas rígidas colgadas unas de
 * otras a ser un `SkinnedMesh` con un `THREE.Skeleton` de verdad: una sola
 * malla cuyos vértices están pesados a los huesos y se DEFORMA al moverlos.
 *
 * Por qué importa: con piezas rígidas, doblar un codo giraba el antebrazo
 * entero y en la axila y el codo se abría un boquete o se solapaban dos
 * cápsulas. Con pesos, la malla se estira y el pliegue queda continuo. Y como
 * el esqueleto es estándar, se le puede enchufar un `AnimationMixer` con
 * clips y mezclarlos (ver `clips.js`), en vez de escribir cada pose a mano.
 *
 * Los huesos llevan nombres de rig convencional (Hips, Spine, LeftArm…) a
 * propósito: si algún día se quiere traer una animación de fuera, el mapeo ya
 * está hecho.
 */

/**
 * El esqueleto, descrito en fracciones de la altura total.
 *
 * `y`/`x` son posiciones ABSOLUTAS desde el suelo (es como se piensa un
 * cuerpo); `buildSkeleton` las convierte a las relativas que quiere Three.
 * `tail` es hacia dónde "apunta" el hueso, y es lo que define el segmento
 * contra el que se miden los pesos — sin él, un hueso sería un punto y el
 * reparto de pesos alrededor saldría en esfera en vez de en cilindro.
 */
// Proporciones CHIBI, como las referencias: la cabeza se come casi la mitad
// del muñeco y las extremidades son cortas y gordas. Esta tabla es la única
// fuente de verdad de dónde está cada articulación — la geometría del cuerpo
// se construye A PARTIR de ella (ver character3d.js), así que no pueden
// desajustarse el hueso y la carne que lo envuelve.
export const SKELETON = [
  { name: "Hips", parent: null, x: 0, y: 0.34 },
  { name: "Spine", parent: "Hips", x: 0, y: 0.42 },
  { name: "Chest", parent: "Spine", x: 0, y: 0.5 },
  { name: "Neck", parent: "Chest", x: 0, y: 0.545 },
  { name: "Head", parent: "Neck", x: 0, y: 0.575, tail: { x: 0, y: 1.0 } },

  { name: "LeftShoulder", parent: "Chest", x: 0.06, y: 0.515 },
  { name: "LeftArm", parent: "LeftShoulder", x: 0.145, y: 0.515 },
  { name: "LeftForeArm", parent: "LeftArm", x: 0.145, y: 0.4 },
  { name: "LeftHand", parent: "LeftForeArm", x: 0.145, y: 0.3, tail: { x: 0.145, y: 0.255 } },

  { name: "RightShoulder", parent: "Chest", x: -0.06, y: 0.515 },
  { name: "RightArm", parent: "RightShoulder", x: -0.145, y: 0.515 },
  { name: "RightForeArm", parent: "RightArm", x: -0.145, y: 0.4 },
  { name: "RightHand", parent: "RightForeArm", x: -0.145, y: 0.3, tail: { x: -0.145, y: 0.255 } },

  { name: "LeftUpLeg", parent: "Hips", x: 0.075, y: 0.335 },
  { name: "LeftLeg", parent: "LeftUpLeg", x: 0.075, y: 0.2 },
  { name: "LeftFoot", parent: "LeftLeg", x: 0.075, y: 0.055, z: -0.01 },
  { name: "LeftToe", parent: "LeftFoot", x: 0.075, y: 0.028, z: 0.055, tail: { x: 0.075, y: 0.02, z: 0.1 } },

  { name: "RightUpLeg", parent: "Hips", x: -0.075, y: 0.335 },
  { name: "RightLeg", parent: "RightUpLeg", x: -0.075, y: 0.2 },
  { name: "RightFoot", parent: "RightLeg", x: -0.075, y: 0.055, z: -0.01 },
  { name: "RightToe", parent: "RightFoot", x: -0.075, y: 0.028, z: 0.055, tail: { x: -0.075, y: 0.02, z: 0.1 } },

  ...fingers("Left", 1),
  ...fingers("Right", -1),
];

/**
 * Los dedos, cinco por mano y dos falanges cada uno.
 *
 * Con la cámara del piso no se ven, pero al conversar de cerca sí, y son lo
 * que separa una mano que AGARRA la taza de una manopla con la taza flotando
 * al lado. Dos falanges bastan: la tercera es medio milímetro en pantalla.
 *
 * Con el brazo colgando, la palma mira al cuerpo, así que los dedos se
 * reparten en PROFUNDIDAD (eje z) y no a lo ancho — de ahí que el meñique
 * quede detrás y el índice delante. El pulgar es el único que sale del plano.
 */
function fingers(side, dir) {
  const x = dir * 0.145;
  const root = 0.262; // donde acaba la palma
  const mid = 0.24;
  const tip = 0.222;
  // z de cada dedo y cuánto se acorta respecto al corazón.
  const LAYOUT = [
    { name: "Index", z: 0.03, len: 0.96 },
    { name: "Middle", z: 0.01, len: 1 },
    { name: "Ring", z: -0.01, len: 0.94 },
    { name: "Pinky", z: -0.029, len: 0.84 },
  ];

  const out = [];
  for (const f of LAYOUT) {
    const m = root - (root - mid) * f.len;
    const t = root - (root - tip) * f.len;
    out.push({ name: `${side}${f.name}1`, parent: `${side}Hand`, x, y: m, z: f.z });
    out.push({
      name: `${side}${f.name}2`,
      parent: `${side}${f.name}1`,
      x,
      y: t,
      z: f.z,
      tail: { x, y: t - 0.016, z: f.z },
    });
  }
  // El pulgar sale hacia delante y hacia dentro, que es lo que permite cerrar
  // la mano contra los otros dedos.
  out.push({ name: `${side}Thumb1`, parent: `${side}Hand`, x: x - dir * 0.012, y: 0.284, z: 0.032 });
  out.push({
    name: `${side}Thumb2`,
    parent: `${side}Thumb1`,
    x: x - dir * 0.02,
    y: 0.268,
    z: 0.048,
    tail: { x: x - dir * 0.026, y: 0.256, z: 0.058 },
  });
  return out;
}

/**
 * Monta la jerarquía de huesos para una altura y una anchura dadas.
 * Devuelve el hueso raíz, la lista en orden y un índice por nombre.
 */
export function buildSkeleton(height, width = 1) {
  const bones = [];
  const byName = new Map();
  const worldOf = new Map();

  for (const def of SKELETON) {
    const bone = new THREE.Bone();
    bone.name = def.name;

    const world = new THREE.Vector3(def.x * width * height, def.y * height, (def.z ?? 0) * height);
    worldOf.set(def.name, world);

    if (def.parent) {
      const parent = byName.get(def.parent);
      // Three quiere la posición RELATIVA al padre; el esqueleto se describe
      // en absoluto porque así es como se piensa un cuerpo.
      bone.position.copy(world).sub(worldOf.get(def.parent));
      parent.add(bone);
    } else {
      bone.position.copy(world);
    }

    // Hacia dónde apunta, para medir los pesos a lo largo del hueso y no
    // alrededor de un punto.
    bone.userData.tail = def.tail
      ? new THREE.Vector3(def.tail.x * width * height, def.tail.y * height, (def.tail.z ?? 0) * height)
      : null;

    byName.set(def.name, bone);
    bones.push(bone);
  }

  // El segmento de cada hueso: de él a su primer hijo, o a su `tail` si es
  // una punta (mano, pie, cabeza).
  for (const def of SKELETON) {
    const bone = byName.get(def.name);
    const head = worldOf.get(def.name);
    const child = SKELETON.find((d) => d.parent === def.name);
    const tail = bone.userData.tail ?? (child ? worldOf.get(child.name) : head.clone().setY(head.y + 0.05 * height));
    bone.userData.segment = { head: head.clone(), tail: tail.clone() };
  }

  const root = byName.get("Hips");
  root.updateMatrixWorld(true);
  return { root, bones, byName };
}

const _v = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _av = new THREE.Vector3();

/** Distancia de un punto al SEGMENTO de un hueso (no a su origen). */
function distanceToBone(point, segment) {
  _ab.subVectors(segment.tail, segment.head);
  _av.subVectors(point, segment.head);
  const lenSq = _ab.lengthSq();
  const t = lenSq > 1e-9 ? Math.max(0, Math.min(1, _av.dot(_ab) / lenSq)) : 0;
  _v.copy(segment.head).addScaledVector(_ab, t);
  return point.distanceTo(_v);
}

/**
 * Pesa una pieza de geometría contra los huesos que se le indiquen.
 *
 * El truco está en `candidates`: cada pieza declara a qué huesos PUEDE
 * pertenecer. Con un reparto por distancia a secas, un vértice del muslo
 * izquierdo también recibe peso del derecho (están a un palmo) y al caminar
 * las piernas se pegan. Diciendo qué huesos entran en juego, la mezcla suave
 * pasa solo donde la queremos: en la articulación.
 *
 * La geometría tiene que venir ya en posición de reposo y en el espacio del
 * personaje, que es el mismo en el que está el esqueleto.
 */
export function skinGeometry(geometry, bones, candidateNames, { falloff = 2.4, maxInfluences = 3 } = {}) {
  const position = geometry.attributes.position;
  const count = position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);

  const candidates = candidateNames
    .map((name) => ({ index: bones.findIndex((b) => b.name === name), bone: bones.find((b) => b.name === name) }))
    .filter((c) => c.index >= 0);

  if (!candidates.length) throw new Error(`skinGeometry: ningún hueso válido en [${candidateNames}]`);

  const point = new THREE.Vector3();
  const scored = [];

  for (let i = 0; i < count; i++) {
    point.fromBufferAttribute(position, i);
    scored.length = 0;

    for (const c of candidates) {
      const d = distanceToBone(point, c.bone.userData.segment);
      // +1e-4 para que un vértice justo sobre el hueso no dé infinito.
      scored.push({ index: c.index, w: 1 / Math.pow(d + 1e-4, falloff) });
    }

    scored.sort((a, b) => b.w - a.w);
    const used = Math.min(maxInfluences, scored.length, 4);
    let total = 0;
    for (let k = 0; k < used; k++) total += scored[k].w;

    for (let k = 0; k < 4; k++) {
      if (k < used) {
        skinIndex[i * 4 + k] = scored[k].index;
        skinWeight[i * 4 + k] = scored[k].w / total;
      } else {
        skinIndex[i * 4 + k] = 0;
        skinWeight[i * 4 + k] = 0;
      }
    }
  }

  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  return geometry;
}

/**
 * Pega una geometría entera a UN hueso, sin mezclas.
 *
 * Para lo que no debe deformarse — los zapatos, la credencial, un mechón —
 * repartir pesos solo lo estropea: se quiere que acompañen al hueso tal cual,
 * como si estuvieran atornillados.
 */
export function rigidGeometry(geometry, bones, boneName) {
  const index = bones.findIndex((b) => b.name === boneName);
  if (index < 0) throw new Error(`rigidGeometry: no existe el hueso "${boneName}"`);
  const count = geometry.attributes.position.count;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    skinIndex[i * 4] = index;
    skinWeight[i * 4] = 1;
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
  return geometry;
}
