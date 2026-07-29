// Architectural reconstruction of "Banca Digital - Piso 7"
// Based on blueprint floor plan with faithful layout and capacity mapping

const WORLD_SCALE = 1.5;

// Floor perimeter (irregular with chamfers) - outer boundary
export const floorPerimeter = [
  { x: -15, z: -10 },
  { x: -15, z: 8 },
  { x: -12, z: 9.5 },
  { x: 8, z: 9.5 },
  { x: 12, z: 8 },
  { x: 15, z: 8 },
  { x: 15, z: -2 },
  { x: 14, z: -4 },
  { x: 14, z: -10 }
].map(p => ({ x: p.x * WORLD_SCALE, z: p.z * WORLD_SCALE }));

// Walls and barriers
export const walls = [
  // Main perimeter - implicit from floorPerimeter

  // Left wing boundary
  { start: { x: -11, z: -5 }, end: { x: -11, z: 3 } },

  // Center-right boundary
  { start: { x: 4, z: -5 }, end: { x: 4, z: 8 } },

  // Right wing boundary
  { start: { x: 11, z: -5 }, end: { x: 11, z: 8 } }
].map(w => ({
  start: { x: w.start.x * WORLD_SCALE, z: w.start.z * WORLD_SCALE },
  end: { x: w.end.x * WORLD_SCALE, z: w.end.z * WORLD_SCALE }
}));

// Closed rooms (salas, baños, núcleos)
export const rooms = [
  // Access / utilities
  {
    id: "entrada_lobby",
    name: "ENTRADA",
    type: "lobby",
    x: -7, z: -9,
    width: 6, depth: 1.5,
    walkable: true
  },
  {
    id: "ascensores",
    name: "ASCENSORES",
    type: "core",
    x: -2, z: -8.5,
    width: 3, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "gradas",
    name: "GRADAS",
    type: "core",
    x: 1.5, z: -8.5,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "banos_a",
    name: "BAÑOS",
    type: "utility",
    x: -11, z: -8.5,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "banos_b",
    name: "BAÑOS",
    type: "utility",
    x: 9, z: 7,
    width: 2.5, depth: 1.5,
    walkable: false,
    capacity: null
  },

  // Meeting rooms
  {
    id: "sala1",
    name: "SALA 1",
    type: "meeting-room",
    x: -12, z: 2,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "sala2",
    name: "SALA 2",
    type: "meeting-room",
    x: -6, z: 5,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "sala3",
    name: "SALA 3",
    type: "meeting-room",
    x: 0.5, z: 5,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "sala4",
    name: "SALA 4",
    type: "meeting-room",
    x: 5, z: 5,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  },
  {
    id: "sala6",
    name: "SALA 6",
    type: "meeting-room",
    x: 12, z: 3,
    width: 2.5, depth: 2,
    walkable: false,
    capacity: null
  }
].map(r => ({
  ...r,
  x: r.x * WORLD_SCALE,
  z: r.z * WORLD_SCALE,
  width: r.width * WORLD_SCALE,
  depth: r.depth * WORLD_SCALE
}));

// Open office areas with capacity mapping
export const openAreas = [
  // Left wing
  {
    id: "segmentos_12",
    name: "Segmentos",
    capacity: 12,
    type: "open-office",
    x: -12, z: 1,
    width: 4, depth: 3.5,
    furniture: "desk-cluster-12"
  },
  {
    id: "run_agencias_14",
    name: "Run Agencias",
    capacity: 14,
    type: "open-office",
    x: -10, z: -4,
    width: 4.5, depth: 2.5,
    furniture: "bench-double-14"
  },
  {
    id: "cfr_transversales",
    name: "CFR + Transversales Tribu",
    capacity: 10,  // 7 + 3
    type: "open-office",
    subgroups: [
      { name: "CFR", capacity: 7 },
      { name: "Transversales", capacity: 3 }
    ],
    x: -7, z: -3,
    width: 3.5, depth: 2,
    furniture: "desk-cluster-mixed"
  },

  // Center-left
  {
    id: "bpone_phygital",
    name: "BPOne + Phygital",
    capacity: 12,  // 10 + 2
    type: "open-office",
    subgroups: [
      { name: "BPOne", capacity: 10 },
      { name: "Phygital", capacity: 2 }
    ],
    x: -2, z: 2,
    width: 3.5, depth: 3,
    furniture: "bench-compact-12"
  },
  {
    id: "portales",
    name: "Portales",
    capacity: 6,
    type: "open-office",
    x: 2, z: 0,
    width: 2.5, depth: 2,
    furniture: "desk-cluster-6"
  },

  // Center
  {
    id: "contact_center",
    name: "Contact Center",
    capacity: 10,
    type: "open-office",
    x: -1, z: -3,
    width: 3, depth: 2.5,
    furniture: "bench-contact-10"
  },
  {
    id: "venta_digital",
    name: "Venta y Post Venta Digital",
    capacity: 9,
    type: "open-office",
    x: 3, z: -3,
    width: 3, depth: 2.5,
    furniture: "desk-cluster-9"
  },

  // Center-right
  {
    id: "foundation",
    name: "Foundation + Capa Común + Migración",
    capacity: 13,
    type: "open-office",
    subgroups: [
      { name: "Foundation", capacity: 6 },
      { name: "Capa Común", capacity: 4 },
      { name: "Migración", capacity: 3 }
    ],
    x: 7, z: 2,
    width: 4, depth: 3,
    furniture: "bench-mixed-13"
  },
  {
    id: "atms",
    name: "ATMS",
    capacity: 7,
    type: "open-office",
    x: 11, z: 0,
    width: 2.5, depth: 2,
    furniture: "desk-cluster-7"
  },

  // Right wing
  {
    id: "bbanking_datos",
    name: "B.Banking + Datos",
    capacity: 11,  // 1 + 10
    type: "open-office",
    subgroups: [
      { name: "B.Banking", capacity: 1 },
      { name: "Datos", capacity: 10 }
    ],
    x: 12, z: -4,
    width: 3, depth: 2.5,
    furniture: "bench-mixed-11"
  },
  {
    id: "enrolamiento",
    name: "Enrolamiento y uso seguro",
    capacity: 12,
    type: "open-office",
    x: 12, z: 0,
    width: 3, depth: 2.5,
    furniture: "bench-double-12"
  },

  // Far right - specialized zones
  {
    id: "experiencia",
    name: "Experiencia",
    capacity: 10,
    type: "open-office",
    x: 13, z: 5,
    width: 2.5, depth: 2,
    furniture: "desk-cluster-10"
  },
  {
    id: "gaps",
    name: "Gaps 1 + Gaps 2",
    capacity: 9,  // distributed
    type: "open-office",
    subgroups: [
      { name: "Gaps 1", capacity: 5 },
      { name: "Gaps 2", capacity: 4 }
    ],
    x: 12, z: 6,
    width: 2.5, depth: 1.5,
    furniture: "desk-distributed-9"
  },
  {
    id: "transversales_tribu",
    name: "Transversales Tribu",
    capacity: 8,
    type: "open-office",
    x: 9, z: 3,
    width: 2.5, depth: 2,
    furniture: "desk-cluster-8"
  },
  {
    id: "evolucion",
    name: "Evolución Transferencias",
    capacity: 7,
    type: "open-office",
    x: 6, z: -1,
    width: 2.5, depth: 2,
    furniture: "desk-cluster-7"
  }
].map(a => ({
  ...a,
  x: a.x * WORLD_SCALE,
  z: a.z * WORLD_SCALE,
  width: a.width * WORLD_SCALE,
  depth: a.depth * WORLD_SCALE
}));

// Circulation paths
export const corridors = [
  {
    id: "main_north_south",
    start: { x: 0, z: -9 },
    end: { x: 0, z: 9 },
    width: 1.5
  },
  {
    id: "main_east_west",
    start: { x: -14, z: 0 },
    end: { x: 14, z: 0 },
    width: 1.5
  },
  {
    id: "secondary_north",
    start: { x: -8, z: -6 },
    end: { x: -8, z: 4 },
    width: 1.2
  },
  {
    id: "secondary_south",
    start: { x: 8, z: -5 },
    end: { x: 8, z: 6 },
    width: 1.2
  }
].map(c => ({
  ...c,
  start: { x: c.start.x * WORLD_SCALE, z: c.start.z * WORLD_SCALE },
  end: { x: c.end.x * WORLD_SCALE, z: c.end.z * WORLD_SCALE },
  width: c.width * WORLD_SCALE
}));

// Collision volumes
export const colliders = [
  // Perimeter walls
  ...walls.map(w => ({
    type: "wall",
    start: w.start,
    end: w.end,
    height: 2.5,
    thickness: 0.3
  })),

  // Room doors/boundaries
  ...rooms.map(r => ({
    type: "room",
    center: { x: r.x, z: r.z },
    width: r.width,
    depth: r.depth,
    walkable: r.walkable
  }))
];

// Gameplay elements
export const activityStations = [
  {
    id: "coffee_main",
    name: "Tomar café",
    type: "coffee",
    x: 0 * WORLD_SCALE,
    z: 7 * WORLD_SCALE,
    capacity: 4,
    riskRate: 14,
    time: 3
  },
  {
    id: "chat_meeting",
    name: "Conversar con colegas",
    type: "chat",
    x: -6 * WORLD_SCALE,
    z: 5 * WORLD_SCALE,
    capacity: 4,
    riskRate: 22,
    time: 5,
    hasNpc: true
  },
  {
    id: "sleep_desk",
    name: "Dormir en el escritorio",
    type: "sleep",
    x: -10 * WORLD_SCALE,
    z: 1 * WORLD_SCALE,
    capacity: 1,
    riskRate: 36,
    time: 2.5
  },
  {
    id: "snack_pantry",
    name: "Desayunar a escondidas",
    type: "snack",
    x: 3 * WORLD_SCALE,
    z: -3 * WORLD_SCALE,
    capacity: 3,
    riskRate: 22,
    time: 4
  },
  {
    id: "movie_screen",
    name: "Ver películas",
    type: "movie",
    x: 8 * WORLD_SCALE,
    z: -2 * WORLD_SCALE,
    capacity: 2,
    riskRate: 36,
    time: 6
  }
];

export const hidingSpots = [
  { x: -13 * WORLD_SCALE, z: -2 * WORLD_SCALE, r: 0.7 * WORLD_SCALE },
  { x: -13 * WORLD_SCALE, z: 4 * WORLD_SCALE, r: 0.7 * WORLD_SCALE },
  { x: 2 * WORLD_SCALE, z: 8 * WORLD_SCALE, r: 0.7 * WORLD_SCALE },
  { x: 13 * WORLD_SCALE, z: -2 * WORLD_SCALE, r: 0.7 * WORLD_SCALE },
  { x: 13 * WORLD_SCALE, z: 6 * WORLD_SCALE, r: 0.7 * WORLD_SCALE }
];

export const distractions = [
  {
    id: "spill",
    name: "Derramar café",
    x: -8 * WORLD_SCALE,
    z: -4 * WORLD_SCALE,
    radius: 0.8 * WORLD_SCALE,
    cooldown: 8
  },
  {
    id: "volume",
    name: "Subir volumen",
    x: 5 * WORLD_SCALE,
    z: 2 * WORLD_SCALE,
    radius: 0.8 * WORLD_SCALE,
    cooldown: 8
  },
  {
    id: "printer",
    name: "Activar impresora",
    x: 10 * WORLD_SCALE,
    z: -3 * WORLD_SCALE,
    radius: 0.8 * WORLD_SCALE,
    cooldown: 8
  }
];

export const npcs = [
  {
    id: "chat_partner",
    name: "Colega",
    x: -6 * WORLD_SCALE,
    z: 5 * WORLD_SCALE,
    facing: "east",
    sway: 0.2
  },
  {
    id: "worker_segmentos",
    name: "Trabajador",
    x: -11 * WORLD_SCALE,
    z: 1.5 * WORLD_SCALE,
    facing: "south",
    sway: 0.25
  },
  {
    id: "worker_contact",
    name: "Agente",
    x: -1 * WORLD_SCALE,
    z: -3 * WORLD_SCALE,
    facing: "north",
    sway: 0.2
  },
  {
    id: "worker_experiencia",
    name: "Especialista",
    x: 13 * WORLD_SCALE,
    z: 5 * WORLD_SCALE,
    facing: "west",
    sway: 0.15
  }
];

export const patrolRoute = [
  { x: -7 * WORLD_SCALE, z: -6 * WORLD_SCALE },
  { x: -7 * WORLD_SCALE, z: 4 * WORLD_SCALE },
  { x: 0 * WORLD_SCALE, z: 6 * WORLD_SCALE },
  { x: 8 * WORLD_SCALE, z: 4 * WORLD_SCALE },
  { x: 12 * WORLD_SCALE, z: 2 * WORLD_SCALE },
  { x: 12 * WORLD_SCALE, z: -5 * WORLD_SCALE },
  { x: 5 * WORLD_SCALE, z: -4 * WORLD_SCALE },
  { x: 0 * WORLD_SCALE, z: -5 * WORLD_SCALE }
];

// Label priorities and visibility rules
export const labelConfig = {
  priority: {
    "lobby": 3,
    "core": 3,
    "meeting-room": 2,
    "open-office": 1,
    "utility": 2
  },
  maxDistance: 20 * WORLD_SCALE,
  fadeStart: 15 * WORLD_SCALE,
  hideDistance: 25 * WORLD_SCALE
};

export const WORLD_SCALE_EXPORT = WORLD_SCALE;
