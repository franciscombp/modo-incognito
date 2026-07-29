import * as THREE from "three";
import { createIsoCamera, resizeIsoCamera } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { createCollisionWorld } from "./scene/collision.js";
import { patrolRoute, npcs as npcData } from "./scene/floorplan.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { createHud } from "./game/hud.js";
import { Game } from "./game/game.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c22);
scene.fog = new THREE.Fog(0x1a1c22, 55, 110);

const aspect = window.innerWidth / window.innerHeight;
const { camera, frustumSize, offset } = createIsoCamera(aspect);
const cameraTarget = new THREE.Vector3(0, 0, 0);

// -------- Lighting: bright, flat, high-key fill so the isometric read
// stays legible like the reference art (no moody shadows). --------
scene.add(new THREE.AmbientLight(0xffffff, 1.1));

const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a4536, 0.9);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff2d6, 1.4);
key.position.set(22, 30, 18);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -22;
key.shadow.camera.right = 22;
key.shadow.camera.top = 22;
key.shadow.camera.bottom = -22;
key.shadow.camera.far = 80;
key.shadow.bias = -0.0015;
scene.add(key);

// -------- World: office structure + collision/vision-blocking geometry --------
const world = createCollisionWorld();
const { roomLabels } = buildOffice(scene, world);

const player = new Player({ x: -0.6, z: 12.6 });
scene.add(player.sprite);

const npcs = npcData.map((data) => new NPC(data));
npcs.forEach((npc) => scene.add(npc.sprite));

const boss = new Boss({ world, route: patrolRoute });
scene.add(boss.sprite);
scene.add(boss.cone);

const hud = createHud(document.getElementById("app"));
const game = new Game({ player, boss, npcs, hud });

// -------- Zoom only: rotation is locked so the view always matches the
// reference isometric angle. --------
let zoom = 1;
window.addEventListener(
  "wheel",
  (e) => {
    zoom = THREE.MathUtils.clamp(zoom - e.deltaY * 0.001, 0.55, 1.8);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  },
  { passive: true }
);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  resizeIsoCamera(camera, frustumSize, w / h);
}
window.addEventListener("resize", onResize);

// -------- Camera follow: pan smoothly toward the player while keeping the
// fixed isometric angle/rotation intact — only position translates. --------
function updateCamera() {
  cameraTarget.lerp(new THREE.Vector3(player.position.x, 0, player.position.z), 0.06);
  camera.position.set(cameraTarget.x + offset.x, offset.y, cameraTarget.z + offset.z);
  camera.lookAt(cameraTarget);
}

// Room labels are only distracting clutter from afar — fade them in as the
// player actually approaches that part of the office, "automatic" instead
// of a wall of always-on signage.
const LABEL_FADE_NEAR = 6;
const LABEL_FADE_FAR = 11;
function updateLabelFade() {
  roomLabels.forEach((label) => {
    const d = Math.hypot(label.userData.homeX - player.position.x, label.userData.homeZ - player.position.z);
    const t = THREE.MathUtils.clamp((LABEL_FADE_FAR - d) / (LABEL_FADE_FAR - LABEL_FADE_NEAR), 0, 1);
    label.material.opacity = t;
    label.visible = t > 0.02;
  });
}

// Gentle bob animation for the hiding/distraction icon markers.
const bobbingMeshes = [];
scene.traverse((obj) => {
  if (obj.userData && obj.userData.bob) bobbingMeshes.push(obj);
});

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  player.update(dt, world);
  npcs.forEach((npc) => npc.update(t));
  game.update(dt);

  bobbingMeshes.forEach((m) => {
    const b = m.userData.bob;
    m.position.y = b.base + Math.sin(t * b.speed + b.offset) * b.amp;
    m.rotation.y = t * 0.6 + b.offset;
  });

  updateLabelFade();
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
