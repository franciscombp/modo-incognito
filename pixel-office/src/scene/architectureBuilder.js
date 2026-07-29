import * as THREE from "three";
import * as floorData from "./floorData.js";
import { generateAllFurniture, createRoomGeometry, createWallGeometry } from "./furnitureGenerator.js";

export function buildOfficeArchitecture(scene, world, data) {
  const group = new THREE.Group();
  group.name = "OfficeArchitecture";

  const floorGeometry = []; // For occlusion testing
  const labelTargets = new Map();

  // Floor base
  const floorGeo = new THREE.PlaneGeometry(45, 40);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xe8e8e8,
    roughness: 0.7,
    metalness: 0.1
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  floorMesh.position.y = -0.01;
  group.add(floorMesh);
  floorGeometry.push(floorMesh);

  // Perimeter walls
  const perimeterGroup = new THREE.Group();
  perimeterGroup.name = "PerimeterWalls";

  data.walls.forEach((wall, idx) => {
    const wallGeom = createWallGeometry(wall);
    perimeterGroup.add(wallGeom);
    floorGeometry.push(...wallGeom.children);

    // Add collision
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    const center = {
      x: (wall.start.x + wall.end.x) / 2,
      z: (wall.start.z + wall.end.z) / 2
    };
    const angle = Math.atan2(dx, dz);

    world.addBox(center.x, center.z, length, (wall.thickness || 0.2), angle);
  });

  group.add(perimeterGroup);

  // Rooms (salas, núcleos, baños)
  const roomsGroup = new THREE.Group();
  roomsGroup.name = "Rooms";

  data.rooms.forEach((room) => {
    const roomGeom = createRoomGeometry(room);
    roomGeom.position.set(room.x, 0, room.z);
    roomsGroup.add(roomGeom);
    floorGeometry.push(...roomGeom.children);

    // Add collision for non-walkable rooms
    if (!room.walkable) {
      world.addBox(room.x, room.z, room.width, room.depth, 0);
    }

    // Label target
    labelTargets.set(room.id, {
      x: room.x,
      z: room.z,
      name: room.name,
      type: room.type
    });
  });

  group.add(roomsGroup);

  // Open office areas with furniture
  const workspaceGroup = new THREE.Group();
  workspaceGroup.name = "OpenAreas";

  data.openAreas.forEach((area) => {
    const areaGroup = new THREE.Group();
    areaGroup.name = area.id;
    areaGroup.position.set(area.x, 0, area.z);

    // Visual boundary (subtle)
    const boundaryGeo = new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(area.width, area.depth)
    );
    const boundaryMat = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.2
    });
    const boundary = new THREE.LineSegments(boundaryGeo, boundaryMat);
    boundary.rotation.x = -Math.PI / 2;
    boundary.position.y = 0.02;
    areaGroup.add(boundary);

    // Floor treatment
    const areaFloorGeo = new THREE.PlaneGeometry(area.width, area.depth);
    const areaFloorMat = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      roughness: 0.8
    });
    const areaFloor = new THREE.Mesh(areaFloorGeo, areaFloorMat);
    areaFloor.rotation.x = -Math.PI / 2;
    areaFloor.position.y = 0.01;
    areaFloor.receiveShadow = true;
    areaGroup.add(areaFloor);

    // Furniture
    const furniture = generateAllFurniture([area]);
    areaGroup.add(furniture);
    floorGeometry.push(...furniture.children);

    workspaceGroup.add(areaGroup);

    // Label target
    labelTargets.set(area.id, {
      x: area.x,
      z: area.z,
      name: area.name,
      type: area.type,
      capacity: area.capacity
    });
  });

  group.add(workspaceGroup);

  // Corridors (visual only)
  const corridorGroup = new THREE.Group();
  corridorGroup.name = "Corridors";

  data.corridors.forEach((corridor) => {
    const dx = corridor.end.x - corridor.start.x;
    const dz = corridor.end.z - corridor.start.z;
    const length = Math.hypot(dx, dz);

    const corridorGeo = new THREE.PlaneGeometry(corridor.width, length);
    const corridorMat = new THREE.MeshStandardMaterial({
      color: 0xf8f8f8,
      roughness: 0.9
    });
    const corridorMesh = new THREE.Mesh(corridorGeo, corridorMat);

    const centerX = (corridor.start.x + corridor.end.x) / 2;
    const centerZ = (corridor.start.z + corridor.end.z) / 2;
    corridorMesh.position.set(centerX, 0, centerZ);
    corridorMesh.rotation.x = -Math.PI / 2;
    corridorMesh.rotation.z = Math.atan2(dx, dz);
    corridorMesh.position.y = 0.005;
    corridorMesh.receiveShadow = true;

    corridorGroup.add(corridorMesh);
  });

  group.add(corridorGroup);

  // Signage elements (small 3D labels)
  const signageGroup = new THREE.Group();
  signageGroup.name = "Signage";

  data.rooms.forEach((room) => {
    if (room.type === "meeting-room") {
      const signGeo = new THREE.BoxGeometry(0.4, 0.3, 0.05);
      const signMat = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a
      });
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(room.x + room.width / 2 + 0.3, 1.8, room.z);
      sign.castShadow = true;
      signageGroup.add(sign);
    }
  });

  group.add(signageGroup);

  // Add to scene
  scene.add(group);

  return {
    floorGeometry,
    labelTargets,
    architecture: group
  };
}
