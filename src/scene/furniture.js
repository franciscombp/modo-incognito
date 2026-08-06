import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WORLD_SCALE as S } from "./config.js";
import { cozyMaterial, SURFACES } from "./cozy.js";

// Every work zone on the blueprint prints a seat count (7, 10, 12, 14...).
// This module turns that single number into ONE big white table with that
// many chairs around it — never a scatter of separate little desks.
//
// PERFORMANCE: the floor holds ~250 chairs and ~25 tables. Built naively that
// is well over a thousand meshes, which is what made mid-range tablets crawl
// and then drop the WebGL context. So nothing here creates meshes directly:
// it records transforms into a registry, and the registry emits a handful of
// InstancedMeshes plus one merged geometry per material at the end. Draw calls
// end up in the dozens instead of the thousands.

const TABLE_H = 0.74 * S;
const TOP_T = 0.045 * S;
const CHAIR_GAP = 0.5 * S; // clear distance from the table edge to a chair
const CHAIR_R = 0.22 * S;

// ---------------------------------------------------------------- geometry
// One geometry per repeated part, built once and reused by every instance.

function chairBodyGeometry() {
  // MISMA silueta que la silla de rueditas de los personajes
  // (furnitureModels.js → createOfficeChair): asiento mullido y respaldo
  // alto un pelín reclinado. La de cilindro que había leía como banqueta de
  // bar, y chocaba verla al lado de la "de verdad" cuando un personaje
  // rodaba con la suya.
  //
  // Lo que la separa de "una caja sobre otra caja" son tres cosas, y las
  // tres se ven desde la cámara del juego: el asiento tiene CANTO (una
  // rebaba más estrecha debajo, que es lo que da grosor de espuma), el
  // respaldo se parte en lumbar y cabecero con un hueco entre medias
  // —silueta reconocible de silla de oficina— y lleva REPOSABRAZOS, que es
  // el detalle que más dice "esto es una silla de trabajo" y no una de
  // comedor.
  const partes = [];

  const seat = new THREE.BoxGeometry(CHAIR_R * 2, 0.07 * S, CHAIR_R * 1.9);
  seat.translate(0, 0.45 * S, 0);
  partes.push(seat);
  // Canto inferior: un pelín más estrecho, para que el asiento no sea un
  // ladrillo de una sola cara.
  const seatEdge = new THREE.BoxGeometry(CHAIR_R * 1.82, 0.05 * S, CHAIR_R * 1.72);
  seatEdge.translate(0, 0.4 * S, 0);
  partes.push(seatEdge);

  // Respaldo en dos piezas con hueco: lumbar ancho y cabecero estrecho.
  const lumbar = new THREE.BoxGeometry(CHAIR_R * 1.9, 0.3 * S, 0.07 * S);
  lumbar.rotateX(0.14);
  lumbar.translate(0, 0.66 * S, CHAIR_R * 0.92);
  partes.push(lumbar);
  const cabecero = new THREE.BoxGeometry(CHAIR_R * 1.5, 0.16 * S, 0.06 * S);
  cabecero.rotateX(0.14);
  cabecero.translate(0, 0.93 * S, CHAIR_R * 1.02);
  partes.push(cabecero);

  // Reposabrazos: soporte vertical + almohadilla horizontal, a cada lado.
  for (const lado of [-1, 1]) {
    const poste = new THREE.BoxGeometry(0.035 * S, 0.16 * S, 0.035 * S);
    poste.translate(lado * CHAIR_R * 0.95, 0.55 * S, CHAIR_R * 0.35);
    partes.push(poste);
    const brazo = new THREE.BoxGeometry(0.05 * S, 0.035 * S, CHAIR_R * 1.1);
    brazo.translate(lado * CHAIR_R * 0.95, 0.64 * S, CHAIR_R * 0.1);
    partes.push(brazo);
  }

  return mergeGeometries(partes, false);
}

function chairStandGeometry() {
  const column = new THREE.CylinderGeometry(0.045 * S, 0.045 * S, 0.36 * S, 6);
  column.translate(0, 0.22 * S, 0);
  // Base de ESTRELLA con rueditas, como una silla de oficina de verdad: el
  // disco plano de antes leía como taburete de bar.
  const parts = [column];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.BoxGeometry(CHAIR_R * 0.95, 0.03 * S, 0.045 * S);
    arm.rotateY(-a);
    arm.translate(Math.cos(a) * CHAIR_R * 0.48, 0.045 * S, Math.sin(a) * CHAIR_R * 0.48);
    parts.push(arm);
    const wheel = new THREE.SphereGeometry(0.032 * S, 8, 6);
    wheel.translate(Math.cos(a) * CHAIR_R * 0.9, 0.032 * S, Math.sin(a) * CHAIR_R * 0.9);
    parts.push(wheel);
  }
  return mergeGeometries(parts, false);
}

/**
 * Pod de auditorio: sillón de DOS plazas, bajo y envolvente. El armazón y
 * los cojines salen como dos instancias con la misma matriz para poder
 * darles materiales distintos sin duplicar transformaciones.
 */
function podFrameGeometry() {
  const w = 1.35 * S;
  const base = new THREE.BoxGeometry(w, 0.3 * S, 0.62 * S);
  base.translate(0, 0.15 * S, 0);
  const back = new THREE.BoxGeometry(w, 0.42 * S, 0.14 * S);
  back.rotateX(0.14);
  back.translate(0, 0.48 * S, 0.26 * S);
  const armL = new THREE.BoxGeometry(0.14 * S, 0.42 * S, 0.6 * S);
  armL.translate(-w / 2 + 0.07 * S, 0.24 * S, 0);
  const armR = armL.clone();
  armR.translate(w - 0.14 * S, 0, 0);
  return mergeGeometries([base, back, armL, armR], false);
}

function podCushionGeometry() {
  const c1 = new THREE.BoxGeometry(0.5 * S, 0.09 * S, 0.5 * S);
  c1.translate(-0.29 * S, 0.34 * S, -0.03 * S);
  const c2 = c1.clone();
  c2.translate(0.58 * S, 0, 0);
  return mergeGeometries([c1, c2], false);
}

let shared = null;
function sharedAssets() {
  if (!shared) {
    shared = {
      chairBody: chairBodyGeometry(),
      chairStand: chairStandGeometry(),
      // ── EL MONITOR VA EN DOS PIEZAS, Y ESA ES TODA LA DIFERENCIA ──────
      //
      // Antes era UNA geometría fundida (pie + cuello + pantalla) pintada
      // entera con el material EMISIVO de la pantalla: el pie y el cuello
      // brillaban igual que el panel, así que el conjunto se leía como una
      // paleta luminosa clavada en la mesa, no como una computadora.
      //
      // Ahora el chasis va con material de mueble y solo la CARA del panel
      // emite. Es lo que hace que se lea encendida: el contraste del panel
      // claro contra su propio marco oscuro, que es exactamente como se
      // reconoce un monitor de un vistazo.
      //
      // Las dos piezas se instancian con la MISMA lista de transformaciones,
      // así que no hay forma de que se desalineen.
      monitorBody: (() => {
        // Pie con peso: base ancha y poco alta, como la de un monitor real.
        const foot = new THREE.BoxGeometry(0.17 * S, 0.012 * S, 0.115 * S);
        foot.translate(0, 0.006 * S, 0);
        // Cuello en columna plana, no en cilindro: un tubo redondo se lee a
        // lápiz desde la cámara oblicua.
        const neck = new THREE.BoxGeometry(0.045 * S, 0.11 * S, 0.03 * S);
        neck.translate(0, 0.06 * S, 0);
        // Carcasa: un pelín más grande que el panel por los cuatro lados,
        // que es el marco que hace de contraste.
        const shell = new THREE.BoxGeometry(0.36 * S, 0.235 * S, 0.022 * S);
        shell.rotateX(0.08);
        shell.translate(0, 0.225 * S, 0.006 * S);
        return mergeGeometries([foot, neck, shell], false);
      })(),
      // La cara encendida: un plano fino por DELANTE de la carcasa. Va algo
      // más pequeño que ella para que quede marco visible por los cuatro
      // lados, y mira a -z (hacia quien se sienta).
      monitorScreen: (() => {
        const panel = new THREE.BoxGeometry(0.315 * S, 0.19 * S, 0.004 * S);
        panel.rotateX(0.08);
        panel.translate(0, 0.2275 * S, -0.0075 * S);
        return panel;
      })(),
      // Laptop abierta: base fina + pantalla abatida hacia atrás. Origen en
      // la bisagra, apoyada sobre la mesa. Misma división que el monitor.
      laptopBody: (() => {
        const base = new THREE.BoxGeometry(0.26 * S, 0.016 * S, 0.18 * S);
        base.translate(0, 0.008 * S, -0.02 * S);
        const lid = new THREE.BoxGeometry(0.26 * S, 0.17 * S, 0.012 * S);
        lid.rotateX(0.32);
        lid.translate(0, 0.078 * S, 0.085 * S);
        return mergeGeometries([base, lid], false);
      })(),
      laptopScreen: (() => {
        const panel = new THREE.BoxGeometry(0.225 * S, 0.142 * S, 0.004 * S);
        panel.rotateX(0.32);
        panel.translate(0, 0.0785 * S, 0.0785 * S);
        return panel;
      })(),
      // Teclado: losa fina inclinada, con una segunda losa encima algo más
      // pequeña que hace de bloque de teclas. Con una sola losa se leía como
      // un posavasos; el escalón basta para que se lea teclado.
      keyboard: (() => {
        const base = new THREE.BoxGeometry(0.3 * S, 0.01 * S, 0.11 * S);
        base.translate(0, 0.005 * S, 0);
        const keys = new THREE.BoxGeometry(0.27 * S, 0.006 * S, 0.085 * S);
        keys.translate(0, 0.012 * S, -0.004 * S);
        const merged = mergeGeometries([base, keys], false);
        merged.rotateX(-0.04);
        return merged;
      })(),
      // El ratón. Es minúsculo y aun así es lo que más "puesto ocupado"
      // aporta por polígono: una mesa con pantalla y teclado pero sin ratón
      // se lee como un expositor de tienda.
      mouse: (() => {
        const m = new THREE.SphereGeometry(0.028 * S, 8, 6);
        m.scale(0.75, 0.5, 1.15);
        m.translate(0, 0.014 * S, 0);
        return m;
      })(),
      stool: new THREE.CylinderGeometry(0.17 * S, 0.17 * S, 0.45 * S, 8),
      podFrame: podFrameGeometry(),
      podCushion: podCushionGeometry(),
      // Lámpara colgante (la lámina de la cabaña): cable fino, campana de
      // metal y bombilla cálida. Cuelga "del aire" — en un diorama el techo
      // se sobreentiende.
      lampShade: (() => {
        const shade = new THREE.CylinderGeometry(0.06 * S, 0.3 * S, 0.24 * S, 12, 1, true);
        const cable = new THREE.CylinderGeometry(0.012 * S, 0.012 * S, 1.5 * S, 6);
        cable.translate(0, 0.85 * S, 0);
        return mergeGeometries([shade, cable], false);
      })(),
      lampBulb: new THREE.SphereGeometry(0.075 * S, 10, 8),
      mug: (() => {
        const cup = new THREE.CylinderGeometry(0.045 * S, 0.038 * S, 0.09 * S, 10);
        cup.translate(0, 0.045 * S, 0);
        return cup;
      })(),
      // Madera clara y tapicería azul empolvado en vez de melamina blanca,
      // patas de metal gris y sillas negras: es lo que separa "oficina de
      // catálogo" de la oficina cálida de las referencias.
      materials: {
        top: cozyMaterial("deskTop"),
        edge: cozyMaterial("deskEdge"),
        leg: cozyMaterial("deskLeg"),
        seat: cozyMaterial("fabricDark"),
        // El marco del monitor: oscuro y MATE, sin emisión. Es la mitad del
        // truco — el panel solo se lee encendido si tiene un marco apagado
        // contra el que contrastar.
        chassis: cozyMaterial("screen"),
        // El panel encendido: base OSCURA con brillo encima, no un color
        // claro a secas. Pintarlo del color del brillo lo dejaba como una
        // ficha de menta plana pegada al marco; con la base oscura, lo que
        // se ve es un cristal que emite, que es como se lee una pantalla.
        //
        // La emisión puede ir alta ahora porque solo la lleva la CARA. Antes
        // la llevaba el monitor entero y por eso había que tenerla a 0.28
        // para que veinte puestos no convirtieran el piso en una feria.
        screen: new THREE.MeshLambertMaterial({
          color: new THREE.Color(SURFACES.screen),
          emissive: new THREE.Color(SURFACES.screenGlow),
          emissiveIntensity: 0.6,
        }),
        bulb: new THREE.MeshLambertMaterial({
          color: new THREE.Color("#fff2cc"),
          emissive: new THREE.Color("#ffca7a"),
          emissiveIntensity: 1.2,
        }),
      },
    };
  }
  return shared;
}

// ---------------------------------------------------------------- registry

const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

function transform(x, y, z, rotY = 0) {
  _pos.set(x, y, z);
  _euler.set(0, rotY, 0);
  _quat.setFromEuler(_euler);
  return _m.compose(_pos, _quat, _scale).clone();
}

/**
 * La matriz de un ratón a partir de la de su teclado.
 *
 * El desplazamiento se aplica por la DERECHA (`multiply`), o sea en el
 * espacio local del teclado: así el ratón queda siempre a la derecha de
 * QUIEN SE SIENTA, gire como gire el puesto. Multiplicando por la izquierda
 * se desplazaría en ejes de mundo y la mitad de los ratones acabarían dentro
 * de la mesa del vecino.
 */
const _mouseOffset = new THREE.Matrix4();
function besideKeyboard(keyboardMatrix) {
  return keyboardMatrix.clone().multiply(_mouseOffset.makeTranslation(0.21 * S, 0, 0.012 * S));
}

/**
 * Collects furniture placements across the whole floor, then emits them as a
 * few instanced/merged meshes. Everything is in world space, so a zone just
 * passes its own origin in.
 */
export function createFurnitureRegistry() {
  const chairs = [];
  const monitors = [];
  const laptops = [];
  const keyboards = [];
  const stools = [];
  const pods = [];
  const lamps = [];
  const mugs = [];
  const slabs = { top: [], edge: [], leg: [] };

  return {
    addChair(x, z, rotY) {
      // +PI: el respaldo del modelo vive en su +z local, y `rotY` llega como
      // "hacia dónde mira quien se sienta" — sin el giro, todas las sillas
      // daban la ESPALDA a su mesa. Y encima un poco de caos determinista
      // (girito y corrimiento por posición): una oficina real nunca tiene
      // las sillas clavadas en formación; recién usadas se leen vivas.
      const seed = Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453;
      const r1 = seed % 1;
      const r2 = (seed * 1.618) % 1;
      const jitterRot = (r1 - 0.5) * 0.5;
      const jx = (r2 - 0.5) * 0.14 * S;
      const jz = (r1 - 0.5) * 0.1 * S;
      chairs.push(transform(x + jx, 0, z + jz, rotY + Math.PI + jitterRot));
    },
    addMonitor(x, y, z, rotY) {
      monitors.push(transform(x, y, z, rotY));
    },
    addLaptop(x, y, z, rotY) {
      laptops.push(transform(x, y, z, rotY));
    },
    addKeyboard(x, y, z, rotY) {
      keyboards.push(transform(x, y, z, rotY));
    },
    addStool(x, z) {
      stools.push(transform(x, 0.23 * S, z));
    },
    /** Sillón de dos plazas (auditorio). rotY = hacia dónde MIRA. */
    addPod(x, z, rotY) {
      pods.push(transform(x, 0, z, rotY));
    },
    /** Lámpara colgante sobre (x,z); la campana queda a ~2.3 unidades. */
    addLamp(x, z) {
      lamps.push(transform(x, 2.3 * S, z));
    },
    /** Una taza olvidada sobre una mesa. y = alto de la superficie. */
    addMug(x, y, z) {
      mugs.push(transform(x, y, z, Math.abs(Math.sin(x * 7.3 + z * 3.1)) * Math.PI));
    },
    /** A static box that will be merged into the shared slab geometry. */
    addSlab(kind, geometry, x, y, z, rotY = 0) {
      geometry.applyMatrix4(transform(x, y, z, rotY));
      slabs[kind].push(geometry);
    },

    build() {
      const group = new THREE.Group();
      group.name = "furniture";
      const a = sharedAssets();

      const instanced = (geometry, material, list) => {
        if (!list.length) return;
        const mesh = new THREE.InstancedMesh(geometry, material, list.length);
        list.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Instanced meshes share one bounding volume, and this one spans the
        // whole floor — culling it per-instance is not possible, so skip the
        // test entirely rather than pay for a useless check.
        mesh.frustumCulled = false;
        group.add(mesh);
      };

      instanced(a.chairBody, a.materials.seat, chairs);
      instanced(a.chairStand, a.materials.leg, chairs);
      // Chasis y panel comparten lista de transformaciones, así que no
      // pueden desalinearse por mucho que se mueva el puesto.
      instanced(a.monitorBody, a.materials.chassis, monitors);
      instanced(a.monitorScreen, a.materials.screen, monitors);
      instanced(a.laptopBody, a.materials.chassis, laptops);
      instanced(a.laptopScreen, a.materials.screen, laptops);
      instanced(a.keyboard, a.materials.leg, keyboards);
      // El ratón sale del teclado, no de una lista propia: se coloca a la
      // derecha de cada uno componiendo un desplazamiento LOCAL sobre su
      // matriz. Así aparece solo en cada puesto que ya tenga teclado, sin
      // que quien monta el plano tenga que acordarse de pedirlo.
      instanced(a.mouse, a.materials.leg, keyboards.map(besideKeyboard));
      instanced(a.stool, a.materials.seat, stools);
      instanced(a.podFrame, a.materials.seat, pods);
      instanced(a.podCushion, a.materials.top, pods);
      instanced(a.lampShade, a.materials.leg, lamps);
      instanced(a.lampBulb, a.materials.bulb, lamps);
      instanced(a.mug, a.materials.edge, mugs);

      for (const [kind, list] of Object.entries(slabs)) {
        if (!list.length) continue;
        const merged = mergeGeometries(list, false);
        const mesh = new THREE.Mesh(merged, a.materials[kind]);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        list.forEach((g) => g.dispose());
      }

      return group;
    },
  };
}

/**
 * Split `capacity` seats between the two long sides and the two short sides
 * of a rectangle, proportionally to their length. Long sides always get the
 * bulk of the seats; the short sides only pick up the remainder.
 */
export function seatDistribution(capacity, longLen, shortLen) {
  if (capacity <= 0) return { long: 0, short: 0, extra: 0 };
  const share = longLen / (longLen + shortLen);
  const perLong = Math.max(1, Math.round((capacity * share) / 2));
  const perShort = Math.max(0, Math.floor((capacity - perLong * 2) / 2));
  // Any leftover (odd counts) goes to a long side so the table never looks
  // lopsided across its short ends.
  return { long: perLong, short: perShort, extra: capacity - (perLong * 2 + perShort * 2) };
}

/**
 * Places one big table with `capacity` chairs around it, centred on
 * (originX, originZ). Returns the footprint the collision world should use.
 */
export function placeSeatedTable(
  registry,
  { originX, originZ, width, depth, capacity, shape = "rect", monitors = true, walkway = 0.35 }
) {
  // Leave room for the chair ring plus a walkway on every side. `walkway` es
  // ese hueco libre entre las sillas y la pared, en unidades de plano: con el
  // valor de siempre (0.35) una sala de reuniones queda tan justa que el
  // navmesh no encuentra dónde ponerse de pie, y desde que las salas son
  // LUGARES SEGUROS eso las volvía inalcanzables (`npm run check:reachable`).
  const margin = (CHAIR_GAP + CHAIR_R * 2 + walkway * S) * 2;
  const tw = Math.max(1.4 * S, width - margin);
  const td = Math.max(1.0 * S, depth - margin);

  if (shape === "round") {
    const r = Math.min(tw, td) / 2;
    registry.addSlab("top", new THREE.CylinderGeometry(r, r, TOP_T, 20), originX, TABLE_H, originZ);
    registry.addSlab(
      "leg",
      new THREE.CylinderGeometry(0.055 * S, 0.16 * S, TABLE_H, 10),
      originX,
      TABLE_H / 2,
      originZ
    );

    registry.addLamp(originX, originZ);
    const ringR = r + CHAIR_GAP + CHAIR_R;
    for (let i = 0; i < capacity; i++) {
      const angle = (i / capacity) * Math.PI * 2;
      registry.addChair(
        originX + Math.sin(angle) * ringR,
        originZ + Math.cos(angle) * ringR,
        angle + Math.PI
      );
    }
    return { w: r * 2, d: r * 2 };
  }

  const alongX = tw >= td;
  const longLen = alongX ? tw : td;
  const shortLen = alongX ? td : tw;

  registry.addSlab("top", new THREE.BoxGeometry(tw, TOP_T, td), originX, TABLE_H, originZ);
  registry.addSlab(
    "edge",
    new THREE.BoxGeometry(tw * 0.94, 0.05 * S, td * 0.88),
    originX,
    TABLE_H - TOP_T,
    originZ
  );
  // FALDÓN central (el panel que separa las dos filas de puestos en un banco
  // de oficina). Es lo que convierte "una losa sobre palillos" en un mueble:
  // le da masa por debajo del sobre y tapa el hueco por el que se veía el
  // suelo de lado a lado.
  registry.addSlab(
    "edge",
    alongX
      ? new THREE.BoxGeometry(tw * 0.9, 0.3 * S, 0.035 * S)
      : new THREE.BoxGeometry(0.035 * S, 0.3 * S, td * 0.9),
    originX,
    TABLE_H - 0.22 * S,
    originZ
  );

  // Trestle legs, one pair per ~2.5 units of length. Y una LÁMPARA colgante
  // por tramo, a lo cabaña de la referencia: es lo que hace que cada mesa
  // tenga su charco de luz implícito encima.
  const pairs = Math.max(2, Math.round(longLen / (2.5 * S)));
  for (let i = 0; i < pairs; i++) {
    const t = pairs === 1 ? 0.5 : i / (pairs - 1);
    const along = (t - 0.5) * longLen * 0.86;
    const lampAlong = (t - 0.5) * longLen * 0.62;
    registry.addLamp(originX + (alongX ? lampAlong : 0), originZ + (alongX ? 0 : lampAlong));
    for (const side of [-1, 1]) {
      const across = side * shortLen * 0.38;
      registry.addSlab(
        "leg",
        new THREE.CylinderGeometry(0.032 * S, 0.04 * S, TABLE_H - TOP_T, 8),
        originX + (alongX ? along : across),
        (TABLE_H - TOP_T) / 2,
        originZ + (alongX ? across : along)
      );
    }
  }

  const { long, short, extra } = seatDistribution(capacity, longLen, shortLen);
  const longOffset = shortLen / 2 + CHAIR_GAP + CHAIR_R;
  const shortOffset = longLen / 2 + CHAIR_GAP + CHAIR_R;

  const place = (px, pz, facing) => {
    // PUESTOS DESIGUALES a propósito: una oficina real tiene huecos — el
    // puesto de alguien que está de viaje (mesa sin silla), quien se llevó
    // la laptop a una reunión (silla sin equipo)... Todo determinista por
    // posición, para que el piso sea el mismo en cada partida.
    const spotSeed = Math.abs(Math.sin(px * 3.37 + pz * 7.79));
    const hasChair = spotSeed > 0.1;
    if (hasChair) registry.addChair(px, pz, facing);
    // Una taza olvidada en ~un tercio de los puestos: el desorden vivido de
    // las referencias, barato y determinista.
    // OJO CON LA GEOMETRÍA DEL PUESTO: el asiento está a CHAIR_GAP+CHAIR_R
    // del borde de la mesa. Lo que va SOBRE la mesa se mide desde el
    // asiento SUMANDO esa distancia primero — medido "un poquito hacia la
    // mesa" a secas, monitor y taza caían fuera del tablero, flotando en el
    // aire, que es exactamente el bug que hubo.
    const TO_EDGE = CHAIR_GAP + CHAIR_R;
    const mugSeed = Math.abs(Math.sin(px * 5.7 + pz * 9.1));
    if (mugSeed < 0.36) {
      const inwardMug = TO_EDGE + 0.16 * S;
      const sideMug = (mugSeed * 10) % 1 < 0.5 ? 0.16 * S : -0.16 * S;
      registry.addMug(
        px + Math.sin(facing) * inwardMug + Math.cos(facing) * sideMug,
        TABLE_H + TOP_T / 2,
        pz + Math.cos(facing) * inwardMug - Math.sin(facing) * sideMug
      );
    }
    if (monitors) {
      // Cada puesto trae monitor con pie, laptop abierta o NADA (el hueco
      // vacío también cuenta la historia). Apoyados EN la mesa, no flotando.
      const gearSeed = Math.abs(Math.sin(px * 8.13 + pz * 2.71));
      const inward = TO_EDGE + 0.26 * S;
      const gx = px + Math.sin(facing) * inward;
      const gz = pz + Math.cos(facing) * inward;
      const surface = TABLE_H + TOP_T / 2;
      if (gearSeed < 0.55) {
        registry.addMonitor(gx, surface, gz, facing);
        // Y su teclado, más cerca del borde: un monitor solo, con la mesa
        // pelada delante, se lee como escaparate y no como puesto.
        const kIn = TO_EDGE + 0.02 * S;
        registry.addKeyboard(
          px + Math.sin(facing) * kIn,
          surface,
          pz + Math.cos(facing) * kIn,
          facing
        );
      } else if (gearSeed < 0.82) {
        registry.addLaptop(gx, surface, gz, facing);
      }
      // else: puesto pelado — ni pantalla ni laptop.
    }
  };

  let leftover = extra;
  for (const side of [-1, 1]) {
    const count = long + (leftover-- > 0 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count - 0.5;
      const along = t * longLen * 0.92;
      const across = side * longOffset;
      // Chairs face the table: local -Z of the chair points at the top.
      const facing = alongX
        ? side > 0
          ? Math.PI
          : 0
        : side > 0
        ? -Math.PI / 2
        : Math.PI / 2;
      place(originX + (alongX ? along : across), originZ + (alongX ? across : along), facing);
    }
  }

  for (let s = 0; s < 2 && short > 0; s++) {
    const side = s === 0 ? -1 : 1;
    for (let i = 0; i < short; i++) {
      const t = (i + 0.5) / short - 0.5;
      const across = t * shortLen * 0.8;
      const along = side * shortOffset;
      const facing = alongX
        ? side > 0
          ? -Math.PI / 2
          : Math.PI / 2
        : side > 0
        ? Math.PI
        : 0;
      place(originX + (alongX ? along : across), originZ + (alongX ? across : along), facing);
    }
  }

  return { w: tw, d: td };
}

/** Small round bistro table with stools — cafetería dressing. */
export function placeBistroTable(registry, { originX, originZ, seats = 4 }) {
  const r = 0.45 * S;
  registry.addSlab("top", new THREE.CylinderGeometry(r, r, 0.06 * S, 14), originX, 0.72 * S, originZ);
  registry.addSlab(
    "leg",
    new THREE.CylinderGeometry(0.06 * S, 0.18 * S, 0.72 * S, 8),
    originX,
    0.36 * S,
    originZ
  );
  for (let i = 0; i < seats; i++) {
    const angle = (i / seats) * Math.PI * 2;
    registry.addStool(
      originX + Math.sin(angle) * (r + 0.42 * S),
      originZ + Math.cos(angle) * (r + 0.42 * S)
    );
  }
  return { w: r * 2, d: r * 2 };
}

export { TABLE_H };
