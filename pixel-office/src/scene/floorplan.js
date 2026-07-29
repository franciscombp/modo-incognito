// Simplified top-down layout for classic 2D RPG gameplay.
// Wider corridors, fewer collision issues, simpler patrol routes.
// Origin (0,0) at center. x right, z forward (away from entrance).

export const ROOM_TYPES = {
  OPEN_PLAN: "open_plan",
  MEETING: "meeting",
  LOUNGE: "lounge",
  SOCIAL: "social",
  UTILITY: "utility",
  MULTIPURPOSE: "multipurpose",
  CIRCULATION: "circulation",
};

// Simplified room layout: 3 main zones plus entrance
export const rooms = [
  // ---- Top zone (back of floor) ----
  { id: "zone_top_left", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -8, z: 6, w: 6, d: 4, accent: 0x8b5cf6, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "zone_top_mid", label: "BANCA", type: ROOM_TYPES.MEETING, x: 0, z: 6, w: 6, d: 4, accent: 0xf2c744, icon: "📦" },
  { id: "zone_top_right", label: "CAFÉ", type: ROOM_TYPES.SOCIAL, x: 8, z: 6, w: 6, d: 4, accent: 0xd9a441, icon: "☕" },

  // ---- Middle zone ----
  { id: "zone_mid_left", label: "TRABAJO", type: ROOM_TYPES.OPEN_PLAN, x: -8, z: 0, w: 6, d: 4, accent: 0xe0722c, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "zone_mid_center", label: "MULTIPROPÓSITO", type: ROOM_TYPES.MULTIPURPOSE, x: 0, z: 0, w: 6, d: 4, accent: 0x6d5a8a, icon: "🎮" },
  { id: "zone_mid_right", label: "ESTRATEGIA", type: ROOM_TYPES.OPEN_PLAN, x: 8, z: 0, w: 6, d: 4, accent: 0xd9463b, deskRows: 2, deskCols: 3, icon: "📊" },

  // ---- Bottom zone (near entrance) ----
  { id: "banos_left", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: -5, z: -6, w: 4, d: 3, accent: 0x3d4552, icon: "🚻" },
  { id: "elevadores", label: "ELEVADORES", type: ROOM_TYPES.UTILITY, x: 0, z: -6, w: 4, d: 3, accent: 0x2b2f38, icon: "🚪" },
  { id: "banos_right", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: 5, z: -6, w: 4, d: 3, accent: 0x3d4552, icon: "🚻" },
];

export const footprint = [
  [-11, 8.2],
  [11, 8.2],
  [11, -7.6],
  [-11, -7.6],
];

export const entrance = { x: 0, z: -10, w: 3, label: "ENTRADA" };

// ---- Gameplay data ----

export const plants = [
  { x: -8, z: 3.5 },
  { x: 0, z: 3.5 },
  { x: 8, z: 3.5 },
];

// Simple rectangular patrol route around the center
export const patrolRoute = [
  { x: -6, z: 4 },
  { x: 6, z: 4 },
  { x: 6, z: -4 },
  { x: -6, z: -4 },
];

// Five activities positioned for easy access without collision
export const activityStations = [
  { id: "coffee", label: "Tomar café", type: "coffee", icon: "☕", x: 9, z: 5, risk: "low", riskRate: 14, time: 3 },
  { id: "chat", label: "Conversar con colegas", type: "chat", icon: "💬", x: -9, z: 1, risk: "medium", riskRate: 22, time: 5, npc: true },
  { id: "sleep", label: "Dormir en el escritorio", type: "sleep", icon: "😴", x: -9, z: 5, risk: "high", riskRate: 36, time: 2.5 },
  { id: "snack", label: "Desayunar a escondidas", type: "snack", icon: "🍪", x: 9, z: -4, risk: "medium", riskRate: 22, time: 4 },
  { id: "movie", label: "Ver películas", type: "movie", icon: "🎬", x: 0, z: -4, risk: "high", riskRate: 36, time: 6 },
];

export const ACTIVITY_COLORS = {
  coffee: 0xd9a441,
  chat: 0xf2c744,
  sleep: 0x5b9bd5,
  snack: 0x6fbf73,
  movie: 0xd9463b,
};

// Hiding spots spread around perimeter
export const hidingSpots = [
  { x: -10, z: 1, r: 0.9 },
  { x: -10, z: 5, r: 0.9 },
  { x: 10, z: 1, r: 0.9 },
  { x: 10, z: 5, r: 0.9 },
  { x: 0, z: -7.5, r: 0.9 },
];

// Distractions at strategic points
export const distractions = [
  { id: "spill", label: "Derramar café", x: -6, z: 1, radius: 1.1, cooldown: 8 },
  { id: "volume", label: "Subir volumen", x: 6, z: 1, radius: 1.1, cooldown: 8 },
  { id: "printer", label: "Activar impresora", x: 0, z: 1, radius: 1.1, cooldown: 8 },
];

// Few NPCs, well-placed to avoid collisions
export const npcs = [
  { id: "chat_partner", x: -9, z: 1, sheet: "npc1", facing: "east" },
  { id: "worker_1", x: -8, z: 5, sheet: "npc2", facing: "south", sway: 0.3 },
  { id: "worker_2", x: 8, z: 5, sheet: "npc3", facing: "north", sway: 0.3 },
];
