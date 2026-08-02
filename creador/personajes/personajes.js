import * as THREE from "three";
// El MISMO módulo que usa el juego, no una copia ni el bundle ya compilado:
// es lo único que garantiza que lo que ves aquí sea lo que sale al jugar. Si
// alguien añade un peinado al motor, aparece aquí solo.
import {
  Character3D,
  POSES,
  HAIR_STYLES,
  TOP_STYLES,
  BOTTOM_STYLES,
  ACCESSORIES,
  DEFAULT_RECIPE,
} from "../../src/entities/character3d.js";
import { siteRoot } from "../../src/data/siteRoot.js";

// Builder de PERSONAJES de Modo Incógnito.
//
// El gemelo del builder del plano: carga characters3d.json, te deja tocar la
// receta de cada uno con vista previa 3D en vivo, y te devuelve el JSON para
// pegarlo. No escribe en el repo.
//
// El juego actual ya usa cuerpos importados desde GLB, así que el builder
// sigue siendo útil pero debe mostrar los personajes actuales y no insistir en
// los viejos procedurales. Esto deja la ruta de futuro abierta para importar el
// modelo base y luego añadir accesorios encima, sin romper lo que ya existe.

// Ruta ABSOLUTA a secas rompía en GitHub Pages, donde el sitio entero
// cuelga de un subdirectorio (ver src/data/siteRoot.js).
const DATA = `${siteRoot()}data/`;
const HEIGHT = 1.6;
const MODELOS = new Map();

// ---------------------------------------------------------------- estado
let doc = { aliases: {}, characters: {}, extras: [] };
let current = null; // id dentro de doc.characters
let muñeco = null;

const $ = (sel) => document.querySelector(sel);
const lista = $("#lista");
const form = $("#form");

// ---------------------------------------------------------------- escena
const canvas = $("#vista");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e2f0);
scene.add(new THREE.AmbientLight(0xfff6ea, 1.35));
const hemi = new THREE.HemisphereLight(0xf0e6ff, 0xd8c4a8, 0.9);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff0d4, 1.15);
key.position.set(3, 6, 5);
scene.add(key);

// Un suelo para que la sombra de contacto tenga dónde caer.
const suelo = new THREE.Mesh(
  new THREE.CircleGeometry(3, 40),
  new THREE.MeshLambertMaterial({ color: 0xf3ecdf })
);
suelo.rotation.x = -Math.PI / 2;
scene.add(suelo);

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
let orbit = { yaw: 0.35, pitch: 0.36, dist: 5.2 };

function colocarCamara() {
  const { yaw, pitch, dist } = orbit;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    HEIGHT * 0.55 + Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist
  );
  camera.lookAt(0, HEIGHT * 0.5, 0);
}

function ajustarTamaño() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(ajustarTamaño).observe(canvas);

// Arrastrar para girar, rueda para acercar.
let arrastrando = false;
let ultimo = { x: 0, y: 0 };
canvas.addEventListener("pointerdown", (e) => {
  arrastrando = true;
  ultimo = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  $("#girar").checked = false;
});
canvas.addEventListener("pointermove", (e) => {
  if (!arrastrando) return;
  orbit.yaw -= (e.clientX - ultimo.x) * 0.01;
  orbit.pitch = Math.max(-0.2, Math.min(1.2, orbit.pitch + (e.clientY - ultimo.y) * 0.006));
  ultimo = { x: e.clientX, y: e.clientY };
});
const soltar = () => (arrastrando = false);
canvas.addEventListener("pointerup", soltar);
canvas.addEventListener("pointercancel", soltar);
canvas.addEventListener(
  "wheel",
  (e) => {
    orbit.dist = Math.max(2.2, Math.min(11, orbit.dist + e.deltaY * 0.004));
  },
  { passive: true }
);

// ---------------------------------------------------------------- bucle
let anterior = performance.now();
function animar(ahora) {
  const dt = Math.min((ahora - anterior) / 1000, 0.05);
  anterior = ahora;
  if ($("#girar").checked && !arrastrando) orbit.yaw += dt * 0.5;
  colocarCamara();
  muñeco?.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(animar);
}
requestAnimationFrame(animar);

// ---------------------------------------------------------------- muñeco
function rehacerMuñeco() {
  const receta = doc.characters[current];
  if (!receta) return;

  const baseModel = receta.baseModel ?? "kiara.glb";
  if (!MODELOS.has(baseModel)) {
    MODELOS.set(baseModel, { loading: true });
  }

  if (!muñeco) {
    muñeco = new Character3D(receta, { height: HEIGHT });
    scene.add(muñeco.object);
  } else {
    muñeco.setRecipe(receta);
  }
  aplicarPose();
}

function aplicarPose() {
  if (!muñeco) return;
  const pose = $("#pose").value;
  const caminando = $("#caminar").checked;
  muñeco.setMoving(caminando);
  muñeco.setPose(caminando ? null : pose || null);
  muñeco.setHeading(0, 1);
}

// ---------------------------------------------------------------- formulario
// Cada campo se declara una vez: de dónde lee, dónde escribe y de qué tipo es.
// Añadir una prenda nueva al motor es añadir su fila aquí.
const COLOR = (path, label, options = {}) => ({ path, label, type: "color", options });
const SELECT = (path, label, options) => ({ path, label, type: "select", options });
const TEXTO = (path, label, ph) => ({ path, label, type: "text", ph });
const RANGO = (path, label, min, max, step) => ({ path, label, type: "range", min, max, step });

const CAMPOS = [
  { grupo: "Cuerpo" },
  COLOR("skin", "Piel"),
  COLOR("eyes", "Ojos"),
  RANGO("build.width", "Complexión", 0.85, 1.25, 0.01),
  RANGO("build.belly", "Barriga", 0, 0.5, 0.02),
  RANGO("build.bust", "Busto", 0, 1, 0.05),

  { grupo: "Pelo" },
  COLOR("hair.color", "Color"),
  SELECT("hair.style", "Estilo", HAIR_STYLES),
  COLOR("hair.streak", "Mechas", { opcional: true }),
  COLOR("beard", "Barba", { opcional: true }),

  { grupo: "Prenda de arriba" },
  COLOR("top.color", "Color"),
  SELECT("top.style", "Estilo", TOP_STYLES),
  TEXTO("top.print", "Estampado", "COSA 1"),
  COLOR("top.printColor", "Color del estampado", { opcional: true }),

  { grupo: "Abajo" },
  COLOR("bottom.color", "Color"),
  SELECT("bottom.style", "Estilo", BOTTOM_STYLES),
  COLOR("shoes.color", "Zapatos"),

  { grupo: "Complementos" },
  COLOR("badge", "Cordón de la credencial", { opcional: true }),
  { tipo: "accesorios" },
  COLOR("capColor", "Color de la gorra", { opcional: true }),
  COLOR("glassesColor", "Montura de las gafas", { opcional: true }),
  COLOR("hoopColor", "Aros", { opcional: true }),
];

function leer(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function escribir(obj, path, value) {
  const partes = path.split(".");
  const ultima = partes.pop();
  let cursor = obj;
  for (const parte of partes) {
    if (typeof cursor[parte] !== "object" || cursor[parte] === null) cursor[parte] = {};
    cursor = cursor[parte];
  }
  // Ojo con la diferencia: borrar la clave significa "lo que diga el motor por
  // defecto", y guardar `null` significa "este personaje NO lleva esto". Kiara
  // sin credencial necesita lo segundo, así que `null` se guarda tal cual.
  if (value === undefined || value === "") delete cursor[ultima];
  else cursor[ultima] = value;
}

function pintarFormulario() {
  const receta = doc.characters[current];
  form.replaceChildren();
  if (!receta) return;

  for (const campo of CAMPOS) {
    if (campo.grupo) {
      const h = document.createElement("h3");
      h.textContent = campo.grupo;
      form.appendChild(h);
      continue;
    }
    if (campo.tipo === "accesorios") {
      form.appendChild(filaAccesorios(receta));
      continue;
    }
    form.appendChild(fila(receta, campo));
  }

  const nota = document.createElement("label");
  nota.className = "campo";
  nota.innerHTML = "<span>Nota</span>";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "para el resto del equipo";
  input.value = receta.$note ?? "";
  input.addEventListener("input", () => {
    escribir(receta, "$note", input.value);
  });
  nota.appendChild(input);
  form.appendChild(nota);
}

function fila(receta, campo) {
  const wrap = document.createElement("label");
  wrap.className = "campo";
  const span = document.createElement("span");
  span.textContent = campo.label;
  wrap.appendChild(span);

  // La receta puede no traer un campo, y entonces el motor usa el suyo por
  // defecto. El formulario tiene que enseñar lo que SE VE en el muñeco, no un
  // hueco: si no, el cordón sale morado en la vista previa y gris en su
  // casilla, y parece que el editor miente.
  const propio = leer(receta, campo.path);
  const valor = propio ?? leer(DEFAULT_RECIPE, campo.path);
  const cambiar = (v) => {
    escribir(receta, campo.path, v);
    rehacerMuñeco();
  };

  if (campo.type === "color") {
    const caja = document.createElement("div");
    caja.className = "color-row";
    const input = document.createElement("input");
    input.type = "color";
    input.value = typeof valor === "string" ? valor : "#cccccc";
    input.addEventListener("input", () => cambiar(input.value));
    caja.appendChild(input);

    // "Sin esto" tiene que ser posible: un personaje sin barba, sin mechas o
    // sin credencial es una decisión, no un color por defecto.
    if (campo.options?.opcional) {
      // Lo que decide el botón es si la pieza SE VE, no si la receta trae la
      // clave: la credencial de Giuli no está escrita en su receta y aun así
      // la lleva puesta, porque el motor la pone por defecto.
      const puesto = valor != null;
      const quitar = document.createElement("button");
      quitar.type = "button";
      quitar.className = "mini";
      quitar.textContent = puesto ? "quitar" : "poner";
      quitar.addEventListener("click", () => {
        // `null` explícito, no borrar la clave: en las recetas, `null` es lo
        // que significa "este personaje NO lleva esto" y gana al valor por
        // defecto (Kiara ya no tiene credencial, por ejemplo).
        escribir(receta, campo.path, puesto ? null : input.value);
        rehacerMuñeco();
        pintarFormulario();
      });
      caja.appendChild(quitar);
    }
    wrap.appendChild(caja);
    return wrap;
  }

  if (campo.type === "select") {
    const select = document.createElement("select");
    for (const opt of campo.options) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    select.value = valor ?? campo.options[0];
    select.addEventListener("change", () => cambiar(select.value));
    wrap.appendChild(select);
    return wrap;
  }

  if (campo.type === "range") {
    const input = document.createElement("input");
    input.type = "range";
    input.min = campo.min;
    input.max = campo.max;
    input.step = campo.step;
    input.value = valor ?? (campo.path.endsWith("belly") ? 0 : 1);
    input.addEventListener("input", () => cambiar(Number(input.value)));
    wrap.appendChild(input);
    return wrap;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = campo.ph ?? "";
  input.value = valor ?? "";
  // Vaciar el campo quita la clave (sin estampado), no guarda un null.
  input.addEventListener("input", () => cambiar(input.value || undefined));
  wrap.appendChild(input);
  return wrap;
}

function filaAccesorios(receta) {
  const wrap = document.createElement("div");
  wrap.className = "campo";
  const span = document.createElement("span");
  span.textContent = "Accesorios";
  wrap.appendChild(span);

  const caja = document.createElement("div");
  caja.className = "chips";
  for (const nombre of ACCESSORIES) {
    const chip = document.createElement("label");
    chip.className = "chip";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = (receta.accessories ?? []).includes(nombre);
    cb.addEventListener("change", () => {
      const set = new Set(receta.accessories ?? []);
      if (cb.checked) set.add(nombre);
      else set.delete(nombre);
      receta.accessories = [...set];
      if (!receta.accessories.length) delete receta.accessories;
      rehacerMuñeco();
    });
    chip.appendChild(cb);
    chip.appendChild(document.createTextNode(nombre));
    caja.appendChild(chip);
  }
  wrap.appendChild(caja);
  return wrap;
}

// ---------------------------------------------------------------- reparto
function pintarLista() {
  lista.replaceChildren();
  for (const id of Object.keys(doc.characters)) {
    const li = document.createElement("li");
    li.className = id === current ? "on" : "";
    const boton = document.createElement("button");
    boton.textContent = id;
    boton.addEventListener("click", () => seleccionar(id));
    li.appendChild(boton);

    const renombrar = document.createElement("button");
    renombrar.className = "mini";
    renombrar.textContent = "id";
    renombrar.title = "Cambiar el id";
    renombrar.addEventListener("click", () => {
      const nuevo = prompt("Nuevo id (el que usan el plano y los diálogos):", id);
      if (!nuevo || nuevo === id) return;
      if (doc.characters[nuevo]) return avisar(`Ya hay un "${nuevo}"`);
      doc.characters[nuevo] = doc.characters[id];
      delete doc.characters[id];
      seleccionar(nuevo);
    });
    li.appendChild(renombrar);
    lista.appendChild(li);
  }
}

function seleccionar(id) {
  current = id;
  pintarLista();
  pintarFormulario();
  rehacerMuñeco();
}

// ---------------------------------------------------------------- carga
async function cargar() {
  const [recetasRes, modelosRes] = await Promise.all([
    fetch(`${DATA}characters3d.json`, { cache: "no-cache" }),
    fetch(`${DATA}models.json`, { cache: "no-cache" }),
  ]);
  if (!recetasRes.ok) {
    avisar(`No se pudo leer characters3d.json (${recetasRes.status})`);
    return;
  }
  if (!modelosRes.ok) {
    avisar(`No se pudo leer models.json (${modelosRes.status})`);
    return;
  }
  doc = await recetasRes.json();
  const modelos = await modelosRes.json();
  doc.characters ??= {};
  for (const [id, receta] of Object.entries(doc.characters)) {
    if (!receta || receta.baseModel) continue;
    const file = modelos.bodies?.[id];
    if (file) receta.baseModel = file;
  }
  seleccionar(current && doc.characters[current] ? current : Object.keys(doc.characters)[0]);
}

// ---------------------------------------------------------------- salida
/** El JSON se ordena como en el archivo, para que el diff sea legible. */
function recetaLimpia(receta) {
  const orden = [
    "$note",
    "skin",
    "eyes",
    "hair",
    "beard",
    "top",
    "bottom",
    "shoes",
    "badge",
    "accessories",
    "capColor",
    "glassesColor",
    "hoopColor",
    "build",
  ];
  const out = {};
  for (const k of orden) if (receta[k] !== undefined) out[k] = receta[k];
  for (const k of Object.keys(receta)) if (!(k in out)) out[k] = receta[k];
  return out;
}

function textoDeUno() {
  return JSON.stringify({ [current]: recetaLimpia(doc.characters[current]) }, null, 2);
}

function textoDeTodo() {
  const salida = { ...doc };
  salida.characters = Object.fromEntries(
    Object.entries(doc.characters).map(([id, r]) => [id, recetaLimpia(r)])
  );
  return JSON.stringify(salida, null, 2) + "\n";
}

async function copiar(texto, que) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(`${que} copiado al portapapeles`);
  } catch {
    // Sin permiso de portapapeles (pasa al abrir por file://): al menos que
    // el texto quede a mano en la consola en vez de perderse.
    console.log(texto);
    avisar("No se pudo copiar; va por consola");
  }
}

let avisoTimer = null;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("on");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove("on"), 2600);
}

// ---------------------------------------------------------------- controles
$("#pose").replaceChildren(
  ...["", ...Object.keys(POSES)].map((p) => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p || "de pie";
    return o;
  })
);
$("#pose").addEventListener("change", aplicarPose);
$("#caminar").addEventListener("change", aplicarPose);

$("#nuevo").addEventListener("click", () => {
  const id = prompt("Id del personaje nuevo:", "nuevo");
  if (!id) return;
  if (doc.characters[id]) return avisar(`Ya hay un "${id}"`);
  doc.characters[id] = JSON.parse(JSON.stringify(doc.characters[current] ?? {}));
  delete doc.characters[id].$note;
  seleccionar(id);
});

$("#recargar").addEventListener("click", cargar);
$("#copiar-uno").addEventListener("click", () => copiar(textoDeUno(), `"${current}"`));
$("#copiar-todo").addEventListener("click", () => copiar(textoDeTodo(), "characters3d.json"));
$("#descargar").addEventListener("click", () => {
  const blob = new Blob([textoDeTodo()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "characters3d.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

ajustarTamaño();
cargar();
