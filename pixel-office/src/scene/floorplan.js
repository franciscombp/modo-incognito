// Data-driven layout of "Tribu Canales · Piso 7", read off the architectural
// blueprint and simplified into a rectilinear diorama.
//
// Everything below is authored in PLAN UNITS (1 unit ~= one desk width) and
// multiplied by WORLD_SCALE on export, so the whole floor can be resized from
// a single constant without touching a coordinate.
//
// Axes are SCENE axes — the same ones the entities use:
//   +x = toward the north wing (right side of the blueprint)
//   +z = toward the front of the building, where the player enters
// The elevator core sits mid-floor, splitting the south wing (-x) from the
// north wing (+x), exactly as in the plan.

import { WORLD_SCALE as S, PALETTE } from "./config.js";

export const WORLD_SCALE = S;

export const AREA_KINDS = {
  OPEN_OFFICE: "open-office", // one big table + chairs on a colour patch
  MEETING: "meeting", // glassed room, big table inside
  SOCIAL: "social", // cafetería
  AUDITORIUM: "auditorium", // stage + rows of chairs
  CORE: "core", // restrooms / stairs / installations: solid volume
  ELEVATOR: "elevator", // entry point
};

const scaleArea = (a) => ({
  ...a,
  x: a.x * S,
  z: a.z * S,
  w: a.w * S,
  d: a.d * S,
});

// ---------------------------------------------------------------------
// Zones. `capacity` is the number of seats the blueprint prints for that
// zone, and it drives how many chairs the builder places around the single
// big table it generates.
// ---------------------------------------------------------------------
const RAW_AREAS = [
  // ================= ALA SUR =================
  { id: "segmentos_sur", name: "12 Segmentos", capacity: 12, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.segmentos, x: -25, z: -6, w: 11, d: 4.6, tableShape: "rect", labelPriority: 2 },
  { id: "sala1", name: "Sala 1", capacity: 8, wing: "sur", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: -27, z: -0.4, w: 6.6, d: 4.4, tableShape: "rect", labelPriority: 1 },
  { id: "sala2", name: "Sala 2", capacity: 6, wing: "sur", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: -28.4, z: 5.6, w: 5, d: 4.2, tableShape: "rect", labelPriority: 1 },
  { id: "run_agencias", name: "Run Agencias", capacity: 14, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: -20.5, z: 0, w: 11, d: 4.6, tableShape: "rect", labelPriority: 2 },
  { id: "cfr", name: "CFR (7) + Transversales (3)", capacity: 10, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: -20, z: 6.2, w: 11, d: 4.4, tableShape: "rect", labelPriority: 2 },

  // ================= NÚCLEO CENTRAL =================
  { id: "banos_sur", name: "Baños", capacity: 0, wing: "sur", kind: AREA_KINDS.CORE, color: PALETTE.neutral, x: -10.5, z: -5.4, w: 6, d: 5.4, labelPriority: 1 },
  { id: "escaleras", name: "Escaleras", capacity: 0, wing: "sur", kind: AREA_KINDS.CORE, color: PALETTE.neutral, x: -10.5, z: 0.8, w: 6, d: 5.4, labelPriority: 3 },
  { id: "ascensores", name: "Ascensores", capacity: 0, wing: "sur", kind: AREA_KINDS.ELEVATOR, color: PALETTE.neutral, x: -10, z: 7.4, w: 5.6, d: 3, labelPriority: 1 },

  // ================= CENTRO-SUR (open office) =================
  { id: "bpone", name: "BPOne (10) + Phygital (2)", capacity: 12, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: -1, z: -5.4, w: 9.6, d: 4.4, tableShape: "rect", labelPriority: 2 },
  { id: "contact_center", name: "Contact Center", capacity: 10, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.producto, x: 9.4, z: -5.4, w: 9, d: 4.4, tableShape: "rect", labelPriority: 2 },
  { id: "portales", name: "Portales", capacity: 6, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: -1.5, z: 0.6, w: 8, d: 4.2, tableShape: "rect", labelPriority: 2 },
  { id: "venta_digital", name: "Venta y Post Venta Digital", capacity: 9, wing: "sur", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.producto, x: 9, z: 0.6, w: 9, d: 4.2, tableShape: "rect", labelPriority: 2 },

  // ================= CORAZÓN SOCIAL =================
  { id: "cafeteria", name: "Cafetería", capacity: 20, wing: "centro", kind: AREA_KINDS.SOCIAL, color: PALETTE.social, x: 0.5, z: 7.6, w: 12, d: 5, labelPriority: 1 },
  { id: "auditorio", name: "Auditorio", capacity: 30, wing: "centro", kind: AREA_KINDS.AUDITORIUM, color: PALETTE.neutral, x: 12.6, z: 7.4, w: 9, d: 5.4, labelPriority: 1 },

  // ================= ALA NORTE =================
  { id: "sala3", name: "Sala 3", capacity: 10, wing: "norte", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: 16.6, z: -6.6, w: 5.6, d: 4.2, tableShape: "rect", labelPriority: 1 },
  { id: "segmentos_norte", name: "12 Segmentos", capacity: 12, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.segmentos, x: 22.2, z: -6.4, w: 4.2, d: 5.6, tableShape: "rect", labelPriority: 2 },
  { id: "sala5", name: "Sala 5", capacity: 8, wing: "norte", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: 27.4, z: -6.6, w: 5, d: 4.2, tableShape: "rect", labelPriority: 1 },
  { id: "sala4", name: "Sala 4", capacity: 10, wing: "norte", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: 33, z: -6.6, w: 6, d: 4.2, tableShape: "rect", labelPriority: 1 },
  { id: "sala6", name: "Sala 6", capacity: 8, wing: "norte", kind: AREA_KINDS.MEETING, color: PALETTE.sala, x: 38.6, z: -6.4, w: 6.4, d: 4.2, tableShape: "rect", labelPriority: 1 },

  { id: "foundation", name: "Foundation + Capa Común", capacity: 13, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: 17.4, z: -1, w: 9.6, d: 4.4, tableShape: "rect", labelPriority: 2 },
  { id: "banos_norte", name: "Baños", capacity: 0, wing: "norte", kind: AREA_KINDS.CORE, color: PALETTE.neutral, x: 24.6, z: -1.2, w: 4.2, d: 4.6, labelPriority: 1 },
  { id: "transversales", name: "Transversales Tribu", capacity: 8, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.soporte, x: 30.4, z: -1.2, w: 8.4, d: 4.2, tableShape: "rect", labelPriority: 2 },
  { id: "experiencia", name: "Experiencia", capacity: 10, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.experiencia, x: 38.6, z: -1.2, w: 6.6, d: 4.4, tableShape: "round", labelPriority: 2 },

  { id: "atms", name: "ATMS", capacity: 7, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.producto, x: 17.4, z: 4.4, w: 9, d: 4.2, tableShape: "rect", labelPriority: 2 },
  { id: "enrolamiento", name: "Enrolamiento y uso seguro", capacity: 12, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.soporte, x: 28.4, z: 4.2, w: 9.4, d: 4.2, tableShape: "rect", labelPriority: 2 },
  { id: "gaps", name: "Gaps 1 + Gaps 2", capacity: 9, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.tribu, x: 38.6, z: 3.6, w: 6.6, d: 4.2, tableShape: "rect", labelPriority: 2 },
  { id: "bbanking", name: "B.Banking + Datos", capacity: 11, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.producto, x: 27.8, z: 9.4, w: 9.4, d: 4, tableShape: "rect", labelPriority: 2 },
  { id: "evolucion", name: "Evolución Transferencias", capacity: 7, wing: "norte", kind: AREA_KINDS.OPEN_OFFICE, color: PALETTE.soporte, x: 38.6, z: 9, w: 6.6, d: 4, tableShape: "rect", labelPriority: 2 },
];

export const areas = RAW_AREAS.map(scaleArea);
export const areaById = new Map(areas.map((a) => [a.id, a]));

/** Outer perimeter, following the blueprint's irregular silhouette. */
export const footprint = [
  [-31.5, -7.4],
  [-14, -9.2],
  [12, -9.2],
  [20, -10.4],
  [34, -10.4],
  [43.5, -8.6],
  [43.5, 11.6],
  [22, 12.6],
  [-6, 12.2],
  [-24, 10.6],
  [-31.5, 7.4],
].map(([x, z]) => [x * S, z * S]);

/** Where the player steps out of the lift. */
export const spawn = { x: -10 * S, z: 10.4 * S };

export const entrance = { x: -10 * S, z: 9.8 * S, w: 5 * S, label: "ASCENSORES" };

// Rectangles of guaranteed-clear floor. The builder keeps furniture out of
// them so the elevator hallway and the ring around the social heart never
// get sealed off.
export const corridors = [
  { x: -10, z: 10.2, w: 8, d: 3.2 }, // salida de ascensores
  { x: -18, z: 10.2, w: 18, d: 2.6 }, // pasillo hacia el ala sur
  { x: 4, z: 10.8, w: 34, d: 2.4 }, // pasillo frontal
  { x: 4, z: 3.4, w: 40, d: 2 }, // pasillo central
  { x: 4, z: -2.8, w: 40, d: 2 }, // pasillo posterior
  { x: -15.6, z: 3.4, w: 3.6, d: 16 }, // conexión núcleo <-> ala sur
  { x: 13.6, z: 0.6, w: 3.2, d: 22 }, // conexión centro <-> ala norte
].map(scaleArea);

// ---------------------------------------------------------------------
// Gameplay data
// ---------------------------------------------------------------------

const pt = (x, z, extra = {}) => ({ x: x * S, z: z * S, ...extra });

/** Cover props: they block the boss's line of sight like a cubicle would. */
export const plants = [
  pt(-15.6, -3), pt(-15.6, 3.4), pt(-15.6, 9.6),
  pt(-5.2, -2.8), pt(-5.2, 3.4), pt(5.2, -2.8), pt(5.2, 3.4),
  pt(13.6, -3.4), pt(13.6, 4.6), pt(13.6, 10.6),
  pt(22.2, -2.8), pt(22.2, 7.2), pt(34.2, -3.4), pt(34.2, 7),
  pt(-2.4, 10.8), pt(8.2, 10.8), pt(-25, 10.2),
];

/** The boss's patrol loop, threading every wing and the social heart. */
export const patrolRoute = [
  pt(-10, 10.4),
  pt(-20, 10.2),
  pt(-27, 3.4),
  pt(-20, -2.8),
  pt(-5, -2.8),
  pt(-1, 3.4),
  pt(9, 3.4),
  pt(13.6, 10.6),
  pt(2, 10.8),
  pt(13.6, -2.8),
  pt(24, -2.8),
  pt(34, -3.4),
  pt(38.6, 1.2),
  pt(30, 6.8),
  pt(20, 6.8),
  pt(13.6, 3.4),
];

// The forbidden activities. `riskRate` is suspicion per second while doing
// it inside the boss's red cone; `time` is seconds of holding E to finish.
export const activityStations = [
  { id: "coffee", label: "Tomar café", type: "coffee", icon: "☕", ...pt(-3.4, 7.6), area: "cafeteria", risk: "low", riskRate: 14, time: 3 },
  { id: "chat", label: "Chismear con colegas", type: "chat", icon: "💬", ...pt(4.4, 7.8), area: "cafeteria", risk: "medium", riskRate: 22, time: 5, npc: true },
  { id: "movie", label: "Ver televisión", type: "movie", icon: "📺", ...pt(12.6, 7.4), area: "auditorio", risk: "high", riskRate: 36, time: 6 },
  { id: "sleep", label: "Dormir en el escritorio", type: "sleep", icon: "😴", ...pt(-24.8, -3.2), area: "segmentos_sur", risk: "high", riskRate: 36, time: 2.5 },
  { id: "snack", label: "Desayunar a escondidas", type: "snack", icon: "🍪", ...pt(38.6, 1.4), area: "experiencia", risk: "medium", riskRate: 22, time: 4 },
];

export const ACTIVITY_COLORS = {
  coffee: 0xd9a441,
  chat: 0xf2c744,
  sleep: 0x5b9bd5,
  snack: 0x6fbf73,
  movie: 0xd9463b,
};

/** Standing inside one hides the player from the boss outright. */
export const hidingSpots = [
  pt(-31, 3.4, { r: 1.3 * S }),
  pt(-13.6, -8, { r: 1.3 * S }),
  pt(-6.4, 10.8, { r: 1.3 * S }),
  pt(13.6, -8.2, { r: 1.3 * S }),
  pt(24.6, 1.8, { r: 1.3 * S }),
  pt(42, 6.4, { r: 1.3 * S }),
  pt(20.4, 11.6, { r: 1.3 * S }),
];

/** A tap of E pulls the boss off patrol to go investigate. */
export const distractions = [
  { id: "spill", label: "Derramar café", ...pt(-2, 10.8), radius: 1.2 * S, cooldown: 8 },
  { id: "volume", label: "Subir el volumen", ...pt(13.6, 10.6), radius: 1.2 * S, cooldown: 8 },
  { id: "printer", label: "Activar la impresora", ...pt(-15.6, 6.6), radius: 1.2 * S, cooldown: 8 },
  { id: "meeting", label: "Convocar reunión falsa", ...pt(27.4, -2.8), radius: 1.2 * S, cooldown: 10 },
];

/** Background coworkers — set dressing that also blocks line of sight. */
export const npcs = [
  { id: "chat_partner", ...pt(5.4, 7.8), sheet: "npc1", facing: "west" },
  { id: "cafe_regular", ...pt(-1.6, 8.6), sheet: "npc2", facing: "south", sway: 0.5 },
  { id: "run_agencias_worker", ...pt(-20.5, 1.8), sheet: "npc3", facing: "north", sway: 0.45 },
  { id: "segmentos_worker", ...pt(-25, -4.2), sheet: "npc4", facing: "south", sway: 0.4 },
  { id: "foundation_worker", ...pt(17.4, 0.8), sheet: "npc2", facing: "north", sway: 0.5 },
  { id: "experiencia_worker", ...pt(38.6, -2.8), sheet: "npc1", facing: "south", sway: 0.4 },
  { id: "enrolamiento_worker", ...pt(28.4, 6.2), sheet: "npc3", facing: "north", sway: 0.45 },
];

/** Which area contains a world-space point (for the HUD readout). */
export function areaAt(x, z) {
  for (const a of areas) {
    if (x >= a.x - a.w / 2 && x <= a.x + a.w / 2 && z >= a.z - a.d / 2 && z <= a.z + a.d / 2) return a;
  }
  return null;
}

/** Nearest area, so the HUD always has something to show in a corridor. */
export function nearestArea(x, z) {
  let best = null;
  let bestD = Infinity;
  for (const a of areas) {
    const dx = Math.max(Math.abs(x - a.x) - a.w / 2, 0);
    const dz = Math.max(Math.abs(z - a.z) - a.d / 2, 0);
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return { area: best, distance: bestD };
}
