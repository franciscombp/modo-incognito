import * as THREE from "three";
import { screenToGround, facingFromGround } from "../scene/iso.js";
import { faceTexture } from "./face.js";
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

    // Usar modelo específico si existe, sino usar kiara como base
    const modelToLoad = r.baseModel ?? "kiara.glb";

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
    this._breatheT += dt;
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
