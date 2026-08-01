import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { screenToGround, facingFromGround } from "../scene/iso.js";
import { buildSkeleton, skinGeometry, rigidGeometry } from "./skinning.js";
import { faceTexture, projectFaceUVs } from "./face.js";
import { loadBaseModel, peekBaseModel, instantiateBase, modelUrlFor, loadFaceSheet } from "./baseModel.js";
import { attachFaceSheet } from "./faceSheet.js";
import { getProp, clearPropCache } from "../game/propModels.js";
import { getFurniture, clearFurnitureCache } from "../game/furnitureModels.js";

/**
 * PERSONAJES 3D COZY, CON ESQUELETO DE VERDAD.
 *
 * Un personaje no es un modelo: es una RECETA (ver
 * `public/data/characters3d.json`), y el motor le monta encima un
 * `THREE.SkinnedMesh` con su `THREE.Skeleton`. No hay ningún .glb ni PNG
 * detrás — por eso hay un builder (`builder/personajes.html`) en vez de una
 * carpeta de modelos.
 *
 * Cuerpo, cara, pelo y complementos acaban en UNA sola malla con color por
 * vértice: con ~25 personajes en el piso, un material por prenda eran seis
 * llamadas de dibujo por cabeza. El color plano no necesita más.
 *
 * Mantiene la API pública que ya usaban player/npc/boss/crossing3d:
 *   object · setPosition · setFacing · setHeading · setMoving · setPose
 *   setTint · update · setRecipe · setRig · hasPoses · height · facing
 */

/** Las cuatro direcciones de siempre, ahora solo como puntos de referencia. */
export const ROW_BY_FACING = { south: 0, west: 1, east: 2, north: 3 };

/** Las ocho poses de acción. Son el contrato con `activities[].pose`. */
export const POSES = {
  work: 0,
  sleep: 1,
  coffee: 2,
  eat: 3,
  movie: 4,
  phone: 5,
  scared: 6,
  shrug: 7,
  sit: 8,
  sitWork: 9,
};

export const DEFAULT_RIG = {
  walk: { fps: 8, rows: ROW_BY_FACING },
  actions: { fps: 3, poses: POSES },
  idle: null,
};

/** Lo que sabe montar el motor; el builder lee estas listas. */
export const HAIR_STYLES = ["short", "fade", "spiky", "wavy", "long", "afro", "bun", "bald"];
export const TOP_STYLES = ["tee", "polo", "sweater", "hoodie"];
export const BOTTOM_STYLES = ["pants", "jeans", "cargo", "shorts", "skirt"];
export const ACCESSORIES = ["glasses", "sunglasses", "hoops", "cap"];

/**
 * Medidas que NO salen del esqueleto: grosores y la cabeza.
 * Las articulaciones viven en `SKELETON` (skinning.js) y la carne se
 * construye entre ellas, así que aquí solo queda lo que el hueso no dice.
 */
const P = {
  headR: 0.225, // cabezón de dibujo animado: casi media altura del muñeco
  headY: 0.78,
  torsoR: 0.155,
  armR: 0.052,
  legR: 0.066,
  shoeH: 0.075,
};

// ---------------------------------------------------------------------------
// Poses. Dos posturas entre las que el muñeco va y viene, interpoladas.
// Los nombres son de articulación "de andar por casa"; `BONE_OF` los traduce
// a los huesos reales, para que las poses se sigan leyendo sin saberse el rig.
// Ángulos en radianes; en brazos y piernas, x NEGATIVO va hacia delante.
// ---------------------------------------------------------------------------
/**
 * Busca un clip por palabra suelta en su nombre.
 *
 * Los exportadores no se ponen de acuerdo: el mismo ciclo sale como "Walking",
 * como "Armature|walking_man|baselayer" o como "mixamo.com". Por eso se busca
 * por trozo y sin distinguir mayúsculas, en vez de por nombre exacto.
 */
function pickClip(clips, words) {
  for (const w of words) {
    const hit = clips.find((c) => c.name.toLowerCase().includes(w));
    if (hit) return hit;
  }
  return null;
}

/**
 * Gira un hueso SIN PERDER SU POSTURA DE REPOSO.
 *
 * El esqueleto que montamos nosotros nace con todos los huesos sin rotar, así
 * que ahí da igual escribir el ángulo directamente. Un rig importado NO: sus
 * huesos ya vienen girados (es lo que lo mantiene de pie y mirando al frente),
 * y escribir encima lo tumbaba y lo dejaba en cruz.
 *
 * Con `restQuat` guardado al montarlo, la pose pasa a ser un giro RELATIVO a
 * esa postura. Sin `restQuat` — el caso del muñeco generado — se comporta
 * exactamente como antes.
 */
const _poseEuler = new THREE.Euler();
const _poseQuat = new THREE.Quaternion();
function setBoneRotation(bone, x, y, z) {
  const rest = bone.userData?.restQuat;
  _poseEuler.set(x, y, z);
  _poseQuat.setFromEuler(_poseEuler);
  if (!rest) {
    bone.quaternion.copy(_poseQuat);
    return;
  }
  bone.quaternion.copy(rest).multiply(_poseQuat);
}

const BONE_OF = {
  torso: "Spine",
  chest: "Chest",
  head: "Head",
  armL: "LeftArm",
  armR: "RightArm",
  elbowL: "LeftForeArm",
  elbowR: "RightForeArm",
  legL: "LeftUpLeg",
  legR: "RightUpLeg",
  kneeL: "LeftLeg",
  kneeR: "RightLeg",
  footL: "LeftFoot",
  footR: "RightFoot",
};

/**
 * Posturas de la mano. Se aplican a los diez huesos de los dedos a la vez,
 * porque nadie quiere escribir veinte ángulos por pose: `curl` cierra los
 * cuatro dedos y `thumb` el pulgar.
 */
const HAND_POSES = {
  relax: { curl: 0.34, thumb: 0.26 },
  open: { curl: 0.02, thumb: 0.05 },
  grip: { curl: 1.15, thumb: 0.85 },
  point: { curl: 1.25, thumb: 0.45, index: 0.05 },
};
const FINGERS = ["Index", "Middle", "Ring", "Pinky"];

const REST = {
  torso: [0, 0, 0],
  chest: [0, 0, 0],
  head: [0, 0, 0],
  // Los brazos descansan algo separados del cuerpo: pegados al torso y del
  // mismo color de la prenda, desaparecían en la silueta.
  armL: [0, 0, 0.22],
  armR: [0, 0, -0.22],
  elbowL: [-0.14, 0, 0],
  elbowR: [-0.14, 0, 0],
  legL: [0, 0, 0],
  legR: [0, 0, 0],
  kneeL: [0, 0, 0],
  kneeR: [0, 0, 0],
  footL: [0, 0, 0],
  footR: [0, 0, 0],
  lift: 0,
  hands: "relax",
};

const POSE_LIBRARY = {
  work: {
    speed: 2.6,
    prop: null,
    hands: "open",
    a: { torso: [0.14, 0, 0], head: [0.2, 0, 0], armL: [-1.35, 0, 0.25], armR: [-1.4, 0, -0.25], elbowL: [-0.75, 0, 0], elbowR: [-0.68, 0, 0] },
    b: { torso: [0.14, 0, 0], head: [0.22, 0, 0], armL: [-1.42, 0, 0.25], armR: [-1.32, 0, -0.25], elbowL: [-0.62, 0, 0], elbowR: [-0.82, 0, 0] },
    context: {
      props: [{ name: "documents", bone: "LeftHand", offset: [0.02, -0.02, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  sleep: {
    speed: 1.1,
    prop: null,
    a: { torso: [0.16, 0, 0.05], head: [0.4, 0, 0.3], armL: [0.1, 0, 0.16], armR: [0.1, 0, -0.16], lift: -0.012 },
    b: { torso: [0.2, 0, 0.05], head: [0.46, 0, 0.34], armL: [0.14, 0, 0.16], armR: [0.14, 0, -0.16], lift: 0.006 },
    context: {
      props: [],
      furniture: [{ name: "bed", position: [0, 0, 0.2], rotation: [0, 0, 0] }],
    },
  },
  coffee: {
    speed: 1.5,
    prop: "cup",
    hands: "grip",
    a: { head: [0.06, -0.1, 0], armR: [-1.15, 0, -0.2], elbowR: [-1.5, 0, 0], armL: [0, 0, 0.22] },
    b: { head: [-0.04, -0.1, 0], armR: [-0.72, 0, -0.3], elbowR: [-1.05, 0, 0], armL: [0, 0, 0.22] },
    context: {
      props: [{ name: "coffee", bone: "RightHand", offset: [0, -0.08, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  eat: {
    speed: 1.9,
    prop: "plate",
    a: { head: [0.12, 0, 0], armL: [-1.0, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-1.1, 0, -0.2], elbowR: [-1.5, 0, 0] },
    b: { head: [0.0, 0, 0], armL: [-1.0, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-0.8, 0, -0.3], elbowR: [-0.95, 0, 0] },
    context: {
      props: [{ name: "food", bone: "LeftHand", offset: [0.02, -0.05, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  movie: {
    speed: 0.9,
    prop: null,
    a: { head: [-0.14, 0.06, 0], armL: [-0.95, 0, 0.55], elbowL: [-1.75, 0, -0.6], armR: [-0.88, 0, -0.55], elbowR: [-1.8, 0, 0.6] },
    b: { head: [-0.12, -0.06, 0], armL: [-0.98, 0, 0.55], elbowL: [-1.7, 0, -0.6], armR: [-0.91, 0, -0.55], elbowR: [-1.85, 0, 0.6] },
    context: {
      props: [{ name: "popcorn", bone: "LeftHand", offset: [0, -0.08, 0], rotation: [0, 0, 0] }],
      furniture: [
        { name: "puff", position: [0, 0, 0.15], rotation: [0, 0, 0] },
        { name: "tv", position: [0.35, 0.3, -0.5], rotation: [0, 0, 0] },
      ],
    },
  },
  phone: {
    speed: 1.7,
    prop: "phone",
    hands: "grip",
    a: { head: [0.28, -0.1, 0], torso: [0.05, 0, 0], armR: [-1.0, 0, -0.25], elbowR: [-1.2, 0, 0], armL: [-0.6, 0, 0.3], elbowL: [-1.1, 0, 0] },
    b: { head: [0.24, -0.08, 0], torso: [0.05, 0, 0], armR: [-0.95, 0, -0.28], elbowR: [-1.32, 0, 0], armL: [-0.6, 0, 0.3], elbowL: [-1.1, 0, 0] },
    context: {
      props: [{ name: "phone", bone: "RightHand", offset: [0, -0.05, 0], rotation: [0.2, 0, 0] }],
      furniture: [],
    },
  },
  scared: {
    speed: 5.5,
    prop: null,
    hands: "open",
    a: { torso: [-0.2, 0, 0], head: [-0.22, 0.1, 0], armL: [-2.3, 0, 0.6], elbowL: [-0.5, 0, 0], armR: [-2.25, 0, -0.6], elbowR: [-0.5, 0, 0], lift: 0.01 },
    b: { torso: [-0.16, 0, 0], head: [-0.2, -0.1, 0], armL: [-2.4, 0, 0.7], elbowL: [-0.4, 0, 0], armR: [-2.35, 0, -0.7], elbowR: [-0.4, 0, 0], lift: 0 },
    context: {
      props: [],
      furniture: [],
    },
  },
  // Sentada. Los muslos van al frente y las rodillas devuelven la espinilla a
  // la vertical; la cadera BAJA a la altura de una silla — sin eso el
  // personaje se sienta en el aire, que es el fallo clásico de esta pose.
  sit: {
    speed: 0.7,
    prop: null,
    hands: "relax",
    a: { torso: [0.04, 0, 0], legL: [-1.5, 0, 0.06], legR: [-1.5, 0, -0.06], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], footL: [0.12, 0, 0], footR: [0.12, 0, 0], armL: [0.1, 0, 0.16], armR: [0.1, 0, -0.16], lift: -0.082 },
    b: { torso: [0.06, 0, 0], legL: [-1.5, 0, 0.06], legR: [-1.5, 0, -0.06], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], footL: [0.12, 0, 0], footR: [0.12, 0, 0], armL: [0.13, 0, 0.16], armR: [0.13, 0, -0.16], lift: -0.08 },
    context: {
      props: [],
      furniture: [{ name: "puff", position: [0, 0, 0.15], rotation: [0, 0, 0] }],
    },
  },
  // Sentada y tecleando: es la postura real de la oficina, y la que hace que
  // "fingir que trabajas" se lea de un vistazo.
  sitWork: {
    speed: 2.4,
    prop: null,
    hands: "open",
    a: { torso: [0.16, 0, 0], head: [0.16, 0, 0], legL: [-1.5, 0, 0.06], legR: [-1.5, 0, -0.06], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], footL: [0.12, 0, 0], footR: [0.12, 0, 0], armL: [-1.2, 0, 0.22], armR: [-1.25, 0, -0.22], elbowL: [-0.7, 0, 0], elbowR: [-0.62, 0, 0], lift: -0.082 },
    b: { torso: [0.16, 0, 0], head: [0.17, 0, 0], legL: [-1.5, 0, 0.06], legR: [-1.5, 0, -0.06], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], footL: [0.12, 0, 0], footR: [0.12, 0, 0], armL: [-1.27, 0, 0.22], armR: [-1.18, 0, -0.22], elbowL: [-0.58, 0, 0], elbowR: [-0.76, 0, 0], lift: -0.082 },
    context: {
      props: [],
      furniture: [
        { name: "office_chair", position: [0.2, 0, 0], rotation: [0, 0, 0] },
        { name: "desk", position: [-0.3, 0.3, -0.3], rotation: [0, 0, 0] },
      ],
    },
  },
  shrug: {
    speed: 1.3,
    prop: null,
    a: { head: [0.05, 0, 0.16], armL: [-0.2, 0, 1.15], elbowL: [-1.1, 0, 0], armR: [-0.2, 0, -1.1], elbowR: [-1.05, 0, 0], lift: 0.008 },
    b: { head: [0.02, 0, 0.2], armL: [-0.15, 0, 1.25], elbowL: [-1.2, 0, 0], armR: [-0.15, 0, -1.2], elbowR: [-1.15, 0, 0], lift: 0.012 },
    context: {
      props: [],
      furniture: [],
    },
  },
};

export const DEFAULT_RECIPE = {
  skin: "#f0c9a8",
  hair: { color: "#3a2c26", style: "short" },
  beard: null,
  eyes: "#2a2118",
  top: { color: "#8fa8bd", style: "tee" },
  bottom: { color: "#3d4358", style: "pants" },
  shoes: { color: "#e8e2d8" },
  badge: "#7a5cc4",
  blush: "#e8a0a0",
  accessories: [],
  build: { width: 1, belly: 0, bust: 0 },
};

function mergeRecipe(recipe) {
  const r = recipe ?? {};
  const sub = (key) => {
    const value = r[key];
    if (value === null) return null;
    if (typeof value === "string") return { ...DEFAULT_RECIPE[key], color: value };
    return { ...DEFAULT_RECIPE[key], ...(value ?? {}) };
  };
  return {
    // OJO: esta lista es un filtro, no una fusión — lo que no se nombre aquí
    // se pierde en silencio. `baseModel` faltaba, y por eso el camino del .glb
    // no llegó a ejecutarse nunca: llegaba siempre como undefined.
    baseModel: r.baseModel ?? null,
    skin: r.skin ?? DEFAULT_RECIPE.skin,
    eyes: r.eyes ?? DEFAULT_RECIPE.eyes,
    blush: r.blush === undefined ? DEFAULT_RECIPE.blush : r.blush,
    hair: sub("hair"),
    beard: r.beard === undefined ? DEFAULT_RECIPE.beard : r.beard,
    top: sub("top"),
    bottom: sub("bottom"),
    shoes: sub("shoes"),
    badge: r.badge === undefined ? DEFAULT_RECIPE.badge : r.badge,
    accessories: r.accessories ?? DEFAULT_RECIPE.accessories,
    glassesColor: r.glassesColor,
    hoopColor: r.hoopColor,
    capColor: r.capColor,
    build: { ...DEFAULT_RECIPE.build, ...(r.build ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Utilidades de geometría
// ---------------------------------------------------------------------------

/** Pinta una geometría entera de un color, en el atributo `color`. */
function paint(geometry, hex) {
  const c = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Un miembro entre dos articulaciones. Lleva segmentos a lo largo del eje a
 * propósito: sin vértices intermedios no hay nada que deformar y el codo
 * volvería a doblarse como una pieza rígida.
 */
function limb(from, to, radiusTop, radiusBottom, profile = null, depth = 1) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, len, 16, 10);
  // `depth` aplasta la sección: un torso es más ancho que hondo. Con sección
  // redonda y sombreado plano, visto de frente se lee como un panel recto.
  if (depth !== 1) geo.scale(1, 1, depth);

  // El PERFIL es lo que separa un miembro de un tubo. Un brazo no tiene el
  // mismo grosor de arriba abajo: se ensancha en el bíceps y se estrecha en
  // la muñeca. Sin esto todo el muñeco son cilindros y por eso parece de
  // piezas encajadas en vez de un cuerpo.
  if (profile) {
    const pos = geo.attributes.position;
    const top = len / 2;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((top - y) / len, 0, 1); // 0 arriba, 1 abajo
      const k = profile(t);
      pos.setX(i, pos.getX(i) * k);
      pos.setZ(i, pos.getZ(i) * k);
    }
    geo.computeVertexNormals();
  }

  geo.translate(0, -len / 2, 0);
  // La geometría nace mirando a +Y; se gira hacia donde va de verdad.
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, -1, 0),
    dir.clone().normalize()
  );
  geo.applyQuaternion(quat);
  geo.translate(from.x, from.y, from.z);
  return geo;
}

/**
 * Perfiles de miembro. `t` va de 0 (arriba) a 1 (abajo).
 * Son suaves a propósito: en un muñeco cabezón, un bíceps marcado se ve
 * ridículo — basta con que el contorno no sea recto.
 */
const PROFILE = {
  arm: (t) => 1 + Math.sin(t * Math.PI) * 0.1 - t * 0.06,
  leg: (t) => 1 + Math.sin(Math.min(1, t * 1.35) * Math.PI) * 0.13 - t * 0.1,
  // Hombros anchos, cintura marcada y cadera que vuelve a abrir. Es la curva
  // que hace que un torso sea un torso y no un bidón.
  torso: (t) => 1 - Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.16 - t * 0.03,
};

/**
 * Una prenda: la misma forma que el miembro pero un poco más gorda, con un
 * DOBLADILLO al final.
 *
 * Es lo que hace que la ropa se lea puesta encima y no pintada sobre la piel.
 * El dobladillo es el truco: un reborde donde acaba la tela deja ver que hay
 * dos capas, y sin él una manga es solo un tramo del brazo de otro color.
 */
function garment(from, to, rTop, rBottom, { hem = 1.06, profile = null, depth = 1 } = {}) {
  const parts = [limb(from, to, rTop, rBottom, profile, depth)];
  if (hem > 1.001) {
    // UN anillo, corto y justo en el filo. Antes era otro cilindro solapado
    // sobre la manga, y dos cilindros casi iguales uno dentro de otro se ven
    // como un acordeón de aros, no como un dobladillo.
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    const edge = to.clone().addScaledVector(dir, -rBottom * 0.16);
    parts.push(
      limb(edge, to.clone().addScaledVector(dir, rBottom * 0.02), rBottom * hem, rBottom * hem, null, depth)
    );
  }
  return mergeGeometries(parts, false);
}

/** Una bola en una articulación: es lo que redondea hombros, codos y rodillas. */
function joint(at, radius) {
  const geo = new THREE.SphereGeometry(radius, 14, 10);
  geo.translate(at.x, at.y, at.z);
  return geo;
}

/**
 * Un bulto. `detail` baja la resolución para las piezas pequeñas: una pupila
 * o un mechón con la malla de una cabeza son cientos de triángulos que a
 * ningún tamaño se distinguen de los de una esfera basta, y de eso hay
 * cuarenta por personaje.
 */
function ellipsoid(at, rx, ry, rz, detail = 1) {
  const seg = detail < 1 ? [10, 7] : [20, 14];
  const geo = new THREE.SphereGeometry(1, seg[0], seg[1]);
  geo.scale(rx, ry, rz);
  geo.translate(at.x, at.y, at.z);
  return geo;
}

/**
 * La cabeza, esculpida en vez de una bola.
 *
 * Una esfera es una bola, y de cerca se ve que es una bola: sin mandíbula que
 * se estreche, sin mentón y sin un plano de cara donde apoyar los rasgos. Se
 * parte de una esfera y se desplazan los vértices:
 *
 *  · la mitad de abajo se estrecha hacia la barbilla (mandíbula);
 *  · la cara se aplana un poco, para que ojos y boca no queden montados en
 *    una superficie que se escapa;
 *  · la nuca se recoge, que es lo que hace que un perfil parezca una cabeza.
 */
function headGeometry(c, R) {
  const geo = new THREE.SphereGeometry(R, 24, 18);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = v.y / R; // -1 abajo, +1 arriba

    if (t < 0) {
      // Mandíbula. El exponente alto es lo importante: estrecha SOLO el
      // último tramo (el mentón) en vez de toda la mitad inferior. Con un
      // estrechamiento amplio la cabeza adelgaza entera, el pelo — que está
      // dimensionado para el cráneo — deja de encajar y se come la cara.
      const taper = 1 - Math.pow(-t, 2.4) * 0.16;
      v.x *= taper;
      v.z *= taper * 1.03;
    } else {
      v.x *= 1 - t * 0.03;
    }

    // Plano de la cara y nuca recogida, ambos con mano ligera.
    if (v.z > 0) v.z *= 1 - Math.max(0, v.z / R) * 0.06;
    else v.z *= 0.96;

    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.translate(c.x, c.y, c.z);
  return geo;
}

function shadeOf(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/** Sombra de contacto: un disco difuminado bajo los pies. */
let shadowTexture = null;
function getShadowTexture() {
  if (shadowTexture) return shadowTexture;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, "rgba(60,48,70,0.42)");
  gradient.addColorStop(0.55, "rgba(60,48,70,0.20)");
  gradient.addColorStop(1, "rgba(60,48,70,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  shadowTexture = new THREE.CanvasTexture(canvas);
  shadowTexture.colorSpace = THREE.SRGBColorSpace;
  return shadowTexture;
}

/** Estampado del pecho ("COSA 1"), dibujado en un lienzo pequeño. */
function printTexture(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = 64;
  do {
    ctx.font = `bold ${size}px Verdana, Geneva, sans-serif`;
    size -= 2;
  } while (size > 10 && ctx.measureText(text).width > 232);
  ctx.fillText(text, 128, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Character3D {
  constructor(recipe, { height = 1.5, y = 0, rig = null } = {}) {
    this.height = height;
    this.baseY = y;

    this.object = new THREE.Group();
    this.object.position.y = y;

    this._built = null;
    this._extras = [];
    this._props = {};
    this._tint = 1;
    this._activePropsByBone = new Map();
    this._activeFurniture = [];

    this.facing = "south";
    this._yaw = 0;
    this._targetYaw = 0;
    this._moving = false;
    this._walkPhase = 0;

    this._pose = null;
    this._poseName = null;
    this._poseT = 0;
    this._blend = 0;

    this._stillFor = 0;
    this._idlePose = null;
    this._idleLeft = 0;

    this.setRig(rig);
    this.setRecipe(recipe);
    this.setFacing("south");
    this._yaw = this._targetYaw;
  }

  // -------------------------------------------------------------------------
  // Construcción
  // -------------------------------------------------------------------------

  setRecipe(recipe) {
    this._dispose();
    const r = mergeRecipe(recipe);
    this.recipe = r;

    // Un cuerpo importado tarda en llegar, y `setRecipe` se llama más de una
    // vez seguida al elegir personaje. Sin este testigo, la carga vieja aún
    // en vuelo se colgaba de `object` DESPUÉS de la nueva y quedaban dos
    // cuerpos superpuestos, con `_built` apuntando solo a uno.
    const token = (this._buildToken = (this._buildToken ?? 0) + 1);

    // Usar modelo específico si existe, sino usar kiara como base
    const modelToLoad = r.baseModel ?? "kiara";

    // Si ya está en memoria se monta AHORA, sin ceder el turno: los menús
    // montan un personaje y le sacan la foto en la misma vuelta, y con una
    // espera de por medio la foto salía en blanco.
    const cached = peekBaseModel(modelUrlFor(modelToLoad));
    if (cached) {
      this._assembleGLB(cached, r, modelToLoad);
      return;
    }

    // Si no está cacheado, cargarlo desde la red
    this._buildFromGLB(modelToLoad, r, token).catch((e) => {
      if (token === this._buildToken) console.error(`No se pudo cargar ${modelToLoad}:`, e);
    });
  }

  _buildProcedural(r) {
    const H = this.height;
    const width = r.build.width ?? 1;
    const { root, bones, byName } = buildSkeleton(H, width);

    // El cuerpo se construye ENTRE las articulaciones del esqueleto, no con
    // medidas propias: así el hueso siempre cae dentro de la carne.
    const at = (name) => byName.get(name).userData.segment.head;
    const tailOf = (name) => byName.get(name).userData.segment.tail;

    const parts = [];
    /** @param bind ["skin", [huesos…]] o ["rigid", hueso] */
    const add = (geo, color, bind) => {
      paint(geo, color);
      if (bind[0] === "rigid") rigidGeometry(geo, bones, bind[1]);
      else skinGeometry(geo, bones, bind[1]);
      parts.push(geo);
    };

    const skinColor = r.skin;
    const topColor = r.top.color;
    const bottomColor = r.bottom.color;
    const sleeveLong = r.top.style === "hoodie" || r.top.style === "sweater";
    const armR = P.armR * H * width;
    const legR = P.legR * H * width;
    const torsoR = P.torsoR * H * width * (1 + (r.build.belly ?? 0) * 0.5);

    // ----- torso -----
    const hips = at("Hips");
    const chest = at("Chest");
    const neck = at("Neck");
    // Cuerpo de piel debajo y prenda ENCIMA con su dobladillo: es lo que hace
    // que la ropa se lea puesta y no pintada. Antes el torso era directamente
    // del color de la camiseta y por eso parecía una pieza de plástico.
    const shoulderY = at("LeftArm").y;
    const shoulderSpan = at("LeftArm").x + armR * 0.95;
    const torsoTop = neck.clone().setY(neck.y - 0.01 * H);
    const torsoBottom = hips.clone().setY(hips.y - 0.075 * H);
    add(limb(torsoTop, torsoBottom, torsoR * 0.86, torsoR * 0.82, PROFILE.torso, 0.74), skinColor, [
      "skin",
      ["Hips", "Spine", "Chest"],
    ]);
    add(
      garment(torsoTop.clone().setY(shoulderY + armR * 0.2), torsoBottom, torsoR * 0.99, torsoR * 0.92, {
        profile: PROFILE.torso,
        hem: 1.05,
        depth: 0.74,
      }),
      topColor,
      ["skin", ["Hips", "Spine", "Chest"]]
    );
    add(ellipsoid(chest, torsoR * 0.97, torsoR * 0.6, torsoR * 0.7), topColor, ["skin", ["Chest", "Spine"]]);

    // Busto. Con un modelo fijo esto exigiría morph targets; generando el
    // cuerpo es un número de la receta (`build.bust`, 0 = sin nada).
    const bust = r.build.bust ?? 0;
    if (bust > 0.01) {
      // SUTIL, y a propósito. El reparto va con ropa de oficina y de abrigo:
      // lo que se ve no es el pecho, es cómo cae la tela por encima. Un bulto
      // marcado con dos mitades separadas no se lee como una prenda gruesa,
      // se lee como un escote — que no es lo que tiene puesto nadie aquí.
      // Por eso van muy juntas, muy planas y metidas dentro del torso.
      const br = torsoR * (0.22 + bust * 0.12);
      for (const dir of [-1, 1]) {
        add(
          ellipsoid(
            new THREE.Vector3(dir * torsoR * 0.22, chest.y - 0.02 * H, torsoR * 0.2),
            br * 1.5,
            br * 0.62,
            br * 0.42
          ),
          topColor,
          ["skin", ["Chest", "Spine"]]
        );
      }
    }

    if (r.top.style === "hoodie") {
      const hood = ellipsoid(
        new THREE.Vector3(0, neck.y - 0.01 * H, -torsoR * 0.5),
        torsoR * 0.9,
        torsoR * 0.55,
        torsoR * 0.66
      );
      add(hood, topColor, ["rigid", "Chest"]);
      const pocket = ellipsoid(
        new THREE.Vector3(0, hips.y + 0.05 * H, torsoR * 0.6),
        torsoR * 0.85,
        torsoR * 0.4,
        torsoR * 0.3
      );
      add(pocket, shadeOf(topColor, -0.05), ["rigid", "Spine"]);
    }

    // Falda y pantalón corto cuelgan de la cadera, no de la pierna.
    if (r.bottom.style === "skirt" || r.bottom.style === "shorts") {
      const isSkirt = r.bottom.style === "skirt";
      const top = hips.clone().setY(hips.y + 0.02 * H);
      const bottomY = hips.clone().setY(hips.y - (isSkirt ? 0.13 : 0.09) * H);
      add(limb(top, bottomY, torsoR * 0.8, torsoR * (isSkirt ? 1.35 : 0.95)), bottomColor, [
        "rigid",
        "Hips",
      ]);
    }

    // Los HOMBROS, de un brazo al otro por encima del pecho. Es la pieza que
    // ata las mangas al cuerpo: sin ella cada manga arrancaba por encima del
    // hombro, sin nada que la uniera al torso, y se veían dos tubos flotando
    // a los lados. También da la caída de hombro — un torso que acaba en un
    // corte recto se lee como un bidón.
    add(
      ellipsoid(
        new THREE.Vector3(0, shoulderY - armR * 0.1, 0),
        shoulderSpan,
        torsoR * 0.48,
        torsoR * 0.62
      ),
      topColor,
      ["skin", ["Chest", "LeftArm", "RightArm"]]
    );

    // ----- brazos y piernas -----
    for (const side of ["Left", "Right"]) {
      const shoulder = at(`${side}Arm`);
      const elbow = at(`${side}ForeArm`);
      const hand = at(`${side}Hand`);

      // El brazo es UNA pieza de piel de punta a punta, y la manga va encima
      // como una funda. Antes eran dos cilindros de colores distintos que se
      // cruzaban en el codo, y en el cruce salía un borde en dientes de
      // sierra que se veía desde cualquier ángulo.
      const armBones = [`${side}Arm`, `${side}ForeArm`, `${side}Hand`, "Chest"];
      add(limb(shoulder, hand, armR, armR * 0.86, PROFILE.arm), skinColor, ["skin", armBones]);
      add(joint(elbow, armR * 0.96), skinColor, ["skin", [`${side}Arm`, `${side}ForeArm`]]);
      // Palma y cinco dedos. Antes era una bola: a distancia de juego daba
      // igual, pero al conversar de cerca una taza flotando junto a una
      // manopla se ve enseguida.
      add(ellipsoid(hand, armR * 1.05, armR * 1.0, armR * 1.3), skinColor, ["rigid", `${side}Hand`]);
      const fingerR = armR * 0.26;
      for (const f of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
        const b1 = `${side}${f}1`;
        const b2 = `${side}${f}2`;
        add(limb(at(b1), at(b2), fingerR, fingerR * 0.94), skinColor, ["skin", [b1, b2, `${side}Hand`]]);
        add(limb(at(b2), tailOf(b2), fingerR * 0.94, fingerR * 0.8), skinColor, ["skin", [b2, b1]]);
        add(joint(at(b2), fingerR * 0.95), skinColor, ["skin", [b2, b1]]);
      }

      // La manga nace DENTRO de la masa del hombro y baja. Antes empezaba por
      // encima de ella y quedaba un escalón entre la camiseta y el brazo.
      const sleeveEnd = sleeveLong
        ? elbow.clone().lerp(hand, 0.82)
        : shoulder.clone().lerp(elbow, 0.52);
      add(
        garment(shoulder.clone().setY(shoulder.y - armR * 0.05), sleeveEnd, armR * 1.14, armR * 1.06, {
          hem: 1.07,
        }),
        topColor,
        ["skin", armBones]
      );

      const hip = at(`${side}UpLeg`);
      const knee = at(`${side}Leg`);
      const ankle = at(`${side}Foot`);

      const legBones = [`${side}UpLeg`, `${side}Leg`, `${side}Foot`, "Hips"];
      add(limb(hip, ankle, legR * 0.9, legR * 0.78, PROFILE.leg), skinColor, ["skin", legBones]);
      add(joint(knee, legR * 0.9), skinColor, ["skin", [`${side}UpLeg`, `${side}Leg`]]);
      // El pantalón llega al tobillo salvo en los cortos; el dobladillo deja
      // ver dónde acaba la tela y empieza la pierna.
      const trouserEnd =
        r.bottom.style === "shorts" ? hip.clone().lerp(knee, 0.85) : ankle.clone().lerp(knee, 0.12);
      add(
        garment(hip.clone().setY(hip.y + legR * 0.4), trouserEnd, legR * 1.06, legR * 0.94, {
          profile: PROFILE.leg,
          hem: 1.08,
        }),
        bottomColor,
        ["skin", legBones]
      );

      // Zapatones: piezas gordas y claras que anclan el muñeco al suelo. Van
      // en DOS partes, talón y puntera, cada una a su hueso: así el pie rueda
      // al caminar y la puntera apoya al sentarse, en vez de quedarse el
      // zapato rígido flotando en diagonal.
      add(
        ellipsoid(
          new THREE.Vector3(ankle.x, P.shoeH * H * 0.52, ankle.z - legR * 0.1),
          legR * 1.15,
          P.shoeH * H * 0.6,
          legR * 1.05
        ),
        r.shoes.color,
        ["rigid", `${side}Foot`]
      );
      const toe = at(`${side}Toe`);
      add(
        ellipsoid(
          new THREE.Vector3(toe.x, P.shoeH * H * 0.45, toe.z + legR * 0.35),
          legR * 1.08,
          P.shoeH * H * 0.5,
          legR * 1.15
        ),
        r.shoes.color,
        ["skin", [`${side}Toe`, `${side}Foot`]]
      );
    }

    // ----- cabeza -----
    const headR = P.headR * H;
    const headC = new THREE.Vector3(0, P.headY * H, 0);
    // Cuello corto, lo justo para que la cabeza no salga del pecho.
    add(limb(neck.clone().setY(neck.y + 0.005 * H), chest, torsoR * 0.32, torsoR * 0.42), skinColor, [
      "skin",
      ["Neck", "Head", "Chest"],
    ]);

    for (const geo of buildHair(headC, headR, r)) add(geo.g, geo.color, ["rigid", "Head"]);
    if (r.beard) for (const geo of buildBeard(headC, headR, r.beard)) add(geo.g, geo.color, ["rigid", "Head"]);
    for (const geo of buildAccessories(headC, headR, r)) add(geo.g, geo.color, ["rigid", "Head"]);

    // El cordón de la credencial lo lleva todo el mundo en los pliegos: es lo
    // que hace que el reparto se lea como la misma oficina.
    if (r.badge) {
      // Un cordón de verdad: dos tiras que BAJAN DEL CUELLO y convergen en la
      // tarjeta. Antes eran dos óvalos verticales sueltos y la tarjeta más
      // abajo, sin tocarse: a la distancia de la cámara del piso colaba, pero
      // en el retrato del diálogo se ven de cerca y eran tres manchas
      // moradas flotando sobre el pecho.
      const cardTop = new THREE.Vector3(0, chest.y - 0.036 * H, torsoR * 0.88);
      for (const dir of [-1, 1]) {
        const collar = new THREE.Vector3(dir * torsoR * 0.46, chest.y + 0.028 * H, torsoR * 0.5);
        add(limb(collar, cardTop, torsoR * 0.045, torsoR * 0.038), r.badge, ["rigid", "Chest"]);
      }
      // La tarjeta es una plaquita plana, no un huevo: el canto recto es lo
      // que la lee como credencial y no como un colgante.
      const card = new THREE.BoxGeometry(torsoR * 0.42, torsoR * 0.54, torsoR * 0.08);
      card.translate(0, cardTop.y - torsoR * 0.24, cardTop.z + torsoR * 0.02);
      add(card, r.badge, ["rigid", "Chest"]);
    }

    // ----- la cabeza va aparte, porque lleva textura -----
    // El cuerpo entero es una malla de color plano; la cabeza es la única
    // pieza con imagen. Separarla cuesta una segunda llamada de dibujo y a
    // cambio la cara se PINTA en vez de modelarse: siete expresiones que son
    // otro trazo, no otra malla, y unos 6.000 triángulos menos por cabeza.
    const headBone = byName.get("Head");
    const headGeo = projectFaceUVs(headGeometry(new THREE.Vector3(0, 0, 0), headR));
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(r, "neutral") });
    const headMesh = new THREE.Mesh(headGeo, faceMat);
    // El hueso está en el cuello y el cráneo más arriba: la diferencia entre
    // los dos es lo que hay que desplazar para que la cabeza caiga en su
    // sitio al colgarla del hueso.
    headMesh.position.y = headC.y - at("Head").y;
    headBone.add(headMesh);

    // ----- el resto, en una sola malla -----
    const geometry = mergeGeometries(parts, false);
    if (!geometry) {
      console.error(`Character3D: mergeGeometries falló. parts.length = ${parts.length}`, { recipe: r });
      throw new Error(`No se pudo crear geometría para el personaje ${current}`);
    }
    parts.forEach((g) => g.dispose());

    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    material.userData.base = new THREE.Color(0xffffff);

    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(root);
    const skeleton = new THREE.Skeleton(bones);
    mesh.bind(skeleton);
    // Sin esto, un personaje con los brazos en alto desaparece en cuanto su
    // caja original (la de reposo) sale del encuadre.
    mesh.frustumCulled = false;
    this.object.add(mesh);

    // El estampado del pecho es lo único con textura, así que va aparte.
    if (r.top.print) {
      const print = new THREE.Mesh(
        new THREE.PlaneGeometry(torsoR * 1.5, torsoR * 0.75),
        new THREE.MeshBasicMaterial({
          map: printTexture(r.top.print, r.top.printColor ?? "#f4efe6"),
          transparent: true,
          depthWrite: false,
        })
      );
      print.position.set(0, -0.01 * H, torsoR * 0.85);
      byName.get("Chest").add(print);
      this._extras.push(print);
    }

    // Sombra de contacto, plana en el suelo y ajena al esqueleto.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(headR * 1.75, 24),
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012 * H;
    shadow.renderOrder = -1;
    this.object.add(shadow);

    // Utilería de las poses, colgada de la mano y escondida hasta que toque.
    this._props = {
      cup: makeCup(byName.get("RightHand"), headR, "#f4efe6"),
      phone: makePhone(byName.get("RightHand"), headR, "#22252e"),
      plate: makePlate(byName.get("LeftHand"), headR),
    };

    this._built = { mesh, material, skeleton, bones, byName, root, shadow, headR, headMesh, faceMat };
    this._hipRest = byName.get("Hips").position.y;
    this._applyPose();
    this.setTint(this._tint);
  }

  /**
   * Cuerpo ESCULPIDO FUERA (`recipe.baseModel`), en vez de montado con
   * primitivas. Lo usan los personajes que alguien modeló aparte.
   *
   * La diferencia de fondo con `_buildProcedural` es la CARA: el muñeco
   * generado la lleva pintada en una textura aparte que podemos redibujar
   * para cambiar de expresión, y un modelo importado ya trae la suya dentro
   * de su propia textura. Así que aquí no se le pega ninguna cara encima —
   * hacerlo dejaba dos caras superpuestas — y a cambio este personaje no
   * gesticula: `setExpression` no tiene nada que redibujar.
   */
  async _buildFromGLB(modelName, r, token) {
    const gltf = await loadBaseModel(modelUrlFor(modelName));
    // Mientras se descargaba pueden haberte cambiado de personaje.
    if (token !== undefined && token !== this._buildToken) return;
    this._assembleGLB(gltf, r, modelName);
  }

  /** El montaje en sí, sin nada que esperar. Ver `_buildFromGLB`. */
  _assembleGLB(gltf, r, modelName) {
    const H = this.height;
    const { root, bones, model } = instantiateBase(gltf, { height: H });

    // La malla de verdad, no el Group que la envuelve: es de donde salen el
    // esqueleto y el material, y `root.children[0]` daba el envoltorio.
    let mesh = null;
    model.traverse((o) => {
      if (!mesh && o.isSkinnedMesh) mesh = o;
    });
    if (!mesh) throw new Error(`El modelo ${modelName} no trae ningún SkinnedMesh`);

    // Rig convencional pero no idéntico al nuestro: las poses hablan de
    // "Chest" y "Neck", y un export típico encadena Spine → Spine01 →
    // Spine02 → neck. Sin estos dos alias el torso y el cuello se quedan
    // quietos en todas las poses, sin que nada lo diga.
    if (!bones.has("Chest")) {
      const chest = bones.get("Spine02") ?? bones.get("Spine01");
      if (chest) bones.set("Chest", chest);
    }
    if (!bones.has("Neck")) {
      const neck = bones.get("neck") ?? bones.get("Neck01");
      if (neck) bones.set("Neck", neck);
    }

    // La postura de reposo del rig, que es lo que lo mantiene de pie y con los
    // brazos donde toca. Las poses se aplican COMO GIRO RELATIVO a esto (ver
    // `setBoneRotation`); escribiendo el ángulo directamente, el personaje
    // salía tumbado y en cruz.
    for (const bone of bones.values()) {
      bone.userData.restQuat = bone.quaternion.clone();
    }

    this.object.add(root);

    // La sombra de contacto se dimensiona con el ANCHO real del modelo. En el
    // muñeco generado salía del radio de la cabeza, que aquí no conocemos.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const footprint = Math.max(size.x, size.z) * 0.6;

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(footprint, 24),
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012 * H;
    shadow.renderOrder = -1;
    this.object.add(shadow);

    // Utilería, a escala del modelo y no de un radio de cabeza inventado.
    const propR = size.y * 0.11;
    const rightHand = bones.get("RightHand");
    const leftHand = bones.get("LeftHand");
    this._props = {
      cup: rightHand ? makeCup(rightHand, propR, "#f4efe6") : null,
      phone: rightHand ? makePhone(rightHand, propR, "#22252e") : null,
      plate: leftHand ? makePlate(leftHand, propR) : null,
    };

    this._built = {
      mesh: root, // lo que se cuelga de `object`, y lo que hay que descolgar
      geometry: mesh.geometry,
      material: mesh.material,
      skeleton: mesh.skeleton ?? null,
      bones,
      byName: bones,
      root,
      shadow,
      headR: propR,
      // Sin cara propia: el modelo ya la trae. `_dispose`, `setTint` y
      // `setExpression` tratan estos dos como opcionales.
      headMesh: null,
      faceMat: null,
    };
    this._hipRest = bones.get("Hips")?.position.y ?? 0;

    // Los gestos, si el personaje trae su tira (ver faceSheet.js). Se pega
    // AHORA si la imagen ya está; si no, se engancha en cuanto llegue, sin
    // bloquear el montaje del cuerpo.
    this._face = null;
    if (r.faces) {
      const head = bones.get("Head");
      const build = (tex) => {
        if (!tex || !this._built) return;
        this._face = attachFaceSheet(head, tex, { height: H, tune: r.face });
        this._face?.set(this._expression ?? "neutral");
      };
      const tex = loadFaceSheet(r.faces);
      if (tex.then) tex.then(build).catch(() => {});
      else build(tex);
    }

    // LA CAMINATA VIENE EN EL ARCHIVO. Nuestro paso procedural está calibrado
    // para el muñeco chibi — zancadas de 0.72 rad, que en un cuerpo humano se
    // ven como marcha militar. Si el .glb trae su propio ciclo de andar, manda
    // ese: para eso lo exportó quien modeló el personaje.
    this._mixer = null;
    this._walkAction = null;
    const clips = gltf.animations ?? [];
    const walkClip = pickClip(clips, ["walk", "walking", "caminar", "andar"]);
    if (walkClip) {
      this._mixer = new THREE.AnimationMixer(model);
      this._walkAction = this._mixer.clipAction(walkClip);
      this._walkAction.play();
      this._walkAction.setEffectiveWeight(0);
    }

    // Aplicar la pose REST a los huesos importados para establecer una postura
    // natural como base. Esto reemplaza la pose T del modelo con la pose REST
    // procedural, que es la que mantiene al personaje de pie de forma natural.
    this._applyRestPose(bones);
    this._hipRest = bones.get("Hips").position.y;
    this._applyPose();
    this.setTint(this._tint);
  }

  /** Compatibilidad: la "hoja" de un personaje es su receta. */
  setSheet(recipe) {
    if (recipe) this.setRecipe(recipe);
  }

  /** Ya no hay pliego de acciones: las poses son procedurales y comunes. */
  setActionSheet() {}

  get hasPoses() {
    return true;
  }

  /** El esqueleto, por si alguien quiere enchufarle un AnimationMixer. */
  get skeleton() {
    return this._built?.skeleton ?? null;
  }

  bone(name) {
    return this._built?.byName.get(name) ?? null;
  }

  setRig(rig) {
    this.rig = {
      walk: { ...DEFAULT_RIG.walk, ...(rig?.walk ?? {}) },
      actions: { ...DEFAULT_RIG.actions, ...(rig?.actions ?? {}) },
      idle: rig?.idle ?? null,
    };
    this._stillFor = 0;
    this._idlePose = null;
    this._idleLeft = 0;
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  setPose(name) {
    if (name == null && this._idlePose) return;
    if (name === this._poseName) return;
    this._poseName = name ?? null;
    this._pose = name ? POSE_LIBRARY[name] ?? null : null;
    this._poseT = 0;
    this._loadPoseContext();
  }

  _cleanupPoseProps() {
    for (const [bone, prop] of this._activePropsByBone) {
      bone.remove(prop);
    }
    this._activePropsByBone.clear();

    for (const furniture of this._activeFurniture) {
      this.object.remove(furniture);
      furniture.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    }
    this._activeFurniture = [];
  }

  _loadPoseContext() {
    this._cleanupPoseProps();
    if (!this._pose || !this._built) return;

    const context = this._pose.context;
    if (!context) return;

    const { byName } = this._built;

    if (context.props && Array.isArray(context.props)) {
      for (const propDef of context.props) {
        const prop = getProp(propDef.name);
        if (!prop) continue;

        const bone = byName.get(propDef.bone);
        if (!bone) continue;

        prop.position.set(
          propDef.offset[0],
          propDef.offset[1],
          propDef.offset[2]
        );
        prop.rotation.set(
          propDef.rotation[0],
          propDef.rotation[1],
          propDef.rotation[2]
        );

        bone.add(prop);
        this._activePropsByBone.set(bone, prop);
      }
    }

    if (context.furniture && Array.isArray(context.furniture)) {
      for (const furnDef of context.furniture) {
        const furniture = getFurniture(furnDef.name);
        if (!furniture) continue;

        furniture.position.set(
          this.object.position.x + furnDef.position[0],
          this.object.position.y + furnDef.position[1],
          this.object.position.z + furnDef.position[2]
        );
        furniture.rotation.set(
          furnDef.rotation[0],
          furnDef.rotation[1],
          furnDef.rotation[2]
        );

        this.object.add(furniture);
        this._activeFurniture.push(furniture);
      }
    }
  }

  /**
   * Las cuatro direcciones de siempre, traducidas a un ángulo de verdad
   * pasando por la cámara: "east" es hacia la derecha DE LA PANTALLA, y la
   * cámara se puede orbitar, así que eso no es una dirección fija del mundo.
   */
  setFacing(facing) {
    if (!facing || ROW_BY_FACING[facing] === undefined) return;
    this.facing = facing;
    const screen = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] }[facing];
    const { dx, dz } = screenToGround(screen[0], screen[1]);
    this._targetYaw = Math.atan2(dx, dz);
  }

  /** Giro continuo hacia una dirección del mundo. */
  setHeading(dx, dz) {
    if (!dx && !dz) return;
    this._targetYaw = Math.atan2(dx, dz);
    // El nombre sale del mismo reparto de siempre (iso.js) y no de un cálculo
    // paralelo: hay código y un test que comparan `facing` con hacia dónde
    // apunta el cono del jefe.
    this.facing = facingFromGround(dx, dz, this.facing);
  }

  setMoving(moving) {
    if (moving === this._moving) return;
    this._moving = moving;
    if (!moving) this._walkPhase = 0;
  }

  setPosition(x, z) {
    this.object.position.x = x;
    this.object.position.z = z;
    this._updateFurniturePositions();
  }

  _updateFurniturePositions() {
    if (!this._pose || !this._pose.context?.furniture) return;
    const context = this._pose.context;
    for (let i = 0; i < this._activeFurniture.length; i++) {
      const furniture = this._activeFurniture[i];
      const furnDef = context.furniture[i];
      if (!furnDef) continue;
      furniture.position.set(
        this.object.position.x + furnDef.position[0],
        this.object.position.y + furnDef.position[1],
        this.object.position.z + furnDef.position[2]
      );
    }
  }

  /** Atenúa el muñeco a cubierto. El color va por vértice, así que el del
   *  material multiplica a todos a la vez — justo lo que hace falta. */
  setTint(scalar) {
    this._tint = scalar;
    if (!this._built) return;
    // Un modelo importado no tiene cara aparte, así que `faceMat` puede faltar.
    for (const mat of [this._built.material, this._built.faceMat]) {
      if (mat) mat.color.setScalar(scalar);
    }
  }

  /**
   * La expresión de la cara. Redibuja la textura, que es todo lo que hay que
   * hacer: `neutral`, `blink`, `happy`, `sad`, `surprised`, `annoyed`, `talk`.
   */
  setExpression(name) {
    if (!this._built || name === this._expression) return;
    // Un cuerpo importado gesticula con su tira de caras, si la trae (ver
    // faceSheet.js): es un recorte distinto, no una textura nueva.
    if (this._face) {
      this._expression = name;
      this._face.set(name);
      return;
    }
    // Y si no la trae, su cara vive dentro de la textura del modelo: no hay
    // nada que redibujar, y pisarle el `map` le borraría la piel entera.
    if (!this._built.faceMat) return;
    this._expression = name;
    this._built.faceMat.map?.dispose();
    this._built.faceMat.map = faceTexture(this.recipe, name);
    this._built.faceMat.needsUpdate = true;
  }

  update(dt) {
    if (!this._built) return;
    this._updateIdle(dt);
    this._updateTurn(dt);

    const wantBlend = this._pose ? 1 : 0;
    this._blend += (wantBlend - this._blend) * Math.min(1, dt * 9);

    if (this._pose) this._poseT += dt * (this._pose.speed ?? 1.5);
    if (this._moving && this._blend < 0.5) this._walkPhase += dt * (this.rig.walk.fps || 8) * 0.78;

    // Quién manda sobre los huesos. El clip del archivo y nuestras poses
    // escriben LOS MISMOS huesos, así que no pueden correr a la vez: el último
    // en escribir gana y sale un temblor. Mientras camina manda el clip; en
    // cuanto hay una pose (café, dormir, susto) vuelven las nuestras, que son
    // las que el juego necesita y ningún .glb trae.
    if (this._walkAction) {
      const want = this._moving && this._blend < 0.5 ? 1 : 0;
      const w = this._walkAction.getEffectiveWeight();
      const next = w + (want - w) * Math.min(1, dt * 10);
      this._walkAction.setEffectiveWeight(next);
      this._mixer.update(dt);
      // A pleno peso no se toca nada más: pisar el clip con `_applyPose` es
      // justo lo que devolvía la marcha militar.
      if (next > 0.99) return;
    }

    this._applyPose();
  }

  /** Aplica la pose REST a los huesos importados de forma ABSOLUTA (no relativa),
   *  estableciendo una postura natural como su nuevo reposo. */
  _applyRestPose(bones) {
    // Limpiar el restQuat para que setBoneRotation escriba directamente,
    // no de forma relativa al T-pose guardado del archivo.
    for (const bone of bones.values()) {
      bone.userData.restQuat = null;
    }

    // Aplicar la pose REST directamente, sin relativizar a la T-pose.
    for (const [name, angles] of Object.entries(REST)) {
      const bone = bones.get(BONE_OF[name]);
      if (!bone || name === "lift" || name === "hands") continue;
      setBoneRotation(bone, angles[0], angles[1], angles[2]);
    }

    // Guardar la nueva postura como el reposo, no la del archivo.
    for (const bone of bones.values()) {
      bone.userData.restQuat = bone.quaternion.clone();
    }
  }

  _updateTurn(dt) {
    let delta = this._targetYaw - this._yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this._yaw += delta * Math.min(1, dt * 12);
    this.object.rotation.y = this._yaw;
  }

  _updateIdle(dt) {
    const idle = this.rig.idle;
    if (!idle || this._moving) {
      if (this._idlePose) {
        this._idlePose = null;
        this.setPose(null);
      }
      this._stillFor = 0;
      this._idleLeft = 0;
      return;
    }
    if (this._poseName != null && !this._idlePose) {
      this._stillFor = 0;
      return;
    }
    if (this._idlePose) {
      this._idleLeft -= dt;
      if (this._idleLeft <= 0) {
        this._idlePose = null;
        this.setPose(null);
        this._stillFor = -(idle.every ?? 9) + (idle.after ?? 4.5);
      }
      return;
    }
    this._stillFor += dt;
    if (this._stillFor < (idle.after ?? 4.5)) return;
    const options = (idle.poses ?? []).filter((p) => POSE_LIBRARY[p]);
    if (!options.length) return;
    this._idlePose = options[Math.floor(Math.random() * options.length)];
    this._idleLeft = idle.hold ?? 2.2;
    this._stillFor = 0;
    this.setPose(this._idlePose);
  }

  /** Coloca los huesos del frame: mezcla la pose con el ciclo de caminata. */
  _applyPose() {
    const { byName } = this._built;
    const H = this.height;
    const blend = this._blend;
    const pose = this._pose;

    const wave = pose ? (1 - Math.cos(this._poseT)) / 2 : 0;
    const angles = (name) => {
      if (!pose) return REST[name];
      const a = pose.a[name] ?? REST[name];
      const b = pose.b[name] ?? REST[name];
      return [
        a[0] + (b[0] - a[0]) * wave,
        a[1] + (b[1] - a[1]) * wave,
        a[2] + (b[2] - a[2]) * wave,
      ];
    };
    const lift = pose ? (pose.a.lift ?? 0) + ((pose.b.lift ?? 0) - (pose.a.lift ?? 0)) * wave : 0;

    // Piernas y brazos en oposición, y el cuerpo botando al doble de
    // frecuencia (un bote por pisada).
    const walking = this._moving ? 1 - blend : 0;
    const swing = Math.sin(this._walkPhase) * 0.72 * walking;
    const knee = Math.max(0, -Math.sin(this._walkPhase)) * 0.5 * walking;
    const bob = Math.abs(Math.sin(this._walkPhase)) * 0.022 * H * walking;

    const set = (key, extraX = 0) => {
      const bone = byName.get(BONE_OF[key]);
      if (!bone) return;
      const [x, y, z] = angles(key);
      setBoneRotation(bone, x * blend + extraX, y * blend, z * blend);
    };

    set("torso");
    set("chest");
    set("head");
    set("legL", swing);
    set("legR", -swing);
    // La rodilla que va atrás se dobla: sin esto la pierna barre el suelo y la
    // caminata se lee como la de un compás.
    set("kneeL", -knee);
    set("kneeR", -Math.max(0, Math.sin(this._walkPhase)) * 0.5 * walking);
    set("armL", -swing * 0.55);
    set("armR", swing * 0.55);
    set("elbowL");
    set("elbowR");
    set("footL");
    set("footR");

    // Las manos: diez huesos por mano movidos con dos números. Se mezclan
    // igual que el resto — al soltar el café los dedos se abren solos.
    const hand = HAND_POSES[pose?.hands ?? REST.hands] ?? HAND_POSES.relax;
    const relax = HAND_POSES.relax;
    const mix = (a, b) => a + (b - a) * blend;
    for (const side of ["Left", "Right"]) {
      for (const f of FINGERS) {
        const curl = mix(relax.curl, f === "Index" && hand.index != null ? hand.index : hand.curl);
        const b1 = byName.get(`${side}${f}1`);
        const b2 = byName.get(`${side}${f}2`);
        if (b1) setBoneRotation(b1, curl, 0, 0);
        if (b2) setBoneRotation(b2, curl * 0.85, 0, 0);
      }
      const th = mix(relax.thumb, hand.thumb);
      const t1 = byName.get(`${side}Thumb1`);
      const t2 = byName.get(`${side}Thumb2`);
      if (t1) setBoneRotation(t1, th * 0.6, 0, 0);
      if (t2) setBoneRotation(t2, th * 0.9, 0, 0);
    }

    // El bote de la caminata sube y baja la cadera entera, que es de donde
    // cuelga todo lo demás.
    byName.get("Hips").position.y = this._hipRest + bob + lift * H * blend;

    const wanted = pose?.prop ?? null;
    for (const [name, mesh] of Object.entries(this._props)) {
      if (mesh) mesh.visible = name === wanted && blend > 0.4;
    }
  }

  /**
   * Solo para tools/check-poses.mjs: una huella del estado del esqueleto. Con
   * el pliego bastaba mirar el offset de la textura; en 3D el equivalente es
   * hacia dónde apuntan los huesos.
   */
  poseSignature() {
    if (!this._built) return "";
    const n = (v) => v.toFixed(3);
    const b = (name) => this._built.byName.get(name).rotation;
    return [
      n(b("Head").x),
      n(b("RightArm").x),
      n(b("RightForeArm").x),
      n(b("LeftArm").x),
      n(b("LeftForeArm").x),
    ].join(",");
  }

  _dispose() {
    this._cleanupPoseProps();
    if (this._built) {
      this.object.remove(this._built.mesh);
      this.object.remove(this._built.shadow);
      // `geometry` explícito: en un cuerpo importado lo que se cuelga de
      // `object` es el envoltorio, y la geometría vive en la malla de dentro.
      (this._built.geometry ?? this._built.mesh.geometry)?.dispose();
      this._built.material?.dispose();
      // Cara aparte: solo la tiene el muñeco generado (ver `_buildFromGLB`).
      this._built.headMesh?.geometry.dispose();
      if (this._built.faceMat) {
        this._built.faceMat.map?.dispose();
        this._built.faceMat.dispose();
      }
      this._built.skeleton?.dispose?.();
      this._built.shadow.geometry.dispose();
      this._built.shadow.material.dispose();
    }
    // El clip del archivo, si lo había. Sin soltarlo, un personaje que pase de
    // cuerpo importado a generado se queda con la caminata del anterior.
    this._mixer?.stopAllAction();
    this._mixer = null;
    this._walkAction = null;
    this._face?.dispose();
    this._face = null;
    this._extras.forEach((m) => {
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.dispose();
    });
    this._extras = [];
    for (const prop of Object.values(this._props)) {
      prop?.traverse?.((o) => {
        o.geometry?.dispose();
        o.material?.dispose();
      });
    }
    this._props = {};
    this._built = null;
    this._hipRest = undefined;
    this._expression = null;
  }

  dispose() {
    this._dispose();
  }
}

// ---------------------------------------------------------------------------
// Cara: es donde vive toda la simpatía del muñeco, así que lleva más piezas
// que el resto del cuerpo junto. Ojos grandes con brillo, pestañas, rubor y
// una boca pequeña — sin eso, un cabezón es solo una bola.
// ---------------------------------------------------------------------------
function buildFace(c, R, r) {
  const out = [];
  const put = (g, color) => out.push({ g, color });
  const eyeY = c.y - R * 0.02;
  const eyeX = R * 0.4;
  const front = R * 0.86;

  for (const dir of [-1, 1]) {
    // Blanco del ojo, iris grande y un brillo: los tres juntos son lo que lo
    // hace parecer vivo y no un botón.
    put(ellipsoid(new THREE.Vector3(dir * eyeX, eyeY, front), R * 0.17, R * 0.21, R * 0.12, 0.5), "#ffffff");
    put(ellipsoid(new THREE.Vector3(dir * eyeX, eyeY - R * 0.01, front + R * 0.06), R * 0.13, R * 0.17, R * 0.1, 0.5), r.eyes);
    put(
      ellipsoid(
        new THREE.Vector3(dir * (eyeX - R * 0.05), eyeY + R * 0.08, front + R * 0.1),
        R * 0.045,
        R * 0.05,
        R * 0.04,
        0.5
      ),
      "#ffffff"
    );
    // Pestaña: una línea fina que remata el ojo por arriba. Gruesa parecía
    // una raya de delineador, no una pestaña.
    const lash = ellipsoid(
      new THREE.Vector3(dir * eyeX, eyeY + R * 0.165, front + R * 0.03),
      R * 0.175,
      R * 0.028,
      R * 0.09,
      0.5
    );
    put(lash, shadeOf(r.hair.color, -0.06));

    // Ceja justo encima del ojo, no en mitad de la frente: más arriba
    // quedaba por detrás del flequillo y se leía como dos manchas sueltas
    // flotando sobre el pelo.
    const brow = ellipsoid(
      new THREE.Vector3(dir * eyeX, eyeY + R * 0.26, front * 0.97),
      R * 0.13,
      R * 0.024,
      R * 0.055,
      0.5
    );
    put(brow, shadeOf(r.hair.color, -0.02));

    if (r.blush) {
      put(
        ellipsoid(
          new THREE.Vector3(dir * R * 0.62, eyeY - R * 0.26, front * 0.72),
          R * 0.14,
          R * 0.085,
          R * 0.07,
          0.5
        ),
        r.blush
      );
    }
  }

  // Nariz de verdad: un puente que arranca entre los ojos y una punta. La
  // anterior era una bolita suelta y de cerca no se leía como nariz.
  put(ellipsoid(new THREE.Vector3(0, eyeY - R * 0.02, front * 0.98), R * 0.05, R * 0.14, R * 0.07, 0.5), shadeOf(r.skin, -0.03));
  put(ellipsoid(new THREE.Vector3(0, eyeY - R * 0.15, front + R * 0.07), R * 0.062, R * 0.052, R * 0.06, 0.5), shadeOf(r.skin, -0.07));
  // Boca pequeña y baja: cuanto más pequeña, más cae en "tierno".
  put(ellipsoid(new THREE.Vector3(0, eyeY - R * 0.38, front * 0.94), R * 0.075, R * 0.045, R * 0.05, 0.5), "#b5645e");

  // Orejas. Aportan poco de frente y muchísimo de perfil: sin ellas la
  // cabeza se lee como un huevo desde cualquier ángulo que no sea el frontal.
  for (const dir of [-1, 1]) {
    put(ellipsoid(new THREE.Vector3(dir * R * 0.9, eyeY - R * 0.02, -R * 0.02), R * 0.09, R * 0.16, R * 0.12, 0.5), shadeOf(r.skin, -0.02));
  }

  return out;
}

/**
 * El pelo es lo que más distingue a un personaje de lejos, así que cada
 * estilo es una silueta clara. Son volúmenes suaves y grandes, no bloques:
 * es la diferencia entre las referencias y un muñeco de piezas.
 */
function buildHair(c, R, r) {
  const out = [];
  const style = r.hair.style ?? "short";
  if (style === "bald") return out;

  const hair = r.hair.color;
  const put = (g, color = hair) => out.push({ g, color });
  const at = (x, y, z) => new THREE.Vector3(c.x + x, c.y + y, c.z + z);
  const streak = r.hair.streak;

  // Casquete común, un pelo más grande que el cráneo.
  put(ellipsoid(at(0, R * 0.12, -R * 0.04), R * 1.05, R * 1.0, R * 1.03));
  // Flequillo: por delante de la frente, pero SIN llegar a las cejas. Es un
  // equilibrio estrecho — subido deja un frentón y el pelo parece un gorro;
  // bajado le come los ojos, que es lo único que de verdad hay que ver.
  put(ellipsoid(at(0, R * 0.62, R * 0.4), R * 0.84, R * 0.3, R * 0.52));
  for (const dir of [-1, 1]) {
    put(ellipsoid(at(dir * R * 0.7, R * 0.36, R * 0.44), R * 0.3, R * 0.42, R * 0.32));
  }

  switch (style) {
    case "afro": {
      // Churos: la masa va debajo y encima se le pegan RIZOS pequeños en
      // varias capas, cada uno con su tamaño. Antes eran catorce bolas
      // grandes en un anillo y se leía como un casco con bultos, no como
      // pelo rizado — el rizo se reconoce por ser menudo y repetido.
      put(ellipsoid(at(0, R * 0.38, -R * 0.05), R * 1.16, R * 1.04, R * 1.12));
      const shell = shadeOf(hair, 0.05);
      for (let ring = 0; ring < 4; ring++) {
        const lift = -0.15 + ring * 0.36;
        const count = 12 + ring * 2;
        const rad = Math.cos(lift * 0.62) * 1.2;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + ring * 0.4;
          const curl = R * (0.19 + ((i + ring) % 3) * 0.035);
          put(
            ellipsoid(
              at(Math.cos(a) * R * rad, R * (0.38 + lift), Math.sin(a) * R * rad * 0.94 - R * 0.05),
              curl,
              curl,
              curl,
              0.5
            ),
            (i + ring) % 2 ? hair : shell
          );
        }
      }
      break;
    }
    case "long": {
      for (const dir of [-1, 1]) {
        put(ellipsoid(at(dir * R * 0.82, -R * 0.34, -R * 0.06), R * 0.34, R * 0.62, R * 0.36));
        put(ellipsoid(at(dir * R * 0.72, -R * 0.86, -R * 0.06), R * 0.26, R * 0.4, R * 0.28));
        if (streak) put(ellipsoid(at(dir * R * 0.95, -R * 0.6, R * 0.14), R * 0.14, R * 0.44, R * 0.16), streak);
      }
      put(ellipsoid(at(0, -R * 0.42, -R * 0.6), R * 0.72, R * 0.62, R * 0.44));
      break;
    }
    case "wavy": {
      // Melena con volumen: tres masas por lado, cada vez más pequeñas y algo
      // más atrás, que es lo que da la caída ondulada sin modelar mechones.
      // Estrechas y largas: anchas y redondas parecían orejeras.
      for (const dir of [-1, 1]) {
        put(ellipsoid(at(dir * R * 0.84, -R * 0.12, -R * 0.12), R * 0.34, R * 0.66, R * 0.42));
        put(ellipsoid(at(dir * R * 0.82, -R * 0.72, -R * 0.14), R * 0.28, R * 0.46, R * 0.34));
        put(ellipsoid(at(dir * R * 0.7, -R * 1.18, -R * 0.16), R * 0.21, R * 0.3, R * 0.25));
        if (streak) put(ellipsoid(at(dir * R * 0.98, -R * 0.75, R * 0.06), R * 0.11, R * 0.42, R * 0.13), streak);
      }
      put(ellipsoid(at(0, -R * 0.4, -R * 0.6), R * 0.8, R * 0.72, R * 0.46));
      break;
    }
    case "spiky": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 4) * Math.PI - Math.PI / 2;
        const g = new THREE.ConeGeometry(R * 0.24, R * 0.42, 8);
        g.translate(0, R * 0.21, 0);
        g.rotateZ(-Math.sin(a) * 0.55);
        g.translate(c.x + Math.sin(a) * R * 0.52, c.y + R * 0.92, c.z + Math.cos(a) * R * 0.26 - R * 0.08);
        put(g);
      }
      break;
    }
    case "bun": {
      put(ellipsoid(at(0, R * 0.86, -R * 0.72), R * 0.4, R * 0.4, R * 0.4));
      break;
    }
    default:
      break;
  }
  return out;
}

function buildBeard(c, R, color) {
  const at = (x, y, z) => new THREE.Vector3(c.x + x, c.y + y, c.z + z);
  // Solo mandíbula y bigote: una barba mayor le tapa la cara al muñeco y lo
  // deja sin expresión, que es justo lo que no queremos.
  // Mandíbula, patillas y bigote. Las patillas son lo que la ata a la cabeza:
  // sin ellas la barba flota como un babero pegado a la barbilla.
  const out = [
    { g: ellipsoid(at(0, -R * 0.54, R * 0.3), R * 0.62, R * 0.34, R * 0.56), color },
    { g: ellipsoid(at(0, -R * 0.3, R * 0.78), R * 0.18, R * 0.06, R * 0.09), color },
  ];
  for (const dir of [-1, 1]) {
    out.push({ g: ellipsoid(at(dir * R * 0.6, -R * 0.26, R * 0.34), R * 0.16, R * 0.3, R * 0.3, 0.5), color });
  }
  return out;
}

function buildAccessories(c, R, r) {
  const out = [];
  const put = (g, color) => out.push({ g, color });
  const at = (x, y, z) => new THREE.Vector3(c.x + x, c.y + y, c.z + z);
  const has = (name) => r.accessories?.includes(name);

  if (has("glasses") || has("sunglasses")) {
    const tinted = has("sunglasses");
    const frame = r.glassesColor ?? (tinted ? "#22222a" : "#6b5a48");
    for (const dir of [-1, 1]) {
      // La lente oscura solo en las de sol; las graduadas se quedan en montura
      // para no taparle los ojos, que es lo que más se mira.
      if (tinted) put(ellipsoid(at(dir * R * 0.38, -R * 0.02, R * 0.93), R * 0.19, R * 0.16, R * 0.05, 0.5), shadeOf(frame, 0.06));
      const rim = new THREE.TorusGeometry(R * 0.2, R * 0.028, 8, 16);
      rim.translate(c.x + dir * R * 0.38, c.y - R * 0.02, c.z + R * 0.94);
      put(rim, frame);
      put(ellipsoid(at(dir * R * 0.72, -R * 0.02, R * 0.55), R * 0.03, R * 0.03, R * 0.28), frame);
    }
    put(ellipsoid(at(0, -R * 0.02, R * 0.95), R * 0.1, R * 0.025, R * 0.03), frame);
  }

  if (has("hoops")) {
    const gold = r.hoopColor ?? "#e8b73a";
    for (const dir of [-1, 1]) {
      const hoop = new THREE.TorusGeometry(R * 0.17, R * 0.032, 8, 16);
      hoop.rotateY(Math.PI / 2);
      hoop.translate(c.x + dir * R * 0.9, c.y - R * 0.3, c.z);
      put(hoop, gold);
    }
  }

  if (has("cap")) {
    // Solo la parte de arriba del cráneo: centrada más abajo se comía la cara
    // entera y Washo salía como una pelota de color.
    const cap = r.capColor ?? "#2f4a7a";
    put(ellipsoid(at(0, R * 0.62, -R * 0.04), R * 1.06, R * 0.44, R * 1.04), cap);
    put(ellipsoid(at(0, R * 0.34, R * 0.66), R * 0.58, R * 0.05, R * 0.4), cap);
  }
  return out;
}

// La utilería se apoya SOBRE la mano y sobresale hacia delante, y cuelga del
// hueso: así sigue al brazo sin que haya que moverla a mano cada frame.
function makeCup(handBone, R, color) {
  const cup = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.26, R * 0.22, R * 0.36, 14),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
  );
  cup.position.set(0, -R * 0.06, R * 0.2);
  cup.visible = false;
  handBone.add(cup);
  return cup;
}

function makePhone(handBone, R, color) {
  const phone = new THREE.Mesh(
    new THREE.BoxGeometry(R * 0.4, R * 0.62, R * 0.07),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color) })
  );
  phone.position.set(0, -R * 0.02, R * 0.22);
  phone.rotation.x = -0.45;
  phone.visible = false;
  handBone.add(phone);
  return phone;
}

function makePlate(handBone, R) {
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.5, R * 0.44, R * 0.08, 16),
    new THREE.MeshLambertMaterial({ color: 0xf2ede3 })
  );
  plate.position.set(0, -R * 0.05, R * 0.26);
  plate.visible = false;
  handBone.add(plate);

  const food = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.2, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xd98a5a })
  );
  food.position.y = R * 0.14;
  plate.add(food);
  return plate;
}

/** Alias histórico, para los ficheros que aún importan el nombre viejo. */
export { Character3D as CharacterSprite };
