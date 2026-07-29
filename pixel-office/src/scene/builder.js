import * as THREE from "three";
import {
  rooms,
  footprint,
  entrance,
  ROOM_TYPES,
  plants,
  hidingSpots,
  distractions,
  activityStations,
  ACTIVITY_COLORS,
} from "./floorplan.js";
import { createLabel } from "./labels.js";
import { texturedMaterial, getTexture } from "./textures.js";

const GLASS_WALL_H = 1.5;
const PERIMETER_WALL_H = 1.6;

// Desk banks are laid out to guarantee a walkable aisle. Previously each
// desk registered a collider wider than the gap to the next one, which
// welded every bullpen into a solid block the player could not enter — the
// "places where I get stuck" problem.
const BANK_DEPTH = 0.75;
const SIDE_WALKWAY = 0.95; // clear floor left/right of a desk bank

// `world` is the collision world (see collision.js) — every solid piece of
// furniture/wall registers itself there as it's built, so the level layout
// stays the single source of truth for both rendering and gameplay.
export function buildOffice(scene, world) {
  const group = new THREE.Group();
  group.name = "office";
  const roomLabels = [];

  group.add(buildFootprintFloor());
  group.add(buildPerimeterWalls(world));

  rooms.forEach((room) => {
    const { node, label } = buildRoom(room, world);
    group.add(node);
    if (label) roomLabels.push(label);
  });

  const entranceNode = buildEntrance();
  group.add(entranceNode.node);
  roomLabels.push(entranceNode.label);
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

// ---------- Base slab following the chamfered-octagon footprint ----------
function buildFootprintFloor() {
  const shape = new THREE.Shape();
  footprint.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.4, 0);
  applyPlanarUV(geometry, 0.55);

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

function buildPerimeterWalls(world) {
  const group = new THREE.Group();
  const material = texturedMaterial("wallPanel", { roughness: 0.85 });
  const h = PERIMETER_WALL_H;

  for (let i = 0; i < footprint.length; i++) {
    const [x1, z1] = footprint[i];
    const [x2, z2] = footprint[(i + 1) % footprint.length];
    // Skip the entrance gap on the front edge.
    if (z1 < -9 && z2 < -9) continue;

    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, h, 0.3), material);
    wall.position.set((x1 + x2) / 2, h / 2, -(z1 + z2) / 2);
    wall.rotation.y = -Math.atan2(dz, dx);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    if (world) world.addSegment(x1, -z1, x2, -z2, 0.3, { sight: true });
  }

  // Far boundary beyond the entrance doorway so the player/boss can't wander
  // off into the void past the front edge.
  if (world) world.addSegment(-7, 14, 7, 14, 0.4, { sight: false });

  return group;
}

function buildEntrance() {
  const group = new THREE.Group();
  const mat = texturedMaterial("woodFloor", { color: 0xb08bd0, roughness: 0.8 });
  const geo = new THREE.BoxGeometry(entrance.w, 0.08, 1.8);
  applyPlanarUV(geo, 0.6);
  const mark = new THREE.Mesh(geo, mat);
  mark.position.set(entrance.x, 0.05, -entrance.z);
  group.add(mark);

  const label = createLabel(entrance.label, { bg: "#3a2f52", accent: "#f2c744" }, 0.85);
  label.position.set(entrance.x, 1.5, -entrance.z);
  // The entrance sign is a landmark, not a proximity hint — never fade it.
  label.userData.homeX = entrance.x;
  label.userData.homeZ = -entrance.z;
  label.userData.alwaysVisible = true;
  group.add(label);
  return { node: group, label };
}

// ---------- Individual room construction ----------
function buildRoom(room, world) {
  const group = new THREE.Group();
  group.name = room.id;
  const worldX = room.x;
  const worldZ = -room.z;
  group.position.set(worldX, 0, worldZ);

  group.add(buildFloor(room));

  // Only glassed meeting rooms get walls, echoing the reference art where
  // open-plan desks, lounges and social areas are unwalled bullpens and
  // only the small meeting rooms are enclosed in glass.
  const hasWalls = room.type === ROOM_TYPES.MEETING;
  if (hasWalls) group.add(buildWalls(room, world, worldX, worldZ));

  switch (room.type) {
    case ROOM_TYPES.OPEN_PLAN:
      group.add(buildDeskBanks(room, world, worldX, worldZ));
      break;
    case ROOM_TYPES.MEETING:
      group.add(buildMeetingTable(room, world, worldX, worldZ));
      break;
    case ROOM_TYPES.LOUNGE:
      group.add(buildLounge(room, world, worldX, worldZ));
      break;
    case ROOM_TYPES.SOCIAL:
      group.add(buildSocial(room, world, worldX, worldZ));
      break;
    case ROOM_TYPES.UTILITY:
      group.add(buildUtility(room, world, worldX, worldZ));
      break;
    case ROOM_TYPES.MULTIPURPOSE:
      group.add(buildMultipurpose(room, world, worldX, worldZ));
      break;
    default:
      break;
  }

  let label = null;
  if (room.label) {
    label = createLabel(
      room.label,
      {
        accent: `#${room.accent.toString(16).padStart(6, "0")}`,
        solid: room.pill === "solid",
        dark: !!room.dark,
        icon: room.icon ?? "",
      },
      0.62
    );
    label.position.set(0, 1.85, 0);
    label.userData.homeX = worldX;
    label.userData.homeZ = worldZ;
    group.add(label);
  }

  return { node: group, label };
}

const FLOOR_TEXTURE_BY_TYPE = {
  [ROOM_TYPES.OPEN_PLAN]: "carpetPurple",
  [ROOM_TYPES.MEETING]: "carpetNeutral",
  [ROOM_TYPES.LOUNGE]: "woodFloor",
  [ROOM_TYPES.SOCIAL]: "tileUtility",
  [ROOM_TYPES.UTILITY]: "tileUtility",
  [ROOM_TYPES.MULTIPURPOSE]: "carpetOrange",
  [ROOM_TYPES.CIRCULATION]: "tileLobby",
};

const _tint = new THREE.Color();
/** Accent washed toward white — a hint of department colour, not a filter. */
function floorTint(accent, strength) {
  return _tint.set(accent).lerp(new THREE.Color(0xffffff), 1 - strength).getHex();
}

function buildFloor(room) {
  // Departments keep their accent tint so the floor colour still reads as
  // "this is the Canales area" the way the reference art does.
  const tintByType = {
    [ROOM_TYPES.OPEN_PLAN]: floorTint(room.accent, 0.22),
    [ROOM_TYPES.MULTIPURPOSE]: 0xf0e6d2,
  };
  const geometry = new THREE.BoxGeometry(room.w, 0.12, room.d);
  applyPlanarUV(geometry, 0.55);
  const texture = room.floorTexture ?? FLOOR_TEXTURE_BY_TYPE[room.type] ?? "tileLight";
  const material = texturedMaterial(texture, {
    color: tintByType[room.type] ?? 0xffffff,
    roughness: 0.92,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.06;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWalls(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const height = GLASS_WALL_H;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.45,
  });

  const thickness = 0.15;

  const segments = [
    { w: room.w, d: thickness, x: 0, z: -room.d / 2 }, // back
    { w: room.w, d: thickness, x: 0, z: room.d / 2 }, // front
    { w: thickness, d: room.d, x: -room.w / 2, z: 0 }, // left
    { w: thickness, d: room.d, x: room.w / 2, z: 0 }, // right
  ];

  // Leave the "front" (closest to circulation, +z locally) open as a doorway.
  segments.forEach((seg, idx) => {
    const isFront = idx === 1;
    if (isFront) {
      const doorWidth = Math.max(1.5, seg.w * 0.42);
      const sideLen = (seg.w - doorWidth) / 2;
      if (sideLen <= 0.05) return;
      [-1, 1].forEach((dir) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sideLen, height, thickness), material);
        const localX = dir * (doorWidth / 2 + sideLen / 2);
        wall.position.set(localX, height / 2, seg.z);
        wall.castShadow = true;
        group.add(wall);
        // Glass still stops movement but never blocks sight.
        if (world) world.addBox(worldX + localX, worldZ + seg.z, sideLen, thickness, { sight: false });
      });
      return;
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(seg.w, height, seg.d), material);
    wall.position.set(seg.x, height / 2, seg.z);
    wall.castShadow = true;
    group.add(wall);
    if (world) world.addBox(worldX + seg.x, worldZ + seg.z, seg.w, seg.d, { sight: false });
  });

  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w, height, room.d)),
    new THREE.LineBasicMaterial({ color: 0x2b3b4d })
  );
  frame.position.y = height / 2;
  group.add(frame);

  return group;
}

// ---------- Furniture ----------

/**
 * Two long desk banks per bullpen with a clear aisle between them and a
 * walkway on either side, which is how the reference floor reads and — more
 * importantly — keeps every part of the floor reachable.
 */
function buildDeskBanks(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const deskMat = texturedMaterial("woodDesk", { roughness: 0.7 });
  const monitorMat = new THREE.MeshStandardMaterial({
    color: 0x1c1e22,
    emissive: 0x2c5a7a,
    emissiveIntensity: 0.7,
  });
  const chairMat = texturedMaterial("fabricDark", { roughness: 0.75 });
  const screenMat = texturedMaterial("fabricScreen", { roughness: 0.9 });

  const bankW = Math.max(2, room.w - SIDE_WALKWAY * 2);
  const bankOffset = room.d * 0.26;
  const seats = room.deskCols ?? 4;

  [-1, 1].forEach((side) => {
    const bz = side * bankOffset;

    const geo = new THREE.BoxGeometry(bankW, 0.62, BANK_DEPTH);
    const desk = new THREE.Mesh(geo, deskMat);
    desk.position.set(0, 0.37, bz);
    desk.castShadow = true;
    desk.receiveShadow = true;
    group.add(desk);

    // Low privacy screen along the aisle side, like the reference cubicles.
    const screen = new THREE.Mesh(new THREE.BoxGeometry(bankW, 0.35, 0.08), screenMat);
    screen.position.set(0, 0.85, bz - side * (BANK_DEPTH / 2 - 0.04));
    group.add(screen);

    for (let i = 0; i < seats; i++) {
      const x = -bankW / 2 + (bankW / seats) * (i + 0.5);

      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.06), monitorMat);
      monitor.position.set(x, 0.83, bz - side * 0.2);
      group.add(monitor);

      const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.5, 8), chairMat);
      chair.position.set(x, 0.25, bz + side * 0.62);
      chair.castShadow = true;
      group.add(chair);
    }

    // One collider for the whole bank; the chairs are deliberately not solid
    // so nobody can be wedged between a chair and its desk.
    if (world) world.addBox(worldX, worldZ + bz, bankW, BANK_DEPTH + 0.15, { sight: true });
  });

  return group;
}

function buildMeetingTable(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const tw = room.w * 0.5;
  const td = room.d * 0.34;
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(tw, 0.52, td),
    texturedMaterial("woodTable", { roughness: 0.6 })
  );
  table.position.y = 0.32;
  table.castShadow = true;
  table.receiveShadow = true;
  group.add(table);
  if (world) world.addBox(worldX, worldZ, tw, td, { sight: true });

  const chairMat = texturedMaterial("fabricDark");
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.45, 8), chairMat);
    chair.position.set(Math.cos(angle) * tw * 0.62, 0.22, Math.sin(angle) * td * 0.85);
    group.add(chair);
  }
  return group;
}

function buildLounge(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const sw = room.w * 0.52;
  const sd = room.d * 0.26;
  const sofa = new THREE.Mesh(
    new THREE.BoxGeometry(sw, 0.55, sd),
    texturedMaterial("fabricSofa", { roughness: 0.9 })
  );
  sofa.position.set(0, 0.33, -room.d * 0.28);
  sofa.castShadow = true;
  group.add(sofa);

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(sw, 0.4, 0.14),
    texturedMaterial("fabricSofa", { color: 0xd0d0d0, roughness: 0.9 })
  );
  back.position.set(0, 0.75, -room.d * 0.28 - sd / 2);
  group.add(back);

  if (world) world.addBox(worldX, worldZ - room.d * 0.28, sw, sd, { sight: true });

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.26, 0.3, room.d * 0.16),
    texturedMaterial("woodTable")
  );
  table.position.set(0, 0.2, room.d * 0.02);
  group.add(table);
  return group;
}

function buildSocial(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const cw = room.w * 0.82;
  const cd = room.d * 0.28;
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(cw, 0.9, cd),
    texturedMaterial("fabricCounter", { roughness: 0.5 })
  );
  counter.position.set(0, 0.51, -room.d * 0.3);
  counter.castShadow = true;
  group.add(counter);
  if (world) world.addBox(worldX, worldZ - room.d * 0.3, cw, cd, { sight: true });

  // Coffee machine + vending silhouette on the counter.
  const machine = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.55, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x25282e, roughness: 0.4 })
  );
  machine.position.set(-cw * 0.28, 1.24, -room.d * 0.3);
  group.add(machine);

  const fridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2f3a45, emissive: 0x123044, emissiveIntensity: 0.4 })
  );
  fridge.position.set(cw * 0.3, 1.26, -room.d * 0.3);
  group.add(fridge);

  const stoolMat = texturedMaterial("fabricDark");
  for (let i = 0; i < 3; i++) {
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.55, 8), stoolMat);
    stool.position.set(-room.w * 0.26 + i * (room.w * 0.26), 0.3, room.d * 0.05);
    group.add(stool);
  }
  return group;
}

function buildUtility(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const w = room.w * 0.8;
  const d = room.d * 0.5;
  const blockZ = room.d * 0.18; // toward the entrance wall, not the corridor
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1.05, d),
    texturedMaterial("panelLight", { roughness: 0.75 })
  );
  block.position.set(0, 0.55, blockZ);
  block.castShadow = true;
  group.add(block);

  // Elevator doors get a brushed-metal face so the lobby reads.
  if (room.id === "elevadores") {
    const doors = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.8, 0.9, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xb9c0c9, metalness: 0.65, roughness: 0.35 })
    );
    doors.position.set(0, 0.5, blockZ - d / 2 - 0.04);
    group.add(doors);
  }

  if (world) world.addBox(worldX, worldZ + blockZ, w, d, { sight: true });
  return group;
}

function buildMultipurpose(room, world, worldX, worldZ) {
  const group = new THREE.Group();

  const pingpong = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.75, 1.3),
    new THREE.MeshStandardMaterial({ color: 0x2f7d5c, roughness: 0.7 })
  );
  pingpong.position.set(1.7, 0.45, 1.7);
  pingpong.castShadow = true;
  group.add(pingpong);
  if (world) world.addBox(worldX + 1.7, worldZ + 1.7, 2.3, 1.3, { sight: true });

  const foosball = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.85, 0.95),
    texturedMaterial("woodLight")
  );
  foosball.position.set(-1.9, 0.46, 1.2);
  group.add(foosball);
  if (world) world.addBox(worldX - 1.9, worldZ + 1.2, 1.9, 0.95, { sight: true });

  const beanBagMat = texturedMaterial("fabricSofa", { roughness: 1 });
  [
    [-1.7, -1.7],
    [-0.4, -2.1],
    [0.9, -1.7],
  ].forEach(([x, z]) => {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), beanBagMat);
    bag.position.set(x, 0.38, z);
    bag.scale.y = 0.72;
    bag.castShadow = true;
    group.add(bag);
  });

  return group;
}

// ---------- Cover props ----------
function buildPlants(world) {
  const group = new THREE.Group();
  const potMat = texturedMaterial("woodPot", { roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.85 });
  const leafMatLight = new THREE.MeshStandardMaterial({ color: 0x529a5c, roughness: 0.85 });

  plants.forEach(({ x, z }, i) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.42, 8), potMat);
    pot.position.set(x, 0.21, z);
    pot.castShadow = true;
    group.add(pot);

    // Two offset blobs make a bushier, more pixel-art-friendly silhouette.
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 7), leafMat);
    a.position.set(x, 0.82, z);
    a.scale.set(0.9, 1.15, 0.9);
    a.castShadow = true;
    group.add(a);

    const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 7), leafMatLight);
    b.position.set(x + (i % 2 ? 0.18 : -0.18), 1.12, z + (i % 3 ? 0.12 : -0.12));
    group.add(b);

    if (world) world.addBox(x, z, 0.56, 0.56, { sight: true });
  });

  return group;
}

// ---------- Gameplay markers: hiding spots ("ESCONDITE") and distractions
// ("DISTRACCIÓN"), styled after the reference image's legend icons, plus a
// small unlabeled ring per activity station. ----------
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
    ring.position.set(x, 0.14, z);
    group.add(ring);

    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), shieldMat);
    badge.position.set(x, 0.6, z);
    badge.userData.bob = { base: 0.6, speed: 1.4, amp: 0.07, offset: Math.random() * Math.PI * 2 };
    group.add(badge);
  });

  const starMat = new THREE.MeshBasicMaterial({ color: 0xf2c744, toneMapped: false });
  const distractionMarkers = distractions.map(({ x, z }) => {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), starMat);
    star.position.set(x, 0.65, z);
    star.userData.bob = { base: 0.65, speed: 2.2, amp: 0.09, offset: Math.random() * Math.PI * 2 };
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.74, 28), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(station.x, 0.14, station.z);
    group.add(ring);
    return ring;
  });

  return { group, distractionMarkers, activityMarkers };
}

export { getTexture };
