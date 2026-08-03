import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { siteRoot } from "../data/siteRoot.js";

/**
 * CUERPOS IMPORTADOS (.glb de public/models/).
 *
 * Todo el reparto sale de aquí: o de su `.glb` propio esculpido fuera
 * (giuli, gabo, fran…) o de uno de los DOS CUERPOS BASE desnudos —
 * `base-chica.glb` y `base-chico.glb` — que vienen SIN textura a propósito
 * para que `character3d.js` los pinte por vértice con los colores de la
 * receta (`paint`) y les dé complexión escalando huesos (`applyBuild`).
 * Qué cuerpo usa cada quien lo decide su receta: `baseModel` explícito si
 * lo trae, y si no el `gender` (`"f"` → chica, el resto → chico).
 *
 * Los modelos son del equipo (esculpidos para este juego); no hay
 * atribución externa que mantener.
 *
 * Los clips de los archivos traen pista de POSICIÓN+ROTACIÓN+ESCALA por
 * hueso. La de escala es constante a 1 y no aporta nada, pero pisaría cada
 * frame la complexión de `applyBuild` — por eso se quita al cargar
 * (`stripScaleTracks`).
 */

/**
 * MAPEO FLEXIBLE DE HUESOS.
 *
 * Mapeos para diferentes rigs. El motor detecta el rig al cargar y aplica
 * el mapeo correcto automáticamente. Los mapeos heredados se quedan para
 * compatibilidad hacia atrás, pero el defecto es ahora el rig estándar
 * (Mixamo/Rigify: Hips, Spine, Chest, etc.).
 */

// Rig heredado de base.gltf (para compatibilidad)
const BONE_MAP_BASE_LEGACY = {
  hips_40: "Hips",
  spine_33: "Spine",
  chest_32: "Chest",
  neck_16: "Neck",
  head_15: "Head",
  "shoulder L_14": "LeftShoulder",
  "upper_arm L_13": "LeftArm",
  "lower_arm L_12": "LeftForeArm",
  "wrist L_11": "LeftHand",
  "shoulder R_31": "RightShoulder",
  "upper_arm R_30": "RightArm",
  "lower_arm R_29": "RightForeArm",
  "wrist R_28": "RightHand",
  "upper_Leg L_36": "LeftUpLeg",
  "lower_leg L_35": "LeftLeg",
  "lower_leg L.001_34": "LeftFoot",
  "upper_Leg R_39": "RightUpLeg",
  "lower_leg R_38": "RightLeg",
  "lower_leg R.001_37": "RightFoot",
};

// Mapeo estándar (Mixamo, Rigify, rigs convencionales)
// Estos ya tienen los nombres correctos, pero los alias ayudan con variantes
const BONE_MAP_STANDARD = {
  // Alias para variantes comunes
  "Spine01": "Spine",
  "Spine02": "Chest",
  "Spine1": "Spine",
  "Spine2": "Chest",
  "Chest1": "Chest",
  "neck": "Neck",
  "Neck1": "Neck",
  "Armature": "", // Nodo padre, ignorar
};

/**
 * Cache de modelos por URL. Permite cargar múltiples bases (giuli.glb, gabo.glb, etc.)
 * sin recargar desde la red.
 */
const modelCache = new Map();

/**
 * Carga el modelo UNA vez. Todos los personajes salen de clonarlo, que es lo
 * único viable con veinticinco en pantalla.
 */
export function loadBaseModel(url) {
  if (!modelCache.has(url)) {
    const loading = new GLTFLoader().loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      renameBones(gltf.scene);
      stripScaleTracks(gltf.animations);
      ready.set(url, gltf);
      return gltf;
    });
    modelCache.set(url, loading);
  }
  return modelCache.get(url);
}

/**
 * Quita las pistas de ESCALA de los clips importados. Son constantes a 1
 * (nadie anima la escala de un hueso en un ciclo de andar), pero el mixer
 * las escribiría cada frame y desharían la complexión que pone `applyBuild`
 * (ancho, torso, barriga) en cuanto el personaje diera un paso.
 */
function stripScaleTracks(animations = []) {
  for (const clip of animations) {
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith(".scale"));
  }
}

/** Los que YA están en memoria, para poder montarlos sin esperar. */
const ready = new Map();

/**
 * Dónde vive un modelo. `public/` se sirve en la RAÍZ (no en `/public/`), y
 * en Pages el sitio entero cuelga de un subdirectorio: montar esta ruta a
 * mano en cada sitio es cómo se cuela un 404.
 *
 * `import.meta.env.BASE_URL` es la cadena literal `"./"` (ver `base` en
 * vite.config.js) y el navegador la resuelve relativa a la PÁGINA actual —
 * funciona desde `index.html`, pero desde un builder anidado dos carpetas
 * más abajo (`creador/personajes/`) apunta dos carpetas de más y nunca
 * encuentra el modelo. `siteRoot()` (ver `../data/siteRoot.js`) calcula el
 * prefijo correcto mirando la propia URL de la página, así que da con la
 * ruta buena en cualquier profundidad — y sirve igual en `npm run dev`
 * (módulos sueltos) que en el build (todo empaquetado), a diferencia de
 * resolver contra `import.meta.url`, que cambia de sitio entre los dos.
 */
export function modelUrlFor(file) {
  return `${siteRoot()}models/${file}`;
}

const faceCache = new Map();
const faceLoader = new THREE.TextureLoader();

/**
 * La tira de gestos de un personaje (`<id>.faces.png`).
 *
 * Devuelve la textura YA CARGADA si se pidió antes, y una promesa la primera
 * vez. La asimetría es a propósito: los retratos de los menús se montan y se
 * fotografían en la misma vuelta, y con una espera de por medio salen en
 * blanco. Cada personaje recibe su COPIA: cada uno recorta su celda, y
 * compartir la textura sería compartir el gesto.
 */
export function loadFaceSheet(file) {
  const url = modelUrlFor(file);
  const hit = faceCache.get(url);
  if (hit) return hit.isTexture ? hit.clone() : hit.then((t) => t.clone());
  const loading = faceLoader.loadAsync(url).then((tex) => {
    faceCache.set(url, tex);
    return tex.clone();
  });
  faceCache.set(url, loading);
  return loading;
}

/**
 * El modelo si ya llegó, o null.
 *
 * Existe por los RETRATOS: los menús montan un personaje y le sacan una foto
 * en la misma vuelta, y con una espera de por medio la foto salía en blanco —
 * y encima se cacheaba en blanco. Con esto, un modelo ya cargado se monta sin
 * ceder el turno y la foto sale con muñeco.
 */
export function peekBaseModel(url) {
  return ready.get(url) ?? null;
}

/**
 * Normaliza un nombre de nodo igual que hace Three al cargar.
 *
 * `GLTFLoader` sanea los nombres (`PropertyBinding.sanitizeNodeName`): los
 * espacios pasan a guion bajo y los puntos y corchetes desaparecen, porque
 * esos caracteres son sintaxis en las rutas de animación. Así, el hueso que en
 * el archivo se llama "lower_leg L.001_34" llega como "lower_leg_L001_34".
 *
 * Se aplica la misma transformación a las claves del mapa, para que BONE_MAP
 * se pueda escribir con los nombres TAL COMO SE VEN en el .gltf — que es
 * donde alguien va a ir a comprobarlos — y aun así encuentren su hueso.
 */
const sanitize = (name) => name.replace(/\s/g, "_").replace(/[\\[\]./:]/g, "");

/** Detecta qué tipo de rig tiene el modelo y devuelve el mapeo apropiado. */
function detectRigAndGetMapping(root) {
  const boneNames = new Set();
  root.traverse((obj) => {
    if (obj.isBone) boneNames.add(sanitize(obj.name));
  });

  // Si tiene los huesos legacy de base.gltf
  if (boneNames.has("hips_40")) {
    return new Map(Object.entries(BONE_MAP_BASE_LEGACY).map(([k, v]) => [sanitize(k), v]));
  }

  // Si ya tiene nombres estándar (Hips, Spine, etc.), solo aplicar alias
  // Crear mapeo de alias para variantes
  const mapping = new Map(
    Object.entries(BONE_MAP_STANDARD).map(([k, v]) => [sanitize(k), v])
  );

  // Que los huesos que ya tienen nombre correcto no se modifiquen
  const standardBones = [
    "Hips",
    "Spine",
    "Chest",
    "Neck",
    "Head",
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
  ];

  for (const bone of standardBones) {
    if (boneNames.has(bone)) {
      mapping.set(bone, bone); // No renombrar
    }
  }

  return mapping;
}

/** Reetiqueta el esqueleto importado con nuestros nombres. */
function renameBones(root) {
  const mapping = detectRigAndGetMapping(root);
  const required = new Set([
    "Hips",
    "Spine",
    "Head",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
  ]);
  const missing = new Set(required);

  root.traverse((obj) => {
    if (!obj.isBone) return;
    const sanitized = sanitize(obj.name);
    const newName = mapping.get(sanitized);

    if (newName) {
      if (newName !== "") {
        obj.name = newName;
        missing.delete(newName);
      }
      // Si newName es "", es un nodo ignorable (Armature, etc.)
    } else if (required.has(obj.name)) {
      // Ya tiene nombre correcto
      missing.delete(obj.name);
    }
  });

  // Advertir si faltan huesos críticos
  if (missing.size) {
    console.warn(
      `baseModel: no se encontraron estos huesos en el modelo: ${[...missing].join(", ")}`
    );
  }
}

/**
 * Una instancia lista para usar: clonada, mirando a +Z, con los pies en y=0 y
 * a la altura que se le pida.
 *
 * La escala NO se calcula del glTF a mano: se mide la caja del modelo ya
 * cargado. Los nodos del archivo traen tres transformaciones encadenadas
 * (conversión Z-up, raíz de escena y armadura), y multiplicarlas a ojo es la
 * clase de cuenta que sale mal y no se nota hasta que el personaje aparece
 * enterrado en el suelo.
 */
export function instantiateBase(gltf, { height = 1.5 } = {}) {
  const model = cloneSkinned(gltf.scene);
  model.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = height / (size.y || 1);

  // Un envoltorio con la escala y el apoyo en el suelo, para no tocar las
  // transformaciones internas del modelo (que es donde vive el esqueleto).
  const root = new THREE.Group();
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;
  root.add(model);

  const bones = new Map();
  const meshes = new Map();
  model.traverse((obj) => {
    if (obj.isBone) bones.set(obj.name, obj);
    if (obj.isSkinnedMesh) {
      obj.frustumCulled = false; // su caja es la de reposo; ver character3d.js
      meshes.set(obj.name, obj);
    }
  });

  return { root, model, bones, meshes, scale };
}

/**
 * Complexión por receta (`build` en characters3d.json), escalando huesos.
 * Sin morph targets es el único camino, y a esta cámara y con este low-poly
 * se lee de sobra. NUNCA toca el eje Y: la altura es sagrada (canon del
 * reparto) y la pone `height`, no esto.
 *
 *  · `width` corpulencia general: escala las caderas a lo ancho, y como TODO
 *    el esqueleto cuelga de ellas, engorda el cuerpo entero sin subirlo.
 *  · `depth` lo mismo a lo hondo (por defecto, el mismo valor que width).
 *  · `chest` solo el torso de pecho para arriba: hombros y espalda anchos
 *    sin tocar caderas ni piernas (es lo que diferencia a Steven de Giuli).
 *  · `belly` barriga: el espinazo bajo, sobre todo hacia delante. 0 = nada.
 *  · `head` la cabeza, uniforme — palanca de caricatura.
 *
 * Las escalas SOBREVIVEN a la caminata porque los clips llegan sin pistas de
 * escala (ver `stripScaleTracks`). Si un clip volviera a traerlas, esto se
 * desharía en el primer paso sin que nada avise.
 */
export function applyBuild(bones, { width = 1, depth = null, chest = 1, belly = 0, head = 1 } = {}) {
  const d = depth ?? width;
  if (width === 1 && d === 1 && chest === 1 && belly === 0 && head === 1) return;

  const set = (name, x, y, z) => {
    const bone = bones.get(name);
    if (bone) bone.scale.set(x, y, z);
  };

  set("Hips", width, 1, d);
  set("Chest", chest, 1, 1 + (chest - 1) * 0.7);
  if (belly) set("Spine", 1 + belly * 0.35, 1, 1 + belly * 0.8);
  set("Head", head, head, head);
}

