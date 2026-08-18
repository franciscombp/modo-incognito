// Active scene store.
//
// The floor plan itself lives in public/data/scenes/*.json — this module just
// holds whichever scene is currently loaded and exposes it as live bindings,
// so the builder, the camera and the gameplay code can keep importing plain
// names instead of threading a scene object through every call.
//
// Call `setActiveScene()` (main.js does it at boot) before building anything.

export { WORLD_SCALE } from "./config.js";

export const AREA_KINDS = {
  OPEN_OFFICE: "open-office", // one big table + chairs on a colour patch
  MEETING: "meeting", // glassed room, big table inside
  SOCIAL: "social", // cafetería
  AUDITORIUM: "auditorium", // stage + rows of chairs
  CORE: "core", // restrooms / stairs / installations: solid volume
  ELEVATOR: "elevator", // entry point
};

export const ACTIVITY_COLORS = {
  coffee: 0xd9a441,
  // Antes compartía el mismo amarillo que las estrellas de distracción —
  // dos marcadores de piso con el mismo color pero significados distintos,
  // así que era imposible saber cuál era cuál de un vistazo.
  chat: 0xc9a0e8,
  sleep: 0x5b9bd5,
  snack: 0x6fbf73,
  movie: 0xd9463b,
};

export let scene = null;
export let areas = [];
export let areaById = new Map();
export let footprint = [];
export let spawn = { x: 0, z: 0 };
export let entrance = { x: 0, z: 0, w: 0, label: "" };
export let corridors = [];
export let plants = [];
export let patrolRoute = [];
export let routes = {};
export let activityStations = [];
export let hidingSpots = [];
export let coartadas = [];
export let safeSpots = [];
export let puestos = [];
export let distractions = [];
export let npcs = [];
export let locationEggs = [];
export let barriers = [];

export function setActiveScene(prepared) {
  scene = prepared;
  areas = prepared.areas;
  areaById = prepared.areaById;
  footprint = prepared.footprint;
  spawn = prepared.spawn;
  entrance = prepared.entrance;
  corridors = prepared.corridors;
  plants = prepared.plants;
  patrolRoute = prepared.patrolRoute;
  routes = prepared.routes ?? {};
  activityStations = prepared.activityStations;
  hidingSpots = prepared.hidingSpots;
  coartadas = prepared.coartadas ?? [];
  safeSpots = prepared.safeSpots ?? [];
  puestos = prepared.puestos ?? [];
  distractions = prepared.distractions;
  npcs = prepared.npcs;
  locationEggs = prepared.locationEggs;
  barriers = prepared.barriers ?? [];
  return prepared;
}

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
