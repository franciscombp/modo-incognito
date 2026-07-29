import * as THREE from "three";
import { createIsoCamera, resizeIsoCamera, overviewZoom, overviewTarget } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { createCollisionWorld } from "./scene/collision.js";
import * as floorplan from "./scene/floorplan.js";
import { patrolRoute, npcs as npcData } from "./scene/floorplan.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { loadSheet } from "./entities/sprite.js";
import { createHud } from "./game/hud.js";
import { Game } from "./game/game.js";
import { createTouchControls } from "./game/touchControls.js";
import { IsoCameraController } from "./scene/isoCameraController.js";

const BASE = import.meta.env.BASE_URL ?? "/";
const sheetUrl = (name) => `${BASE}sprites/${name}.png`;

const canvas = document.getElementById("scene");
const app = document.getElementById("app");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0d11);

const aspect = window.innerWidth / window.innerHeight;
const { camera, frustumSize, offset } = createIsoCamera(aspect);
const cameraTarget = overviewTarget();

// -------- Lighting: bright, flat, high-key fill so the pixel textures read
// cleanly, with one soft key light for isometric depth. --------
scene.add(new THREE.AmbientLight(0xffffff, 1.0));
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x50493a, 0.85));

const key = new THREE.DirectionalLight(0xfff2d6, 1.35);
key.position.set(26, 34, 20);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -24;
key.shadow.camera.right = 24;
key.shadow.camera.top = 24;
key.shadow.camera.bottom = -24;
key.shadow.camera.far = 120;
key.shadow.bias = -0.0018;
scene.add(key);

// -------- World --------
const world = createCollisionWorld();
const { roomLabels } = buildOffice(scene, world);

let zoom = 1;
let follow = false;

function applyZoom(next, aspectRatio = window.innerWidth / window.innerHeight) {
  const fit = overviewZoom(aspectRatio);
  zoom = THREE.MathUtils.clamp(next, fit * 0.9, 2.6);
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  // Once the view is tighter than the whole floor there is nothing to frame
  // statically any more, so hand the camera over to the player.
  follow = zoom > fit * 1.06;
}

async function boot() {
  const [employeeSheet, bossSheet, ...npcSheets] = await Promise.all([
    loadSheet(sheetUrl("employee")),
    loadSheet(sheetUrl("boss")),
    loadSheet(sheetUrl("npc1")),
    loadSheet(sheetUrl("npc2")),
    loadSheet(sheetUrl("npc3")),
    loadSheet(sheetUrl("npc4")),
  ]);
  const npcSheetByName = { npc1: npcSheets[0], npc2: npcSheets[1], npc3: npcSheets[2], npc4: npcSheets[3] };

  const player = new Player(employeeSheet, { x: -0.6, z: 12.2 });
  scene.add(player.object3D);

  const npcs = npcData.map((data) => new NPC(npcSheetByName[data.sheet] ?? npcSheets[0], data));
  npcs.forEach((npc) => scene.add(npc.object3D));

  const boss = new Boss(bossSheet, { world, route: patrolRoute });
  scene.add(boss.object3D);
  scene.add(boss.cone);

  const hud = createHud(app);
  const game = new Game({ player, boss, npcs, hud });
  createTouchControls(player, app);

  // Initialize interactive camera controller
  try {
    const cameraController = new IsoCameraController(camera, { pitchDeg: 35, yawDeg: -45, distance: 60 });
    window.__cameraController = cameraController;
  } catch (err) {
    console.error("Failed to initialize camera controller:", err);
  }

  // Start framed on the whole floor like the reference image; narrow screens
  // can't show it usefully, so those start following the player instead.
  applyZoom(aspect >= 1.15 ? overviewZoom(aspect) : 1.35, aspect);

  window.addEventListener("wheel", (e) => applyZoom(zoom - e.deltaY * 0.0012), { passive: true });

  let pinchStartDist = null;
  let pinchStartZoom = 1;
  const pinchDistance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = pinchDistance(e.touches);
        pinchStartZoom = zoom;
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        applyZoom(pinchStartZoom * (pinchDistance(e.touches) / pinchStartDist));
      }
    },
    { passive: true }
  );
  canvas.addEventListener("touchend", (e) => {
    if (e.touches.length < 2) pinchStartDist = null;
  }, { passive: true });

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    resizeIsoCamera(camera, frustumSize, w / h);
    applyZoom(zoom, w / h);
  });

  // -------- Camera: fixed angle always; only the centre point moves. -----
  const overview = overviewTarget();
  const desired = new THREE.Vector3();
  function updateCamera() {
    if (follow) desired.set(player.position.x, 0, player.position.z);
    else desired.copy(overview);
    cameraTarget.lerp(desired, follow ? 0.08 : 0.05);
    const currentOffset = camera.userData.isoOffset || offset;
    camera.position.set(cameraTarget.x + currentOffset.x, currentOffset.y, cameraTarget.z + currentOffset.z);
    camera.lookAt(cameraTarget);
  }

  // Room labels are clutter from afar — fade them in as the player
  // approaches, and show them all in the overview framing where they act as
  // the map key the reference image uses.
  const LABEL_NEAR = 6;
  const LABEL_FAR = 11;
  const overviewFit = () => overviewZoom(window.innerWidth / window.innerHeight);
  function updateLabelFade() {
    // Sprites keep a fixed world size, so under an orthographic zoom they
    // would balloon on screen. Counter-scale by the zoom so signage stays a
    // constant, readable size however far in the player is.
    const sizeComp = overviewFit() / zoom;
    roomLabels.forEach((label) => {
      let t;
      if (!follow || label.userData.alwaysVisible) {
        t = 1;
      } else {
        const d = Math.hypot(
          label.userData.homeX - player.position.x,
          label.userData.homeZ - player.position.z
        );
        t = THREE.MathUtils.clamp((LABEL_FAR - d) / (LABEL_FAR - LABEL_NEAR), 0, 1);
      }
      label.material.opacity = t;
      label.visible = t > 0.02;
      const base = label.userData.baseScale;
      if (base) label.scale.set(base.x * sizeComp, base.y * sizeComp, 1);
    });
  }

  const bobbingMeshes = [];
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.bob) bobbingMeshes.push(obj);
  });

  let last = performance.now();
  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    player.update(dt, world);
    npcs.forEach((npc) => npc.update(dt, t));
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
  requestAnimationFrame(animate);

  // Exposed for the automated reachability check in tools/check-reachable.mjs.
  window.__game = { world, player, boss, game, camera, scene };
  window.__floorplan = floorplan;
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement("div");
  msg.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;color:#e6483f;font:14px sans-serif";
  msg.textContent = `No se pudieron cargar los sprites: ${err.message ?? err}`;
  app.appendChild(msg);
});
