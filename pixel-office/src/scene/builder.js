import * as THREE from "three";
import { rooms, footprint, entrance, ROOM_TYPES } from "./floorplan.js";
import { createLabel } from "./labels.js";

const GLASS_WALL_H = 1.5;
const PERIMETER_WALL_H = 1.6;

export function buildOffice(scene) {
  const group = new THREE.Group();
  group.name = "office";

  group.add(buildFootprintFloor());
  group.add(buildPerimeterWalls());

  rooms.forEach((room) => {
    group.add(buildRoom(room));
  });

  group.add(buildEntrance());

  scene.add(group);
  return group;
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

function buildPerimeterWalls() {
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
  }
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

  const label = createLabel(entrance.label, { bg: "#3a2f52", accent: "#f2c744" });
  label.position.set(entrance.x, 1.6, -entrance.z);
  group.add(label);
  return group;
}

// ---------- Individual room construction ----------
function buildRoom(room) {
  const group = new THREE.Group();
  group.name = room.id;
  group.position.set(room.x, 0, -room.z);

  group.add(buildFloor(room));

  // Only glassed meeting rooms get walls, echoing the reference art where
  // open-plan desks, lounges and social areas are unwalled bullpens and
  // only the small meeting rooms are enclosed in glass.
  const hasWalls = room.type === ROOM_TYPES.MEETING;
  if (hasWalls) group.add(buildWalls(room, true));

  switch (room.type) {
    case ROOM_TYPES.OPEN_PLAN:
      group.add(buildDesks(room));
      break;
    case ROOM_TYPES.MEETING:
      group.add(buildMeetingTable(room));
      break;
    case ROOM_TYPES.LOUNGE:
      group.add(buildLounge(room));
      break;
    case ROOM_TYPES.SOCIAL:
      group.add(buildSocial(room));
      break;
    case ROOM_TYPES.UTILITY:
      group.add(buildUtility(room));
      break;
    case ROOM_TYPES.MULTIPURPOSE:
      group.add(buildMultipurpose(room));
      break;
    default:
      break;
  }

  if (room.label) {
    const label = createLabel(room.label, { accent: `#${room.accent.toString(16).padStart(6, "0")}` });
    label.position.set(0, 2.4, 0);
    group.add(label);
  }

  return group;
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

function buildWalls(room, glass) {
  const group = new THREE.Group();
  const height = glass ? GLASS_WALL_H : WALL_H;
  const material = glass
    ? new THREE.MeshPhysicalMaterial({
        color: 0xbfe0ff,
        transparent: true,
        opacity: 0.25,
        roughness: 0.05,
        metalness: 0,
        transmission: 0.4,
      })
    : new THREE.MeshStandardMaterial({ color: 0x232529, roughness: 0.9 });

  const thickness = 0.15;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20 });

  const segments = [
    { w: room.w, d: thickness, x: 0, z: -room.d / 2 }, // back
    { w: room.w, d: thickness, x: 0, z: room.d / 2 }, // front
    { w: thickness, d: room.d, x: -room.w / 2, z: 0 }, // left
    { w: thickness, d: room.d, x: room.w / 2, z: 0 }, // right
  ];

  // Leave the "front" (closest to circulation, +z locally) open as a doorway
  // for open-plan/lounge feel; meeting rooms keep a glass front too but with
  // a gap for the door.
  segments.forEach((seg, idx) => {
    const isFront = idx === 1;
    if (isFront) {
      const doorWidth = Math.min(1.4, seg.w * 0.4);
      const sideLen = (seg.w - doorWidth) / 2;
      [-1, 1].forEach((dir) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(sideLen, height, thickness), material);
        wall.position.set(dir * (doorWidth / 2 + sideLen / 2), height / 2, seg.z);
        wall.castShadow = true;
        group.add(wall);
      });
      return;
    }
    const wall = new THREE.Mesh(new THREE.BoxGeometry(seg.w, height, seg.d), material);
    wall.position.set(seg.x, height / 2, seg.z);
    wall.castShadow = true;
    group.add(wall);
  });

  if (glass) {
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w, height, room.d)),
      new THREE.LineBasicMaterial({ color: 0x0d1a26 })
    );
    frame.position.y = height / 2;
    group.add(frame);
  }

  return group;
}

// ---------- Furniture placeholders (blockout, textures/sprites come later) ----------
function buildDesks(room) {
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
    }
  }
  return group;
}

function buildMeetingTable(room) {
  const group = new THREE.Group();
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.55, 0.5, room.d * 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.6 })
  );
  table.position.y = 0.3;
  table.castShadow = true;
  group.add(table);

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

function buildLounge(room) {
  const group = new THREE.Group();
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.8 });
  const sofa = new THREE.Mesh(new THREE.BoxGeometry(room.w * 0.5, 0.55, room.d * 0.28), sofaMat);
  sofa.position.set(0, 0.3, room.d * 0.2);
  sofa.castShadow = true;
  group.add(sofa);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.25, 0.3, room.d * 0.18),
    new THREE.MeshStandardMaterial({ color: 0x6b533a })
  );
  table.position.set(0, 0.18, -room.d * 0.1);
  group.add(table);
  return group;
}

function buildSocial(room) {
  const group = new THREE.Group();
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(room.w * 0.85, 0.9, room.d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.5 })
  );
  counter.position.set(0, 0.45, -room.d * 0.28);
  counter.castShadow = true;
  group.add(counter);

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

function buildMultipurpose(room) {
  const group = new THREE.Group();

  const pingpong = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.75, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x2f7d5c })
  );
  pingpong.position.set(1.6, 0.4, 1.8);
  pingpong.castShadow = true;
  group.add(pingpong);

  const foosball = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.85, 1),
    new THREE.MeshStandardMaterial({ color: 0x3a3f4a })
  );
  foosball.position.set(-1.6, 0.42, 1.2);
  group.add(foosball);

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
