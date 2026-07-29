import * as THREE from "three";

// Furniture capacity mapping: capacity → modular layout
const CAPACITY_PATTERNS = {
  "desk-cluster-6": { type: "cluster", desks: 6, layout: "2x3" },
  "desk-cluster-7": { type: "cluster", desks: 7, layout: "2x3+1" },
  "desk-cluster-8": { type: "cluster", desks: 8, layout: "2x4" },
  "desk-cluster-9": { type: "cluster", desks: 9, layout: "3x3" },
  "desk-cluster-10": { type: "cluster", desks: 10, layout: "2x5" },
  "desk-cluster-12": { type: "cluster", desks: 12, layout: "3x4" },
  "desk-cluster-mixed": { type: "mixed", desks: 10, groups: [7, 3] },

  "bench-compact-12": { type: "bench", desks: 12, layout: "2x6" },
  "bench-double-12": { type: "bench-double", desks: 12, layout: "2x6" },
  "bench-double-14": { type: "bench-double", desks: 14, layout: "2x7" },
  "bench-contact-10": { type: "bench-contact", desks: 10, layout: "2x5" },
  "bench-mixed-13": { type: "mixed", desks: 13, groups: [6, 4, 3] },
  "bench-mixed-11": { type: "mixed", desks: 11, groups: [1, 10] },

  "desk-distributed-9": { type: "distributed", desks: 9, groups: [5, 4] }
};

// Simple geometric primitives for furniture
function createDeskCluster(group, pattern, capacity) {
  const deskWidth = 1.2;
  const deskDepth = 0.8;
  const spacing = 0.4;

  const [cols, rows] = pattern.layout.split("x").map(Number);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r * cols + c >= capacity) break;

      const x = (c - cols / 2) * (deskWidth + spacing);
      const z = (r - rows / 2) * (deskDepth + spacing);

      // Desk
      const deskGeo = new THREE.BoxGeometry(deskWidth, 0.75, deskDepth);
      const deskMat = new THREE.MeshStandardMaterial({ color: 0xd4a574 });
      const desk = new THREE.Mesh(deskGeo, deskMat);
      desk.position.set(x, 0.375, z);
      desk.castShadow = true;
      desk.receiveShadow = true;
      group.add(desk);

      // Chair
      const chairGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8);
      const chairMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
      const chair = new THREE.Mesh(chairGeo, chairMat);
      chair.position.set(x, 0.35, z + deskDepth / 2 + 0.3);
      chair.castShadow = true;
      group.add(chair);
    }
  }
}

function createBenchLayout(group, capacity, doubleRow = false) {
  const deskWidth = 1.0;
  const deskDepth = 0.7;
  const spacing = 0.3;

  const cols = Math.ceil(capacity / (doubleRow ? 2 : 1));
  const rows = doubleRow ? 2 : 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r * cols + c >= capacity) break;

      const x = (c - cols / 2) * (deskWidth + spacing) + (r === 1 ? 0.6 : 0);
      const z = (r - rows / 2) * (deskDepth + spacing + 0.5);

      // Desk
      const deskGeo = new THREE.BoxGeometry(deskWidth, 0.7, deskDepth);
      const deskMat = new THREE.MeshStandardMaterial({ color: 0xc4906a });
      const desk = new THREE.Mesh(deskGeo, deskMat);
      desk.position.set(x, 0.35, z);
      desk.castShadow = true;
      desk.receiveShadow = true;
      group.add(desk);

      // Chair
      const chairGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.65, 8);
      const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a });
      const chair = new THREE.Mesh(chairGeo, chairMat);
      chair.position.set(x, 0.33, z + deskDepth / 2 + 0.25);
      chair.castShadow = true;
      group.add(chair);
    }
  }
}

function createMixedLayout(group, capacity, subgroups) {
  // Position subgroups within the area
  const numGroups = subgroups.length;
  const spacing = 1.5;

  subgroups.forEach((subCap, idx) => {
    const offset = (idx - numGroups / 2) * spacing;
    const subGroup = new THREE.Group();
    subGroup.position.x = offset;

    // Use simple cluster for each subgroup
    createDeskCluster(subGroup, { layout: "1x" + subCap }, subCap);

    group.add(subGroup);
  });
}

function createDistributedLayout(group, capacity, groups) {
  // Scatter smaller clusters around the area
  const totalPositions = groups.length;
  const angleStep = (Math.PI * 2) / totalPositions;
  const radius = 1.2;

  let deskCount = 0;
  groups.forEach((count, idx) => {
    const angle = idx * angleStep;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const subGroup = new THREE.Group();
    subGroup.position.set(x, 0, z);

    createDeskCluster(subGroup, { layout: "1x" + count }, count);
    group.add(subGroup);

    deskCount += count;
  });
}

export function generateFurnitureForArea(areaData) {
  const furnitureGroup = new THREE.Group();
  furnitureGroup.position.set(areaData.x, 0, areaData.z);
  furnitureGroup.userData = {
    areaId: areaData.id,
    areaName: areaData.name,
    capacity: areaData.capacity
  };

  if (!areaData.furniture) return furnitureGroup;

  const pattern = CAPACITY_PATTERNS[areaData.furniture];
  if (!pattern) {
    console.warn(`Unknown furniture pattern: ${areaData.furniture}`);
    return furnitureGroup;
  }

  switch (pattern.type) {
    case "cluster":
      createDeskCluster(furnitureGroup, pattern, areaData.capacity);
      break;

    case "bench":
      createBenchLayout(furnitureGroup, areaData.capacity, false);
      break;

    case "bench-double":
      createBenchLayout(furnitureGroup, areaData.capacity, true);
      break;

    case "bench-contact":
      // Contact center with headsets visible
      createBenchLayout(furnitureGroup, areaData.capacity, true);
      break;

    case "mixed":
      createMixedLayout(furnitureGroup, areaData.capacity, pattern.groups);
      break;

    case "distributed":
      createDistributedLayout(furnitureGroup, areaData.capacity, pattern.groups);
      break;

    default:
      console.warn(`Unknown furniture type: ${pattern.type}`);
  }

  return furnitureGroup;
}

export function generateAllFurniture(openAreas) {
  const furnitureGroup = new THREE.Group();
  furnitureGroup.name = "Furniture";

  openAreas.forEach(area => {
    const areaFurniture = generateFurnitureForArea(area);
    furnitureGroup.add(areaFurniture);
  });

  return furnitureGroup;
}

// Create simplified walls and room geometry
export function createRoomGeometry(room) {
  const group = new THREE.Group();
  group.userData = { roomId: room.id, roomName: room.name };

  if (room.walkable) {
    // Walkable room - light floor indicator
    const floorGeo = new THREE.PlaneGeometry(room.width, room.depth);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5dc,
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    group.add(floor);
  } else {
    // Closed room - visible walls
    const wallHeight = 2.5;

    // Create simple box representation
    const boxGeo = new THREE.BoxGeometry(room.width, wallHeight, room.depth);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xe8e8e8,
      roughness: 0.6
    });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = wallHeight / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);

    // Door outline
    const doorGeo = new THREE.PlaneGeometry(0.9, 2);
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x8b6f47 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(room.width / 2 - 0.5, 1, room.depth / 2 - 0.1);
    group.add(door);
  }

  return group;
}

// Create wall geometry
export function createWallGeometry(wall) {
  const group = new THREE.Group();

  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, dz);

  const wallHeight = 2.4;
  const thickness = wall.thickness || 0.2;

  const wallGeo = new THREE.BoxGeometry(thickness, wallHeight, length);
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.8
  });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);

  const centerX = (wall.start.x + wall.end.x) / 2;
  const centerZ = (wall.start.z + wall.end.z) / 2;
  wallMesh.position.set(centerX, wallHeight / 2, centerZ);
  wallMesh.rotation.y = angle;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;

  group.add(wallMesh);
  return group;
}
