// Isometric office floor plan based on architectural blueprint.
// Replicates the actual "Banca Digital - Piso 7" layout with proper room distribution.
// Origin (0,0) at center. z+ points back (away from entrance), x+ right.

export const ROOM_TYPES = {
  OPEN_PLAN: "open_plan",
  MEETING: "meeting",
  LOUNGE: "lounge",
  SOCIAL: "social",
  UTILITY: "utility",
  MULTIPURPOSE: "multipurpose",
  CIRCULATION: "circulation",
};

// Layout based on blueprint: Left wing (CANALES), Center (CORE/BANCA), Right wing (ESTRATEGIA/ADTECH)
// Top-to-bottom: Canales, Salas de reunion, Multiproposito, Gestion/Segmentos, Elevadores/Banos
export const rooms = [
  // ---- Entrada & Ascensores (bottom) ----
  { id: "lobby", label: "", type: ROOM_TYPES.CIRCULATION, x: -2, z: -9, w: 4, d: 2, accent: 0x2a2d33 },
  { id: "elevadores", label: "ASCENSORES", type: ROOM_TYPES.UTILITY, x: 0, z: -8, w: 3.5, d: 2.2, accent: 0x2b2f38, icon: "🚪" },
  { id: "escaleras", label: "GRADAS", type: ROOM_TYPES.UTILITY, x: 3.5, z: -8, w: 2, d: 2.2, accent: 0x2b2f38, icon: "📍" },
  { id: "banos_a", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: -3.5, z: -8, w: 2.5, d: 2.2, accent: 0x3d4552, icon: "🚻" },

  // ---- Lower section ----
  { id: "canales_low", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -8, z: -4.5, w: 5, d: 3, accent: 0x8b5cf6, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "estrategia", label: "ESTRATEGIA", type: ROOM_TYPES.MEETING, x: 0, z: -4.5, w: 4, d: 3, accent: 0x3a3f4a, icon: "📊" },
  { id: "adtech", label: "ADTECH", type: ROOM_TYPES.OPEN_PLAN, x: 7, z: -4.5, w: 5, d: 3, accent: 0xd9463b, deskRows: 2, deskCols: 3, icon: "📊" },
  { id: "banos_b", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: 12, z: -4.5, w: 2.5, d: 3, accent: 0x3d4552, icon: "🚻" },

  // ---- Middle section ----
  { id: "canales_mid", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -8, z: -0.5, w: 5, d: 3, accent: 0x8b5cf6, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "multiproposito", label: "MULTIPROPOSITO", type: ROOM_TYPES.MULTIPURPOSE, x: 0, z: -0.5, w: 4, d: 3, accent: 0x6d5a8a, icon: "🎮" },
  { id: "gestion", label: "GESTIÓN", type: ROOM_TYPES.OPEN_PLAN, x: 7, z: -0.5, w: 5, d: 3, accent: 0xe0722c, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "sala5_mid", label: "SALA 5", type: ROOM_TYPES.MEETING, x: 12, z: -0.5, w: 2.5, d: 3, accent: 0x5b9bd5, icon: "📅" },

  // ---- Upper section ----
  { id: "canales_top", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -8, z: 3, w: 5, d: 3, accent: 0x8b5cf6, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "sala2", label: "SALA 2", type: ROOM_TYPES.MEETING, x: -4, z: 3, w: 3, d: 3, accent: 0x5b9bd5, icon: "📅" },
  { id: "banca", label: "BANCA DIGITAL", type: ROOM_TYPES.LOUNGE, x: 0, z: 3, w: 4, d: 3, accent: 0xf2c744, icon: "📦" },
  { id: "sala3", label: "SALA 3", type: ROOM_TYPES.MEETING, x: 4.5, z: 3, w: 3, d: 3, accent: 0x5b9bd5, icon: "📅" },
  { id: "segmentos", label: "SEGMENTOS", type: ROOM_TYPES.OPEN_PLAN, x: 8, z: 3, w: 5, d: 3, accent: 0xe0722c, deskRows: 2, deskCols: 3, icon: "👥" },
  { id: "sala4", label: "SALA 4", type: ROOM_TYPES.MEETING, x: 13, z: 3, w: 2.5, d: 3, accent: 0x5b9bd5, icon: "📅" },

  // ---- Top back ----
  { id: "cafe", label: "CAFÉ POWER", type: ROOM_TYPES.SOCIAL, x: 9, z: 6.5, w: 5, d: 2.5, accent: 0xd9a441, icon: "☕" },
];

// Floor footprint boundary (chamfered to match blueprint shape)
export const footprint = [
  [-13, 8],
  [-13, -10],
  [14, -10],
  [14.5, 0],
  [14.5, 7],
  [10, 8],
];

export const entrance = { x: 0, z: -10, w: 3, label: "ENTRADA" };

// ---- Gameplay data ----

export const plants = [
  { x: -10, z: 1.5 },
  { x: -5, z: 5 },
  { x: 2, z: 5 },
  { x: 10, z: 1.5 },
];

// Boss patrol weaves through main corridors and open spaces
export const patrolRoute = [
  { x: -6, z: -6 },
  { x: -6, z: 2 },
  { x: -2, z: 5 },
  { x: 2, z: 5 },
  { x: 9, z: 2 },
  { x: 9, z: -6 },
  { x: 5, z: -4 },
  { x: 0, z: -4 },
];

// Five activities spread across different zones
export const activityStations = [
  { id: "coffee", label: "Tomar café", type: "coffee", icon: "☕", x: 10, z: 6, risk: "low", riskRate: 14, time: 3 },
  { id: "chat", label: "Conversar con colegas", type: "chat", icon: "💬", x: -9, z: 1, risk: "medium", riskRate: 22, time: 5, npc: true },
  { id: "sleep", label: "Dormir en el escritorio", type: "sleep", icon: "😴", x: -9, z: 4, risk: "high", riskRate: 36, time: 2.5 },
  { id: "snack", label: "Desayunar a escondidas", type: "snack", icon: "🍪", x: 8, z: -4, risk: "medium", riskRate: 22, time: 4 },
  { id: "movie", label: "Ver películas", type: "movie", icon: "🎬", x: 0, z: -4.5, risk: "high", riskRate: 36, time: 6 },
];

export const ACTIVITY_COLORS = {
  coffee: 0xd9a441,
  chat: 0xf2c744,
  sleep: 0x5b9bd5,
  snack: 0x6fbf73,
  movie: 0xd9463b,
};

// Hiding spots in corners and alcoves
export const hidingSpots = [
  { x: -11, z: -2, r: 0.9 },
  { x: -11, z: 4, r: 0.9 },
  { x: -2, z: 6.5, r: 0.9 },
  { x: 11, z: 1, r: 0.9 },
  { x: 11, z: -6, r: 0.9 },
];

// Distractions at key points
export const distractions = [
  { id: "spill", label: "Derramar café", x: -6, z: -4, radius: 1, cooldown: 8 },
  { id: "volume", label: "Subir volumen", x: 5, z: 1, radius: 1, cooldown: 8 },
  { id: "printer", label: "Activar impresora", x: 0, z: 3, radius: 1, cooldown: 8 },
];

// NPCs positioned naturally in their work areas
export const npcs = [
  { id: "chat_partner", x: -8.5, z: 1, sheet: "npc1", facing: "east" },
  { id: "canales_worker", x: -9, z: 4.5, sheet: "npc2", facing: "south", sway: 0.3 },
  { id: "segmentos_worker", x: 9, z: 1, sheet: "npc3", facing: "west", sway: 0.3 },
  { id: "gestor", x: 6.5, z: 0.5, sheet: "npc4", facing: "north", sway: 0.25 },
];
