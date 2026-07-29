import * as THREE from "three";
import { createDioramaCamera, updateDioramaCamera, setDioramaZoom } from "./scene/cameraPreset.js";
import { buildOfficeArchitecture } from "./scene/architectureBuilder.js";
import { createCollisionWorld } from "./scene/collision.js";
import * as floorData from "./scene/floorData.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { loadSheet } from "./entities/sprite.js";
import { HudManager } from "./ui/hudManager.js";
import { LabelManager, LABEL_MODES } from "./ui/labelManager.js";
import { Game } from "./game/game.js";
import { createTouchControls } from "./game/touchControls.js";
import { debugScene } from "./debug.js";

const BASE = import.meta.env.BASE_URL ?? "/";
const sheetUrl = (name) => `${BASE}sprites/${name}.png`;

const canvas = document.getElementById("scene");
const app = document.getElementById("app");

// Three.js setup
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const aspect = window.innerWidth / window.innerHeight;
const cameraState = createDioramaCamera(aspect);
const { camera } = cameraState;

// Diorama fog effect - softer
scene.fog = new THREE.Fog(0x2a2a3e, 60, 200);

// Lighting optimized for diorama style - BRIGHT for visibility
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x808080, 1.0);
scene.add(hemisphereLight);

// Key light for depth - STRONG
const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(28, 30, 20);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -40;
keyLight.shadow.camera.right = 40;
keyLight.shadow.camera.top = 40;
keyLight.shadow.camera.bottom = -40;
keyLight.shadow.camera.far = 150;
keyLight.shadow.bias = -0.001;
scene.add(keyLight);

// Fill light for balance
const fillLight = new THREE.DirectionalLight(0xffffff, 0.8);
fillLight.position.set(-20, 20, -10);
scene.add(fillLight);

// World and collision setup
const world = createCollisionWorld();
const { floorGeometry, labelTargets } = buildOfficeArchitecture(scene, world, floorData);

// Test cube to verify rendering
const testCubeGeo = new THREE.BoxGeometry(2, 2, 2);
const testCubeMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const testCube = new THREE.Mesh(testCubeGeo, testCubeMat);
testCube.position.set(0, 2, 0);
testCube.castShadow = true;
scene.add(testCube);
console.log("Test cube added at (0, 2, 0)");

// Debug scene setup
debugScene(scene, camera, cameraState);
console.log("FloorData:", { openAreas: floorData.openAreas?.length, rooms: floorData.rooms?.length, walls: floorData.walls?.length });

// UI managers
const hud = new HudManager(app);
const labelManager = new LabelManager(camera, scene, renderer);

// Add labels for all areas
floorData.openAreas.forEach(area => {
  labelManager.addLabel(area.id, {
    x: area.x,
    z: area.z,
    name: area.name,
    type: area.type,
    capacity: area.capacity,
    priority: floorData.labelConfig.priority[area.type] || 1
  });
});

floorData.rooms.forEach(room => {
  labelManager.addLabel(room.id, {
    x: room.x,
    z: room.z,
    name: room.name,
    type: room.type,
    capacity: room.capacity,
    priority: floorData.labelConfig.priority[room.type] || 1
  });
});

// Game state that will be populated by boot()
let player = null;
let npcs = [];
let boss = null;
let game = null;
let followCamera = true;
let labelTogglePressed = false;

// Determine current area
function getCurrentArea() {
  if (!player) return null;
  for (const area of floorData.openAreas) {
    const dx = Math.abs(player.position.x - area.x);
    const dz = Math.abs(player.position.z - area.z);
    if (dx < area.width / 2 && dz < area.depth / 2) {
      return area;
    }
  }
  for (const room of floorData.rooms) {
    const dx = Math.abs(player.position.x - room.x);
    const dz = Math.abs(player.position.z - room.z);
    if (dx < room.width / 2 && dz < room.depth / 2) {
      return room;
    }
  }
  return null;
}

// Main render loop - starts immediately
let last = performance.now();
function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  // Update game (only if boot() has finished)
  if (player && game) {
    player.update(dt, world);
    npcs.forEach((npc) => npc.update(dt, now / 1000));
    game.update(dt);

    // Update camera
    updateDioramaCamera(cameraState, player.position, followCamera);

    // Update area info
    const currentArea = getCurrentArea();
    if (currentArea) {
      hud.updateAreaInfo(currentArea.name, currentArea.type, currentArea.capacity);
    }

    // Update suspicion display
    hud.updateSuspicion(game.suspicion, game.suspicionMax);
    hud.updateObjectives(game.objectives);
    hud.updateWarnings(game.warnings, game.maxWarnings);
  }

  // Update labels with occlusion (works even without player)
  labelManager.update(player?.position || new THREE.Vector3(0, 0, 0), floorGeometry);

  // Render scene
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Start rendering immediately
requestAnimationFrame(animate);

// Input handling
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "l") {
    if (!labelTogglePressed) {
      labelManager.toggleMode();
      hud.updateLabelModeIndicator(labelManager.mode);
      labelTogglePressed = true;
    }
  }
  if (e.key.toLowerCase() === "v") {
    followCamera = !followCamera;
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key.toLowerCase() === "l") {
    labelTogglePressed = false;
  }
});

// Zoom input
window.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const newZoom = cameraState.currentZoom - e.deltaY * 0.0003;
    setDioramaZoom(cameraState, newZoom);
  },
  { passive: false }
);

// Touch pinch zoom
let pinchStartDist = null;
let pinchStartZoom = 1;
const pinchDistance = (t) =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (e.touches.length === 2) {
      pinchStartDist = pinchDistance(e.touches);
      pinchStartZoom = cameraState.currentZoom;
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (e.touches.length === 2 && pinchStartDist) {
      const newZoom =
        pinchStartZoom * (pinchDistance(e.touches) / pinchStartDist);
      setDioramaZoom(cameraState, newZoom);
    }
  },
  { passive: true }
);

canvas.addEventListener("touchend", (e) => {
  if (e.touches.length < 2) pinchStartDist = null;
}, { passive: true });

// Resize handler
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

// Expose for debugging
window.__game = { world, camera, scene, labelManager, hud };
window.__floorplan = floorData;

async function boot() {
  try {
    console.log("Boot starting, sprite URLs:", {
      employee: sheetUrl("employee"),
      boss: sheetUrl("boss"),
      npc1: sheetUrl("npc1")
    });

    const [employeeSheet, bossSheet, ...npcSheets] = await Promise.all([
      loadSheet(sheetUrl("employee")),
      loadSheet(sheetUrl("boss")),
      loadSheet(sheetUrl("npc1")),
      loadSheet(sheetUrl("npc2")),
      loadSheet(sheetUrl("npc3")),
      loadSheet(sheetUrl("npc4"))
    ]);
    console.log("Sprites loaded successfully");
  const npcSheetByName = {
    npc1: npcSheets[0],
    npc2: npcSheets[1],
    npc3: npcSheets[2],
    npc4: npcSheets[3]
  };

  // Player at entrance
  player = new Player(employeeSheet, { x: -3, z: -6 });
  scene.add(player.object3D);

  // NPCs
  npcs = floorData.npcs.map(
    (data) => new NPC(npcSheetByName[data.sheet] || npcSheets[0], data)
  );
  npcs.forEach((npc) => scene.add(npc.object3D));

  // Boss
  boss = new Boss(bossSheet, { world, route: floorData.patrolRoute });
  scene.add(boss.object3D);
  scene.add(boss.cone);

  // Game logic
  game = new Game({ player, boss, npcs, hud });
  createTouchControls(player, app);

  // Boot complete - update debug refs
  window.__game.player = player;
  window.__game.boss = boss;
  window.__game.game = game;
  console.log("Boot complete! Game is ready.");
  } catch (err) {
    console.error("Boot failed:", err);
    throw err;
  }
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement("div");
  msg.style.cssText =
    "position:absolute;inset:0;display:grid;place-items:center;color:#e6483f;font:14px sans-serif";
  msg.textContent = `No se pudieron cargar los sprites: ${err.message ?? err}`;
  app.appendChild(msg);
});
