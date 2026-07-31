import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  areas,
  footprint,
  entrance,
  corridors,
  AREA_KINDS,
  plants,
  hidingSpots,
  safeSpots,
  distractions,
  activityStations,
  barriers,
  ACTIVITY_COLORS,
} from "./floorplan.js";
import { WORLD_SCALE as S } from "./config.js";
import { createLabel } from "./labels.js";
import { texturedMaterial, getTexture } from "./textures.js";
import { cozyMaterial, SURFACES } from "./cozy.js";
import { createFurnitureRegistry, placeSeatedTable, placeBistroTable } from "./furniture.js";

const GLASS_WALL_H = 1.9 * S;
const PERIMETER_WALL_H = 2.2 * S;
const CORE_H = 2.6 * S;

/**
 * Builds the whole floor from the `areas` table. Every solid piece registers
 * itself in the collision world as it is created, so the layout data stays
 * the single source of truth for both rendering and gameplay.
 *
 * The build is aggressively batched: repeated furniture goes through an
 * instancing registry, and same-material static geometry is merged into a
 * single mesh per material. A floor with ~250 chairs and 25 tables ends up
 * costing a few dozen draw calls, which is what keeps it playable on a
 * tablet instead of stalling and losing the WebGL context.
 */
export function buildOffice(scene, world) {
  const group = new THREE.Group();
  group.name = "office";
  const roomLabels = [];
  const registry = createFurnitureRegistry();

  const carpets = [];
  const glassPanes = [];
  const extras = []; // one-off meshes that are not worth batching
  const coreParts = { body: [], door: [], metal: [] };

  group.add(buildFootprintFloor());
  group.add(buildCorridors());
  group.add(buildPerimeterWalls(world));
  group.add(buildBarriers(world));

  areas.forEach((area) => {
    const label = buildArea(area, world, { registry, carpets, glassPanes, coreParts, extras });
    if (label) {
      group.add(label);
      roomLabels.push(label);
    }
  });

  if (carpets.length) {
    // One mesh for every zone carpet: the colour rides in the vertex data, so
    // 25 differently-coloured patches still cost a single draw call.
    const merged = mergeGeometries(carpets, false);
    const mesh = new THREE.Mesh(
      merged,
      texturedMaterial("carpetPurple", { vertexColors: true, roughness: 0.95 })
    );
    mesh.receiveShadow = true;
    group.add(mesh);
    carpets.forEach((g) => g.dispose());
  }

  if (glassPanes.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glassPanes, false), interiorGlassMaterial());
    group.add(mesh);
    glassPanes.forEach((g) => g.dispose());
  }

  group.add(buildCoreMeshes(coreParts));
  extras.forEach((mesh) => group.add(mesh));
  group.add(buildEntranceMat());
  group.add(buildPlants(world));
  group.add(registry.build());

  const markers = buildGameplayMarkers();
  group.add(markers.group);

  scene.add(group);
  return {
    group,
    roomLabels,
    markerGroup: markers.group,
    activityMarkers: markers.activityMarkers,
    distractionMarkers: markers.distractionMarkers,
    hidingMarkers: markers.hidingMarkers,
    safeSpotMarkers: markers.safeSpotMarkers,
  };
}

// ---------- Base slab following the irregular footprint ----------
function buildFootprintFloor() {
  const shape = new THREE.Shape();
  footprint.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.4 * S, bevelEnabled: false });
  // ExtrudeGeometry builds in XY; rotate it flat and keep the plan's z sign.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -0.4 * S, 0);
  applyPlanarUV(geometry, 0.45 / S);

  const mesh = new THREE.Mesh(geometry, texturedMaterial("tileLight", { roughness: 0.9 }));
  mesh.receiveShadow = true;
  return mesh;
}

/** Box/extrude geometries need world-planar UVs for a tiling floor texture. */
function applyPlanarUV(geometry, scale) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * scale;
    uv[i * 2 + 1] = pos.getZ(i) * scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

/**
 * Cada zona trae su color en el JSON del plano y se pinta por vértice. Esos
 * colores se eligieron contra un suelo gris y sobre el suelo cálido de ahora
 * salían chillones, así que se llevan al pastel aquí — en un solo sitio, sin
 * tener que reescribir el plano ni perder qué zona es cuál.
 */
function pastel(hexColor) {
  const color = new THREE.Color(hexColor);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(hsl.h, Math.min(hsl.s, 0.32), Math.max(hsl.l, 0.78));
  return color;
}

function paintGeometry(geometry, hexColor) {
  const color = pastel(hexColor);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Slightly lighter strips marking the main circulation, like real vinyl. */
function buildCorridors() {
  const parts = corridors.map((c) => {
    const geo = new THREE.BoxGeometry(c.w, 0.05 * S, c.d);
    applyPlanarUV(geo, 0.4 / S);
    geo.translate(c.x, 0.025 * S, c.z);
    return geo;
  });
  if (!parts.length) return new THREE.Group();
  const mesh = new THREE.Mesh(
    mergeGeometries(parts, false),
    texturedMaterial("tileLobby")
  );
  mesh.receiveShadow = true;
  parts.forEach((g) => g.dispose());
  return mesh;
}

function interiorGlassMaterial() {
  return new THREE.MeshLambertMaterial({
    color: new THREE.Color(SURFACES.glass),
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
  });
}

const BARRIER_H = 2.2 * S;
const BARRIER_THICK = 0.34 * S;

/**
 * Los tabiques que parten el piso (ver `barriers` en el JSON de escena). Se
 * construyen como dos tramos macizos con un hueco en medio: la puerta es un
 * hueco de verdad, se cruza andando y el navmesh la ve — no un adorno.
 * El marco y el dintel dejan claro dónde está el paso a distancia.
 */
function buildBarriers(world) {
  const group = new THREE.Group();
  group.name = "barriers";
  if (!barriers.length) return group;

  const body = [];
  const trim = [];

  barriers.forEach((b) => {
    const along = b.axis === "z" ? "x" : "z"; // eje sobre el que se extiende
    const door = b.door;
    // Tramos macizos: todo el muro menos el hueco de la puerta.
    const spans = door
      ? [
          [b.from, door.at - door.w / 2],
          [door.at + door.w / 2, b.to],
        ]
      : [[b.from, b.to]];

    spans.forEach(([a, z]) => {
      const length = z - a;
      if (length <= 0.01) return;
      const mid = (a + z) / 2;
      const geo =
        along === "z"
          ? new THREE.BoxGeometry(BARRIER_THICK, BARRIER_H, length)
          : new THREE.BoxGeometry(length, BARRIER_H, BARRIER_THICK);
      const [cx, cz] = along === "z" ? [b.at, mid] : [mid, b.at];
      geo.translate(cx, BARRIER_H / 2, cz);
      body.push(geo);
      const [w, d] = along === "z" ? [BARRIER_THICK, length] : [length, BARRIER_THICK];
      world.addBox(cx, cz, w, d); // opaco: también corta la línea de visión
    });

    if (!door) return;
    // Dintel sobre la puerta: se ve el vano, pero se pasa por debajo.
    const lintelH = 0.42 * S;
    const geo =
      along === "z"
        ? new THREE.BoxGeometry(BARRIER_THICK * 1.15, lintelH, door.w)
        : new THREE.BoxGeometry(door.w, lintelH, BARRIER_THICK * 1.15);
    const [cx, cz] = along === "z" ? [b.at, door.at] : [door.at, b.at];
    geo.translate(cx, BARRIER_H - lintelH / 2, cz);
    trim.push(geo);
  });

  if (body.length) {
    group.add(new THREE.Mesh(mergeGeometries(body, false), texturedMaterial("wallPanel", { roughness: 0.9 })));
    body.forEach((g) => g.dispose());
  }
  if (trim.length) {
    group.add(
      new THREE.Mesh(
        mergeGeometries(trim, false),
        cozyMaterial("lintel", { color: "#d9a066" })
      )
    );
    trim.forEach((g) => g.dispose());
  }
  return group;
}

/**
 * The building envelope is a glass curtain wall rather than a solid one: at
 * this camera angle an opaque parapet swallows whoever is walking behind it,
 * and losing sight of the player or the boss on the near edge is the single
 * most frustrating thing the old build did.
 */
function buildPerimeterWalls(world) {
  const group = new THREE.Group();
  const h = PERIMETER_WALL_H;

  const panes = [];
  const mullions = [];
  const sills = [];

  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];

    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    const rotY = -Math.atan2(dz, dx);

    const pane = new THREE.BoxGeometry(length, h, 0.08 * S);
    pane.rotateY(rotY);
    pane.translate(cx, h / 2, cz);
    panes.push(pane);

    // A low sill and evenly spaced mullions give the glass something to read
    // against, so the edge of the floor is still legible.
    const sill = new THREE.BoxGeometry(length, 0.16 * S, 0.22 * S);
    sill.rotateY(rotY);
    sill.translate(cx, 0.08 * S, cz);
    sills.push(sill);

    const cap = new THREE.BoxGeometry(length, 0.1 * S, 0.2 * S);
    cap.rotateY(rotY);
    cap.translate(cx, h, cz);
    sills.push(cap);

    const spacing = 2.6 * S;
    const count = Math.max(1, Math.round(length / spacing));
    for (let m = 0; m <= count; m++) {
      const t = m / count - 0.5;
      const post = new THREE.BoxGeometry(0.1 * S, h, 0.14 * S);
      post.rotateY(rotY);
      post.translate(cx + dx * t, h / 2, cz + dz * t);
      mullions.push(post);
    }

    // Glass still stops you walking out of the building, but it must never
    // block the boss's line of sight — you can be seen through a window.
    if (world) world.addSegment(x1, z1, x2, z2, 0.3 * S, { sight: false });
  }

  const glass = new THREE.Mesh(
    mergeGeometries(panes, false),
    new THREE.MeshLambertMaterial({
      color: new THREE.Color(SURFACES.glass),
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glass.renderOrder = 3;
  group.add(glass);

  const frameMat = cozyMaterial("frame");
  const frame = new THREE.Mesh(mergeGeometries([...mullions, ...sills], false), frameMat);
  frame.castShadow = false;
  frame.receiveShadow = true;
  group.add(frame);

  [...panes, ...mullions, ...sills].forEach((g) => g.dispose());
  return group;
}

/**
 * The mat the player spawns on. Deliberately unlabelled — the lift core
 * right behind it already carries the "Ascensores" sign, and a second one
 * here would sit exactly on top of the player at spawn.
 */
function buildEntranceMat() {
  const geo = new THREE.BoxGeometry(entrance.w, 0.06 * S, 1.6 * S);
  applyPlanarUV(geo, 0.5 / S);
  const mark = new THREE.Mesh(geo, texturedMaterial("woodFloor"));
  mark.position.set(entrance.x, 0.06 * S, entrance.z + 1.4 * S);
  return mark;
}

// ---------- Per-zone construction ----------
function buildArea(area, world, ctx) {
  const solid = area.kind === AREA_KINDS.CORE || area.kind === AREA_KINDS.ELEVATOR;
  if (!solid) ctx.carpets.push(buildCarpet(area));

  switch (area.kind) {
    case AREA_KINDS.OPEN_OFFICE:
      addSeatedTable(area, world, ctx.registry);
      break;
    case AREA_KINDS.MEETING:
      addGlassWalls(area, world, ctx.glassPanes);
      addSeatedTable(area, world, ctx.registry, { monitors: false });
      break;
    case AREA_KINDS.SOCIAL:
      addCafeteria(area, world, ctx);
      break;
    case AREA_KINDS.AUDITORIUM:
      addAuditorium(area, world, ctx);
      break;
    case AREA_KINDS.CORE:
      addCoreBlock(area, world, ctx.coreParts);
      break;
    case AREA_KINDS.ELEVATOR:
      addElevators(area, world, ctx.coreParts);
      break;
    default:
      break;
  }

  if (!area.name) return null;
  const seats = area.capacity > 0 ? `\n${area.capacity} puestos` : "";
  const label = createLabel(
    `${area.name}${seats}`,
    {
      accent: area.color,
      solid: area.kind === AREA_KINDS.OPEN_OFFICE,
      dark: true,
      icon: iconFor(area),
    },
    0.62
  );
  label.position.set(area.x, (solid ? CORE_H : GLASS_WALL_H) + 0.7 * S, area.z);
  label.userData.homeX = area.x;
  label.userData.homeZ = area.z;
  label.userData.priority = area.labelPriority ?? 2;
  label.userData.areaId = area.id;
  return label;
}

function iconFor(area) {
  switch (area.kind) {
    case AREA_KINDS.MEETING:
      return "📅";
    case AREA_KINDS.SOCIAL:
      return "☕";
    case AREA_KINDS.AUDITORIUM:
      return "🎬";
    case AREA_KINDS.CORE:
      return area.id.startsWith("banos") ? "🚻" : "🪜";
    case AREA_KINDS.ELEVATOR:
      return "🛗";
    default:
      return "👥";
  }
}

/** The colour "moqueta" patch that identifies each zone from above. */
function buildCarpet(area) {
  const geo = new THREE.BoxGeometry(area.w, 0.1 * S, area.d);
  applyPlanarUV(geo, 0.5 / S);
  paintGeometry(geo, area.color);
  geo.translate(area.x, 0.05 * S, area.z);
  return geo;
}

function addSeatedTable(area, world, registry, opts = {}) {
  const collider = placeSeatedTable(registry, {
    originX: area.x,
    originZ: area.z,
    width: area.w,
    depth: area.d,
    capacity: area.capacity,
    shape: area.tableShape ?? "rect",
    monitors: opts.monitors !== false,
    // En una sala de reuniones se puede ENTRAR: es donde se finge trabajar.
    // Necesita pasillo de sobra alrededor de la mesa, no solo hueco de silla.
    walkway: area.kind === "meeting" ? 0.9 : 0.35,
  });
  // Only the table top is solid — chairs stay walk-through so nobody can be
  // wedged between a chair and the table they are meant to sit at.
  if (world) world.addBox(area.x, area.z, collider.w, collider.d, { sight: true });
}

/**
 * `area.doorSide` elige qué pared de la sala de vidrio lleva el hueco de la
 * puerta, con el mismo vocabulario que `wing` y los rótulos de ala del
 * plano: "norte"/+x, "sur"/-x, "frente"/+z (por defecto, el comportamiento
 * de siempre: el jugador entra por los ascensores hacia +z), "fondo"/-z.
 */
function addGlassWalls(area, world, panes) {
  const height = GLASS_WALL_H;
  const thickness = 0.12 * S;
  const doorSide = area.doorSide ?? "frente";

  const push = (w, d, x, z) => {
    const geo = new THREE.BoxGeometry(w, height, d);
    geo.translate(area.x + x, height / 2, area.z + z);
    panes.push(geo);
    if (world) world.addBox(area.x + x, area.z + z, w, d, { sight: false });
  };

  // Cada pared: si es la que lleva la puerta, se parte en dos tramos con un
  // hueco centrado; si no, va entera.
  const walls = {
    fondo: { horizontal: true, x: 0, z: -area.d / 2, len: area.w },
    frente: { horizontal: true, x: 0, z: area.d / 2, len: area.w },
    sur: { horizontal: false, x: -area.w / 2, z: 0, len: area.d },
    norte: { horizontal: false, x: area.w / 2, z: 0, len: area.d },
  };

  for (const [side, wall] of Object.entries(walls)) {
    if (side !== doorSide) {
      if (wall.horizontal) push(wall.len, thickness, wall.x, wall.z);
      else push(thickness, wall.len, wall.x, wall.z);
      continue;
    }
    const doorWidth = Math.max(1.5 * S, wall.len * 0.4);
    const sideLen = (wall.len - doorWidth) / 2;
    if (sideLen <= 0.05) continue;
    for (const dir of [-1, 1]) {
      if (wall.horizontal) push(sideLen, thickness, dir * (doorWidth / 2 + sideLen / 2), wall.z);
      else push(thickness, sideLen, wall.x, dir * (doorWidth / 2 + sideLen / 2));
    }
  }
}

/** Restrooms / stairs / lifts: closed volumes you walk around. */
function addCoreBlock(area, world, parts) {
  const body = new THREE.BoxGeometry(area.w, CORE_H, area.d);
  body.translate(area.x, CORE_H / 2, area.z);
  parts.body.push(body);

  const door = new THREE.BoxGeometry(0.9 * S, 1.9 * S, 0.08 * S);
  door.translate(area.x, 0.95 * S, area.z + area.d / 2 + 0.05 * S);
  parts.door.push(door);

  if (world) world.addBox(area.x, area.z, area.w, area.d, { sight: true });
}

function addElevators(area, world, parts) {
  const h = CORE_H * 1.15;
  const shaft = new THREE.BoxGeometry(area.w, h, area.d);
  shaft.translate(area.x, h / 2, area.z);
  parts.body.push(shaft);

  for (const side of [-1, 1]) {
    const doors = new THREE.BoxGeometry(1.5 * S, 2.1 * S, 0.1 * S);
    doors.translate(area.x + side * area.w * 0.24, 1.05 * S, area.z + area.d / 2 + 0.06 * S);
    parts.metal.push(doors);
  }

  if (world) world.addBox(area.x, area.z, area.w, area.d, { sight: true });
}

function buildCoreMeshes(parts) {
  const group = new THREE.Group();
  const specs = [
    ["body", texturedMaterial("panelLight")],
    ["door", cozyMaterial("door", { color: "#b99a76" })],
    ["metal", cozyMaterial("metal")],
  ];
  for (const [kind, material] of specs) {
    if (!parts[kind].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts[kind], false), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    parts[kind].forEach((g) => g.dispose());
  }
  return group;
}

/** Cafetería: counter with machines, bistro tables. */
function addCafeteria(area, world, ctx) {
  const cw = area.w * 0.7;
  const cd = 0.75 * S;
  const cz = area.z - area.d / 2 + cd;

  const counter = new THREE.BoxGeometry(cw, 1.05 * S, cd);
  counter.translate(area.x, 0.53 * S, cz);
  ctx.coreParts.body.push(counter);
  if (world) world.addBox(area.x, cz, cw, cd, { sight: true });

  const machine = new THREE.BoxGeometry(0.5 * S, 0.6 * S, 0.42 * S);
  machine.translate(area.x - cw * 0.3, 1.35 * S, cz);
  ctx.coreParts.door.push(machine);

  const fridge = new THREE.BoxGeometry(0.62 * S, 0.66 * S, 0.42 * S);
  fridge.translate(area.x + cw * 0.32, 1.38 * S, cz);
  ctx.coreParts.metal.push(fridge);

  // Bistro tables spread along the room, leaving a wide aisle in front of
  // the counter so the chase never bottlenecks here.
  [-0.3, 0.12, 0.34].forEach((tx, i) => {
    const px = area.x + area.w * tx;
    const pz = area.z + area.d * 0.18;
    const collider = placeBistroTable(ctx.registry, {
      originX: px,
      originZ: pz,
      seats: i === 1 ? 3 : 4,
    });
    if (world) world.addBox(px, pz, collider.w, collider.d, { sight: false });
  });
}

/** Small auditorium: raised stage, screen, rows of chairs facing it. */
function addAuditorium(area, world, ctx) {
  const stageD = area.d * 0.26;
  const stageZ = area.z - area.d / 2 + stageD / 2 + 0.3 * S;

  const stage = new THREE.BoxGeometry(area.w * 0.82, 0.28 * S, stageD);
  stage.translate(area.x, 0.19 * S, stageZ);
  ctx.coreParts.body.push(stage);
  if (world) world.addBox(area.x, stageZ, area.w * 0.82, stageD, { sight: false });

  // The lit screen is a one-off landmark, so it stays its own small mesh.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(area.w * 0.5, 1.3 * S, 0.12 * S),
    new THREE.MeshLambertMaterial({
      color: new THREE.Color(SURFACES.screen),
      emissive: new THREE.Color("#7fb4c9"),
      emissiveIntensity: 0.9,
    })
  );
  screen.position.set(area.x, 1.25 * S, area.z - area.d / 2 + 0.2 * S);
  ctx.extras.push(screen);

  const rows = 3;
  const perRow = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      ctx.registry.addStool(
        area.x + (c / (perRow - 1) - 0.5) * area.w * 0.66,
        area.z + area.d * (0.04 + r * 0.16)
      );
    }
  }

}

// ---------- Cover props ----------
function buildPlants(world) {
  const potParts = [];
  const leafParts = [];

  plants.forEach(({ x, z }, i) => {
    const pot = new THREE.CylinderGeometry(0.3 * S, 0.24 * S, 0.45 * S, 8);
    pot.translate(x, 0.23 * S, z);
    potParts.push(pot);

    const bush = new THREE.SphereGeometry(0.5 * S, 8, 7);
    bush.scale(0.9, 1.2, 0.9);
    bush.translate(x, 0.95 * S, z);
    leafParts.push(bush);

    const top = new THREE.SphereGeometry(0.32 * S, 8, 7);
    top.translate(x + (i % 2 ? 0.2 : -0.2) * S, 1.3 * S, z + (i % 3 ? 0.14 : -0.14) * S);
    leafParts.push(top);

    if (world) world.addBox(x, z, 0.6 * S, 0.6 * S, { sight: true });
  });

  const group = new THREE.Group();
  if (!potParts.length) return group;

  const pots = new THREE.Mesh(
    mergeGeometries(potParts, false),
    texturedMaterial("woodPot", { roughness: 0.9 })
  );
  pots.castShadow = true;
  group.add(pots);

  const leaves = new THREE.Mesh(
    mergeGeometries(leafParts, false),
    cozyMaterial("leaves")
  );
  leaves.castShadow = true;
  group.add(leaves);

  [...potParts, ...leafParts].forEach((g) => g.dispose());
  return group;
}

// ---------- Gameplay markers ----------
function buildGameplayMarkers() {
  const group = new THREE.Group();
  group.name = "markers";

  // One mesh per hiding spot rather than a merged batch: each has to be able
  // to grey out on its own while it is recharging.
  const hidingMarkers = hidingSpots.map(({ x, z, r }, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4caf6a,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r * 0.9, 22), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.16 * S, z);
    ring.userData.spotIndex = i;
    group.add(ring);
    return ring;
  });

  // Lugares seguros: mismo trato que los escondites (un anillo cada uno, no
  // fusionado) porque cada uno se agota por su cuenta y hay que poder atenuar
  // el suyo sin tocar los demás. Azul para no confundirlos con los verdes.
  const safeSpotMarkers = safeSpots.map(({ x, z, radius }, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x4a9de0,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.72, radius * 0.9, 22), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.16 * S, z);
    ring.userData.spotIndex = i;
    group.add(ring);
    return ring;
  });

  const starMat = new THREE.MeshBasicMaterial({ color: 0xf2c744, toneMapped: false });
  const distractionMarkers = distractions.map(({ x, z }) => {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.24 * S, 0), starMat);
    star.position.set(x, 0.75 * S, z);
    star.userData.bob = { base: 0.75 * S, speed: 2.2, amp: 0.1 * S, offset: Math.random() * Math.PI * 2 };
    group.add(star);
    return star;
  });

  const activityMarkers = activityStations.map((station) => {
    const color = ACTIVITY_COLORS[station.type] ?? 0xffffff;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6 * S, 0.78 * S, 24), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(station.x, 0.16 * S, station.z);
    ring.userData.stationId = station.id;
    group.add(ring);

    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * S, 0), mat);
    icon.position.set(station.x, 0.85 * S, station.z);
    icon.userData.bob = { base: 0.85 * S, speed: 1.8, amp: 0.07 * S, offset: Math.random() * Math.PI * 2 };
    icon.userData.stationId = station.id;
    group.add(icon);
    return ring;
  });

  return { group, distractionMarkers, activityMarkers, hidingMarkers, safeSpotMarkers };
}

export { getTexture };
