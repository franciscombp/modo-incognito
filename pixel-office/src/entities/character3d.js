import * as THREE from "three";
import { screenToGround, facingFromGround } from "../scene/iso.js";

/**
 * PERSONAJES 3D COZY.
 *
 * Sustituye a los sprites planos (`sprite.js`) por muñecos low-poly montados
 * en el momento con primitivas de Three.js: cabezones, sin textura, de color
 * plano y contorno redondeado. No hay ningún .glb ni ningún PNG detrás — un
 * personaje ES su receta (ver `public/data/characters3d.json`), y eso es lo
 * que permite tener un builder en vez de modelar uno por uno.
 *
 * Mantiene la API pública de `CharacterSprite` a propósito, para que
 * player.js / npc.js / boss.js / crossing3d.js solo cambien el import:
 *   object · setPosition · setFacing · setMoving · setPose · setTint · update
 *   setSheet · setActionSheet · setRig · hasPoses · height · facing
 *
 * Lo que ANTES venía del pliego de dibujo y ahora es procedural:
 *  · el ciclo de caminata (las piernas y los brazos se balancean solos);
 *  · las cuatro direcciones, que pasan a ser un giro de verdad, continuo;
 *  · las poses de acción, que ya no dependen de que el pliego del personaje
 *    las tenga dibujadas — todos pueden hacerlas todas.
 */

// ---------------------------------------------------------------------------
// Geometrías compartidas. Se crean una vez y se reutilizan escalando el mesh:
// con ~25 personajes en el piso, una geometría por pieza y por personaje era
// la diferencia entre ir fluido y no ir.
// ---------------------------------------------------------------------------
const UNIT = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  blob: new THREE.SphereGeometry(1, 10, 8), // rizos, matas de pelo
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 8),
  disc: new THREE.CircleGeometry(1, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};

/** Las cuatro direcciones de siempre, ahora solo como puntos de referencia. */
export const ROW_BY_FACING = { south: 0, west: 1, east: 2, north: 3 };

/** Las mismas ocho poses que tenía el pliego de acciones. */
export const POSES = {
  work: 0,
  sleep: 1,
  coffee: 2,
  eat: 3,
  movie: 4,
  phone: 5,
  scared: 6,
  shrug: 7,
};

export const DEFAULT_RIG = {
  walk: { fps: 8, rows: ROW_BY_FACING },
  actions: { fps: 3, poses: POSES },
  idle: null,
};

/**
 * Lo que sabe montar el motor. El builder (builder/personajes.html) lee estas
 * listas para armar sus desplegables, así que no puede ofrecer un peinado que
 * el juego no dibuje ni quedarse corto cuando se añade uno nuevo.
 */
export const HAIR_STYLES = ["short", "fade", "spiky", "wavy", "long", "afro", "bun", "bald"];
export const TOP_STYLES = ["tee", "polo", "sweater", "hoodie"];
export const BOTTOM_STYLES = ["pants", "jeans", "cargo", "shorts", "skirt"];
export const ACCESSORIES = ["glasses", "sunglasses", "hoops", "cap"];

/**
 * Proporciones, en fracción de la altura total, medidas desde el suelo. Son de
 * dibujo animado a propósito: la cabeza se come casi la mitad del muñeco y las
 * piernas son cortas y gordas, como en las referencias. Tocar esto cambia a
 * TODO el reparto de golpe.
 */
const P = {
  headR: 0.205, // radio de la cabeza (su coronilla queda justo en 1.0)
  headY: 0.79, // centro de la cabeza
  torsoTop: 0.63,
  torsoBottom: 0.34,
  torsoR: 0.175,
  hipY: 0.38, // de dónde cuelgan las piernas
  legR: 0.075,
  shoeH: 0.075,
  shoulderY: 0.585,
  shoulderX: 0.175, // al filo de la silueta, para que los brazos se lean
  armR: 0.058,
  upperArm: 0.145,
  foreArm: 0.135, // la mano acaba a media pierna, como en las referencias
};

/**
 * Una cápsula de radio y ALTO TOTAL dados.
 *
 * CapsuleGeometry(1, 1) no mide una unidad: mide tres (el cilindro más los dos
 * casquetes), así que escalarla por el largo que quieres la deja al triple. Es
 * lo que hacía que las piernas atravesaran el suelo y los zapatos quedaran
 * flotando por debajo.
 */
function capsule(material, radius, totalHeight) {
  const mesh = new THREE.Mesh(UNIT.capsule, material);
  mesh.scale.set(radius, totalHeight / 3, radius);
  return mesh;
}

// ---------------------------------------------------------------------------
// Poses. Cada una son DOS fotogramas entre los que el muñeco va y viene, igual
// que las dos celdas del pliego dibujado — pero interpolado, que es lo que lo
// hace parecer vivo en vez de un GIF de dos cuadros.
//
// Ángulos en radianes. En los brazos, x NEGATIVO es hacia delante (hacia la
// cámara); z aleja el brazo del cuerpo.
// ---------------------------------------------------------------------------
const REST = {
  torso: [0, 0, 0],
  head: [0, 0, 0],
  // Los brazos descansan algo separados del cuerpo: pegados al torso y del
  // mismo color de la prenda, desaparecían en la silueta.
  armL: [0, 0, 0.2],
  armR: [0, 0, -0.2],
  elbowL: [-0.12, 0, 0],
  elbowR: [-0.12, 0, 0],
  legL: [0, 0, 0],
  legR: [0, 0, 0],
  lift: 0,
};

const POSE_LIBRARY = {
  // Teclear: inclinada sobre la mesa, las dos manos bien al frente. Visto
  // desde la cámara del piso (picada), un brazo que se adelanta poco no se
  // distingue de uno que cuelga — por eso las amplitudes son generosas.
  work: {
    speed: 2.6,
    prop: null,
    a: { torso: [0.14, 0, 0], head: [0.22, 0, 0], armL: [-1.35, 0, 0.25], armR: [-1.4, 0, -0.25], elbowL: [-0.75, 0, 0], elbowR: [-0.68, 0, 0] },
    b: { torso: [0.14, 0, 0], head: [0.24, 0, 0], armL: [-1.42, 0, 0.25], armR: [-1.32, 0, -0.25], elbowL: [-0.62, 0, 0], elbowR: [-0.82, 0, 0] },
  },
  // Dormida de pie, que es el deporte nacional de la oficina.
  sleep: {
    speed: 1.1,
    prop: null,
    a: { torso: [0.16, 0, 0.05], head: [0.45, 0, 0.28], armL: [0.1, 0, 0.12], armR: [0.1, 0, -0.12], lift: -0.012 },
    b: { torso: [0.2, 0, 0.05], head: [0.52, 0, 0.32], armL: [0.14, 0, 0.12], armR: [0.14, 0, -0.12], lift: 0.006 },
  },
  // Café: la taza sube a la boca y baja. El test check-poses vive de esto.
  coffee: {
    speed: 1.5,
    prop: "cup",
    a: { head: [0.08, -0.1, 0], armR: [-1.15, 0, -0.2], elbowR: [-1.5, 0, 0], armL: [0, 0, 0.2] },
    b: { head: [-0.02, -0.1, 0], armR: [-0.72, 0, -0.3], elbowR: [-1.05, 0, 0], armL: [0, 0, 0.2] },
  },
  // Comer: el plato en una mano, la otra va y viene a la boca.
  eat: {
    speed: 1.9,
    prop: "plate",
    a: { head: [0.14, 0, 0], armL: [-1.0, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-1.1, 0, -0.2], elbowR: [-1.5, 0, 0] },
    b: { head: [0.02, 0, 0], armL: [-1.0, 0, 0.3], elbowL: [-1.15, 0, 0], armR: [-0.8, 0, -0.3], elbowR: [-0.95, 0, 0] },
  },
  // Ver la peli: brazos cruzados sobre el pecho, mirando un poco hacia arriba.
  movie: {
    speed: 0.9,
    prop: null,
    a: { head: [-0.12, 0.06, 0], armL: [-0.95, 0, 0.55], elbowL: [-1.75, 0, -0.6], armR: [-0.88, 0, -0.55], elbowR: [-1.8, 0, 0.6] },
    b: { head: [-0.1, -0.06, 0], armL: [-0.98, 0, 0.55], elbowL: [-1.7, 0, -0.6], armR: [-0.91, 0, -0.55], elbowR: [-1.85, 0, 0.6] },
  },
  // El móvil: la pose de fingir que trabajas por antonomasia.
  phone: {
    speed: 1.7,
    prop: "phone",
    a: { head: [0.32, -0.1, 0], torso: [0.05, 0, 0], armR: [-1.0, 0, -0.25], elbowR: [-1.2, 0, 0], armL: [-0.6, 0, 0.3], elbowL: [-1.1, 0, 0] },
    b: { head: [0.28, -0.08, 0], torso: [0.05, 0, 0], armR: [-0.95, 0, -0.28], elbowR: [-1.32, 0, 0], armL: [-0.6, 0, 0.3], elbowL: [-1.1, 0, 0] },
  },
  // Susto: manos arriba y cuerpo echado atrás.
  scared: {
    speed: 5.5,
    prop: null,
    a: { torso: [-0.2, 0, 0], head: [-0.25, 0.1, 0], armL: [-2.3, 0, 0.6], elbowL: [-0.5, 0, 0], armR: [-2.25, 0, -0.6], elbowR: [-0.5, 0, 0], lift: 0.01 },
    b: { torso: [-0.16, 0, 0], head: [-0.22, -0.1, 0], armL: [-2.4, 0, 0.7], elbowL: [-0.4, 0, 0], armR: [-2.35, 0, -0.7], elbowR: [-0.4, 0, 0], lift: 0 },
  },
  // Encogerse de hombros: "yo qué sé, a mí no me han dicho nada".
  shrug: {
    speed: 1.3,
    prop: null,
    a: { head: [0.05, 0, 0.16], armL: [-0.2, 0, 1.15], elbowL: [-1.1, 0, 0], armR: [-0.2, 0, -1.1], elbowR: [-1.05, 0, 0], lift: 0.008 },
    b: { head: [0.02, 0, 0.2], armL: [-0.15, 0, 1.25], elbowL: [-1.2, 0, 0], armR: [-0.15, 0, -1.2], elbowR: [-1.15, 0, 0], lift: 0.012 },
  },
};

// ---------------------------------------------------------------------------
// Receta por defecto: el compañero genérico. Cualquier campo que falte en
// characters3d.json sale de aquí, así que una receta puede ser tan corta como
// `{ "top": { "color": "#c02018" } }` y seguir dando un personaje entero.
// ---------------------------------------------------------------------------
export const DEFAULT_RECIPE = {
  skin: "#e8b48c",
  hair: { color: "#3a2c26", style: "short" },
  beard: null,
  eyes: "#2a2118",
  top: { color: "#8fa8bd", style: "tee" },
  bottom: { color: "#3d4358", style: "pants" },
  shoes: { color: "#e8e2d8" },
  badge: "#7a5cc4", // el cordón morado que llevan todos en el pliego
  accessories: [],
  build: { width: 1, belly: 0 },
};

const CUP = "#f4efe6";
const PHONE = "#22252e";

function mergeRecipe(recipe) {
  const r = recipe ?? {};
  const sub = (key) => {
    const value = r[key];
    if (value === null) return null;
    if (typeof value === "string") return { ...DEFAULT_RECIPE[key], color: value };
    return { ...DEFAULT_RECIPE[key], ...(value ?? {}) };
  };
  return {
    skin: r.skin ?? DEFAULT_RECIPE.skin,
    eyes: r.eyes ?? DEFAULT_RECIPE.eyes,
    hair: sub("hair"),
    beard: r.beard === undefined ? DEFAULT_RECIPE.beard : r.beard,
    top: sub("top"),
    bottom: sub("bottom"),
    shoes: sub("shoes"),
    badge: r.badge === undefined ? DEFAULT_RECIPE.badge : r.badge,
    accessories: r.accessories ?? DEFAULT_RECIPE.accessories,
    build: { ...DEFAULT_RECIPE.build, ...(r.build ?? {}) },
  };
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
  // El cuerpo se ajusta al texto en vez de al revés: "COSA 1" y "EQUIPO
  // CANALES" tienen que caber los dos sin salirse de la camiseta.
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

    this._materials = [];
    this._built = null;
    this._props = {};

    this.facing = "south";
    this._yaw = 0;
    this._targetYaw = 0;
    this._moving = false;
    this._walkPhase = 0;
    this._tint = 1;

    // Pose en curso y su mezcla entre los dos fotogramas.
    this._pose = null;
    this._poseName = null;
    this._poseT = 0;
    this._blend = 0; // 0 = de pie, 1 = pose aplicada del todo

    // Animación de espera: si lleva un rato quieta, saca el móvil o se encoge
    // de hombros. Igual que en sprite.js, sale del rig del personaje.
    this._stillFor = 0;
    this._idlePose = null;
    this._idleLeft = 0;

    this.setRig(rig);
    this.setRecipe(recipe);
    this.setFacing("south");
    this._yaw = this._targetYaw; // sin giro de entrada en el primer frame
  }

  // -------------------------------------------------------------------------
  // Construcción del muñeco
  // -------------------------------------------------------------------------

  /** Rehace el muñeco entero con otra receta. */
  setRecipe(recipe) {
    this._disposeBuild();
    const r = mergeRecipe(recipe);
    this.recipe = r;

    const H = this.height;
    const mat = (color, extra) => {
      const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), ...extra });
      m.userData.base = new THREE.Color(color);
      this._materials.push(m);
      return m;
    };

    const skin = mat(r.skin);
    const hair = mat(r.hair.color);
    const top = mat(r.top.color);
    const bottom = mat(r.bottom.color);
    const shoes = mat(r.shoes.color);
    const dark = mat(r.eyes);

    const width = r.build.width ?? 1;
    const root = new THREE.Group(); // todo el cuerpo, para girarlo de una pieza
    this.object.add(root);

    const body = new THREE.Group(); // sube y baja al caminar
    root.add(body);

    // --- piernas ---
    // La cadera es el punto de giro; todo lo que cuelga se mide desde ahí, en
    // negativo, para que el zapato acabe exactamente en el suelo.
    const hipY = P.hipY * H;
    const shoeH = P.shoeH * H;
    const legR = P.legR * H * width;
    const legLen = hipY - shoeH * 0.45; // se mete un poco dentro del zapato
    const legs = {};
    for (const side of ["L", "R"]) {
      const hinge = new THREE.Group();
      hinge.position.set((side === "L" ? 1 : -1) * legR * 1.15, hipY, 0);
      body.add(hinge);

      const leg = capsule(bottom, legR, legLen);
      leg.position.y = -legLen / 2;
      hinge.add(leg);

      // Zapatones: en las referencias el pie es una pieza gorda y clara que
      // ancla al personaje al suelo, no un detalle.
      const foot = new THREE.Mesh(UNIT.sphere, shoes);
      foot.scale.set(legR * 1.15, shoeH * 0.62, legR * 2.0);
      foot.position.set(0, -hipY + shoeH * 0.5, legR * 0.7);
      hinge.add(foot);

      legs[side] = hinge;
    }

    // Falda y pantalón corto: cuelgan de la cadera, no de la pierna, para que
    // no se retuerzan con la zancada. El resto de estilos de `bottom` se
    // distinguen solo por el color — son el mismo pantalón.
    if (r.bottom.style === "skirt" || r.bottom.style === "shorts") {
      const isSkirt = r.bottom.style === "skirt";
      const piece = new THREE.Mesh(UNIT.cylinder, bottom);
      const rTop = P.torsoR * H * width * 0.78;
      piece.scale.set(rTop * (isSkirt ? 1.5 : 1.15), hipY * (isSkirt ? 0.42 : 0.3), rTop * (isSkirt ? 1.4 : 1.1));
      piece.position.y = hipY - piece.scale.y / 2;
      body.add(piece);
    }

    // --- torso ---
    const torso = new THREE.Group();
    torso.position.y = P.torsoBottom * H;
    body.add(torso);

    const torsoH = (P.torsoTop - P.torsoBottom) * H;
    const chestR = P.torsoR * H * width * (1 + (r.build.belly ?? 0) * 0.5);
    const chest = capsule(top, chestR, torsoH * 1.5);
    chest.scale.z *= 0.82;
    chest.position.y = torsoH * 0.42;
    torso.add(chest);

    // La sudadera con capucha lleva su rodete detrás del cuello y un bolsillo
    // delantero: es lo que la distingue de una camiseta a esta distancia.
    if (r.top.style === "hoodie") {
      const hood = new THREE.Mesh(UNIT.sphere, top);
      hood.scale.set(chestR * 0.95, chestR * 0.6, chestR * 0.7);
      hood.position.set(0, torsoH * 0.92, -chestR * 0.55);
      torso.add(hood);

      const pocket = new THREE.Mesh(UNIT.box, mat(shadeOf(r.top.color, -0.05)));
      pocket.scale.set(chestR * 1.15, torsoH * 0.22, chestR * 0.3);
      pocket.position.set(0, torsoH * 0.3, chestR * 0.72);
      torso.add(pocket);
    }

    if (r.top.print) {
      const print = new THREE.Mesh(
        UNIT.plane,
        new THREE.MeshBasicMaterial({
          map: printTexture(r.top.print, r.top.printColor ?? "#f4efe6"),
          transparent: true,
          depthWrite: false,
        })
      );
      print.scale.set(chestR * 1.5, chestR * 0.75, 1);
      print.position.set(0, torsoH * 0.6, chestR * 0.84);
      torso.add(print);
    }

    // El cordón morado de la credencial lo lleva TODO el mundo en los pliegos:
    // es lo que hace que el reparto se lea como la misma oficina.
    if (r.badge) {
      const lanyard = mat(r.badge);
      // El pecho es una cápsula de profundidad 0.82·chestR, así que la
      // credencial tiene que ir claramente por delante de eso o se queda
      // enterrada dentro del jersey y no se ve ni rastro de ella.
      for (const dir of [-1, 1]) {
        const strap = new THREE.Mesh(UNIT.box, lanyard);
        strap.scale.set(chestR * 0.14, torsoH * 0.5, chestR * 0.1);
        strap.position.set(dir * chestR * 0.42, torsoH * 0.72, chestR * 0.9);
        strap.rotation.z = dir * 0.22;
        torso.add(strap);
      }
      const card = new THREE.Mesh(UNIT.box, lanyard);
      card.scale.set(chestR * 0.4, chestR * 0.52, chestR * 0.12);
      card.position.set(0, torsoH * 0.44, chestR * 0.98);
      torso.add(card);
    }

    // --- brazos, con codo: sin él, ni el café ni el móvil se leen ---
    const arms = {};
    for (const side of ["L", "R"]) {
      const dir = side === "L" ? 1 : -1;
      const shoulder = new THREE.Group();
      shoulder.position.set(dir * P.shoulderX * H * width, (P.shoulderY - P.torsoBottom) * H, 0);
      torso.add(shoulder);

      const armR = P.armR * H;
      const upperLen = P.upperArm * H;
      const foreLen = P.foreArm * H;

      const upper = capsule(top, armR, upperLen);
      upper.position.y = -upperLen / 2;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -upperLen;
      shoulder.add(elbow);

      // La manga corta deja el antebrazo de piel; la larga, de tela.
      const sleeveLong = r.top.style === "hoodie" || r.top.style === "sweater";
      const fore = capsule(sleeveLong ? top : skin, armR * 0.9, foreLen);
      fore.position.y = -foreLen / 2;
      elbow.add(fore);

      const hand = new THREE.Group();
      hand.position.y = -foreLen;
      elbow.add(hand);

      const fist = new THREE.Mesh(UNIT.sphere, skin);
      fist.scale.setScalar(armR * 1.2);
      hand.add(fist);

      arms[side] = { shoulder, elbow, hand };
    }

    // --- cabeza ---
    // El grupo de la cabeza pivota en el cuello (arriba del torso) para que
    // asentir y ladear salgan del sitio correcto; el cráneo va desplazado.
    const head = new THREE.Group();
    head.position.y = torsoH;
    torso.add(head);

    // Dentro va otro grupo con una inclinación FIJA hacia arriba. La cámara
    // del juego mira desde arriba, así que un muñeco con la cabeza recta le
    // enseña la coronilla y esconde justo lo único que tiene expresión. Va en
    // su propio grupo, y no en la rotación de `head`, porque las poses
    // sobrescriben esa rotación entera y se llevarían la inclinación por
    // delante.
    const tilt = new THREE.Group();
    tilt.rotation.x = -0.17;
    head.add(tilt);

    const headR = P.headR * H;
    const faceY = (P.headY - P.torsoTop) * H;
    const skull = new THREE.Mesh(UNIT.sphere, skin);
    skull.scale.set(headR, headR * 1.04, headR * 0.96);
    skull.position.y = faceY;
    tilt.add(skull);

    // Ojos grandes y muy separados: es de donde sale toda la simpatía del
    // muñeco. Con puntos pequeños parecía un maniquí.
    const eyeZ = headR * 0.88;
    for (const dir of [-1, 1]) {
      const eye = new THREE.Mesh(UNIT.sphere, dark);
      eye.scale.set(headR * 0.15, headR * 0.2, headR * 0.1);
      eye.position.set(dir * headR * 0.36, faceY + headR * 0.04, eyeZ);
      tilt.add(eye);

      const spark = new THREE.Mesh(UNIT.sphere, mat("#ffffff"));
      spark.scale.setScalar(headR * 0.045);
      spark.position.set(dir * headR * 0.32, faceY + headR * 0.12, eyeZ * 1.06);
      tilt.add(spark);

      const brow = new THREE.Mesh(UNIT.box, hair);
      brow.scale.set(headR * 0.26, headR * 0.05, headR * 0.06);
      brow.position.set(dir * headR * 0.36, faceY + headR * 0.32, eyeZ * 0.98);
      brow.rotation.z = dir * 0.12;
      tilt.add(brow);
    }

    const nose = new THREE.Mesh(UNIT.sphere, mat(shadeOf(r.skin, -0.07)));
    nose.scale.set(headR * 0.1, headR * 0.09, headR * 0.1);
    nose.position.set(0, faceY - headR * 0.16, eyeZ * 1.05);
    tilt.add(nose);

    buildHair(tilt, r, { headR, faceY, hair, mat });
    if (r.beard) buildBeard(tilt, { headR, faceY, mat, color: r.beard });
    buildAccessories(tilt, r, { headR, faceY, mat });

    // --- sombra de contacto ---
    const shadow = new THREE.Mesh(
      UNIT.disc,
      new THREE.MeshBasicMaterial({
        map: getShadowTexture(),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012 * this.height;
    shadow.scale.setScalar(headR * 1.9);
    shadow.renderOrder = -1;
    root.add(shadow);

    // --- utilería de las poses, escondida hasta que toque ---
    this._props = {
      cup: makeCup(arms.R.hand, headR, mat(CUP)),
      phone: makePhone(arms.R.hand, headR, mat(PHONE)),
      plate: makePlate(arms.L.hand, headR, mat("#f2ede3"), mat("#d98a5a")),
    };

    this._built = { root, body, torso, head, arms, legs, shadow };
    this._applyPose(0);
    this.setTint(this._tint);
  }

  /** Compatibilidad con sprite.js: la "hoja" de un personaje es su receta. */
  setSheet(recipe) {
    if (!recipe) return;
    this.setRecipe(recipe);
  }

  /** Ya no hay pliego de acciones: las poses son procedurales y comunes. */
  setActionSheet() {}

  get hasPoses() {
    return true;
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

  /** `name` es una pose (work, coffee...), o null para volver a estar de pie. */
  setPose(name) {
    // Mientras corre la animación de espera, un "sin pose" no la tumba: quien
    // lo manda es el bucle del jugador en cada frame que no hace nada.
    if (name == null && this._idlePose) return;
    if (name === this._poseName) return;
    this._poseName = name ?? null;
    this._pose = name ? POSE_LIBRARY[name] ?? null : null;
    this._poseT = 0;
  }

  /**
   * Las cuatro direcciones de siempre. Se traducen a un ángulo de verdad
   * pasando por la cámara: "east" es hacia la derecha DE LA PANTALLA, y como
   * la cámara se puede orbitar, eso no es una dirección fija del mundo.
   */
  setFacing(facing) {
    if (!facing || ROW_BY_FACING[facing] === undefined) return;
    this.facing = facing;
    const screen = { south: [0, -1], north: [0, 1], east: [1, 0], west: [-1, 0] }[facing];
    const { dx, dz } = screenToGround(screen[0], screen[1]);
    this._targetYaw = Math.atan2(dx, dz);
  }

  /**
   * Giro continuo hacia una dirección del mundo. Es lo que de verdad quieres
   * en 3D — las cuatro direcciones eran una limitación del pliego, no del
   * personaje. `facing` se sigue actualizando porque hay código (y un test)
   * que lo lee.
   */
  setHeading(dx, dz) {
    if (!dx && !dz) return;
    this._targetYaw = Math.atan2(dx, dz);
    // El nombre sale del mismo reparto de siempre (iso.js) y no de un cálculo
    // paralelo: hay código y un test que comparan `facing` con hacia dónde
    // apunta el cono del jefe, y dos formas distintas de redondear la
    // dirección los harían discrepar.
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
  }

  /** Atenúa el muñeco mientras está a cubierto, para que se lea de un vistazo. */
  setTint(scalar) {
    this._tint = scalar;
    for (const m of this._materials) {
      if (m.userData.base) m.color.copy(m.userData.base).multiplyScalar(scalar);
    }
  }

  update(dt) {
    if (!this._built) return;
    this._updateIdle(dt);
    this._updateTurn(dt);

    // La pose entra y sale con una mezcla, en vez de saltar de golpe.
    const wantBlend = this._pose ? 1 : 0;
    this._blend += (wantBlend - this._blend) * Math.min(1, dt * 9);

    if (this._pose) this._poseT += dt * (this._pose.speed ?? 1.5);
    if (this._moving && this._blend < 0.5) this._walkPhase += dt * (this.rig.walk.fps || 8) * 0.78;

    this._applyPose(dt);
  }

  /** El giro es suave: pegar el cambio de dirección se ve robótico. */
  _updateTurn(dt) {
    let delta = this._targetYaw - this._yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this._yaw += delta * Math.min(1, dt * 12);
    this._built.root.rotation.y = this._yaw;
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

  /**
   * Coloca todas las articulaciones del frame: mezcla la pose (si hay) con el
   * ciclo de caminata, y deja la utilería a la vista solo si la pose la pide.
   */
  _applyPose() {
    const { body, torso, head, arms, legs } = this._built;
    const H = this.height;
    const blend = this._blend;

    // Fotograma A <-> B con una onda suave: ni salta ni se queda a medias.
    const pose = this._pose;
    const wave = pose ? (1 - Math.cos(this._poseT)) / 2 : 0;
    const joint = (name) => {
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

    // Ciclo de caminata: piernas y brazos en oposición, y el cuerpo botando al
    // doble de frecuencia (un bote por cada pisada).
    const walking = this._moving ? 1 - blend : 0;
    const swing = Math.sin(this._walkPhase) * 0.72 * walking;
    const bob = Math.abs(Math.sin(this._walkPhase)) * 0.022 * H * walking;

    const set = (obj, name, extraX = 0) => {
      const [x, y, z] = joint(name);
      obj.rotation.set(x * blend + extraX, y * blend, z * blend);
    };

    set(torso, "torso");
    set(head, "head");
    set(legs.L, "legL", swing);
    set(legs.R, "legR", -swing);
    set(arms.L.shoulder, "armL", -swing * 0.55);
    set(arms.R.shoulder, "armR", swing * 0.55);
    set(arms.L.elbow, "elbowL");
    set(arms.R.elbow, "elbowR");

    body.position.y = bob + lift * H * blend;

    const wanted = pose?.prop ?? null;
    for (const [name, mesh] of Object.entries(this._props)) {
      if (mesh) mesh.visible = name === wanted && blend > 0.4;
    }
  }

  /**
   * Solo para tools/check-poses.mjs: una huella del estado de las
   * articulaciones. Con el pliego bastaba mirar el offset de la textura para
   * saber que la pose se movía; en 3D el equivalente es esto.
   */
  poseSignature() {
    if (!this._built) return "";
    const { arms, head } = this._built;
    const n = (v) => v.toFixed(3);
    return [
      n(head.rotation.x),
      n(arms.R.shoulder.rotation.x),
      n(arms.R.elbow.rotation.x),
      n(arms.L.shoulder.rotation.x),
      n(arms.L.elbow.rotation.x),
    ].join(",");
  }

  _disposeBuild() {
    if (this._built) this.object.remove(this._built.root);
    this._materials.forEach((m) => {
      m.map?.dispose();
      m.dispose();
    });
    this._materials = [];
    this._props = {};
    this._built = null;
  }

  dispose() {
    this._disposeBuild();
  }
}

// ---------------------------------------------------------------------------
// Piezas sueltas
// ---------------------------------------------------------------------------

function shadeOf(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/**
 * El pelo es lo que más distingue a un personaje de otro de lejos, así que
 * cada estilo es una silueta clara: el afro de Crispo se reconoce a tres
 * mesas de distancia y la melena de Giuli también.
 */
function buildHair(head, r, { headR, faceY, hair, mat }) {
  const style = r.hair.style ?? "short";
  const put = (geo, material, sx, sy, sz, x, y, z) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, faceY + y, z);
    head.add(mesh);
    return mesh;
  };

  // Casquete común: todos los estilos lo llevan menos el calvo.
  if (style !== "bald") {
    put(UNIT.sphere, hair, headR * 1.02, headR * 1.02, headR * 1.0, 0, headR * 0.16, -headR * 0.05);
  }

  const streak = r.hair.streak ? mat(r.hair.streak) : null;

  switch (style) {
    case "afro": {
      // Una nube de rizos: es la silueta, no el detalle, lo que lo vende.
      const curls = 16;
      for (let i = 0; i < curls; i++) {
        const a = (i / curls) * Math.PI * 2;
        const ring = i % 2 ? 1 : 0.72;
        put(
          UNIT.blob,
          hair,
          headR * 0.42,
          headR * 0.42,
          headR * 0.42,
          Math.cos(a) * headR * 1.05 * ring,
          headR * (0.3 + (i % 3) * 0.22),
          Math.sin(a) * headR * 0.95 * ring - headR * 0.05
        );
      }
      put(UNIT.sphere, hair, headR * 1.25, headR * 1.1, headR * 1.2, 0, headR * 0.42, -headR * 0.05);
      break;
    }
    case "long": {
      // Melena: dos masas a los lados y una detrás, hasta el pecho.
      for (const dir of [-1, 1]) {
        put(
          UNIT.capsule,
          hair,
          headR * 0.42,
          headR * 0.62,
          headR * 0.42,
          dir * headR * 0.86,
          -headR * 0.5,
          -headR * 0.1
        );
        if (streak) {
          put(
            UNIT.capsule,
            streak,
            headR * 0.2,
            headR * 0.5,
            headR * 0.2,
            dir * headR * 1.02,
            -headR * 0.62,
            headR * 0.12
          );
        }
      }
      put(UNIT.capsule, hair, headR * 0.78, headR * 0.6, headR * 0.5, 0, -headR * 0.45, -headR * 0.62);
      break;
    }
    case "wavy": {
      // Ondas con volumen, más ancha que larga (la de Giuli en el pliego).
      for (const dir of [-1, 1]) {
        put(UNIT.sphere, hair, headR * 0.6, headR * 0.72, headR * 0.55, dir * headR * 0.92, -headR * 0.18, -headR * 0.08);
        put(UNIT.sphere, hair, headR * 0.45, headR * 0.5, headR * 0.42, dir * headR * 0.88, -headR * 0.78, -headR * 0.02);
        if (streak) {
          put(UNIT.capsule, streak, headR * 0.16, headR * 0.42, headR * 0.16, dir * headR * 1.06, -headR * 0.6, headR * 0.2);
        }
      }
      put(UNIT.sphere, hair, headR * 0.9, headR * 0.7, headR * 0.6, 0, -headR * 0.35, -headR * 0.66);
      break;
    }
    case "spiky": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI - Math.PI / 2;
        const spike = put(
          UNIT.cone,
          hair,
          headR * 0.26,
          headR * 0.42,
          headR * 0.26,
          Math.sin(a) * headR * 0.55,
          headR * 1.0,
          Math.cos(a) * headR * 0.3 - headR * 0.1
        );
        spike.rotation.z = -Math.sin(a) * 0.5;
      }
      break;
    }
    case "bun": {
      put(UNIT.sphere, hair, headR * 0.42, headR * 0.42, headR * 0.42, 0, headR * 0.95, -headR * 0.7);
      break;
    }
    case "fade":
    case "short":
    default:
      break;
  }
}

function buildBeard(head, { headR, faceY, mat, color }) {
  const beard = mat(color);
  // Solo la mandíbula y el bigote: una barba más grande le tapa la cara al
  // muñeco y lo deja sin expresión, que es justo lo que no queremos.
  const jaw = new THREE.Mesh(UNIT.sphere, beard);
  jaw.scale.set(headR * 0.62, headR * 0.34, headR * 0.58);
  jaw.position.set(0, faceY - headR * 0.6, headR * 0.34);
  head.add(jaw);

  const moustache = new THREE.Mesh(UNIT.box, beard);
  moustache.scale.set(headR * 0.34, headR * 0.09, headR * 0.12);
  moustache.position.set(0, faceY - headR * 0.32, headR * 0.85);
  head.add(moustache);
}

/** Gafas, gafas de sol y aros: los detalles por los que el equipo se reconoce. */
function buildAccessories(head, r, { headR, faceY, mat }) {
  const has = (name) => r.accessories?.includes(name);

  if (has("glasses") || has("sunglasses")) {
    const tinted = has("sunglasses");
    const frame = mat(r.glassesColor ?? (tinted ? "#1e1e24" : "#6b5a48"));
    const lensMat = tinted ? frame : mat("#dff0ff", { transparent: true, opacity: 0.35 });

    for (const dir of [-1, 1]) {
      const lens = new THREE.Mesh(UNIT.cylinder, lensMat);
      lens.scale.set(headR * 0.28, headR * 0.05, headR * 0.28);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(dir * headR * 0.34, faceY + headR * 0.06, headR * 0.93);
      head.add(lens);

      const rim = new THREE.Mesh(UNIT.cylinder, frame);
      rim.scale.set(headR * 0.32, headR * 0.04, headR * 0.32);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(dir * headR * 0.34, faceY + headR * 0.06, headR * 0.9);
      head.add(rim);

      const arm = new THREE.Mesh(UNIT.box, frame);
      arm.scale.set(headR * 0.06, headR * 0.06, headR * 0.5);
      arm.position.set(dir * headR * 0.62, faceY + headR * 0.06, headR * 0.62);
      head.add(arm);
    }
    const bridge = new THREE.Mesh(UNIT.box, frame);
    bridge.scale.set(headR * 0.16, headR * 0.05, headR * 0.06);
    bridge.position.set(0, faceY + headR * 0.08, headR * 0.94);
    head.add(bridge);
  }

  if (has("hoops")) {
    const gold = mat(r.hoopColor ?? "#e8b73a");
    for (const dir of [-1, 1]) {
      const hoop = new THREE.Mesh(UNIT.cylinder, gold);
      hoop.scale.set(headR * 0.2, headR * 0.04, headR * 0.2);
      hoop.rotation.z = Math.PI / 2;
      hoop.position.set(dir * headR * 0.95, faceY - headR * 0.3, headR * 0.1);
      head.add(hoop);
    }
  }

  if (has("cap")) {
    const cap = mat(r.capColor ?? "#2f4a7a");
    const crown = new THREE.Mesh(UNIT.sphere, cap);
    crown.scale.set(headR * 1.06, headR * 0.72, headR * 1.04);
    crown.position.set(0, faceY + headR * 0.42, -headR * 0.04);
    head.add(crown);
    const brim = new THREE.Mesh(UNIT.cylinder, cap);
    brim.scale.set(headR * 0.85, headR * 0.05, headR * 0.85);
    brim.position.set(0, faceY + headR * 0.3, headR * 0.55);
    head.add(brim);
  }
}

// La utilería se apoya SOBRE el puño y sobresale hacia delante. La primera
// versión la metía dentro de la mano y con menos radio que ella, así que las
// tres piezas existían y no se veía ninguna.
function makeCup(hand, headR, material) {
  const cup = new THREE.Mesh(UNIT.cylinder, material);
  cup.scale.set(headR * 0.28, headR * 0.2, headR * 0.28);
  cup.position.set(0, headR * 0.16, headR * 0.2);
  cup.visible = false;
  hand.add(cup);
  return cup;
}

function makePhone(hand, headR, material) {
  const phone = new THREE.Mesh(UNIT.box, material);
  phone.scale.set(headR * 0.42, headR * 0.66, headR * 0.07);
  phone.position.set(0, headR * 0.2, headR * 0.22);
  phone.rotation.x = -0.45;
  phone.visible = false;
  hand.add(phone);
  return phone;
}

function makePlate(hand, headR, plateMat, foodMat) {
  const plate = new THREE.Mesh(UNIT.cylinder, plateMat);
  plate.scale.set(headR * 0.52, headR * 0.045, headR * 0.52);
  plate.position.set(0, headR * 0.14, headR * 0.24);
  plate.visible = false;
  hand.add(plate);

  const food = new THREE.Mesh(UNIT.sphere, foodMat);
  food.scale.set(0.5, 3.2, 0.5);
  food.position.y = 2.4;
  plate.add(food);
  return plate;
}

/** Alias para que los ficheros que ya existían cambien solo el import. */
export { Character3D as CharacterSprite };
