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
 * Del rig del modelo al nuestro.
 *
 * Es lo que hace que NO haya que reescribir las poses: `POSE_LIBRARY` habla de
 * "LeftArm" y "Spine", así que a los huesos importados se les cambia el nombre
 * al cargarlos y todo lo demás sigue funcionando igual.
 *
 * El mapeo sale de los nodos del propio glTF. Ojo con dos:
 *  · `wrist * ` es nuestra mano (el modelo cuelga los dedos de ahí).
 *  · `lower_leg *.001` es el tobillo, y hace de nuestro pie — el modelo no
 *    tiene hueso de pie de verdad.
 */
export const BONE_MAP = {
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

/** Qué parte del cuerpo es cada malla, para poder darles color distinto. */
export const MESH_ROLES = {
  Object_7: "arms",
  Object_9: "body",
  Object_11: "head",
  Object_13: "neck",
};

let loading = null;

/**
 * Carga el modelo UNA vez. Todos los personajes salen de clonarlo, que es lo
 * único viable con veinticinco en pantalla.
 */
export function loadBaseModel(url) {
  if (!loading) {
    loading = new GLTFLoader().loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      renameBones(gltf.scene);
      return gltf;
    });
  }
  return loading;
}

/** Reetiqueta el esqueleto importado con nuestros nombres. */
function renameBones(root) {
  root.traverse((obj) => {
    if (obj.isBone && BONE_MAP[obj.name]) obj.name = BONE_MAP[obj.name];
  });
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
