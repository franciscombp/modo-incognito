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

const GLASS_WALL_H = 1.5;
const PERIMETER_WALL_H = 1.6;

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

  group.add(buildEntrance());
  group.add(buildPlants(world));
  const markers = buildGameplayMarkers();
  group.add(markers.group);

  scene.add(group);
  return { group, roomLabels, activityMarkers: markers.activityMarkers, distractionMarkers: markers.distractionMarkers };
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

  const material = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function buildPerimeterWalls(world) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.8 });
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
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(entrance.w, 0.06, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x6d5a8a, emissive: 0x2c2140, emissiveIntensity: 0.4 })
  );
  mark.position.set(entrance.x, 0.04, -entrance.z);
  group.add(mark);

  const label = createLabel(entrance.label, { bg: "#3a2f52", accent: "#f2c744" }, 0.85);
  label.position.set(entrance.x, 1.5, -entrance.z);
  group.add(label);
  return group;
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
      group.add(buildDesks(room, world, worldX, worldZ));
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
      group.add(buildUtility(room));
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

function buildFloor(room) {
  const colorByType = {
    [ROOM_TYPES.OPEN_PLAN]: 0xe5e2da,
    [ROOM_TYPES.MEETING]: 0xd7d2c4,
    [ROOM_TYPES.LOUNGE]: 0xb7a98f,
    [ROOM_TYPES.SOCIAL]: 0x9a9088,
    [ROOM_TYPES.UTILITY]: 0x8f97a3,
    [ROOM_TYPES.MULTIPURPOSE]: 0xc7bfae,
    [ROOM_TYPES.CIRCULATION]: 0xbfc3c9,
  };
  const geometry = new THREE.BoxGeometry(room.w, 0.1, room.d);
  const material = new THREE.MeshStandardMaterial({ color: colorByType[room.type] ?? 0xcccccc, roughness: 0.85 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.05;
  mesh.receiveShadow = true;
  return mesh;
}

function buildWalls(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const height = GLASS_WALL_H;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xbfe0ff,
    transparent: true,
    opacity: 0.25,
    roughness: 0.05,
    metalness: 0,
    transmission: 0.4,
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
      const doorWidth = Math.min(1.4, seg.w * 0.4);
      const sideLen = (seg.w - doorWidth) / 2;
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
    new THREE.LineBasicMaterial({ color: 0x0d1a26 })
  );
  frame.position.y = height / 2;
  group.add(frame);

  return group;
}

// ---------- Furniture placeholders (blockout, textures/sprites come later) ----------
function buildDesks(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const rowsN = room.deskRows ?? 2;
  const colsN = room.deskCols ?? 3;
  const deskW = 1.3;
  const deskD = 0.7;
  const gapX = (room.w - 1) / colsN;
  const gapZ = (room.d - 1) / rowsN;

  const deskMat = new THREE.MeshStandardMaterial({ color: 0xcbb28a, roughness: 0.7 });
  const monitorMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, emissive: 0x1c3a52, emissiveIntensity: 0.6 });
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x2f3238, roughness: 0.6 });

  for (let r = 0; r < rowsN; r++) {
    for (let c = 0; c < colsN; c++) {
      const x = -room.w / 2 + gapX * (c + 0.5) + 0.5;
      const z = -room.d / 2 + gapZ * (r + 0.5) + 0.5;

      const desk = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.6, deskD), deskMat);
      desk.position.set(x, 0.3, z);
      desk.castShadow = true;
      group.add(desk);

      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.05), monitorMat);
      monitor.position.set(x, 0.75, z - deskD / 2 + 0.05);
      group.add(monitor);

      const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), chairMat);
      chair.position.set(x, 0.25, z + deskD / 2 + 0.35);
      group.add(chair);

      // Desk + chair together form one cover-granting collider a little
      // larger than the desk box, matching "cubículos bloquean la visión".
      if (world) world.addBox(worldX + x, worldZ + z, deskW + 0.2, deskD + 0.9, { sight: true });
    }
  }
  return group;
}

function buildMeetingTable(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.55, 0.5, room.d * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.6 })
  );
  table.position.y = 0.3;
  table.castShadow = true;
  group.add(table);
  if (world) world.addBox(worldX, worldZ, room.w * 0.55, room.d * 0.4, { sight: true });

  const chairMat = new THREE.MeshStandardMaterial({ color: 0x394048 });
  const chairCount = 4;
  for (let i = 0; i < chairCount; i++) {
    const angle = (i / chairCount) * Math.PI * 2;
    const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 8), chairMat);
    chair.position.set(Math.cos(angle) * room.w * 0.32, 0.22, Math.sin(angle) * room.d * 0.28);
    group.add(chair);
  }
  return group;
}

function buildLounge(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.8 });
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(room.w * 0.5, 0.55, room.d * 0.28), sofaMat);
  sofa.position.set(0, 0.3, room.d * 0.2);
  sofa.castShadow = true;
  group.add(sofa);
  if (world) world.addBox(worldX, worldZ + room.d * 0.2, room.w * 0.5, room.d * 0.28, { sight: true });

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.25, 0.3, room.d * 0.18),
    new THREE.MeshStandardMaterial({ color: 0x6b533a })
  );
  table.position.set(0, 0.18, -room.d * 0.1);
  group.add(table);
  return group;
}

function buildSocial(room, world, worldX, worldZ) {
  const group = new THREE.Group();
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.85, 0.9, room.d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5 })
  );
  counter.position.set(0, 0.45, -room.d * 0.28);
  counter.castShadow = true;
  group.add(counter);
  if (world) world.addBox(worldX, worldZ - room.d * 0.28, room.w * 0.85, room.d * 0.3, { sight: true });

  for (let i = 0; i < 3; i++) {
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f3238 })
    );
    stool.position.set(-room.w * 0.3 + i * (room.w * 0.3), 0.28, room.d * 0.15);
    group.add(stool);
  }
  return group;
}

function buildUtility(room) {
  const group = new THREE.Group();
  const block = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.8, 1, room.d * 0.6),
    new THREE.MeshStandardMaterial({ color: 0x5a616b })
  );
  block.position.y = 0.5;
  group.add(block);
  return group;
}

function buildMultipurpose(room, world, worldX, worldZ) {
  const group = new THREE.Group();

  const pingpong = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.75, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2f7d5c })
  );
  pingpong.position.set(1.6, 0.4, 1.8);
  pingpong.castShadow = true;
  group.add(pingpong);
  if (world) world.addBox(worldX + 1.6, worldZ + 1.8, 2.4, 1.4, { sight: true });

  const foosball = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.85, 1),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4a })
  );
  foosball.position.set(-1.6, 0.42, 1.2);
  group.add(foosball);
  if (world) world.addBox(worldX - 1.6, worldZ + 1.2, 2, 1, { sight: true });

  const beanBagMat = new THREE.MeshStandardMaterial({ color: 0xe0b53c, roughness: 1 });
  [
    [-1.6, -1.6],
    [-0.4, -1.9],
    [0.8, -1.6],
  ].forEach(([x, z]) => {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), beanBagMat);
    bag.position.set(x, 0.4, z);
    bag.scale.y = 0.7;
    bag.castShadow = true;
    group.add(bag);
  });

  return group;
}

// ---------- Cover props ----------
function buildPlants(world) {
  const group = new THREE.Group();
  const potMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a4a, roughness: 0.8 });

  plants.forEach(({ x, z }) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.4, 8), potMat);
    pot.position.set(x, 0.2, z);
    pot.castShadow = true;
    group.add(pot);

    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 7), leafMat);
    leaves.position.set(x, 0.85, z);
    leaves.scale.set(0.8, 1.1, 0.8);
    leaves.castShadow = true;
    group.add(leaves);

    if (world) world.addBox(x, z, 0.55, 0.55, { sight: true });
  });

  return group;
}

// ---------- Gameplay markers: hiding spots ("ESCONDITE") and distractions
// ("DISTRACCIÓN"), styled after the reference image's legend icons, plus a
// small unlabeled ring per activity station (details live in the HUD
// prompt instead of another floating 3D label). ----------
function buildGameplayMarkers() {
  const group = new THREE.Group();

  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x4caf6a,
    emissive: 0x1c5c34,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.85,
  });
  hidingSpots.forEach(({ x, z, r }) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r * 0.85, 24), shieldMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.11, z);
    group.add(ring);

    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), shieldMat);
    badge.position.set(x, 0.55, z);
    badge.userData.bob = { base: 0.55, speed: 1.4, amp: 0.06, offset: Math.random() * Math.PI * 2 };
    group.add(badge);
  });

  const starMat = new THREE.MeshStandardMaterial({
    color: 0xf2c744,
    emissive: 0x7a5f10,
    emissiveIntensity: 0.6,
  });
  const distractionMarkers = distractions.map(({ x, z }) => {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), starMat);
    star.position.set(x, 0.6, z);
    star.userData.bob = { base: 0.6, speed: 2.2, amp: 0.08, offset: Math.random() * Math.PI * 2 };
    group.add(star);
    return star;
  });

  const activityMarkers = activityStations.map((station) => {
    const color = ACTIVITY_COLORS[station.type] ?? 0xffffff;
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 28), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(station.x, 0.11, station.z);
    group.add(ring);
    return ring;
  });

  return { group, distractionMarkers, activityMarkers };
}
