import * as THREE from "three";
import { screenToGround, facingFromGround } from "../scene/iso.js";
import { faceTexture, faceStripTexture } from "./face.js";
import { loadBaseModel, peekBaseModel, instantiateBase, modelUrlFor, loadFaceSheet, applyBuild } from "./baseModel.js";
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

// Reutilizado para leer escalas de hueso sin alojar un vector por frame.
const _v3 = new THREE.Vector3();

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
  doze: 10,
};

// Lo que queda de un "rig" (public/data/sprites/<id>.json): el ritmo del paso
// procedural y la animación de espera. Todo lo demás que había aquí —filas y
// celdas de un pliego de sprites— murió con el sistema de pliegos.
export const DEFAULT_RIG = {
  walkFps: 8,
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
const _poseConj = new THREE.Quaternion();
function setBoneRotation(bone, x, y, z) {
  const rest = bone.userData?.restQuat;
  _poseEuler.set(x, y, z);
  _poseQuat.setFromEuler(_poseEuler);
  if (!rest) {
    bone.quaternion.copy(_poseQuat);
    return;
  }
  // Los ángulos de POSE_LIBRARY están escritos en ejes de PERSONAJE (los del
  // esqueleto procedural, donde hueso y personaje compartían ejes). Un rig
  // importado trae los suyos propios, y aplicar el euler en local hacía que
  // "brazo adelante" saliera "brazo en cruz" según el exportador. Con la
  // orientación de reposo del hueso EN MUNDO (`restWorldQuat`) se conjuga el
  // giro al espacio local: mismo resultado visual en cualquier rig. Para un
  // rig de ejes alineados la conjugación es la identidad — por eso los
  // cuerpos que ya posaban bien posan exactamente igual.
  const world = bone.userData?.restWorldQuat;
  if (world) {
    _poseConj.copy(world).invert().multiply(_poseQuat).multiply(world);
    bone.quaternion.copy(rest).multiply(_poseConj);
    return;
  }
  bone.quaternion.copy(rest).multiply(_poseQuat);
}

/**
 * LOS CANALES DE UNA POSE: nombre corto -> hueso del rig.
 *
 * Exportado porque el builder de animaciones (`creador/animaciones/`) escribe
 * poses con estos mismos nombres. Si se copiara alla, el dia que aqui se
 * añada un hueso el builder seguiria ofreciendo la lista vieja sin que nada
 * fallara a la vista — que es justo lo que los builders existen para evitar.
 */
export const BONE_OF = {
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
export const HAND_POSES = {
  relax: { curl: 0.34, thumb: 0.26 },
  open: { curl: 0.02, thumb: 0.05 },
  grip: { curl: 1.15, thumb: 0.85 },
  point: { curl: 1.25, thumb: 0.45, index: 0.05 },
};
const FINGERS = ["Index", "Middle", "Ring", "Pinky"];

export const REST = {
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

export const POSE_LIBRARY = {
  // TECLEAR: aquí NO hay que subir la amplitud del brazo — un mecanógrafo
  // mueve las manos, no los hombros, y un brazo que sube y baja se lee como
  // dirigir una orquesta. Lo que faltaba era ALTERNANCIA: los dos codos se
  // movían casi al unísono, y dos manos que suben y bajan a la vez no
  // teclean. Ahora van en oposición clara, y sin `hold` — teclear es
  // continuo, no tiene acento.
  work: {
    speed: 3.1,
    prop: null,
    hands: "open",
    a: { torso: [0.14, 0, 0], head: [0.2, 0, 0], armL: [-1.35, 0, 0.25], armR: [-1.4, 0, -0.25], elbowL: [-0.94, 0, 0], elbowR: [-0.52, 0, 0] },
    b: { torso: [0.15, 0, 0], head: [0.22, 0, 0], armL: [-1.4, 0, 0.25], armR: [-1.35, 0, -0.25], elbowL: [-0.5, 0, 0], elbowR: [-0.96, 0, 0] },
    context: {
      props: [{ name: "documents", bone: "LeftHand", offset: [0.02, -0.02, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  // ── LA CAMA SE RETIRÓ ENTERA (decisión de diseño) ────────────────────
  // Aquí vivía `sleep`, la misma postura que `doze` pero con una CAMA en su
  // `context.furniture`. Se quitó de raíz: un colchón apareciendo de la nada
  // a los pies de alguien que está DE PIE se lee como un fallo, no como una
  // siesta — y las dos actividades que la pedían eran «dormir en el
  // escritorio» y «estirar cinco minutos», o sea una cama en tu puesto y una
  // cama al desperezarte.
  //
  // Lo que cuenta que estás durmiendo es el ZZZ sobre la cabeza
  // (`entities/alertIcon.js`), que es legible desde el otro lado del piso y
  // no ocupa suelo. Si algún día vuelve una cama, será mobiliario del PLANO
  // en un sitio concreto, no algo que la pose invoque donde estés parada.
  //
  // No se deja `sleep` como alias de `doze`: dos entradas idénticas se
  // separan a la primera edición. Un JSON que pida una pose que ya no existe
  // avisa por consola (ver `setPose`), no se queda mudo.
  //
  // LA CABEZADA: dormirse DE PIE, sin cama. Es la misma postura que `sleep`
  // pero con el contexto VACÍO, y existe por un fallo que se veía fatal:
  // quedarte sin energía en mitad del pasillo usaba `sleep`, y esa pose
  // monta una CAMA — aparecía un colchón de la nada a los pies de la
  // jugadora, en mitad de la oficina. `sleep` (con cama) se queda para la
  // siesta táctica, que es una actividad de un sitio concreto; el
  // agotamiento usa esta.
  doze: {
    speed: 1.1,
    prop: null,
    a: { torso: [0.16, 0, 0.05], head: [0.4, 0, 0.3], armL: [0.1, 0, 0.16], armR: [0.1, 0, -0.16], lift: -0.012 },
    b: { torso: [0.2, 0, 0.05], head: [0.46, 0, 0.34], armL: [0.14, 0, 0.16], armR: [0.14, 0, -0.16], lift: 0.006 },
    context: { props: [], furniture: [] },
  },
  // BEBER: la taza baja al pecho y SUBE HASTA LA BOCA, donde se queda el
  // sorbo. Antes el brazo recorría 0.43 rad (unos 25°) — a la distancia a la
  // que se juega, dos píxeles: se veía a alguien quieto con una taza, no
  // bebiendo. Ahora recorre el triple y la cabeza baja a encontrarse con
  // ella, que es el gesto que de verdad delata que estás bebiendo.
  coffee: {
    speed: 1.5,
    hold: 0.45,
    prop: "cup",
    hands: "grip",
    a: { head: [0.02, -0.1, 0], armR: [-0.62, 0, -0.26], elbowR: [-0.78, 0, 0], armL: [0, 0, 0.22] },
    b: { head: [0.2, -0.1, 0], armR: [-1.42, 0, -0.16], elbowR: [-1.92, 0, 0], armL: [0, 0, 0.22] },
    context: {
      props: [{ name: "coffee", bone: "RightHand", offset: [0, -0.08, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  // COMER: la izquierda SOSTIENE el plato quieto (es el ancla que dice
  // "plato") y la derecha hace el viaje entero plato -> boca. Antes la
  // derecha se movía 0.3 rad, menos aún que el café, y las dos manos
  // quedaban a la misma altura: se leía como alguien aplaudiendo despacio.
  eat: {
    speed: 1.7,
    hold: 0.4,
    prop: "plate",
    a: { head: [0.16, 0, 0], armL: [-1.02, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-0.5, 0, -0.28], elbowR: [-0.72, 0, 0] },
    b: { head: [0.08, 0, 0], armL: [-1.02, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-1.34, 0, -0.14], elbowR: [-1.95, 0, 0] },
    context: {
      props: [{ name: "food", bone: "LeftHand", offset: [0.02, -0.05, 0], rotation: [0, 0, 0] }],
      furniture: [],
    },
  },
  movie: {
    speed: 0.9,
    prop: null,
    hands: "grip",
    // SENTADA en el puff con el bucket de palomitas en el regazo: la mano
    // derecha va y viene del bucket a la boca. Antes la pose se quedaba de
    // pie ENCIMA del puf, que era exactamente lo contrario de ver una peli.
    a: { head: [-0.1, 0.04, 0], torso: [0.1, 0, 0], legL: [-1.5, 0, 0.08], legR: [-1.5, 0, -0.08], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], armL: [-1.1, 0, 0.35], elbowL: [-0.95, 0, 0], armR: [-1.05, 0, -0.25], elbowR: [-1.0, 0, 0], lift: -0.088 },
    b: { head: [-0.16, -0.04, 0], torso: [0.1, 0, 0], legL: [-1.5, 0, 0.08], legR: [-1.5, 0, -0.08], kneeL: [1.42, 0, 0], kneeR: [1.42, 0, 0], armL: [-1.12, 0, 0.35], elbowL: [-0.92, 0, 0], armR: [-1.75, 0, -0.12], elbowR: [-1.95, 0, 0], lift: -0.088 },
    context: {
      props: [{ name: "popcorn", bone: "LeftHand", offset: [0, -0.08, 0], rotation: [0, 0, 0] }],
      furniture: [
        { name: "puff", position: [0, 0, -0.05], rotation: [0, 0, 0] },
        // La tele es escenario: se queda donde está aunque el personaje se
        // levante a media película.
        { name: "tv", position: [0, 0.3, 0.9], rotation: [0, Math.PI, 0], anchor: "world" },
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
      // SIN MUEBLES: la silla es la DEL PUESTO, no una que traiga el
      // personaje. Antes esta pose creaba su propio `office_chair` y el
      // resultado era dos sillas en cada puesto — la del escenario, vacía, y
      // la del personaje, encima. Quien se sienta se coloca sobre un asiento
      // real (ver `claimNearestSeat` en scene/furniture.js), así que aquí no
      // hay nada que crear. La mesa y la computadora tampoco: son las del
      // escenario de siempre.
      furniture: [],
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

/**
 * Colores por región para un cuerpo sin textura. El .glb base de Kiara viene
 * sin material: se pinta POR VÉRTICE según qué hueso manda en cada uno, así
 * que cada personaje que lo preste puede ir de sus propios colores solo con
 * un bloque `paint` en su receta.
 */
export const DEFAULT_PAINT = {
  skin: "#e8b088",
  hair: "#3a2c26",
  top: "#7f96ab",
  bottom: "#3d4358",
  shoes: "#e8e2d8",
};

/**
 * Qué .glb le toca a una receta. `baseModel` explícito manda (personajes con
 * cuerpo propio, o indexado desde public/models por characterRecipes.js); sin
 * él, el GÉNERO de la receta elige entre los dos cuerpos base desnudos.
 * Es la única regla: no hay más fallbacks escondidos por ahí.
 */
export function baseFileFor(r) {
  return r?.baseModel ?? (r?.gender === "f" ? "base-chica.glb" : "base-chico.glb");
}

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
  build: { width: 1, depth: null, chest: 1, belly: 0, head: 1 },
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
    // "m" | "f". Sin baseModel propio decide el cuerpo base (ver baseFileFor)
    // y el motor de diálogos lo lee para concordar el texto. Puede faltar:
    // un genérico sin género usa el cuerpo de chico y texto neutro.
    gender: r.gender ?? null,
    // Pintura por regiones para cuerpos SIN textura (ver _paintByBones):
    // { skin, hair, top, bottom, shoes }. En un .glb con textura se ignora.
    paint: r.paint ?? null,
    // La tira de gestos (`<id>.faces.png`, la indexa characterRecipes.js) y
    // su ajuste fino de colocación. Faltaban de esta lista-filtro y la rama
    // entera de las caras pegadas era código muerto — la misma trampa que ya
    // se pagó con baseModel.
    faces: r.faces ?? null,
    face: r.face ?? null,
    // Altura propia de la receta, si trae una — ver setRecipe(). Sin esto,
    // todo cuerpo importado se escala a la altura que le pasó quien lo creó
    // (characters.json por rol: jefe, secuaz, jugadora…), la misma para
    // cualquier personaje que herede ese rol.
    height: r.height ?? null,
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
    // Respiración: un vaivén continuo y suave para cuando no hay pose ni
    // caminata, para que quieto no sea sinónimo de estático. Corre siempre
    // (nunca se resetea), con un desfase propio por muñeco para que un grupo
    // parado no respire al unísono como clones.
    this._breatheT = Math.random() * Math.PI * 2;

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
    // La receta puede pedir su propia altura (personajes con cuerpo
    // importado, de proporciones distintas entre sí); si no trae una, se
    // queda con la que fijó quien construyó este Character3D.
    if (r.height != null) this.height = r.height;

    // Un cuerpo importado tarda en llegar, y `setRecipe` se llama más de una
    // vez seguida al elegir personaje. Sin este testigo, la carga vieja aún
    // en vuelo se colgaba de `object` DESPUÉS de la nueva y quedaban dos
    // cuerpos superpuestos, con `_built` apuntando solo a uno.
    const token = (this._buildToken = (this._buildToken ?? 0) + 1);

    // Su .glb propio si lo tiene; si no, el cuerpo base que diga su género.
    const modelToLoad = baseFileFor(r);

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

  /**
   * Pinta un cuerpo sin textura POR VÉRTICE, mirando qué hueso pesa más en
   * cada uno: manos y cabeza son piel, torso y brazos la prenda, caderas y
   * piernas el pantalón, pies zapatos. Dentro de la cabeza, la mitad de
   * arriba (y la nuca) es pelo — no hay hueso de pelo, así que se corta por
   * altura sobre la propia caja de los vértices de cabeza.
   */
  _paintByBones(mesh, paint) {
    const colors = { ...DEFAULT_PAINT, ...(paint ?? {}) };
    // cloneSkinned COMPARTE la geometría entre instancias (es lo barato);
    // pintar colores por vértice sobre la compartida repintaba a TODO el
    // reparto del color del último en montarse. Cada muñeco pinta su copia.
    mesh.geometry = mesh.geometry.clone();
    const geo = mesh.geometry;
    const pos = geo.getAttribute("position");
    const skinIndex = geo.getAttribute("skinIndex");
    const skinWeight = geo.getAttribute("skinWeight");
    if (!pos || !skinIndex || !skinWeight || !mesh.skeleton) return;

    const boneNames = mesh.skeleton.bones.map((b) => b.name);
    const REGION_OF = (name) => {
      if (/hand/i.test(name)) return "skin";
      if (/head|neck/i.test(name)) return "head"; // se decide piel/pelo abajo
      if (/foot|toe/i.test(name)) return "shoes";
      if (/upleg|leg/i.test(name)) return "bottom";
      if (/hips/i.test(name)) return "bottom";
      return "top"; // spine, chest, shoulder, arm, forearm
    };

    // La caja de la cabeza, para los cortes piel/pelo. Los umbrales son
    // RELATIVOS a esa caja (fracción de su alto y de su fondo), nunca
    // absolutos: cada export centra la cabeza donde quiere, y un corte en
    // metros que funcionaba en un cuerpo pintaba de pelo media cara del
    // siguiente — que es como cuatro personajes salieron "de espaldas".
    let headMinY = Infinity;
    let headMaxY = -Infinity;
    let headMinZ = Infinity;
    let headMaxZ = -Infinity;
    let allMinY = Infinity;
    let allMaxY = -Infinity;
    const domOf = new Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = skinIndex.getComponent(i, k);
        }
      }
      const region = REGION_OF(boneNames[best] ?? "");
      domOf[i] = region;
      const y = pos.getY(i);
      if (y < allMinY) allMinY = y;
      if (y > allMaxY) allMaxY = y;
      if (region === "head") {
        const z = pos.getZ(i);
        if (y < headMinY) headMinY = y;
        if (y > headMaxY) headMaxY = y;
        if (z < headMinZ) headMinZ = z;
        if (z > headMaxZ) headMaxZ = z;
      }
    }
    // Línea PROVISIONAL, solo para clasificar componentes: la caja de cabeza
    // de arriba aún mezcla cráneo y melena. La definitiva se recalcula abajo,
    // ya sin el pelo.
    let hairline = headMinY + (headMaxY - headMinY) * 0.55;

    // EL FARO DE LA CARA. El rig trae un hueso `headfront` clavado en el
    // centro de la cara; el vértice más cercano a él marca qué componente es
    // el CRÁNEO. Sin este ancla no hay forma fiable de distinguirlo de la
    // melena: una melena larga abraza el cráneo, lo desborda por todos lados
    // y hasta lleva pesos de hombros — todos los umbrales de caja que se
    // probaron acababan pintando de pelo la cara de alguien.
    const facePoint = new THREE.Vector3(0, headMinY + (headMaxY - headMinY) * 0.45, headMaxZ * 0.9);
    const hfIdx = mesh.skeleton.bones.findIndex((b) => /headfront/i.test(b.name));
    if (hfIdx >= 0 && mesh.skeleton.boneInverses[hfIdx]) {
      const bind = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[hfIdx]).invert();
      facePoint.setFromMatrixPosition(bind);
    }
    let nearestIdx = 0;
    let nearestD = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - facePoint.x;
      const dy = pos.getY(i) - facePoint.y;
      const dz = pos.getZ(i) - facePoint.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < nearestD) {
        nearestD = d;
        nearestIdx = i;
      }
    }

    // EL PELO ES SU PROPIA CARCASA. Estos cuerpos traen la melena esculpida
    // como pieza aparte (sin soldar al cráneo), y pintarla por hueso dominante
    // la degradaba: una melena larga cae hasta el pecho, donde mandan los
    // huesos del torso, y esos mechones salían color camiseta. Se separan las
    // componentes conexas de la malla (soldando por posición, que las costuras
    // de UV parten los shells) y toda componente que no sea el cuerpo, llegue
    // por encima de la línea del pelo y tenga vértices de cabeza, ES PELO
    // entero, de la raíz a las puntas.
    const hairComp = new Uint8Array(pos.count);
    const index = geo.getIndex();
    if (index) {
      const keyOf = new Map();
      const parent = new Int32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
        const first = keyOf.get(k);
        parent[i] = first === undefined ? i : first;
        if (first === undefined) keyOf.set(k, i);
      }
      const find = (i) => {
        let r = i;
        while (parent[r] !== r) r = parent[r];
        while (parent[i] !== r) {
          const next = parent[i];
          parent[i] = r;
          i = next;
        }
        return r;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[rb] = ra;
      };
      for (let t = 0; t < index.count; t += 3) {
        union(index.getX(t), index.getX(t + 1));
        union(index.getX(t), index.getX(t + 2));
      }
      const comps = new Map(); // raíz -> { n, headN, maxY }
      for (let i = 0; i < pos.count; i++) {
        const r = find(i);
        let s = comps.get(r);
        if (!s) comps.set(r, (s = { n: 0, headN: 0, maxY: -Infinity }));
        s.n++;
        if (domOf[i] === "head") s.headN++;
        const y = pos.getY(i);
        if (y > s.maxY) s.maxY = y;
      }
      let bodyRoot = -1;
      let bodyN = 0;
      for (const [r, s] of comps) {
        if (s.n > bodyN) {
          bodyN = s.n;
          bodyRoot = r;
        }
      }
      // La componente del vértice más cercano a `headfront` ES el cráneo:
      // jamás se marca de pelo, aunque cumpla todo lo demás.
      const skullRoot = find(nearestIdx);
      for (const [r, s] of comps) {
        if (r === bodyRoot || r === skullRoot) continue;
        if (s.maxY > hairline && s.headN / s.n > 0.15) {
          for (let i = 0; i < pos.count; i++) if (find(i) === r) hairComp[i] = 1;
        }
      }
    }

    // La caja DEFINITIVA de la cabeza: solo el cráneo, sin la melena. Con la
    // melena dentro, una cabellera larga corría la línea de la nuca hasta
    // delante de la cara y la cara entera salía color pelo.
    headMinY = Infinity;
    headMaxY = -Infinity;
    headMinZ = Infinity;
    headMaxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (domOf[i] !== "head" || hairComp[i]) continue;
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < headMinY) headMinY = y;
      if (y > headMaxY) headMaxY = y;
      if (z < headMinZ) headMinZ = z;
      if (z > headMaxZ) headMaxZ = z;
    }
    hairline = headMinY + (headMaxY - headMinY) * 0.55;
    // La cara mira a +Z: el 40% trasero del cráneo es nuca, o sea pelo.
    const napeline = headMinZ + (headMaxZ - headMinZ) * 0.4;
    // La caja (en espacio de la malla), para colocar después la cara
    // sintética — ver _attachSyntheticFace.
    this._bindFace =
      headMaxY > -Infinity
        ? { headMinY, headMaxY, headMinZ, headMaxZ, bindMinY: allMinY, bindHeight: allMaxY - allMinY }
        : null;

    const c = new THREE.Color();
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      let region = domOf[i];
      if (hairComp[i]) {
        region = "hair";
      } else if (region === "head") {
        // Arriba de la línea, o detrás de la cabeza (nuca), es pelo.
        region = pos.getY(i) > hairline || pos.getZ(i) < napeline ? "hair" : "skin";
      }
      c.set(colors[region] ?? colors.top);
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      m.vertexColors = true;
      m.color?.set("#ffffff");
      m.needsUpdate = true;
    }
  }

  /**
   * Si el rig reposa con los brazos EN CRUZ (T-pose), los baja a los lados.
   * Se mide en mundo — la dirección hombro→codo casi horizontal delata la
   * T-pose — y se corrige también en mundo, con un giro que lleva esa
   * dirección a "colgando con una gota de holgura", convertido al espacio
   * local del hueso. Así funciona igual venga el rig orientado como venga.
   */
  _relaxTPose(model, bones) {
    model.updateMatrixWorld(true);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const pq = new THREE.Quaternion();
    for (const side of ["Left", "Right"]) {
      const arm = bones.get(`${side}Arm`);
      const fore = bones.get(`${side}ForeArm`);
      if (!arm || !fore || !arm.parent) continue;
      arm.getWorldPosition(a);
      fore.getWorldPosition(b);
      const dir = b.sub(a).normalize();
      if (dir.y < -0.5) continue; // ya cuelga: rig relajado, no tocar
      // Abajo con una pizca hacia fuera, para no hundir la mano en la cadera
      // (menos aún en un cuerpo ensanchado por `build`).
      const target = new THREE.Vector3(side === "Left" ? 0.25 : -0.25, -0.96, 0.04).normalize();
      const swing = new THREE.Quaternion().setFromUnitVectors(dir, target);
      arm.parent.getWorldQuaternion(pq);
      arm.quaternion.premultiply(pq.clone().invert().multiply(swing).multiply(pq));
      arm.updateMatrixWorld(true);
    }
  }

  /**
   * La cara de un cuerpo base, dibujada y pegada delante (ver faceSheet.js).
   *
   * El plano NO se cuelga del hueso a pelo: los ejes locales del hueso de la
   * cabeza son los que quiera el exportador, y la posición heredaría además
   * su escala (~0.01 por el armature). Se cuelga de un grupo NORMALIZADOR que
   * anula la orientación y la escala del hueso, de modo que dentro de él se
   * trabaja en ejes de personaje y metros — y ahí las cuentas son las obvias:
   * la cara va centrada en la caja de la cabeza, un pelo por delante.
   */
  _attachSyntheticFace(bones, r, H) {
    const head = bones.get("Head");
    const fb = this._bindFace;
    if (!head || !fb || !(fb.bindHeight > 0)) return;
    const k = H / fb.bindHeight; // malla (bind) → mundo

    const carrier = new THREE.Group();
    head.add(carrier);
    head.updateWorldMatrix(true, false);
    const objQ = new THREE.Quaternion();
    this.object.getWorldQuaternion(objQ);
    const headQ = new THREE.Quaternion();
    head.getWorldQuaternion(headQ);
    carrier.quaternion.copy(headQ).invert().multiply(objQ);
    const ws = new THREE.Vector3();
    head.getWorldScale(ws);
    carrier.scale.set(1 / (ws.x || 1), 1 / (ws.y || 1), 1 / (ws.z || 1));

    // Todo en espacio del PERSONAJE (pies en y=0, cara mirando a +z).
    const headPos = this.object.worldToLocal(head.getWorldPosition(new THREE.Vector3()));
    const faceY = (fb.headMinY - fb.bindMinY + (fb.headMaxY - fb.headMinY) * 0.52) * k;
    const faceZ = fb.headMaxZ * k + 0.012;
    const size = (fb.headMaxY - fb.headMinY) * k * 0.62;

    const colors = { ...DEFAULT_PAINT, ...(r.paint ?? {}) };
    const tex = faceStripTexture({
      skin: colors.skin,
      hair: { color: colors.hair },
      eyes: r.eyes,
      blush: r.blush,
    });
    this._face = attachFaceSheet(carrier, tex, {
      height: H,
      tune: { y: (faceY - headPos.y) / H, z: (faceZ - headPos.z) / H, size: size / H, ...(r.face ?? {}) },
    });
    this._face?.set(this._expression ?? "neutral");
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

    // La caja de la cabeza se mide al PINTAR (solo cuerpos sin textura); un
    // montaje anterior no debe dejar la suya colgando para este.
    this._bindFace = null;

    // Un cuerpo SIN textura (el .glb base viene desnudo a propósito) se
    // pinta aquí por vértice: cada hueso dominante decide la región (piel,
    // pelo, prenda, pantalón, zapatos) y la receta pone los colores.
    let untextured = true;
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m?.map)) untextured = false;
    });
    if (untextured) this._paintByBones(mesh, r.paint);

    // Cada exportador deja su propio metalness/roughness en el material —
    // varios cuerpos importados traen metalness:1 con un roughness bajo, que
    // sin un mapa de entorno que reflejar se ve como una bola de metal gris
    // en vez de piel o tela. El color y la textura del artista se quedan
    // igual; solo se pisa cómo reacciona a la luz.
    model.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && "metalness" in m) {
          m.metalness = 0;
          m.roughness = 0.85;
        }
      }
    });

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

    // Un rig que reposa en T-POSE (los dos cuerpos base vienen así) se relaja
    // aquí ANTES de nada: brazos abajo. Tiene que pasar antes de capturar
    // `restQuat` (para que las poses partan de brazos caídos, no en cruz) y
    // antes de crear el mixer (que guarda como estado "original" lo que
    // encuentre al enlazar, y es a lo que vuelve al parar de andar). Un rig
    // que ya viene relajado (los esculpidos) se detecta y no se toca.
    this._relaxTPose(model, bones);

    // La postura de reposo del rig, que es lo que lo mantiene de pie y con los
    // brazos donde toca. Las poses se aplican COMO GIRO RELATIVO a esto (ver
    // `setBoneRotation`); escribiendo el ángulo directamente, el personaje
    // salía tumbado y en cruz. Se guarda también la orientación de reposo EN
    // MUNDO (aún sin colgar de `object`, o sea relativa al personaje), que es
    // lo que permite conjugar las poses a los ejes de cualquier rig.
    model.updateMatrixWorld(true);
    const _wq = new THREE.Quaternion();
    for (const bone of bones.values()) {
      bone.userData.restQuat = bone.quaternion.clone();
      bone.getWorldQuaternion(_wq);
      bone.userData.restWorldQuat = _wq.clone();
    }

    // La complexión de la receta: ancho/peso (width/depth), torso (chest),
    // barriga (belly), cabeza (head). Va DESPUÉS de los alias (usa "Chest")
    // y antes de medir la sombra, que así sale del cuerpo ya engordado.
    // Nunca toca la altura — esa es de `height` y de nadie más.
    applyBuild(bones, r.build);

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

    // Utilería: con GLB modelos importados, los props vienen en el modelo.
    this._props = {
      cup: null,
      phone: null,
      plate: null,
    };

    const headR = size.y * 0.11;
    this._built = {
      mesh: root, // lo que se cuelga de `object`, y lo que hay que descolgar
      geometry: mesh.geometry,
      material: mesh.material,
      skeleton: mesh.skeleton ?? null,
      bones,
      byName: bones,
      root,
      shadow,
      headR,
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
    } else if (untextured && this._bindFace) {
      // Un cuerpo base pintado no trae cara en su textura (no TIENE textura):
      // sin esto era un maniquí. Se le pega la tira SINTÉTICA (ver
      // faceStripTexture) delante de la cabeza, con la caja medida al pintar.
      this._attachSyntheticFace(bones, r, H);
    }

    // LA CAMINATA VIENE EN EL ARCHIVO. Nuestro paso procedural está calibrado
    // para el muñeco chibi — zancadas de 0.72 rad, que en un cuerpo humano se
    // ven como marcha militar. Si el .glb trae su propio ciclo de andar, manda
    // ese: para eso lo exportó quien modeló el personaje.
    this._mixer = null;
    this._walkAction = null;
    this._runAction = null;
    const clips = gltf.animations ?? [];
    const walkClip = pickClip(clips, ["walk", "walking", "caminar", "andar"]);
    const runClip = pickClip(clips, ["run", "running", "correr", "sprint"]);
    if (walkClip || runClip) {
      this._mixer = new THREE.AnimationMixer(model);
      if (walkClip) {
        this._walkAction = this._mixer.clipAction(walkClip);
        this._walkAction.play();
        this._walkAction.setEffectiveWeight(0);
      }
      if (runClip) {
        this._runAction = this._mixer.clipAction(runClip);
        this._runAction.play();
        this._runAction.setEffectiveWeight(0);
      }
    }

    // El T-pose del archivo es SAGRADO: todas las rotaciones se aplican de forma
    // relativa a él. NO aplicar la pose REST de forma absoluta, que daña el esqueleto.
    // El restQuat ya fue guardado líneas arriba (468), eso es suficiente.
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
      walkFps: rig?.walkFps ?? DEFAULT_RIG.walkFps,
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
    // Un nombre que no existe AVISA, no se ignora en silencio. Mismo criterio
    // que `effects.js`: sin esto, un `"pose": "loQueSea"` en un JSON de escena
    // deja al personaje quieto y parece que la actividad no hace nada.
    if (name && !POSE_LIBRARY[name]) {
      console.warn(`[character3d] pose desconocida: "${name}" (ver POSE_LIBRARY)`);
    }
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
      // Puede colgar del personaje (silla) o de la escena (escritorio
      // anclado al mundo): se le pregunta a su padre real.
      furniture.parent?.remove(furniture);
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

        // La taza, el plato, el teléfono… están medidos EN METROS, como el
        // personaje. Pero un hueso de un cuerpo importado no vive a escala
        // 1: el .glb está modelado ~110 veces más grande y se encoge entero
        // al montarlo (ver instantiateBase), así que todo lo que cuelgue de
        // un hueso hereda ese encogimiento. La taza acababa midiendo 1,7 mm
        // en una persona de metro y medio — colgada de la mano, pero
        // literalmente invisible. Aquí se deshace esa escala para que el
        // objeto mida lo que dice medir, y el offset se convierte al espacio
        // local del hueso por lo mismo.
        const boneScale = bone.getWorldScale(_v3).x || 1;
        const inv = 1 / boneScale;
        prop.scale.setScalar(inv);
        prop.position.set(
          propDef.offset[0] * inv,
          propDef.offset[1] * inv,
          propDef.offset[2] * inv
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

        // Se cuelga de `this.object`, así que la posición ya es RELATIVA al
        // personaje: sumarle además su posición de mundo la contaba dos
        // veces y mandaba la silla al otro lado del piso (y con el
        // personaje moviéndose, a perseguirlo desde lejos).
        furniture.position.set(
          furnDef.position[0],
          furnDef.position[1],
          furnDef.position[2]
        );
        furniture.rotation.set(
          furnDef.rotation[0],
          furnDef.rotation[1],
          furnDef.rotation[2]
        );

        if (furnDef.anchor === "world" && this.object.parent) {
          // Anclado al MUNDO: el escritorio y su computadora se quedan
          // clavados donde estaban al sentarse, aunque a su dueño se lo
          // lleve la silla rodando (ver npc.rollAway). Se hornea la
          // transformación del personaje y se cuelga de la escena.
          this.object.updateMatrixWorld(true);
          furniture.applyMatrix4(this.object.matrixWorld);
          this.object.parent.add(furniture);
        } else {
          this.object.add(furniture);
        }
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
  setHeading(dx, dz, { snap = false } = {}) {
    if (!dx && !dz) return;
    this._targetYaw = Math.atan2(dx, dz);
    // `snap` existe para las ESCENAS: el giro normal es un tween que avanza
    // en update(), y durante un diálogo la partida está en PAUSA — así que
    // «ponerse de frente al otro» no llegaba a verse en toda la
    // conversación. Una escena coloca; el juego, tuenea.
    if (snap && this.object) this.object.rotation.y = this._targetYaw;
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
    // Los muebles de pose son HIJOS del grupo del personaje con offset
    // LOCAL: se mueven con él sin ayuda (así es como la silla RUEDA con su
    // dueño al empujarlo). Aquí se escribía encima la posición de MUNDO en
    // coordenadas locales — el doble — y al primer setPosition (un
    // empujón) la silla saltaba al otro lado del piso: "desaparecía". Los
    // anclados al mundo (escritorio, computadora) cuelgan de la escena y
    // tampoco necesitan nada. No hay nada que hacer, y eso es lo correcto.
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
    this._breatheT += dt;
    this._updateIdle(dt);
    this._updateTurn(dt);

    const wantBlend = this._pose ? 1 : 0;
    this._blend += (wantBlend - this._blend) * Math.min(1, dt * 9);

    if (this._pose) this._poseT += dt * (this._pose.speed ?? 1.5);
    if (this._moving && this._blend < 0.5) this._walkPhase += dt * (this.rig.walkFps || 8) * 0.78;

    // Quién manda sobre los huesos. El clip del archivo y nuestras poses
    // escriben LOS MISMOS huesos, así que no pueden correr a la vez: el último
    // en escribir gana y sale un temblor. Mientras camina manda el clip; en
    // cuanto hay una pose (café, dormir, susto) vuelven las nuestras, que son
    // las que el juego necesita y ningún .glb trae.
    if (this._mixer) {
      // La velocidad no se pide a quien mueve al personaje: se MIDE del propio
      // desplazamiento entre frames. Así jugadora, jefe, secuaces y NPCs
      // quedan sincronizados sin que ninguno tenga que avisar de nada.
      const px = this.object.position.x;
      const pz = this.object.position.z;
      let speed = 0;
      if (this._lastPos) {
        speed = Math.hypot(px - this._lastPos.x, pz - this._lastPos.z) / Math.max(dt, 1e-4);
      }
      this._lastPos = { x: px, z: pz };
      this._speedSmooth = (this._speedSmooth ?? 0) * 0.8 + speed * 0.2;

      // Los clips vienen calibrados para un cuerpo de 1.7 unidades: paso
      // ~1.25 u/s andando y ~3.1 u/s corriendo. Se reescalan a la altura de
      // ESTE muñeco y el reloj del clip sigue a la velocidad real — es lo que
      // mata el patinaje de pies, que era andar a 5 u/s con un ciclo de 1.25.
      const bodyScale = this.height / 1.7;
      const runThreshold = 2.1 * bodyScale;
      const running = this._runAction && this._speedSmooth > runThreshold;

      const moving = this._moving && this._blend < 0.5;
      const wantWalk = moving && !running ? 1 : 0;
      const wantRun = moving && running ? 1 : 0;
      let top = 0;
      for (const [action, want, ref] of [
        [this._walkAction, wantWalk, 1.25],
        [this._runAction, wantRun, 3.1],
      ]) {
        if (!action) continue;
        const w = action.getEffectiveWeight();
        const next = w + (want - w) * Math.min(1, dt * 10);
        action.setEffectiveWeight(next);
        if (want) {
          action.timeScale = THREE.MathUtils.clamp(
            this._speedSmooth / (ref * bodyScale) || 1, 0.55, 2.4
          );
        }
        top = Math.max(top, next);
      }
      this._mixer.update(dt);
      // A pleno peso no se toca nada más: pisar el clip con `_applyPose` es
      // justo lo que devolvía la marcha militar.
      if (top > 0.99) return;
    }

    this._applyPose();
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

    // ── EL RITMO DE LA POSE ─────────────────────────────────────────────
    //
    // Era `(1 - cos t) / 2` a secas: un vaivén PERFECTAMENTE SIMÉTRICO y sin
    // pausa. Subir tardaba lo mismo que bajar y nunca se detenía en ningún
    // extremo, así que todas las poses se leían igual — "respirar con los
    // brazos en otra postura" — y no se entendía qué estaba haciendo nadie.
    //
    // Una acción se reconoce por su ACENTO: llegar, PARARSE un momento, y
    // volver. `hold` es cuánto se queda quieta en cada extremo (0 = como
    // antes, 0.5 = media vuelta parada). Recortar y reescalar la onda es lo
    // que crea esa pausa: los tramos que se salen del rango se aplastan
    // contra 0 y 1, que es precisamente el tiempo que la mano pasa en la
    // boca o el dedo sobre la tecla.
    //
    // Por defecto es 0, así que una pose que no lo pida se mueve exactamente
    // igual que antes.
    const hold = pose?.hold ?? 0;
    const raw = pose ? (1 - Math.cos(this._poseT)) / 2 : 0;
    const h = Math.min(Math.max(hold, 0), 0.9) / 2;
    const wave = h > 0 ? Math.min(Math.max((raw - h) / (1 - 2 * h), 0), 1) : raw;
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

    // Respiración: solo cuando no hay pose activa ni caminata, y con una
    // rampa suave (no un interruptor) para que arrancar a andar no la corte
    // en seco. Amplitud pequeña a propósito — "delicada", no una animación
    // que compita con las poses de verdad.
    const wantBreathe = !this._moving && blend < 0.05 ? 1 : 0;
    this._breatheAmt = (this._breatheAmt ?? 0) + (wantBreathe - (this._breatheAmt ?? 0)) * 0.06;
    const breathe = this._breatheAmt;
    const chestWave = Math.sin(this._breatheT * 0.55) * 0.028 * breathe;
    const headWave = Math.sin(this._breatheT * 0.4 + 1.1) * 0.02 * breathe;
    const armWave = Math.sin(this._breatheT * 0.55 + 0.4) * 0.035 * breathe;

    const set = (key, extraX = 0) => {
      const bone = byName.get(BONE_OF[key]);
      if (!bone) return;
      const rest = REST[key];
      const target = angles(key);
      // Interpolar entre REST (blend=0) y target pose (blend=1)
      const x = rest[0] + (target[0] - rest[0]) * blend + extraX;
      const y = rest[1] + (target[1] - rest[1]) * blend;
      const z = rest[2] + (target[2] - rest[2]) * blend;
      setBoneRotation(bone, x, y, z);
    };

    set("torso");
    set("chest", chestWave);
    set("head", headWave);
    set("legL", swing);
    set("legR", -swing);
    // La rodilla que va atrás se dobla: sin esto la pierna barre el suelo y la
    // caminata se lee como la de un compás.
    set("kneeL", -knee);
    set("kneeR", -Math.max(0, Math.sin(this._walkPhase)) * 0.5 * walking);
    set("armL", -swing * 0.55 + armWave);
    set("armR", swing * 0.55 - armWave);
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
    this._runAction = null;
    this._lastPos = null;
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
