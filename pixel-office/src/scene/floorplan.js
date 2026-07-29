// Data-driven layout of "Banca Digital - Piso 7".
// Everything is expressed in grid cells (1 cell = 1 world unit ≈ 1 desk-width).
// Origin (0,0) sits at the center of the floor, near the elevator core.
// x grows to the right, z grows toward the back (away from the entrance).
//
// This is intentionally a simplified, rectilinear reading of the reference
// image: it keeps the same rooms, the same relative placement and the same
// circulation (entrance -> lobby -> elevator core -> wings), so it can later
// receive real textures/sprites without reshaping the level.

export const ROOM_TYPES = {
  OPEN_PLAN: "open_plan", // desks in rows, no walls (bullpen)
  MEETING: "meeting", // glassed-in room with a table
  LOUNGE: "lounge", // soft seating / breakout
  SOCIAL: "social", // kitchen / café
  UTILITY: "utility", // restrooms, elevators
  MULTIPURPOSE: "multipurpose", // games / bean bags
  CIRCULATION: "circulation", // open corridors / lobby
};

// Each room: { id, label, type, x, z, w, d, accent, deskRows, deskCols }
// (x, z) is the room's center; (w, d) are width (x) and depth (z).
export const rooms = [
  // ---- Top wing (back of the floor) ----
  { id: "canales_top", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: 7.5, w: 8, d: 4, accent: 0x8b5cf6, deskRows: 2, deskCols: 4, pill: "solid", icon: "👥" },
  { id: "sala2", label: "SALA 2", type: ROOM_TYPES.MEETING, x: -2.6, z: 7.5, w: 4.2, d: 4, accent: 0x5b9bd5, icon: "📅" },
  { id: "banca_digital", label: "BANCA DIGITAL", type: ROOM_TYPES.LOUNGE, x: 1.8, z: 7.5, w: 4.4, d: 4, accent: 0xf2c744, pill: "solid", dark: true, icon: "📦" },
  { id: "sala3", label: "SALA 3", type: ROOM_TYPES.MEETING, x: 6.2, z: 7.5, w: 4.2, d: 4, accent: 0x5b9bd5, icon: "📅" },
  { id: "cafe_power", label: "CAFÉ POWER", type: ROOM_TYPES.SOCIAL, x: 10.6, z: 7.5, w: 4.6, d: 4, accent: 0xd9a441, pill: "solid", dark: true, icon: "☕" },

  // ---- Upper-mid wing ----
  { id: "sala1", label: "SALA 1", type: ROOM_TYPES.MEETING, x: -12.6, z: 3.4, w: 3.4, d: 4.2, accent: 0x5b9bd5, icon: "📅" },
  { id: "breakout_left", label: "", type: ROOM_TYPES.LOUNGE, x: -8.4, z: 3.2, w: 5, d: 4.2, accent: 0x9b7bb0 },
  { id: "segmentos", label: "SEGMENTOS", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: 3.2, w: 7.2, d: 4.4, accent: 0xe0722c, deskRows: 2, deskCols: 4, pill: "solid", icon: "👥" },
  { id: "sala4", label: "SALA 4", type: ROOM_TYPES.MEETING, x: 12.6, z: 6, w: 3.6, d: 3.6, accent: 0x5b9bd5, icon: "📅" },
  { id: "sala5_top", label: "SALA 5", type: ROOM_TYPES.MEETING, x: 12.6, z: 1.8, w: 3.6, d: 3.6, accent: 0x5b9bd5, icon: "📅" },

  // ---- Center ----
  { id: "multiproposito", label: "ÁREA MULTIPROPÓSITO", type: ROOM_TYPES.MULTIPURPOSE, x: -0.9, z: -0.6, w: 8.6, d: 6.6, accent: 0x6d5a8a, icon: "🎮" },

  // ---- Lower-mid wing ----
  { id: "canales_bottom", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: -0.8, w: 8, d: 4.6, accent: 0x8b5cf6, deskRows: 2, deskCols: 4, pill: "solid", icon: "👥" },
  { id: "gestion_interacciones", label: "GESTIÓN DE\nINTERACCIONES", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: -1.2, w: 7.2, d: 4.6, accent: 0xe0722c, deskRows: 2, deskCols: 4, pill: "solid", icon: "👥" },
  { id: "sala5_bottom", label: "SALA 5", type: ROOM_TYPES.MEETING, x: 12.6, z: -1.6, w: 3.6, d: 3.8, accent: 0x5b9bd5, icon: "📅" },

  // ---- Lower wing ----
  { id: "canales_low", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: -5, w: 8, d: 3.6, accent: 0x8b5cf6, deskRows: 2, deskCols: 4, pill: "solid", icon: "👥" },
  { id: "estrategia", label: "ESTRATEGIA\nINTERACCIONES /\nMKT ANALYTICS", type: ROOM_TYPES.MEETING, x: -0.6, z: -5.3, w: 5.2, d: 2.8, accent: 0x3a3f4a, icon: "📅" },
  { id: "adtech", label: "ADTECH", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: -5.1, w: 7.2, d: 3.2, accent: 0xd9463b, deskRows: 2, deskCols: 4, pill: "solid", icon: "📊" },

  // ---- Front / lobby ----
  { id: "banos_a", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: -4.6, z: -8.4, w: 3.2, d: 3, accent: 0x3d4552, icon: "🚻" },
  { id: "elevadores", label: "ELEVADORES", type: ROOM_TYPES.UTILITY, x: -0.6, z: -8.6, w: 3.6, d: 2.8, accent: 0x2b2f38, icon: "🚪" },
  { id: "banos_b", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: 4, z: -8.4, w: 3.2, d: 3, accent: 0x3d4552, icon: "🚻" },
  { id: "lobby", label: "", type: ROOM_TYPES.CIRCULATION, x: -0.6, z: -10.6, w: 5.4, d: 2.4, accent: 0x2a2d33 },
];

// Rough outer footprint (chamfered octagon) that encloses every room above,
// echoing the tapered top/bottom silhouette from the reference art.
export const footprint = [
  [-13, 9.6],
  [13.6, 9.6],
  [15.4, 6.8],
  [15.4, -3.6],
  [13, -7.4],
  [3.2, -9.6],
  [-3.4, -9.6],
  [-13.6, -7.4],
  [-15.4, -3.6],
  [-15.4, 6.8],
];

export const entrance = { x: -0.6, z: -12, w: 3, label: "ENTRADA" };

// ---------------------------------------------------------------------
// Gameplay data — expressed directly in *scene* space (x, z), i.e. what
// the player/boss/npc entities actually use: +z points toward the
// entrance/front, -z toward the back wing. Equivalent to (room.x,
// -room.z) for any room above. Kept separate from the room list because
// none of this needs to travel through the builder's local room groups.
// ---------------------------------------------------------------------

// Cover props scattered through the open-plan areas — they block the
// boss's line of sight just like a desk or cubicle wall would.
export const plants = [
  { x: -5.0, z: -6.4 },
  { x: -5.0, z: -1.2 },
  { x: -5.0, z: 3.0 },
  { x: -5.0, z: 7.2 },
  { x: 3.6, z: -6.4 },
  { x: 3.6, z: -1.2 },
  { x: 3.6, z: 3.0 },
  { x: 3.6, z: 7.2 },
  { x: -0.9, z: -3.6 },
  { x: -0.9, z: 4.6 },
  { x: -12.4, z: -0.2 },
  { x: 10.4, z: -0.4 },
];

// Loop the boss patrols, weaving through the open bullpens so it passes
// close to every activity station. Rotation between waypoints doubles as
// "el cono gira al patrullar".
export const patrolRoute = [
  { x: -0.6, z: -6.4 },
  { x: -9.0, z: 0.8 },
  { x: -9.0, z: 5.0 },
  { x: -0.6, z: 5.9 },
  { x: 6.4, z: 5.1 },
  { x: 6.4, z: 1.2 },
  { x: 6.4, z: -3.2 },
  { x: 1.8, z: -6.4 },
  { x: 9.4, z: -6.2 },
];

// The five "actividades prohibidas" from the design doc. riskRate is the
// suspicion gained per second while performing the activity in the boss's
// (red) cone; `time` is seconds of holding E needed to complete it once.
export const activityStations = [
  { id: "coffee", label: "Tomar café", type: "coffee", icon: "☕", x: 9.3, z: -6.1, risk: "low", riskRate: 14, time: 3 },
  { id: "chat", label: "Conversar con colegas", type: "chat", icon: "💬", x: -8.2, z: -2.9, risk: "medium", riskRate: 22, time: 5, npc: true },
  { id: "sleep", label: "Dormir en el escritorio", type: "sleep", icon: "😴", x: -11.4, z: 4.4, risk: "high", riskRate: 36, time: 2.5 },
  { id: "snack", label: "Desayunar a escondidas", type: "snack", icon: "🍪", x: -11.4, z: 1.0, risk: "medium", riskRate: 22, time: 4 },
  { id: "movie", label: "Ver películas", type: "movie", icon: "🎬", x: 1.8, z: -6.4, risk: "high", riskRate: 36, time: 6 },
];

// Shared color-per-activity-type map so the 3D floor markers and the HUD
// checklist read as the same palette.
export const ACTIVITY_COLORS = {
  coffee: 0xd9a441,
  chat: 0xf2c744,
  sleep: 0x5b9bd5,
  snack: 0x6fbf73,
  movie: 0xd9463b,
};

// "ESCONDITE" — matches the green-shield legend icon from the reference
// image. Standing inside one hides the player from the boss outright.
export const hidingSpots = [
  { x: -10.6, z: -2.0, r: 1.15 },
  { x: -3.4, z: 2.4, r: 1.15 },
  { x: 9.2, z: 4.1, r: 1.15 },
  { x: 11.2, z: -1.3, r: 1.15 },
  { x: 11.2, z: 2.6, r: 1.15 },
];

// "DISTRACCIÓN" — the yellow-star legend icon. A tap of E near one pulls
// the boss off its patrol to go investigate for a while.
export const distractions = [
  { id: "spill", label: "Derramar café", x: -5.6, z: -6.6, radius: 1.1, cooldown: 8 },
  { id: "volume", label: "Subir volumen", x: -2.0, z: 1.7, radius: 1.1, cooldown: 8 },
  { id: "printer", label: "Activar impresora", x: -2.4, z: 4.3, radius: 1.1, cooldown: 8 },
];

// Background coworkers: mostly idle set-dressing, but they also block the
// boss's line of sight and one of them anchors the "chat" activity.
export const npcs = [
  { id: "chat_partner", x: -7.6, z: -3.1, sheet: "npc1", facing: "east" },
  { id: "canales_worker_1", x: -9.6, z: -6.4, sheet: "npc2", facing: "south", sway: 0.5 },
  { id: "segmentos_worker", x: 6.2, z: -2.2, sheet: "npc3", facing: "south", sway: 0.45 },
  { id: "adtech_worker", x: 7.0, z: 6.4, sheet: "npc4", facing: "north", sway: 0.5 },
  { id: "canales_worker_2", x: -9.0, z: 1.0, sheet: "npc3", facing: "south", sway: 0.4 },
  { id: "gestion_worker", x: 5.4, z: 1.4, sheet: "npc1", facing: "north", sway: 0.4 },
];
