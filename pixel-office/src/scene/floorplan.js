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
  { id: "canales_top", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: 7.5, w: 8, d: 4, accent: 0x8b5cf6, deskRows: 2, deskCols: 4 },
  { id: "sala2", label: "SALA 2", type: ROOM_TYPES.MEETING, x: -2.6, z: 7.5, w: 4.2, d: 4, accent: 0x5b9bd5 },
  { id: "banca_digital", label: "BANCA DIGITAL", type: ROOM_TYPES.LOUNGE, x: 1.8, z: 7.5, w: 4.4, d: 4, accent: 0xf2c744 },
  { id: "sala3", label: "SALA 3", type: ROOM_TYPES.MEETING, x: 6.2, z: 7.5, w: 4.2, d: 4, accent: 0x5b9bd5 },
  { id: "cafe_power", label: "CAFÉ POWER", type: ROOM_TYPES.SOCIAL, x: 10.6, z: 7.5, w: 4.6, d: 4, accent: 0xd9a441 },

  // ---- Upper-mid wing ----
  { id: "sala1", label: "SALA 1", type: ROOM_TYPES.MEETING, x: -12.6, z: 3.4, w: 3.4, d: 4.2, accent: 0x5b9bd5 },
  { id: "breakout_left", label: "", type: ROOM_TYPES.LOUNGE, x: -8.4, z: 3.2, w: 5, d: 4.2, accent: 0x9b7bb0 },
  { id: "segmentos", label: "SEGMENTOS", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: 3.2, w: 7.2, d: 4.4, accent: 0xe0722c, deskRows: 2, deskCols: 4 },
  { id: "sala4", label: "SALA 4", type: ROOM_TYPES.MEETING, x: 12.6, z: 6, w: 3.6, d: 3.6, accent: 0x5b9bd5 },
  { id: "sala5_top", label: "SALA 5", type: ROOM_TYPES.MEETING, x: 12.6, z: 1.8, w: 3.6, d: 3.6, accent: 0x5b9bd5 },

  // ---- Center ----
  { id: "multiproposito", label: "ÁREA MULTIPROPÓSITO", type: ROOM_TYPES.MULTIPURPOSE, x: -0.9, z: -0.6, w: 8.6, d: 6.6, accent: 0x6d5a8a },

  // ---- Lower-mid wing ----
  { id: "canales_bottom", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: -0.8, w: 8, d: 4.6, accent: 0x8b5cf6, deskRows: 2, deskCols: 4 },
  { id: "gestion_interacciones", label: "GESTIÓN DE\nINTERACCIONES", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: -1.2, w: 7.2, d: 4.6, accent: 0xe0722c, deskRows: 2, deskCols: 4 },
  { id: "sala5_bottom", label: "SALA 5", type: ROOM_TYPES.MEETING, x: 12.6, z: -1.6, w: 3.6, d: 3.8, accent: 0x5b9bd5 },

  // ---- Lower wing ----
  { id: "canales_low", label: "CANALES", type: ROOM_TYPES.OPEN_PLAN, x: -9, z: -5, w: 8, d: 4, accent: 0x8b5cf6, deskRows: 2, deskCols: 4 },
  { id: "estrategia", label: "ESTRATEGIA\nINTERACCIONES /\nMKT ANALYTICS", type: ROOM_TYPES.MEETING, x: -0.6, z: -5.6, w: 5.2, d: 3.6, accent: 0x3a3f4a },
  { id: "adtech", label: "ADTECH", type: ROOM_TYPES.OPEN_PLAN, x: 6.4, z: -5.6, w: 7.2, d: 3.8, accent: 0xd9463b, deskRows: 2, deskCols: 4 },

  // ---- Front / lobby ----
  { id: "banos_a", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: -4.6, z: -8.4, w: 3.2, d: 3, accent: 0x3d4552 },
  { id: "elevadores", label: "ELEVADORES", type: ROOM_TYPES.UTILITY, x: -0.6, z: -8.6, w: 3.6, d: 2.8, accent: 0x2b2f38 },
  { id: "banos_b", label: "BAÑOS", type: ROOM_TYPES.UTILITY, x: 4, z: -8.4, w: 3.2, d: 3, accent: 0x3d4552 },
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
