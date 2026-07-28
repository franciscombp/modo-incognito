import * as THREE from "three";
import { createIsoCamera, resizeIsoCamera } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { Player } from "./entities/player.js";

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

buildOffice(scene);

// Scene-space bounds roughly matching the building footprint, so the
// player can roam the whole floor (entrance side is +z, back wall -z).
const player = new Player({ footprint: [-15, 15, -9.3, 13 ] });
scene.add(player.sprite);

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
  cameraTarget.lerp(
    new THREE.Vector3(player.sprite.position.x, 0, player.sprite.position.z),
    0.06
  );
  camera.position.set(
    cameraTarget.x + offset.x,
    offset.y,
    cameraTarget.z + offset.z
  );
  camera.lookAt(cameraTarget);
}

const clock = new THREE.Clock();
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  player.update(dt);
  updateCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
