import * as THREE from "three";
// El MISMO módulo que usa el juego, y de ahí salen también el mapa de huesos,
// el reposo y la biblioteca de poses. Copiarlos aquí habría sido lo fácil y
// habría durado hasta el primer hueso nuevo: el builder seguiría ofreciendo la
// lista vieja sin que nada fallara a la vista.
import {
  Character3D,
  POSE_LIBRARY,
  BONE_OF,
  REST,
  HAND_POSES,
} from "../../src/entities/character3d.js";
import { siteRoot } from "../../src/data/siteRoot.js";
import { montarNav } from "../nav.js";

/**
 * BUILDER DE ANIMACIONES.
 *
 * ── Qué es una "animación" en este juego ──
 *
 * No es una curva por hueso con llaves donde quieras: el motor anima con DOS
 * POSTURAS y una velocidad (`POSE_LIBRARY` en `entities/character3d.js`). El
 * muñeco va de `a` a `b` y vuelve, en bucle. Suena pobre y no lo es — así
 * están hechas todas las poses del juego (teclear, beber, dormir), y es lo
 * que las deja legibles a la distancia isométrica a la que se juega.
 *
 * Así que la línea de tiempo de aquí tiene DOS LLAVES, no veinte. Es la
 * verdad del motor puesta en pantalla, y no una que haya que traducir al
 * exportar: lo que se copia se pega tal cual en `POSE_LIBRARY`.
 *
 * ── Qué NO hace, a propósito ──
 *
 * No escribe en el repo, igual que los otros builders: devuelve JSON para
 * pegar. Y no toca el `.glb` de nadie — las poses son procedurales y comunes
 * a todo el reparto, así que lo que edites aquí lo pueden hacer todos.
 */

const DATA = `${siteRoot()}data/`;
const HEIGHT = 1.6;
const GRADOS = 180 / Math.PI;

const $ = (s) => document.querySelector(s);

// ---------------------------------------------------------------- estado
let doc = { characters: {} };
let quien = null; // id del personaje que sirve de maniquí
let muñeco = null;
let esqueleto = null; // THREE.SkeletonHelper

/** La pose que se está editando, en el MISMO formato que POSE_LIBRARY. */
let pose = nuevaPose();
let llave = "a"; // cuál de las dos posturas recibe lo que toques
let hueso = "armR"; // canal seleccionado
let t = 0; // 0..1, dónde va el cursor entre A y B
let reproduciendo = false;

function nuevaPose() {
  return {
    speed: 1.4,
    prop: null,
    hands: "relax",
    a: postura(),
    b: postura(),
    context: { props: [], furniture: [] },
  };
}

/** Una postura arranca en REPOSO, que es lo que el motor da por defecto. */
function postura() {
  const p = {};
  for (const canal of Object.keys(BONE_OF)) p[canal] = [...(REST[canal] ?? [0, 0, 0])];
  p.lift = 0;
  return p;
}

// ---------------------------------------------------------------- escena
const canvas = $("#vista");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101f2c);
scene.add(new THREE.AmbientLight(0xfff6ea, 1.25));
scene.add(new THREE.HemisphereLight(0xdff2ff, 0x1b3244, 0.9));
const key = new THREE.DirectionalLight(0xfff0d4, 1.1);
key.position.set(3, 6, 5);
scene.add(key);

const suelo = new THREE.Mesh(
  new THREE.CircleGeometry(3, 40),
  new THREE.MeshLambertMaterial({ color: 0x16293a })
);
suelo.rotation.x = -Math.PI / 2;
scene.add(suelo);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const orbit = { yaw: 0.4, pitch: 0.3, dist: 5 };

function colocarCamara() {
  const { yaw, pitch, dist } = orbit;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    Math.sin(pitch) * dist + HEIGHT * 0.55,
    Math.cos(yaw) * Math.cos(pitch) * dist
  );
  camera.lookAt(0, HEIGHT * 0.5, 0);
}

let arrastrando = false;
canvas.addEventListener("pointerdown", (e) => {
  arrastrando = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", () => (arrastrando = false));
canvas.addEventListener("pointermove", (e) => {
  if (!arrastrando) return;
  orbit.yaw -= e.movementX * 0.008;
  orbit.pitch = Math.min(1.2, Math.max(-0.3, orbit.pitch + e.movementY * 0.006));
  colocarCamara();
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  orbit.dist = Math.min(11, Math.max(2.4, orbit.dist + e.deltaY * 0.003));
  colocarCamara();
}, { passive: false });

function ajustarLienzo() {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustarLienzo).observe(canvas);

// ---------------------------------------------------------------- maniquí
async function cargarReparto() {
  const res = await fetch(`${DATA}characters3d.json`);
  doc = await res.json();
  const ids = Object.keys(doc.characters ?? {});
  quien = ids.includes("giuli") ? "giuli" : ids[0];
  pintarReparto(ids);
  await montarMuñeco();
}

function pintarReparto(ids) {
  const box = $("#reparto");
  box.replaceChildren();
  for (const id of ids) {
    const fila = document.createElement("button");
    fila.className = `row${id === quien ? " on" : ""}`;
    fila.textContent = id;
    fila.onclick = async () => {
      quien = id;
      pintarReparto(ids);
      await montarMuñeco();
    };
    box.appendChild(fila);
  }
}

async function montarMuñeco() {
  if (muñeco) {
    scene.remove(muñeco.object);
    muñeco.dispose?.();
  }
  if (esqueleto) {
    scene.remove(esqueleto);
    esqueleto = null;
  }
  muñeco = new Character3D(doc.characters[quien] ?? {}, { height: HEIGHT });
  scene.add(muñeco.object);

  // El `.glb` tarda en llegar; el esqueleto no existe hasta entonces.
  for (let i = 0; i < 80 && !muñeco.skeleton; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (muñeco.skeleton) {
    esqueleto = new THREE.SkeletonHelper(muñeco.object);
    esqueleto.material.linewidth = 2;
    esqueleto.visible = $("#huesos").checked;
    scene.add(esqueleto);
  }
  pintarHuesos();
}

// ---------------------------------------------------------------- poses
function pintarPoses() {
  const box = $("#poses");
  box.replaceChildren();
  for (const nombre of Object.keys(POSE_LIBRARY)) {
    const fila = document.createElement("button");
    fila.className = "row";
    fila.textContent = nombre;
    fila.onclick = () => {
      // Copia PROFUNDA: editar aquí no puede tocar la biblioteca del motor
      // que esta misma pestaña tiene cargada.
      pose = structuredClone(POSE_LIBRARY[nombre]);
      for (const k of ["a", "b"]) pose[k] = { ...postura(), ...pose[k] };
      $("#nombre").value = nombre;
      sincronizarAjustes();
      pintarHuesos();
      avisar(`Cargada «${nombre}»`);
    };
    box.appendChild(fila);
  }
}

function sincronizarAjustes() {
  $("#speed").value = pose.speed ?? 1.4;
  $("#speed-val").textContent = Number(pose.speed ?? 1.4).toFixed(2);
  $("#hands").value = pose.hands ?? "relax";
  const lift = pose[llave].lift ?? 0;
  $("#lift").value = lift;
  $("#lift-val").textContent = Number(lift).toFixed(3);
}

// ---------------------------------------------------------------- huesos
function pintarHuesos() {
  const box = $("#bones");
  box.replaceChildren();
  for (const canal of Object.keys(BONE_OF)) {
    const fila = document.createElement("div");
    fila.className = `bone${canal === hueso ? " on" : ""}`;

    const cab = document.createElement("button");
    cab.className = "bone-name";
    cab.textContent = canal;
    cab.onclick = () => {
      hueso = canal;
      pintarHuesos();
    };
    const rig = document.createElement("span");
    rig.className = "tag";
    rig.textContent = BONE_OF[canal];
    cab.appendChild(rig);
    fila.appendChild(cab);

    if (canal === hueso) {
      const val = pose[llave][canal] ?? [0, 0, 0];
      ["x", "y", "z"].forEach((eje, i) => {
        const lab = document.createElement("label");
        const cap = document.createElement("span");
        cap.className = "bone-axis";
        cap.textContent = `${eje.toUpperCase()} ${Math.round(val[i] * GRADOS)}°`;
        const sl = document.createElement("input");
        sl.type = "range";
        sl.min = -180;
        sl.max = 180;
        sl.step = 1;
        sl.value = Math.round(val[i] * GRADOS);
        sl.oninput = () => {
          pose[llave][canal][i] = Number(sl.value) / GRADOS;
          cap.textContent = `${eje.toUpperCase()} ${sl.value}°`;
        };
        lab.append(cap, sl);
        fila.appendChild(lab);
      });

      const cero = document.createElement("button");
      cero.className = "bone-reset";
      cero.textContent = "A reposo";
      cero.onclick = () => {
        pose[llave][canal] = [...(REST[canal] ?? [0, 0, 0])];
        pintarHuesos();
      };
      fila.appendChild(cero);
    }
    box.appendChild(fila);
  }
}

// ---------------------------------------------------------------- línea de tiempo
function pintarLinea() {
  $("#head").style.left = `${t * 100}%`;
  $("#tl-t").textContent = t.toFixed(2);
  $("#key-a").classList.toggle("on", llave === "a");
  $("#key-b").classList.toggle("on", llave === "b");
}

function seleccionarLlave(cual) {
  llave = cual;
  // Saltar a la llave que editas: si no, mueves un hueso y no ves el cambio
  // porque el cursor está en la otra punta de la mezcla.
  t = cual === "a" ? 0 : 1;
  reproduciendo = false;
  $("#play").textContent = "▶ Reproducir";
  sincronizarAjustes();
  pintarHuesos();
  pintarLinea();
}

$("#key-a").onclick = () => seleccionarLlave("a");
$("#key-b").onclick = () => seleccionarLlave("b");
$("#copiar-ab").onclick = () => {
  const otra = llave === "a" ? "b" : "a";
  pose[otra] = structuredClone(pose[llave]);
  avisar(`Copiada ${llave.toUpperCase()} en ${otra.toUpperCase()}`);
};
$("#reposo").onclick = () => {
  pose[llave] = postura();
  sincronizarAjustes();
  pintarHuesos();
};
$("#play").onclick = () => {
  reproduciendo = !reproduciendo;
  $("#play").textContent = reproduciendo ? "❚❚ Pausa" : "▶ Reproducir";
};

$("#track").addEventListener("pointerdown", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  reproduciendo = false;
  $("#play").textContent = "▶ Reproducir";
  pintarLinea();
});

// ---------------------------------------------------------------- ajustes
$("#speed").oninput = (e) => {
  pose.speed = Number(e.target.value);
  $("#speed-val").textContent = pose.speed.toFixed(2);
};
$("#lift").oninput = (e) => {
  pose[llave].lift = Number(e.target.value);
  $("#lift-val").textContent = pose[llave].lift.toFixed(3);
};
$("#huesos").onchange = (e) => {
  if (esqueleto) esqueleto.visible = e.target.checked;
};

const selManos = $("#hands");
for (const m of Object.keys(HAND_POSES)) {
  const op = document.createElement("option");
  op.value = m;
  op.textContent = m;
  selManos.appendChild(op);
}
selManos.onchange = (e) => (pose.hands = e.target.value);

// ---------------------------------------------------------------- salida
/**
 * El JSON que se pega en `POSE_LIBRARY`. Se redondea a cuatro decimales
 * porque un slider en grados produce colas de flotante que solo ensucian el
 * diff, y a esa escala no se ve ninguna diferencia.
 */
function salida() {
  const limpia = (p) => {
    const o = {};
    for (const canal of Object.keys(BONE_OF)) {
      o[canal] = p[canal].map((v) => Number(v.toFixed(4)));
    }
    if (p.lift) o.lift = Number(p.lift.toFixed(4));
    return o;
  };
  const nombre = $("#nombre").value.trim() || "mi-pose";
  return `${nombre}: ${JSON.stringify(
    {
      speed: pose.speed,
      prop: null,
      hands: pose.hands,
      a: limpia(pose.a),
      b: limpia(pose.b),
      context: pose.context ?? { props: [], furniture: [] },
    },
    null,
    2
  )},`;
}

$("#copiar").onclick = async () => {
  await navigator.clipboard.writeText(salida());
  avisar("Pose copiada — pégala en POSE_LIBRARY (character3d.js)");
};
$("#descargar").onclick = () => {
  const blob = new Blob([salida()], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${$("#nombre").value.trim() || "mi-pose"}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
};

let avisoTimer = 0;
function avisar(txt) {
  const el = $("#toast");
  el.textContent = txt;
  el.classList.remove("hidden");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.add("hidden"), 2600);
}

// ---------------------------------------------------------------- bucle
/**
 * La vista previa NO usa `setPose()`: esa sale de la biblioteca del motor por
 * nombre, y aquí la pose todavía no existe en ninguna biblioteca. Se escriben
 * los huesos a mano con la MISMA mezcla que hace el motor (de `a` a `b` con
 * suavizado), que es lo que garantiza que lo que ves aquí sea lo que se verá
 * al pegarlo.
 */
function aplicar() {
  if (!muñeco?.skeleton) return;
  const k = t * t * (3 - 2 * t); // el mismo suavizado del motor
  for (const canal of Object.keys(BONE_OF)) {
    const a = pose.a[canal] ?? [0, 0, 0];
    const b = pose.b[canal] ?? [0, 0, 0];
    const hueso3d = muñeco.bone(BONE_OF[canal]);
    if (!hueso3d) continue;
    const rest = hueso3d.userData?.restQuat;
    const e = new THREE.Euler(
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k
    );
    const q = new THREE.Quaternion().setFromEuler(e);
    const mundo = hueso3d.userData?.restWorldQuat;
    if (rest && mundo) {
      const conj = mundo.clone().invert().multiply(q).multiply(mundo);
      hueso3d.quaternion.copy(rest).multiply(conj);
    } else if (rest) {
      hueso3d.quaternion.copy(rest).multiply(q);
    } else {
      hueso3d.quaternion.copy(q);
    }
  }
  const liftA = pose.a.lift ?? 0;
  const liftB = pose.b.lift ?? 0;
  muñeco.object.position.y = liftA + (liftB - liftA) * k;
}

let anterior = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.05, (ahora - anterior) / 1000);
  anterior = ahora;
  if (reproduciendo) {
    // Ida y VUELTA: el motor recorre la pose en las dos direcciones, así que
    // un triángulo, no una sierra — con sierra se ve un salto al reiniciar.
    const ciclo = (ahora / 1000) * (pose.speed ?? 1.4);
    t = 1 - Math.abs((ciclo % 2) - 1);
    pintarLinea();
  }
  aplicar();
  muñeco?.update?.(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(bucle);
}

montarNav("animaciones");
colocarCamara();
ajustarLienzo();
pintarPoses();
pintarHuesos();
pintarLinea();
sincronizarAjustes();
await cargarReparto();
requestAnimationFrame(bucle);
