import * as THREE from "three";
import {
  areas,
  footprint,
  entrance,
  corridors,
  AREA_KINDS,
  plants,
  hidingSpots,
  distractions,
  activityStations,
  ACTIVITY_COLORS,
} from "./floorplan.js";
import { WORLD_SCALE as S } from "./config.js";
import { createLabel } from "./labels.js";
import { texturedMaterial, getTexture } from "./textures.js";
import { createSeatedTable, createBistroTable } from "./furniture.js";

const GLASS_WALL_H = 1.9 * S;
const PERIMETER_WALL_H = 1.5 * S;
const CORE_H = 2.6 * S;

/**
 * Builds the whole floor from the `areas` table. Every solid piece registers
 * itself in the collision world as it is created, so the layout data stays
 * the single source of truth for both rendering and gameplay.
 */
export function buildOffice(scene, world) {
  const group = new THREE.Group();
  group.name = "office";
  const roomLabels = [];

  group.add(buildFootprintFloor());
  group.add(buildCorridors());
  group.add(buildPerimeterWalls(world));

  areas.forEach((area) => {
    const { node, label } = buildArea(area, world);
    group.add(node);
    if (label) roomLabels.push(label);
  });

  group.add(buildEntranceMat());
  group.add(buildPlants(world));
  const markers = buildGameplayMarkers();
  group.add(markers.group);

  scene.add(group);
  return {
    group,
    roomLabels,
    activityMarkers: markers.activityMarkers,
    distractionMarkers: markers.distractionMarkers,
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

/** Slightly lighter strips marking the main circulation, like real vinyl. */
function buildCorridors() {
  const group = new THREE.Group();
  const mat = texturedMaterial("tileLobby", { color: 0xf1f2f4, roughness: 0.85 });
  corridors.forEach((c) => {
    const geo = new THREE.BoxGeometry(c.w, 0.05 * S, c.d);
    applyPlanarUV(geo, 0.4 / S);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.x, 0.025 * S, c.z);
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  return group;
}

function buildPerimeterWalls(world) {
  const group = new THREE.Group();
  const material = texturedMaterial("wallPanel", { color: 0xc8ccd4, roughness: 0.85 });
  const h = PERIMETER_WALL_H;

  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];

    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, h, 0.3 * S), material);
    wall.position.set((x1 + x2) / 2, h / 2, (z1 + z2) / 2);
    wall.rotation.y = -Math.atan2(dz, dx);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    if (world) world.addSegment(x1, z1, x2, z2, 0.3 * S, { sight: true });
  }

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
  const mark = new THREE.Mesh(geo, texturedMaterial("woodFloor", { color: 0xc9a8dd, roughness: 0.8 }));
  mark.position.set(entrance.x, 0.06 * S, entrance.z + 1.4 * S);
  return mark;
}

// ---------- Per-zone construction ----------
function buildArea(area, world) {
  const group = new THREE.Group();
  group.name = area.id;
  group.position.set(area.x, 0, area.z);

  const solid = area.kind === AREA_KINDS.CORE || area.kind === AREA_KINDS.ELEVATOR;
  if (!solid) group.add(buildCarpet(area));

  switch (area.kind) {
    case AREA_KINDS.OPEN_OFFICE:
      addSeatedTable(group, area, world);
      break;
    case AREA_KINDS.MEETING:
      group.add(buildGlassWalls(area, world));
      addSeatedTable(group, area, world, { monitors: false });
      break;
    case AREA_KINDS.SOCIAL:
      group.add(buildCafeteria(area, world));
      break;
    case AREA_KINDS.AUDITORIUM:
      group.add(buildAuditorium(area, world));
      break;
    case AREA_KINDS.CORE:
      group.add(buildCoreBlock(area, world));
      break;
    case AREA_KINDS.ELEVATOR:
      group.add(buildElevators(area, world));
      break;
    default:
      break;
  }

  let label = null;
  if (area.name) {
    const seats = area.capacity > 0 ? `\n${area.capacity} puestos` : "";
    label = createLabel(
      `${area.name}${seats}`,
      {
        accent: area.color,
        solid: area.kind === AREA_KINDS.OPEN_OFFICE,
        dark: true,
        icon: iconFor(area),
      },
      0.5
    );
    label.position.set(0, (solid ? CORE_H : GLASS_WALL_H) + 0.7 * S, 0);
    label.userData.homeX = area.x;
    label.userData.homeZ = area.z;
    label.userData.priority = area.labelPriority ?? 2;
    label.userData.areaId = area.id;
    group.add(label);
  }

  return { node: group, label };
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
  const texture = area.kind === AREA_KINDS.MEETING ? "carpetNeutral" : "carpetPurple";
  const mesh = new THREE.Mesh(
    geo,
    texturedMaterial(texture, { color: new THREE.Color(area.color), roughness: 0.95 })
  );
  mesh.position.y = 0.05 * S;
  mesh.receiveShadow = true;
  return mesh;
}

function addSeatedTable(group, area, world, opts = {}) {
  const { group: table, collider } = createSeatedTable({
    width: area.w,
    depth: area.d,
    capacity: area.capacity,
    shape: area.tableShape ?? "rect",
    monitors: opts.monitors !== false,
  });
  group.add(table);
  // Only the table top is solid — chairs stay walk-through so nobody can be
  // wedged between a chair and the table they are meant to sit at.
  if (world) world.addBox(area.x, area.z, collider.w, collider.d, { sight: true });
}

function buildGlassWalls(area, world) {
  const group = new THREE.Group();
  const height = GLASS_WALL_H;
  const thickness = 0.14 * S;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0.24,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.45,
  });

  const sides = [
    { w: area.w, d: thickness, x: 0, z: -area.d / 2, door: false },
    { w: area.w, d: thickness, x: 0, z: area.d / 2, door: true },
    { w: thickness, d: area.d, x: -area.w / 2, z: 0, door: false },
    { w: thickness, d: area.d, x: area.w / 2, z: 0, door: false },
  ];

  sides.forEach((seg) => {
    if (seg.door) {
      const doorWidth = Math.max(1.5 * S, seg.w * 0.4);
      const sideLen = (seg.w - doorWidth) / 2;
      if (sideLen <= 0.05) return;
      [-1, 1].forEach((dir) => {
        const localX = dir * (doorWidth / 2 + sideLen / 2);
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sideLen, height, thickness), material);
        wall.position.set(localX, height / 2, seg.z);
        wall.castShadow = true;
        group.add(wall);
        if (world) world.addBox(area.x + localX, area.z + seg.z, sideLen, thickness, { sight: false });
      });
      return;
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(seg.w, height, seg.d), material);
    wall.position.set(seg.x, height / 2, seg.z);
    wall.castShadow = true;
    group.add(wall);
    if (world) world.addBox(area.x + seg.x, area.z + seg.z, seg.w, seg.d, { sight: false });
  });

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(area.w, height, area.d)),
    new THREE.LineBasicMaterial({ color: 0x5b6a7d })
  );
  frame.position.y = height / 2;
  group.add(frame);
  return group;
}

/** Restrooms / stairs: a closed volume you walk around, with a visible door. */
function buildCoreBlock(area, world) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(area.w, CORE_H, area.d),
    texturedMaterial("panelLight", { color: 0xdfe3e9, roughness: 0.8 })
  );
  body.position.y = CORE_H / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.9 * S, 1.9 * S, 0.08 * S),
    new THREE.MeshStandardMaterial({ color: 0x4d5663, roughness: 0.6 })
  );
  door.position.set(0, 0.95 * S, area.d / 2 + 0.05 * S);
  group.add(door);

  if (world) world.addBox(area.x, area.z, area.w, area.d, { sight: true });
  return group;
}

/** The lift bank the player arrives through. */
function buildElevators(area, world) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(area.w, CORE_H * 1.15, area.d),
    texturedMaterial("panelLight", { color: 0xd3d8e0, roughness: 0.7 })
  );
  shaft.position.y = (CORE_H * 1.15) / 2;
  shaft.castShadow = true;
  group.add(shaft);

  const doorMat = new THREE.MeshStandardMaterial({
    color: 0xb9c0c9,
    metalness: 0.7,
    roughness: 0.3,
  });
  [-1, 1].forEach((side) => {
    const doors = new THREE.Mesh(new THREE.BoxGeometry(1.5 * S, 2.1 * S, 0.1 * S), doorMat);
    doors.position.set(side * area.w * 0.24, 1.05 * S, area.d / 2 + 0.06 * S);
    group.add(doors);
  });

  if (world) world.addBox(area.x, area.z, area.w, area.d, { sight: true });
  return group;
}

/** Cafetería: counter with machines, bistro tables, planters. */
function buildCafeteria(area, world) {
  const group = new THREE.Group();

  const cw = area.w * 0.7;
  const cd = 0.75 * S;
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(cw, 1.05 * S, cd),
    texturedMaterial("fabricCounter", { color: 0xf0e2cf, roughness: 0.5 })
  );
  counter.position.set(0, 0.53 * S, -area.d / 2 + cd);
  counter.castShadow = true;
  group.add(counter);
  if (world) world.addBox(area.x, area.z - area.d / 2 + cd, cw, cd, { sight: true });

  const machine = new THREE.Mesh(
    new THREE.BoxGeometry(0.5 * S, 0.6 * S, 0.42 * S),
    new THREE.MeshStandardMaterial({ color: 0x25282e, roughness: 0.4 })
  );
  machine.position.set(-cw * 0.3, 1.35 * S, -area.d / 2 + cd);
  group.add(machine);

  const fridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.62 * S, 0.66 * S, 0.42 * S),
    new THREE.MeshStandardMaterial({ color: 0x2f3a45, emissive: 0x123044, emissiveIntensity: 0.4 })
  );
  fridge.position.set(cw * 0.32, 1.38 * S, -area.d / 2 + cd);
  group.add(fridge);

  // Bistro tables spread along the room, leaving a wide aisle in front of
  // the counter so the chase never bottlenecks here.
  [-0.3, 0.12, 0.34].forEach((tx, i) => {
    const { group: table, collider } = createBistroTable(i === 1 ? 3 : 4);
    const px = area.w * tx;
    const pz = area.d * 0.18;
    table.position.set(px, 0, pz);
    group.add(table);
    if (world) world.addBox(area.x + px, area.z + pz, collider.w, collider.d, { sight: false });
  });

  return group;
}

/** Small auditorium: raised stage, screen, rows of chairs facing it. */
function buildAuditorium(area, world) {
  const group = new THREE.Group();

  const stageD = area.d * 0.26;
  const stageZ = -area.d / 2 + stageD / 2 + 0.3 * S;
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(area.w * 0.82, 0.28 * S, stageD),
    texturedMaterial("woodLight", { roughness: 0.7 })
  );
  stage.position.set(0, 0.19 * S, stageZ);
  stage.receiveShadow = true;
  group.add(stage);
  if (world) world.addBox(area.x, area.z + stageZ, area.w * 0.82, stageD, { sight: false });

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(area.w * 0.5, 1.3 * S, 0.12 * S),
    new THREE.MeshStandardMaterial({
      color: 0x11141a,
      emissive: 0x2a6f9e,
      emissiveIntensity: 1.1,
    })
  );
  screen.position.set(0, 1.25 * S, -area.d / 2 + 0.2 * S);
  group.add(screen);

  const seatMat = texturedMaterial("fabricDark", { roughness: 0.85 });
  const rows = 3;
  const perRow = 6;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      const seat = new THREE.Group();
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.34 * S, 0.1 * S, 0.34 * S), seatMat);
      cushion.position.y = 0.4 * S;
      seat.add(cushion);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.34 * S, 0.4 * S, 0.08 * S), seatMat);
      back.position.set(0, 0.6 * S, 0.15 * S);
      seat.add(back);
      seat.position.set((c / (perRow - 1) - 0.5) * area.w * 0.66, 0, area.d * (0.02 + r * 0.16));
      seat.castShadow = true;
      group.add(seat);
    }
  }
  return group;
}

// ---------- Cover props ----------
function buildPlants(world) {
  const group = new THREE.Group();
  const potMat = texturedMaterial("woodPot", { roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.85 });
  const leafMatLight = new THREE.MeshStandardMaterial({ color: 0x529a5c, roughness: 0.85 });

  plants.forEach(({ x, z }, i) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * S, 0.24 * S, 0.45 * S, 8), potMat);
    pot.position.set(x, 0.23 * S, z);
    pot.castShadow = true;
    group.add(pot);

    const a = new THREE.Mesh(new THREE.SphereGeometry(0.5 * S, 8, 7), leafMat);
    a.position.set(x, 0.95 * S, z);
    a.scale.set(0.9, 1.2, 0.9);
    a.castShadow = true;
    group.add(a);

    const b = new THREE.Mesh(new THREE.SphereGeometry(0.32 * S, 8, 7), leafMatLight);
    b.position.set(x + (i % 2 ? 0.2 : -0.2) * S, 1.3 * S, z + (i % 3 ? 0.14 : -0.14) * S);
    group.add(b);

    if (world) world.addBox(x, z, 0.6 * S, 0.6 * S, { sight: true });
  });

  return group;
}

// ---------- Gameplay markers ----------
function buildGameplayMarkers() {
  const group = new THREE.Group();

  const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x4caf6a,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
  });
  hidingSpots.forEach(({ x, z, r }) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.72, r * 0.9, 24), shieldMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.16 * S, z);
    group.add(ring);

    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.2 * S, 0), shieldMat);
    badge.position.set(x, 0.7 * S, z);
    badge.userData.bob = { base: 0.7 * S, speed: 1.4, amp: 0.08 * S, offset: Math.random() * Math.PI * 2 };
    group.add(badge);
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6 * S, 0.78 * S, 28), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(station.x, 0.16 * S, station.z);
    group.add(ring);

    const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * S, 0), mat);
    icon.position.set(station.x, 0.85 * S, station.z);
    icon.userData.bob = { base: 0.85 * S, speed: 1.8, amp: 0.07 * S, offset: Math.random() * Math.PI * 2 };
    group.add(icon);
    return ring;
  });

  return { group, distractionMarkers, activityMarkers };
}

export { getTexture };
