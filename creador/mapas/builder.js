// Builder de niveles y escenarios de Modo Incógnito.
//
// Es un editor 2D del plano (scenes/*.json) y del guion mecánico del día
// (levels/*.json). No compila nada ni escribe en el repo: carga los mismos
// JSON que lee el juego, te deja moverlos con el ratón y te devuelve el JSON
// para pegarlo de vuelta. Sin dependencias y sin build — se abre y ya.
//
// Todo se trabaja en UNIDADES DE PLANO, las mismas que hay en los archivos;
// el motor las multiplica por WORLD_SCALE al cargar, y eso aquí no se toca.

const DATA = "/data/";
const GRID = 0.1; // ajuste al mover, en unidades de plano

// ---------------------------------------------------------------- registro
// Cada colección editable del JSON de escena, descrita una sola vez: cómo se
// dibuja, qué campos tiene y qué sale al crear una nueva. Añadir un tipo de
// objeto al juego es añadir una entrada aquí, no tocar el resto del editor.
const NUM = (key, label, opts = {}) => ({ key, label, type: "number", ...opts });
const TXT = (key, label, opts = {}) => ({ key, label, type: "text", ...opts });
const SEL = (key, label, options) => ({ key, label, type: "select", options });

const KINDS = {
  areas: {
    label: "Zona",
    shape: "rect",
    color: "#a9c9f2",
    plural: "Zonas",
    make: (x, z) => ({
      id: "zona_nueva",
      name: "Zona nueva",
      capacity: 8,
      wing: "sur",
      kind: "open-office",
      color: "#a9c9f2",
      x,
      z,
      w: 8,
      d: 4.4,
      tableShape: "rect",
      labelPriority: 2,
      doorSide: "frente",
    }),
    fields: [
      TXT("id", "id"),
      TXT("name", "nombre"),
      SEL("kind", "tipo", ["open-office", "meeting", "social", "auditorium", "core", "elevator"]),
      SEL("wing", "ala", ["sur", "centro", "norte"]),
      NUM("capacity", "sillas", { step: 1 }),
      SEL("tableShape", "mesa", ["rect", "round"]),
      SEL("labelPriority", "rótulo", [1, 2, 3]),
      // Qué pared lleva la puerta, en kind "meeting" (un hueco de verdad) y
      // en kind "core" (decorado, el bloque es macizo). Mismo eje que `wing`:
      // norte = +x, sur = -x; frente = +z (por donde entra la jugadora desde
      // los ascensores), fondo = -z.
      //
      // Es lo que más fácil se pone mal: una puerta contra la fachada o
      // contra el vecino deja la sala inentrable y el plano se ve idéntico.
      // Lo caza `npm run check:doors`, que además dice qué lado sí funciona.
      SEL("doorSide", "puerta (meeting/core)", ["frente", "fondo", "norte", "sur"]),
      TXT("color", "color"),
    ],
  },
  corridors: {
    label: "Pasillo",
    shape: "rect",
    color: "#dfe6f5",
    plural: "Pasillos",
    make: (x, z) => ({ x, z, w: 10, d: 2.4 }),
    fields: [],
  },
  activities: {
    label: "Actividad",
    shape: "point",
    color: "#f2c744",
    plural: "Actividades",
    make: (x, z) => ({
      id: "actividad_nueva",
      label: "Actividad nueva",
      type: "coffee",
      icon: "⭐",
      x,
      z,
      area: "",
      riskRate: 20,
      time: 4,
      reward: 25,
      pose: "coffee",
    }),
    fields: [
      TXT("id", "id"),
      TXT("label", "etiqueta"),
      SEL("type", "tipo", ["coffee", "chat", "movie", "sleep", "snack"]),
      TXT("icon", "icono"),
      SEL("pose", "pose", ["", "work", "sleep", "coffee", "eat", "movie", "phone", "scared", "shrug"]),
      TXT("area", "zona"),
      NUM("riskRate", "riesgo/s"),
      NUM("time", "segundos"),
      NUM("reward", "reloj que da (s)", { step: 1 }),
    ],
  },
  safeSpots: {
    label: "Lugar seguro",
    shape: "circle",
    radiusKey: "radius",
    color: "#45e0d0",
    plural: "Lugares seguros",
    make: (x, z) => ({
      id: "seguro_nuevo",
      label: "Sala nueva",
      icon: "door",
      kind: "meeting",
      x,
      z,
      radius: 2.2,
      budget: 26,
      busyEvery: 34,
      busyFor: 14,
    }),
    fields: [
      TXT("id", "id"),
      TXT("label", "etiqueta"),
      TXT("icon", "icono"),
      SEL("kind", "tipo", ["meeting", "desk"]),
      NUM("radius", "radio", { step: 0.1 }),
      NUM("budget", "cupo (s)"),
      NUM("busyEvery", "se ocupa cada (s)"),
      NUM("busyFor", "ocupada (s)"),
    ],
    hint: "«meeting» cubre con entrar, se gasta y se ocupa. «desk» no se gasta pero solo cubre mientras finges.",
  },
  hidingSpots: {
    label: "Escondite",
    shape: "circle",
    radiusKey: "r",
    color: "#7ee08a",
    plural: "Escondites",
    make: (x, z) => ({ x, z, r: 1.4 }),
    fields: [NUM("r", "radio", { step: 0.1 })],
  },
  distractions: {
    label: "Distracción",
    shape: "point",
    color: "#ff9ad5",
    plural: "Distracciones",
    make: (x, z) => ({ id: "distraccion_nueva", label: "Distracción nueva", x, z, cooldown: 9 }),
    fields: [TXT("id", "id"), TXT("label", "etiqueta"), NUM("cooldown", "enfriamiento (s)")],
  },
  npcs: {
    label: "NPC",
    shape: "point",
    color: "#ffb27a",
    plural: "NPC",
    make: (x, z) => ({ id: "npc_nuevo", x, z, sheet: "npc1", facing: "south", sway: 0.4, cast: "" }),
    fields: [
      TXT("id", "id"),
      SEL("sheet", "pliego", ["npc1", "npc2", "npc3", "npc4", "guili-camina", "gabo-camina", "crispo-camina"]),
      SEL("facing", "mira hacia", ["south", "west", "east", "north"]),
      NUM("sway", "balanceo", { step: 0.05 }),
      TXT("cast", "personaje (cast)"),
    ],
    hint: "«cast» enlaza con dialogues.json. Sin él, es decorado y no se le puede hablar.",
  },
  eggs: {
    label: "Secreto",
    shape: "circle",
    radiusKey: "radius",
    color: "#cbb3ff",
    plural: "Secretos",
    make: (x, z) => ({
      id: "egg_nuevo",
      x,
      z,
      radius: 2,
      dwell: 2.5,
      scene: [{ speaker: "Nota", portrait: "📝", text: "..." }],
    }),
    fields: [TXT("id", "id"), NUM("radius", "radio", { step: 0.1 }), NUM("dwell", "espera (s)")],
  },
  props: {
    label: "Planta",
    shape: "point",
    color: "#5fa86a",
    plural: "Plantas y objetos",
    make: (x, z) => ({ type: "plant", x, z }),
    fields: [TXT("type", "tipo")],
  },
};

const LAYER_ORDER = [
  "corridors",
  "areas",
  "hidingSpots",
  "safeSpots",
  "eggs",
  "distractions",
  "activities",
  "npcs",
  "props",
];

// ------------------------------------------------------------------ estado
const state = {
  scene: null,
  level: null,
  sel: null, // { kind, index }
  visible: new Set(LAYER_ORDER),
  view: { x: 0, y: 0, scale: 14 },
};

const $ = (sel) => document.querySelector(sel);
const canvas = $("#canvas");
const ctx = canvas.getContext("2d");

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

// --------------------------------------------------------------- proyección
const toScreen = (x, z) => ({
  x: (x - state.view.x) * state.view.scale + canvas.width / 2,
  y: (z - state.view.y) * state.view.scale + canvas.height / 2,
});
const toPlan = (px, py) => ({
  x: (px - canvas.width / 2) / state.view.scale + state.view.x,
  z: (py - canvas.height / 2) / state.view.scale + state.view.y,
});
const snap = (v, free) => (free ? Math.round(v * 100) / 100 : Math.round(v / GRID) * GRID);

// ------------------------------------------------------------------- carga
async function loadFromGame() {
  try {
    const manifest = await fetch(`${DATA}manifest.json`).then((r) => r.json());
    const sceneId = manifest.scenes[0];
    const levelId = manifest.levels[0];
    state.scene = await fetch(`${DATA}scenes/${sceneId}.json`).then((r) => r.json());
    state.level = await fetch(`${DATA}levels/${levelId}.json`).then((r) => r.json());
    fitView();
    rebuild();
    toast(`Cargado ${sceneId} + ${levelId}`);
  } catch (err) {
    toast("No se pudo leer del juego — ábrelo servido, o usa «Abrir escena…»");
    console.warn(err);
  }
}

function fitView() {
  const pts = (state.scene?.footprint ?? []).map(([x, z]) => ({ x, z }));
  if (!pts.length) return;
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  state.view.x = (minX + maxX) / 2;
  state.view.y = (minZ + maxZ) / 2;
  state.view.scale = Math.min(
    (canvas.width - 60) / (maxX - minX),
    (canvas.height - 60) / (maxZ - minZ)
  );
}

// ------------------------------------------------------------------ dibujo
function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.round(r.width * devicePixelRatio);
  canvas.height = Math.round(r.height * devicePixelRatio);
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  draw();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#070a11";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!state.scene) {
    ctx.fillStyle = "#8ea0c4";
    ctx.font = `${14 * devicePixelRatio}px ui-monospace, monospace`;
    ctx.fillText("Sin escena cargada.", 24, 40);
    return;
  }

  drawGrid();
  drawFootprint();
  for (const kind of LAYER_ORDER) {
    if (!state.visible.has(kind)) continue;
    (state.scene[kind] ?? []).forEach((obj, i) => drawObject(kind, obj, i));
  }
  drawBarriers();
  drawRoutes();
  drawSpawn();
  drawBossSpawn();
  drawSelection();
  checkOverlaps();
}

function drawGrid() {
  const step = state.view.scale > 9 ? 1 : 5;
  ctx.strokeStyle = "#131a2a";
  ctx.lineWidth = 1;
  const a = toPlan(0, 0);
  const b = toPlan(canvas.width, canvas.height);
  ctx.beginPath();
  for (let x = Math.floor(a.x / step) * step; x < b.x; x += step) {
    const p = toScreen(x, 0);
    ctx.moveTo(p.x, 0);
    ctx.lineTo(p.x, canvas.height);
  }
  for (let z = Math.floor(a.z / step) * step; z < b.z; z += step) {
    const p = toScreen(0, z);
    ctx.moveTo(0, p.y);
    ctx.lineTo(canvas.width, p.y);
  }
  ctx.stroke();
}

function drawFootprint() {
  const fp = state.scene.footprint ?? [];
  if (fp.length < 3) return;
  ctx.beginPath();
  fp.forEach(([x, z], i) => {
    const p = toScreen(x, z);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = "#0d1220";
  ctx.fill();
  ctx.strokeStyle = "#2c3a5c";
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.stroke();

  // Mostrar nodos interactivos cuando está activo el modo edición
  if (footprintEditMode && state.view.scale > 5) {
    fp.forEach(([x, z], i) => {
      const p = toScreen(x, z);
      const isSelected = i === selectedFootprintNode;
      ctx.fillStyle = isSelected ? "#45e0d0" : "#8ea0c4";
      ctx.beginPath();
      ctx.arc(p.x, p.y, (isSelected ? 8 : 6) * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
      if (state.view.scale > 15) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `${8 * devicePixelRatio}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i), p.x, p.y);
      }
    });
  }
}

function rectOf(obj) {
  return { x: obj.x - obj.w / 2, z: obj.z - obj.d / 2, w: obj.w, d: obj.d };
}

function drawObject(kind, obj, index) {
  const def = KINDS[kind];
  const selected = state.sel?.kind === kind && state.sel.index === index;
  ctx.lineWidth = (selected ? 2.5 : 1.2) * devicePixelRatio;

  if (def.shape === "rect") {
    const r = rectOf(obj);
    const a = toScreen(r.x, r.z);
    const w = r.w * state.view.scale;
    const h = r.d * state.view.scale;
    ctx.fillStyle = hexA(obj.color ?? def.color, kind === "corridors" ? 0.1 : 0.22);
    ctx.fillRect(a.x, a.y, w, h);
    ctx.strokeStyle = selected ? "#ffffff" : obj.color ?? def.color;
    ctx.strokeRect(a.x, a.y, w, h);
    drawDoorGap(kind, obj, a, w, h);
    if (obj.name && state.view.scale > 9) label(obj.name, a.x + 5, a.y + 14, obj.color ?? def.color);
    return;
  }

  const p = toScreen(obj.x, obj.z);
  if (def.shape === "circle") {
    const r = (obj[def.radiusKey] ?? 1.4) * state.view.scale;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = hexA(def.color, 0.14);
    ctx.fill();
    ctx.strokeStyle = selected ? "#ffffff" : def.color;
    ctx.stroke();
  }
  const s = (selected ? 7 : 5) * devicePixelRatio;
  ctx.fillStyle = selected ? "#ffffff" : def.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
  ctx.fill();
  const text = obj.label ?? obj.id ?? obj.type ?? "";
  if (text && state.view.scale > 15) label(text, p.x + 9, p.y + 4, def.color);
}

/**
 * El hueco de la puerta, dibujado sobre la pared que le toca.
 *
 * Sin esto, una sala con la puerta contra la fachada se ve EXACTAMENTE igual
 * que una bien puesta: el rectángulo es el mismo y `doorSide` es un desplegable
 * que hay que ir a mirar uno por uno. Pintarlo convierte "no se puede entrar a
 * esa sala" en algo que se ve de un vistazo.
 */
function drawDoorGap(kind, obj, a, w, h) {
  if (kind !== "areas") return;
  if (obj.kind !== "meeting" && obj.kind !== "core") return;
  const side = obj.doorSide ?? "frente";

  // Mismo cálculo que el motor (ver scene/builder.js): el hueco es el 40% de
  // la pared, con un mínimo, y va centrado.
  const along = side === "norte" || side === "sur" ? h : w;
  const gap = Math.max(1.5 * state.view.scale, along * 0.4);
  const cx = a.x + w / 2;
  const cy = a.y + h / 2;

  ctx.save();
  // Un hueco en una sala de vidrio se atraviesa; en un núcleo es solo la hoja
  // de la puerta pintada en el bloque. Se distinguen con línea llena/punteada.
  ctx.strokeStyle = "#f2c744";
  ctx.lineWidth = 3.5 * devicePixelRatio;
  ctx.setLineDash(obj.kind === "core" ? [4 * devicePixelRatio, 3 * devicePixelRatio] : []);
  ctx.beginPath();
  if (side === "frente" || side === "fondo") {
    const y = side === "frente" ? a.y + h : a.y;
    ctx.moveTo(cx - gap / 2, y);
    ctx.lineTo(cx + gap / 2, y);
  } else {
    const x = side === "norte" ? a.x + w : a.x;
    ctx.moveTo(x, cy - gap / 2);
    ctx.lineTo(x, cy + gap / 2);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBarriers() {
  (state.scene.barriers ?? []).forEach((b, idx) => {
    const along = b.axis === "z" ? "x" : "z";
    const spans = b.door
      ? [
          [b.from, b.door.at - b.door.w / 2],
          [b.door.at + b.door.w / 2, b.to],
        ]
      : [[b.from, b.to]];
    ctx.strokeStyle = selectedBarrier === idx ? "#ff6b81" : "#8ea0c4";
    ctx.lineWidth = (selectedBarrier === idx ? 7 : 5) * devicePixelRatio;
    spans.forEach(([s, e]) => {
      const p1 = along === "z" ? toScreen(b.at, s) : toScreen(s, b.at);
      const p2 = along === "z" ? toScreen(b.at, e) : toScreen(e, b.at);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    if (b.door) {
      const p = along === "z" ? toScreen(b.at, b.door.at) : toScreen(b.door.at, b.at);
      ctx.fillStyle = selectedBarrier === idx ? "#ff9ad5" : "#f2c744";
      ctx.beginPath();
      ctx.arc(p.x, p.y, (selectedBarrier === idx ? 8 : 5) * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
      label("puerta", p.x + 9, p.y + 4, ctx.fillStyle);
    }

    // Mostrar handles para redimensionar cuando la barrera está seleccionada
    if (selectedBarrier === idx) {
      const p1 = along === "z" ? toScreen(b.at, b.from) : toScreen(b.from, b.at);
      const p2 = along === "z" ? toScreen(b.at, b.to) : toScreen(b.to, b.at);

      // Handle en "from"
      ctx.fillStyle = selectedBarrierHandle === "from" ? "#ff6b81" : "#45e0d0";
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, (selectedBarrierHandle === "from" ? 8 : 6) * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();

      // Handle en "to"
      ctx.fillStyle = selectedBarrierHandle === "to" ? "#ff6b81" : "#45e0d0";
      ctx.beginPath();
      ctx.arc(p2.x, p2.y, (selectedBarrierHandle === "to" ? 8 : 6) * devicePixelRatio, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawRoutes() {
  const routes = state.scene.routes ?? {};
  const colors = ["#ff6b81", "#45a0e0", "#a8e05f", "#cbb3ff"];
  const routeNames = Object.keys(routes);
  routeNames.forEach((name, i) => {
    const pts = routes[name];
    if (!pts || pts.length === 0) return;
    const isSelected = routeEditMode && selectedRouteName === name;
    ctx.strokeStyle = hexA(colors[i % colors.length], isSelected ? 1 : 0.5);
    ctx.lineWidth = isSelected ? 3 * devicePixelRatio : 1.5 * devicePixelRatio;
    ctx.setLineDash([5 * devicePixelRatio, 5 * devicePixelRatio]);
    ctx.beginPath();
    pts.forEach((pt, j) => {
      const p = toScreen(pt.x, pt.z);
      j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    if (pts[0]) label(name, toScreen(pts[0].x, pts[0].z).x + 8, toScreen(pts[0].x, pts[0].z).y - 6, colors[i % colors.length]);

    // Mostrar nodos de la ruta en modo edición
    if (routeEditMode && isSelected) {
      pts.forEach((pt, j) => {
        const p = toScreen(pt.x, pt.z);
        ctx.fillStyle = selectedRouteNode === j ? colors[i % colors.length] : hexA(colors[i % colors.length], 0.6);
        ctx.beginPath();
        ctx.arc(p.x, p.y, (selectedRouteNode === j ? 8 : 5) * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  });
}

function drawSpawn() {
  const s = state.scene.spawn;
  if (!s) return;
  const p = toScreen(s.x, s.z);
  ctx.strokeStyle = spawnEditMode ? "#ff6b81" : "#45e0d0";
  ctx.lineWidth = (spawnEditMode ? 3 : 2) * devicePixelRatio;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9 * devicePixelRatio, 0, Math.PI * 2);
  ctx.stroke();
  label(spawnEditMode ? "INGRESO (presiona S para terminar)" : "entras aquí", p.x + 12, p.y + 4, ctx.strokeStyle);
}

function drawBossSpawn() {
  const bs = state.scene.bossSpawn;
  if (!bs) return;
  const p = toScreen(bs.x, bs.z);
  ctx.strokeStyle = bossSpawnEditMode ? "#ff9ad5" : "#ff6b81";
  ctx.lineWidth = (bossSpawnEditMode ? 3 : 2) * devicePixelRatio;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 7 * devicePixelRatio, 0, Math.PI * 2);
  ctx.stroke();
  label(bossSpawnEditMode ? "JEFE (presiona B para terminar)" : "jefe", p.x + 12, p.y - 8, ctx.strokeStyle);
}

function drawSelection() {
  if (!state.sel) return;
  const def = KINDS[state.sel.kind];
  const obj = state.scene[state.sel.kind]?.[state.sel.index];
  if (!obj || def.shape !== "rect") return;
  const r = rectOf(obj);
  ctx.fillStyle = "#ffffff";
  handles(r).forEach((h) => {
    const p = toScreen(h.x, h.z);
    ctx.fillRect(p.x - 4 * devicePixelRatio, p.y - 4 * devicePixelRatio, 8 * devicePixelRatio, 8 * devicePixelRatio);
  });
}

function handles(r) {
  return [
    { x: r.x, z: r.z, sx: -1, sz: -1 },
    { x: r.x + r.w, z: r.z, sx: 1, sz: -1 },
    { x: r.x, z: r.z + r.d, sx: -1, sz: 1 },
    { x: r.x + r.w, z: r.z + r.d, sx: 1, sz: 1 },
  ];
}

function label(text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = `${10 * devicePixelRatio}px ui-monospace, monospace`;
  ctx.fillText(text, x, y);
}

function hexA(hex, a) {
  const h = (hex ?? "#888").replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** La invariante que documenta CLAUDE.md: las zonas no deben pisarse. */
function checkOverlaps() {
  const areas = state.scene.areas ?? [];
  const bad = [];
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = rectOf(areas[i]);
      const b = rectOf(areas[j]);
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
      if (ox > 0.01 && oz > 0.01) bad.push(`${areas[i].id} ∩ ${areas[j].id}`);
    }
  }
  const warn = $("#warn");
  warn.classList.toggle("hidden", !bad.length);
  if (bad.length) {
    warn.textContent = `Zonas solapadas (el motor no lo admite): ${bad.slice(0, 4).join(" · ")}${
      bad.length > 4 ? ` y ${bad.length - 4} más` : ""
    }`;
    bad.forEach((pair) => {
      const [ia, ib] = pair.split(" ∩ ");
      [ia, ib].forEach((id) => {
        const a = areas.find((x) => x.id === id);
        if (!a) return;
        const r = rectOf(a);
        const p = toScreen(r.x, r.z);
        ctx.strokeStyle = "#ff4d5e";
        ctx.lineWidth = 2 * devicePixelRatio;
        ctx.strokeRect(p.x, p.y, r.w * state.view.scale, r.d * state.view.scale);
      });
    });
  }
}

// ----------------------------------------------------------- interacciones
let drag = null;
let spaceHeld = false;
let footprintEditMode = false;
let selectedFootprintNode = null;
let spawnEditMode = false;
let bossSpawnEditMode = false;
let routeEditMode = false;
let selectedRouteName = null; // Nombre de la ruta, no índice
let selectedRouteNode = null;
let selectedBarrier = null;
let selectedBarrierHandle = null; // "from", "to", o null

function footprintNodeAt(plan) {
  const fp = state.scene?.footprint ?? [];
  const grab = 10 / state.view.scale;
  for (let i = 0; i < fp.length; i++) {
    const [x, z] = fp[i];
    if (Math.abs(x - plan.x) < grab && Math.abs(z - plan.z) < grab) {
      return i;
    }
  }
  return null;
}

function closestFootprintSegment(plan) {
  const fp = state.scene?.footprint ?? [];
  if (fp.length < 2) return null;

  let closest = null;
  let minDist = Infinity;

  for (let i = 0; i < fp.length; i++) {
    const [x1, z1] = fp[i];
    const [x2, z2] = fp[(i + 1) % fp.length];

    // Distancia del punto al segmento
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len2 = dx * dx + dz * dz;

    if (len2 === 0) continue;

    let t = ((plan.x - x1) * dx + (plan.z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));

    const px = x1 + t * dx;
    const pz = z1 + t * dz;

    const dist = Math.hypot(plan.x - px, plan.z - pz);

    if (dist < minDist) {
      minDist = dist;
      closest = { segment: i, t, px, pz };
    }
  }

  return minDist < 20 / state.view.scale ? closest : null;
}

function routeNodeAt(plan, routeName) {
  const route = state.scene?.routes?.[routeName] ?? [];
  const grab = 30 / state.view.scale; // Aumentado de 10 a 30
  for (let i = 0; i < route.length; i++) {
    const { x, z } = route[i];
    if (Math.abs(x - plan.x) < grab && Math.abs(z - plan.z) < grab) {
      console.log(`Nodo encontrado en ruta ${routeName}: índice ${i}, distancia x: ${Math.abs(x - plan.x).toFixed(2)}, z: ${Math.abs(z - plan.z).toFixed(2)}, grab: ${grab.toFixed(2)}`);
      return i;
    }
  }
  console.log(`Ningún nodo encontrado en ruta ${routeName}. Grab: ${grab.toFixed(2)}`);
  return null;
}

function routeAt(plan) {
  const routes = state.scene?.routes ?? {};
  const routeNames = Object.keys(routes);
  if (routeNames.length === 0) {
    console.log("routeAt: NO HAY RUTAS EN state.scene.routes");
    console.log("state.scene.routes:", state.scene?.routes);
    return null;
  }

  console.log("routeAt: Rutas disponibles:", routeNames, "Routes object:", routes);
  const grab = 20 / state.view.scale; // Aumentado para detectar mejor

  for (let i = 0; i < routeNames.length; i++) {
    const name = routeNames[i];
    const pts = routes[name];
    if (!pts || pts.length < 2) continue;

    for (let j = 0; j < pts.length - 1; j++) {
      const x1 = pts[j].x, z1 = pts[j].z;
      const x2 = pts[j + 1].x, z2 = pts[j + 1].z;
      const dx = x2 - x1, dz = z2 - z1;
      const len2 = dx * dx + dz * dz;
      if (len2 === 0) continue;

      let t = ((plan.x - x1) * dx + (plan.z - z1) * dz) / len2;
      t = Math.max(0, Math.min(1, t));

      const px = x1 + t * dx;
      const pz = z1 + t * dz;
      const dist = Math.hypot(plan.x - px, plan.z - pz);

      if (dist < grab) {
        console.log(`Ruta encontrada: ${name}, distancia: ${dist.toFixed(2)}, grab: ${grab.toFixed(2)}`);
        return name;
      }
    }
  }
  console.log(`No se encontró ruta. Routes: ${routeNames.join(", ")}, grab: ${(20 / state.view.scale).toFixed(2)}`);
  return null;
}

function closestRouteSegment(plan, routeName) {
  const route = state.scene?.routes?.[routeName] ?? [];
  if (route.length < 2) return null;
  let minDist = Infinity;
  let closest = null;
  for (let i = 0; i < route.length - 1; i++) {
    const x1 = route[i].x, z1 = route[i].z;
    const x2 = route[i + 1].x, z2 = route[i + 1].z;
    const dx = x2 - x1, dz = z2 - z1;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    let t = ((plan.x - x1) * dx + (plan.z - z1) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, pz = z1 + t * dz;
    const dist = Math.hypot(plan.x - px, plan.z - pz);
    if (dist < minDist) {
      minDist = dist;
      closest = { segment: i, t, px, pz };
    }
  }
  const maxGrab = 40 / state.view.scale; // Aumentado de 20 a 40
  if (minDist < maxGrab) {
    console.log(`Segmento encontrado en ruta ${routeName}: segmento ${closest.segment}, distancia: ${minDist.toFixed(2)}, maxGrab: ${maxGrab.toFixed(2)}`);
    return closest;
  }
  console.log(`Ningún segmento encontrado en ruta ${routeName}. MinDist: ${minDist.toFixed(2)}, maxGrab: ${maxGrab.toFixed(2)}`);
  return null;
}

function barrierAt(plan) {
  const barriers = state.scene?.barriers ?? [];
  const grab = 15 / state.view.scale;
  for (let i = 0; i < barriers.length; i++) {
    const b = barriers[i];
    const axis = b.axis; // "x" o "z"
    const along = axis === "x" ? "z" : "x"; // Eje a lo largo del cual se extiende
    const perp = axis; // Eje perpendicular (donde está fija)
    const bmin = Math.min(b.from, b.to);
    const bmax = Math.max(b.from, b.to);
    const pval = plan[perp];
    const aval = plan[along];
    if (Math.abs(pval - b.at) < grab && aval >= bmin - grab && aval <= bmax + grab) return i;
  }
  return null;
}

function barrierHandleAt(plan) {
  if (selectedBarrier === null) return null;
  const b = state.scene?.barriers?.[selectedBarrier];
  if (!b) return null;
  const along = b.axis === "z" ? "x" : "z";
  const grab = 8 / state.view.scale;

  const p1 = along === "z" ? { x: b.at, z: b.from } : { x: b.from, z: b.at };
  const p2 = along === "z" ? { x: b.at, z: b.to } : { x: b.to, z: b.at };

  if (Math.abs(plan.x - p1.x) < grab && Math.abs(plan.z - p1.z) < grab) return "from";
  if (Math.abs(plan.x - p2.x) < grab && Math.abs(plan.z - p2.z) < grab) return "to";
  return null;
}

function doorAt(plan) {
  const barriers = state.scene?.barriers ?? [];
  const grab = 10 / state.view.scale;
  for (let i = 0; i < barriers.length; i++) {
    const b = barriers[i];
    if (!b.door) continue;
    const along = b.axis === "z" ? "x" : "z";
    const p = along === "z" ? { x: b.at, z: b.door.at } : { x: b.door.at, z: b.at };
    if (Math.abs(p.x - plan.x) < grab && Math.abs(p.z - plan.z) < grab) {
      return i;
    }
  }
  return null;
}

function hitTest(plan) {
  // De arriba abajo en la pila de capas, para que un punto encima de una zona
  // gane a la zona.
  for (const kind of [...LAYER_ORDER].reverse()) {
    if (!state.visible.has(kind)) continue;
    const def = KINDS[kind];
    const list = state.scene[kind] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      if (def.shape === "rect") {
        const r = rectOf(obj);
        if (plan.x >= r.x && plan.x <= r.x + r.w && plan.z >= r.z && plan.z <= r.z + r.d) {
          return { kind, index: i };
        }
      } else {
        const grab = 10 / state.view.scale;
        if (Math.hypot(obj.x - plan.x, obj.z - plan.z) < grab) return { kind, index: i };
      }
    }
  }
  return null;
}

function handleAt(plan) {
  if (!state.sel || KINDS[state.sel.kind].shape !== "rect") return null;
  const obj = state.scene[state.sel.kind][state.sel.index];
  const grab = 8 / state.view.scale;
  return handles(rectOf(obj)).find((h) => Math.abs(h.x - plan.x) < grab && Math.abs(h.z - plan.z) < grab) ?? null;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const plan = toPlan(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);

  // Modo edición spawn
  if (spawnEditMode) {
    state.scene.spawn = { x: snap(plan.x, e.shiftKey), z: snap(plan.z, e.shiftKey) };
    toast("Spawn movido");
    draw();
    return;
  }

  // Modo edición boss spawn
  if (bossSpawnEditMode) {
    state.scene.bossSpawn = state.scene.bossSpawn ?? {};
    state.scene.bossSpawn.x = snap(plan.x, e.shiftKey);
    state.scene.bossSpawn.z = snap(plan.z, e.shiftKey);
    toast("Boss spawn movido");
    draw();
    return;
  }

  // Modo edición rutas
  if (routeEditMode) {
    // PRIORIDAD 1: Si hay ruta seleccionada, editar sus nodos
    if (selectedRouteName !== null) {
      console.log(`Editando ruta seleccionada: "${selectedRouteName}"`);
      const nodeIdx = routeNodeAt(plan, selectedRouteName);

      if (nodeIdx !== null) {
        // Se hizo clic en un nodo existente
        console.log(`Nodo ${nodeIdx} seleccionado`);
        selectedRouteNode = nodeIdx;
        drag = { mode: "route-node-drag", routeName: selectedRouteName, nodeIndex: nodeIdx };
        draw();
        return;
      }

      // Si se hace clic con botón izquierdo, intentar agregar nodo
      if (e.button === 0) {
        console.log("Intentando agregar nodo...");
        const segment = closestRouteSegment(plan, selectedRouteName);
        if (segment) {
          const insertIdx = segment.segment + 1;
          const route = state.scene.routes[selectedRouteName];
          route.splice(insertIdx, 0, { x: snap(segment.px, e.shiftKey), z: snap(segment.pz, e.shiftKey) });
          selectedRouteNode = insertIdx;
          toast(`Nodo insertado en ruta "${selectedRouteName}"`);
          console.log(`Nodo ${insertIdx} insertado`);
          draw();
          return;
        } else {
          console.log("No se encontró segmento para insertar");
          // Si no hay segmento, tal vez el usuario quiere deseleccionar la ruta
          selectedRouteName = null;
          selectedRouteNode = null;
          toast("Ruta deseleccionada");
          draw();
          return;
        }
      }
      return; // No intentar seleccionar otra ruta si ya hay una seleccionada
    }

    // PRIORIDAD 2: Si NO hay ruta seleccionada, intentar seleccionar una
    console.log("Buscando ruta para seleccionar...");
    const clickedRouteName = routeAt(plan);
    if (clickedRouteName !== null) {
      selectedRouteName = clickedRouteName;
      selectedRouteNode = null;
      toast(`Ruta "${selectedRouteName}" seleccionada - haz clic en nodos para editarlos`);
      console.log(`Ruta seleccionada: ${selectedRouteName}`);
      draw();
      return;
    }
  }

  // Modo edición footprint
  if (footprintEditMode) {
    const nodeIdx = footprintNodeAt(plan);
    if (nodeIdx !== null) {
      selectedFootprintNode = nodeIdx;
      drag = { mode: "footprint-drag", nodeIndex: nodeIdx, start: [...state.scene.footprint[nodeIdx]] };
      draw();
      return;
    }
    if (e.button === 0) {
      const segment = closestFootprintSegment(plan);
      if (segment) {
        // Insertar nodo en el segmento más cercano
        const insertIdx = segment.segment + 1;
        state.scene.footprint.splice(insertIdx, 0, [snap(segment.px, e.shiftKey), snap(segment.pz, e.shiftKey)]);
        selectedFootprintNode = insertIdx;
        toast(`Nodo ${insertIdx} insertado entre ${segment.segment} y ${(segment.segment + 1) % state.scene.footprint.length}`);
      } else {
        // Si no hay segmento cercano, agregar al final
        state.scene.footprint = state.scene.footprint ?? [];
        state.scene.footprint.push([snap(plan.x, e.shiftKey), snap(plan.z, e.shiftKey)]);
        selectedFootprintNode = state.scene.footprint.length - 1;
        toast(`Nodo ${selectedFootprintNode} añadido`);
      }
      draw();
      return;
    }
  }

  // Detectar clic en puerta
  const doorIdx = doorAt(plan);
  if (doorIdx !== null && e.button === 0) {
    selectedBarrier = doorIdx;
    const b = state.scene.barriers[doorIdx];
    const along = b.axis === "z" ? "x" : "z";
    if (along === "z") {
      drag = { mode: "door-drag", barrierIndex: doorIdx, start: b.door.at };
    } else {
      drag = { mode: "door-drag", barrierIndex: doorIdx, start: b.door.at };
    }
    draw();
    return;
  }

  // Detectar clic en handle de barrera (para redimensionar)
  const handleType = barrierHandleAt(plan);
  if (handleType !== null && e.button === 0) {
    selectedBarrierHandle = handleType;
    const b = state.scene.barriers[selectedBarrier];
    const along = b.axis === "z" ? "z" : "x";
    drag = {
      mode: "barrier-handle-drag",
      barrierIndex: selectedBarrier,
      handle: handleType,
      along: along
    };
    draw();
    return;
  }

  // Detectar clic en pared (para mover toda la pared)
  const barrierIdx = barrierAt(plan);
  if (barrierIdx !== null && e.button === 0) {
    selectedBarrier = barrierIdx;
    selectedBarrierHandle = null;
    const b = state.scene.barriers[barrierIdx];
    const axis = b.axis; // "x" o "z"
    drag = {
      mode: "barrier-drag",
      barrierIndex: barrierIdx,
      axis: axis
    };
    draw();
    return;
  }

  // Botón central o derecho (y espacio + arrastrar) desplazan la vista.
  if (e.button === 1 || e.button === 2 || spaceHeld) {
    drag = { mode: "pan", from: plan };
    return;
  }
  const h = handleAt(plan);
  if (h) {
    drag = { mode: "resize", handle: h, start: { ...state.scene[state.sel.kind][state.sel.index] } };
    return;
  }
  const hit = hitTest(plan);
  select(hit);
  if (hit) {
    const obj = state.scene[hit.kind][hit.index];
    drag = { mode: "move", offset: { x: obj.x - plan.x, z: obj.z - plan.z } };
  } else {
    drag = { mode: "pan", from: plan };
  }
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

canvas.addEventListener("pointermove", (e) => {
  const plan = toPlan(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
  $("#stage-hud").textContent = `x ${plan.x.toFixed(1)}  z ${plan.z.toFixed(1)}`;
  if (!drag) return;

  if (drag.mode === "door-drag") {
    const b = state.scene.barriers[drag.barrierIndex];
    b.door.at = snap(plan[b.axis === "z" ? "z" : "x"], e.shiftKey);
    draw();
    return;
  }
  if (drag.mode === "barrier-handle-drag") {
    const b = state.scene.barriers[drag.barrierIndex];
    const val = snap(plan[drag.along], e.shiftKey);
    if (drag.handle === "from") {
      b.from = val;
    } else {
      b.to = val;
    }
    draw();
    return;
  }
  if (drag.mode === "barrier-drag") {
    const b = state.scene.barriers[drag.barrierIndex];
    // Si axis es "x", moverse en x; si es "z", moverse en z
    b.at = snap(plan[drag.axis], e.shiftKey);
    draw();
    return;
  }
  if (drag.mode === "route-node-drag") {
    const route = state.scene.routes?.[drag.routeName];
    if (route && route[drag.nodeIndex]) {
      route[drag.nodeIndex].x = snap(plan.x, e.shiftKey);
      route[drag.nodeIndex].z = snap(plan.z, e.shiftKey);
    }
    draw();
    return;
  }
  if (drag.mode === "footprint-drag") {
    state.scene.footprint[drag.nodeIndex] = [snap(plan.x, e.shiftKey), snap(plan.z, e.shiftKey)];
    draw();
    return;
  }
  if (drag.mode === "pan") {
    state.view.x -= plan.x - drag.from.x;
    state.view.y -= plan.z - drag.from.z;
    draw();
    return;
  }
  const obj = state.scene[state.sel.kind][state.sel.index];
  if (drag.mode === "move") {
    obj.x = snap(plan.x + drag.offset.x, e.shiftKey);
    obj.z = snap(plan.z + drag.offset.z, e.shiftKey);
  } else if (drag.mode === "resize") {
    const s = drag.start;
    const left = drag.handle.sx < 0 ? plan.x : s.x - s.w / 2;
    const right = drag.handle.sx > 0 ? plan.x : s.x + s.w / 2;
    const top = drag.handle.sz < 0 ? plan.z : s.z - s.d / 2;
    const bottom = drag.handle.sz > 0 ? plan.z : s.z + s.d / 2;
    obj.w = Math.max(0.4, snap(Math.abs(right - left), e.shiftKey));
    obj.d = Math.max(0.4, snap(Math.abs(bottom - top), e.shiftKey));
    obj.x = snap((left + right) / 2, e.shiftKey);
    obj.z = snap((top + bottom) / 2, e.shiftKey);
  }
  draw();
  renderProps();
});

canvas.addEventListener("pointerup", () => {
  drag = null;
  renderList();
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const before = toPlan(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
    state.view.scale = Math.max(3, Math.min(60, state.view.scale * (e.deltaY < 0 ? 1.12 : 0.89)));
    const after = toPlan(e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio);
    state.view.x += before.x - after.x;
    state.view.y += before.z - after.z;
    draw();
  },
  { passive: false }
);

window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
});

window.addEventListener("keydown", (e) => {
  if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
  if (e.code === "Space") {
    spaceHeld = true;
    e.preventDefault();
  }
  // S para spawn
  if (e.key.toLowerCase() === "s") {
    e.preventDefault();
    spawnEditMode = !spawnEditMode;
    toast(spawnEditMode ? "Modo INGRESO: haz clic donde debe aparecer el jugador" : "Modo ingreso desactivado");
    draw();
    updateToolbar();
    return;
  }
  // B para boss spawn
  if (e.key.toLowerCase() === "b") {
    e.preventDefault();
    bossSpawnEditMode = !bossSpawnEditMode;
    toast(bossSpawnEditMode ? "Modo JEFE: haz clic donde debe aparecer el jefe" : "Modo jefe desactivado");
    draw();
    updateToolbar();
    return;
  }
  // R para rutas
  if (e.key.toLowerCase() === "r") {
    e.preventDefault();
    routeEditMode = !routeEditMode;
    if (routeEditMode) {
      selectedRouteName = null;
      selectedRouteNode = null;
      toast("Modo RUTAS activado - haz clic en una ruta para editarla");
    } else {
      selectedRouteName = null;
      selectedRouteNode = null;
      toast("Modo rutas desactivado");
    }
    draw();
    updateToolbar();
    return;
  }
  // F para footprint
  if (e.key.toLowerCase() === "f") {
    e.preventDefault();
    footprintEditMode = !footprintEditMode;
    selectedFootprintNode = null;
    toast(footprintEditMode ? "Modo edición de piso: ACTIVADO (F para desactivar)" : "Modo edición de piso: desactivado");
    draw();
    updateToolbar();
    return;
  }
  // Delete para nodos del footprint seleccionados
  if ((e.key === "Delete" || e.key === "Backspace") && footprintEditMode && selectedFootprintNode !== null) {
    e.preventDefault();
    state.scene.footprint.splice(selectedFootprintNode, 1);
    selectedFootprintNode = null;
    toast("Nodo eliminado");
    draw();
    return;
  }
  // Delete para nodos de rutas seleccionados
  if ((e.key === "Delete" || e.key === "Backspace") && routeEditMode && selectedRouteName !== null && selectedRouteNode !== null) {
    e.preventDefault();
    const route = state.scene.routes[selectedRouteName];
    if (route && route.length > 1) {
      route.splice(selectedRouteNode, 1);
      selectedRouteNode = null;
      toast("Nodo de ruta eliminado");
    } else {
      toast("No se puede eliminar el último nodo");
    }
    draw();
    return;
  }
  // Delete para barreras seleccionadas
  if ((e.key === "Delete" || e.key === "Backspace") && selectedBarrier !== null) {
    e.preventDefault();
    state.scene.barriers.splice(selectedBarrier, 1);
    selectedBarrier = null;
    selectedBarrierHandle = null;
    toast("Pared eliminada");
    draw();
    return;
  }
  // Delete para objetos seleccionados
  if ((e.key === "Delete" || e.key === "Backspace") && state.sel) {
    e.preventDefault();
    state.scene[state.sel.kind].splice(state.sel.index, 1);
    select(null);
    rebuild();
  }
});

function select(hit) {
  state.sel = hit;
  draw();
  renderList();
  renderProps();
}

// ------------------------------------------------------------------- panel
function rebuild() {
  renderLayers();
  renderAdd();
  renderList();
  renderProps();
  renderLevel();
  draw();
}

function renderAdd() {
  const box = $("#add-grid");
  box.innerHTML = "";
  LAYER_ORDER.forEach((kind) => {
    const b = document.createElement("button");
    b.textContent = `+ ${KINDS[kind].label}`;
    b.onclick = () => {
      if (!state.scene) return;
      state.scene[kind] = state.scene[kind] ?? [];
      const c = { x: Math.round(state.view.x * 10) / 10, z: Math.round(state.view.y * 10) / 10 };
      state.scene[kind].push(KINDS[kind].make(c.x, c.z));
      state.visible.add(kind);
      select({ kind, index: state.scene[kind].length - 1 });
      rebuild();
    };
    box.appendChild(b);
  });
}

function renderLayers() {
  const box = $("#layers");
  box.innerHTML = "";
  LAYER_ORDER.forEach((kind) => {
    const row = document.createElement("label");
    row.className = "layer";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = state.visible.has(kind);
    cb.onchange = () => {
      cb.checked ? state.visible.add(kind) : state.visible.delete(kind);
      draw();
    };
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = KINDS[kind].color;
    row.append(cb, sw, document.createTextNode(`${KINDS[kind].plural} (${(state.scene?.[kind] ?? []).length})`));
    box.appendChild(row);
  });
}

function renderList() {
  const box = $("#object-list");
  box.innerHTML = "";
  if (!state.scene) return;
  LAYER_ORDER.forEach((kind) => {
    if (!state.visible.has(kind)) return;
    (state.scene[kind] ?? []).forEach((obj, i) => {
      const row = document.createElement("div");
      row.className = `row${state.sel?.kind === kind && state.sel.index === i ? " on" : ""}`;
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = obj.color ?? KINDS[kind].color;
      const name = document.createElement("span");
      name.textContent = obj.name ?? obj.label ?? obj.id ?? `${KINDS[kind].label} ${i + 1}`;
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = KINDS[kind].label;
      row.append(sw, name, tag);
      row.onclick = () => select({ kind, index: i });
      box.appendChild(row);
    });
  });
}

function field(label, input) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const l = document.createElement("label");
  l.textContent = label;
  wrap.append(l, input);
  return wrap;
}

function inputFor(spec, obj, onChange) {
  let el;
  if (spec.type === "select") {
    el = document.createElement("select");
    spec.options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = String(o);
      opt.textContent = o === "" ? "(ninguna)" : String(o);
      el.appendChild(opt);
    });
    el.value = String(obj[spec.key] ?? "");
  } else {
    el = document.createElement("input");
    el.type = spec.type;
    if (spec.step) el.step = spec.step;
    el.value = obj[spec.key] ?? "";
  }
  el.onchange = () => {
    let v = el.value;
    if (spec.type === "number") v = v === "" ? undefined : Number(v);
    else if (spec.type === "select" && !Number.isNaN(Number(v)) && v !== "") v = Number(v);
    if (v === "" || v === undefined) delete obj[spec.key];
    else obj[spec.key] = v;
    onChange();
  };
  return el;
}

function renderProps() {
  const box = $("#props");
  const title = $("#prop-title");
  box.innerHTML = "";
  if (!state.sel || !state.scene) {
    title.textContent = "Nada seleccionado";
    return;
  }
  const { kind, index } = state.sel;
  const def = KINDS[kind];
  const obj = state.scene[kind]?.[index];
  if (!obj) {
    title.textContent = "Nada seleccionado";
    return;
  }
  title.textContent = `${def.label} · ${obj.id ?? obj.name ?? index + 1}`;

  const after = () => {
    draw();
    renderList();
  };

  // Posición y tamaño, siempre.
  const pair = document.createElement("div");
  pair.className = "field pair";
  ["x", "z"].forEach((k) => {
    const i = document.createElement("input");
    i.type = "number";
    i.step = "0.1";
    i.value = obj[k];
    i.onchange = () => {
      obj[k] = Number(i.value);
      after();
    };
    pair.appendChild(field(k, i));
  });
  box.appendChild(pair);

  if (def.shape === "rect") {
    const p2 = document.createElement("div");
    p2.className = "field pair";
    ["w", "d"].forEach((k) => {
      const i = document.createElement("input");
      i.type = "number";
      i.step = "0.1";
      i.value = obj[k];
      i.onchange = () => {
        obj[k] = Number(i.value);
        after();
      };
      p2.appendChild(field(k === "w" ? "ancho" : "fondo", i));
    });
    box.appendChild(p2);
  }

  def.fields.forEach((spec) => box.appendChild(field(spec.label, inputFor(spec, obj, after))));

  if (def.hint) {
    const h = document.createElement("p");
    h.className = "hint";
    h.textContent = def.hint;
    box.appendChild(h);
  }

  const del = document.createElement("button");
  del.className = "danger";
  del.textContent = `Borrar ${def.label.toLowerCase()}`;
  del.onclick = () => {
    state.scene[kind].splice(index, 1);
    select(null);
    rebuild();
  };
  box.appendChild(del);
}

// -------------------------------------------------------------- el día
function renderLevel() {
  const box = $("#level-form");
  box.innerHTML = "";
  const lvl = state.level;
  if (!lvl) return;
  const rules = (lvl.rules = lvl.rules ?? {});

  const simple = [
    ["title", "título", "text", lvl],
    ["subtitle", "subtítulo", "text", lvl],
    ["theme", "tema", "text", lvl],
    ["duration", "duración (s)", "number", rules],
    ["maxWarnings", "amonestaciones", "number", rules],
    ["targetScore", "puntos objetivo", "number", rules],
    ["bossSpeedMul", "×velocidad del jefe", "number", rules],
    ["visionMul", "×visión del jefe", "number", rules],
    ["bossRoute", "ronda del jefe", "text", rules],
  ];
  simple.forEach(([key, label, type, target]) => {
    const i = document.createElement("input");
    i.type = type;
    if (type === "number") i.step = "any";
    i.value = target[key] ?? "";
    i.onchange = () => {
      const v = type === "number" ? Number(i.value) : i.value;
      if (i.value === "") delete target[key];
      else target[key] = v;
    };
    box.appendChild(field(label, i));
  });

  // Correa del jefe: dos números que van juntos.
  const tether = document.createElement("div");
  tether.className = "field pair";
  ["cerca", "lejos"].forEach((label, idx) => {
    const i = document.createElement("input");
    i.type = "number";
    i.step = "0.5";
    i.value = rules.bossTether?.[idx] ?? "";
    i.onchange = () => {
      const cur = rules.bossTether ?? [5, 9];
      cur[idx] = Number(i.value);
      rules.bossTether = cur;
    };
    tether.appendChild(field(`correa ${label}`, i));
  });
  box.appendChild(tether);
  const th = document.createElement("p");
  th.className = "hint";
  th.textContent = "La correa mantiene al jefe rondándote: se acerca si te alejas más de «lejos» y te suelta a «cerca». Vacío = ronda normal.";
  box.appendChild(th);

  // Objetivos: se eligen de las actividades que existen en el plano.
  const objTitle = document.createElement("label");
  objTitle.textContent = "objetivos del día";
  objTitle.style.cssText = "display:block;font-size:10px;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;margin:14px 0 6px";
  box.appendChild(objTitle);

  const checks = document.createElement("div");
  checks.className = "checks";
  (state.scene?.activities ?? []).forEach((a) => {
    const l = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = (rules.objectives ?? []).includes(a.id);
    cb.onchange = () => {
      const set = new Set(rules.objectives ?? []);
      cb.checked ? set.add(a.id) : set.delete(a.id);
      rules.objectives = [...set];
    };
    l.append(cb, document.createTextNode(`${a.icon ?? ""} ${a.label} (${a.id})`));
    checks.appendChild(l);
  });
  box.appendChild(checks);

  // Secuaces de turno.
  const minTitle = objTitle.cloneNode();
  minTitle.textContent = "secuaces de turno";
  box.appendChild(minTitle);
  const minions = document.createElement("div");
  minions.className = "checks";
  ["chispita", "washo", "crispo"].forEach((id) => {
    const l = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = (lvl.minions ?? []).some((m) => m.id === id);
    const route = document.createElement("select");
    Object.keys(state.scene?.routes ?? {}).forEach((r) => {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = r;
      route.appendChild(o);
    });
    route.value = (lvl.minions ?? []).find((m) => m.id === id)?.route ?? "sur";
    const sync = () => {
      const list = (lvl.minions ?? []).filter((m) => m.id !== id);
      if (cb.checked) list.push({ id, route: route.value });
      lvl.minions = list;
    };
    cb.onchange = sync;
    route.onchange = sync;
    route.style.cssText = "width:auto;margin-left:auto";
    l.append(cb, document.createTextNode(id), route);
    minions.appendChild(l);
  });
  box.appendChild(minions);
}

// ------------------------------------------------------------------ salida
function sceneJSON() {
  return `${JSON.stringify(state.scene, null, 2)}\n`;
}
function levelJSON() {
  return `${JSON.stringify(state.level, null, 2)}\n`;
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copiado al portapapeles`);
  } catch {
    // Sin permiso de portapapeles (file://, navegador quisquilloso): al menos
    // que se pueda seleccionar a mano en vez de perder el trabajo.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    toast(`${what} copiado`);
  }
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function updateToolbar() {
  document.querySelectorAll(".tool").forEach((btn) => {
    btn.classList.remove("active");
  });
  if (spawnEditMode) document.getElementById("tool-spawn").classList.add("active");
  if (bossSpawnEditMode) document.getElementById("tool-boss").classList.add("active");
  if (routeEditMode) document.getElementById("tool-routes").classList.add("active");
  if (footprintEditMode) document.getElementById("tool-footprint").classList.add("active");
}

// ------------------------------------------------------------------- arranque
$("#copy-scene").onclick = () => state.scene && copy(sceneJSON(), "Plano");
$("#copy-level").onclick = () => state.level && copy(levelJSON(), "Día");
$("#download").onclick = () => {
  if (state.scene) download(`${state.scene.id ?? "escena"}.json`, sceneJSON());
  setTimeout(() => {
    if (state.level) download(`${state.level.id ?? "dia"}.json`, levelJSON());
  }, 200);
};
$("#reload").onclick = loadFromGame;

// Toolbar click handlers
document.getElementById("tool-spawn").onclick = () => {
  const key = new KeyboardEvent("keydown", { key: "s" });
  window.dispatchEvent(key);
};
document.getElementById("tool-boss").onclick = () => {
  const key = new KeyboardEvent("keydown", { key: "b" });
  window.dispatchEvent(key);
};
document.getElementById("tool-routes").onclick = () => {
  const key = new KeyboardEvent("keydown", { key: "r" });
  window.dispatchEvent(key);
};
document.getElementById("tool-footprint").onclick = () => {
  const key = new KeyboardEvent("keydown", { key: "f" });
  window.dispatchEvent(key);
};

function readFile(input, apply) {
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        apply(JSON.parse(String(r.result)));
        rebuild();
        toast(`Cargado ${file.name}`);
      } catch (err) {
        toast(`${file.name} no es JSON válido`);
        console.warn(err);
      }
    };
    r.readAsText(file);
  };
}
readFile($("#open-scene"), (json) => {
  state.scene = json;
  state.sel = null;
  fitView();
});
readFile($("#open-level"), (json) => {
  state.level = json;
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
    document
      .querySelectorAll(".tabpage")
      .forEach((p) => p.classList.toggle("on", p.dataset.page === tab.dataset.tab));
  };
});

// El ResizeObserver dispara después del primer dibujado, así que el encuadre
// inicial se calculaba con un lienzo de tamaño provisional.
let firstFit = true;
new ResizeObserver(() => {
  resize();
  if (firstFit && state.scene) {
    firstFit = false;
    fitView();
    draw();
  }
}).observe(canvas.parentElement);
resize();
loadFromGame();
