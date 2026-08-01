import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * CUERPO BASE IMPORTADO.
 *
 * Carga el cuerpo humanoide de `public/models/base.glb` y lo deja listo para
 * que `character3d.js` le monte encima el pelo, la ropa, la cara y los
 * complementos de la receta. El cuerpo viene de fuera; todo lo que distingue a
 * un personaje de otro sigue siendo nuestro y sigue saliendo del JSON.
 *
 * El modelo es "P2u Base Modifiers", de Shedletsky_2, bajo CC BY 4.0.
 * La atribución vive en CREDITS.md y es obligatoria: no la quites mientras el
 * modelo siga aquí.
 *
 * TRES COSAS QUE EL MODELO NO TRAE, y que conviene saber antes de pelearse
 * con él:
 *  · No tiene morph targets. Se llama "Modifiers", pero los modificadores se
 *    quedaron en Blender y no sobrevivieron a la exportación. Gordo, flaco y
 *    alto se hacen ESCALANDO HUESOS (ver `applyBuild`), no con deslizadores.
 *  · No tiene huesos de pie: la pierna acaba en el tobillo. Los zapatos
 *    cuelgan de ahí.
 *  · No tiene cara. Los ojos, el rubor y la boca los seguimos poniendo
 *    nosotros, que además es lo que les da el aire de las referencias.
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

/** Qué parte del cuerpo es cada malla, para poder darles color distinto. */
export const MESH_ROLES = {
  Object_7: "arms",
  Object_9: "body",
  Object_11: "head",
  Object_13: "neck",
};

let loading = null;

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
      ready.set(url, gltf);
      return gltf;
    });
    modelCache.set(url, loading);
  }
  return modelCache.get(url);
}

/** Los que YA están en memoria, para poder montarlos sin esperar. */
const ready = new Map();

/**
 * Dónde vive un modelo. `public/` se sirve en la RAÍZ (no en `/public/`), y
 * en Pages el sitio entero cuelga de un subdirectorio: montar esta ruta a
 * mano en cada sitio es cómo se cuela un 404.
 */
export function modelUrlFor(file) {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}models/${file}`;
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
      const role = MESH_ROLES[obj.name] ?? obj.name;
      meshes.set(role, obj);
    }
  });

  return { root, model, bones, meshes, scale };
}

/**
 * Chibifica y da complexión, escalando huesos.
 *
 * Es el único camino que queda sin morph targets, y tiene un límite honesto:
 * una cabeza pensada para medir un sexto del cuerpo, agrandada al triple, no
 * se lee igual que una diseñada para ser grande. Por eso esto sale de una
 * comparativa contra el muñeco procedural y no de un número elegido a ojo.
 *
 *  · `head`  1 = como venía · 2.4 ≈ las proporciones de nuestras referencias
 *  · `width` engorda torso y extremidades sin tocar la altura
 *  · `limbs` acorta brazos y piernas, que es lo que de verdad "achaparra"
 */
export function applyBuild(bones, { head = 1, width = 1, limbs = 1, belly = 0 } = {}) {
  const set = (name, x, y, z) => {
    const bone = bones.get(name);
    if (bone) bone.scale.set(x, y, z);
  };

  set("Head", head, head, head);
  // El torso engorda a lo ancho y a lo hondo, nunca a lo alto: estirarlo en Y
  // le sube la cabeza y descoloca todo lo que cuelga de ella.
  set("Spine", width + belly * 0.5, 1, width + belly * 0.8);
  set("Chest", width, 1, width);

  for (const side of ["Left", "Right"]) {
    set(`${side}Arm`, width, limbs, width);
    set(`${side}UpLeg`, width, limbs, width);
  }
}

/**
 * Tiñe el cuerpo por partes. El modelo trae UN material para todo, así que
 * cada malla (brazos, cuerpo, cabeza, cuello) recibe el suyo — es la única
 * división de color que da el archivo sin pintar una textura.
 */
export function paintBase(meshes, { skin, body }) {
  const skinMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(skin) });
  const bodyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(body ?? skin) });
  for (const [role, mesh] of meshes) {
    mesh.material = role === "body" ? bodyMat : skinMat;
  }
  return { skinMat, bodyMat };
}
