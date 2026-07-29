import * as THREE from "three";
import { DioramaCamera } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { createCollisionWorld } from "./scene/collision.js";
import { buildNavmesh } from "./scene/navmesh.js";
import { WORLD_SCALE as S } from "./scene/config.js";
import * as floorplan from "./scene/floorplan.js";
import { patrolRoute, npcs as npcData, spawn } from "./scene/floorplan.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { loadSheet } from "./entities/sprite.js";
import { createEngine } from "./game/engine.js";
import { createTouchControls } from "./game/touchControls.js";

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
scene.background = new THREE.Color(0x9fb4c9);

const aspect = window.innerWidth / window.innerHeight;
const view = new DioramaCamera(aspect);
const camera = view.camera;

// -------- Lighting: bright, flat fill so the flat art reads cleanly, plus
// one soft key light for diorama depth. The day theme re-tints these. -----
const ambient = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x50493a, 0.85);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff2d6, 1.35);
key.position.set(26 * S, 40 * S, 20 * S);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
const shadowSpan = 44 * S;
key.shadow.camera.left = -shadowSpan;
key.shadow.camera.right = shadowSpan;
key.shadow.camera.top = shadowSpan;
key.shadow.camera.bottom = -shadowSpan;
key.shadow.camera.far = 220 * S;
key.shadow.bias = -0.0018;
scene.add(key);

// -------- World --------
const world = createCollisionWorld();
const { roomLabels } = buildOffice(scene, world);
const navmesh = buildNavmesh(world, { radius: 0.3 * S });

async function boot() {
  const [employeeSheet, bossSheet, ...npcSheets] = await Promise.all([
    loadSheet(sheetUrl("employee")),
    loadSheet(sheetUrl("boss")),
    loadSheet(sheetUrl("npc1")),
    loadSheet(sheetUrl("npc2")),
    loadSheet(sheetUrl("npc3")),
    loadSheet(sheetUrl("npc4")),
  ]);
  const npcSheetByName = {
    npc1: npcSheets[0],
    npc2: npcSheets[1],
    npc3: npcSheets[2],
    npc4: npcSheets[3],
  };

  const player = new Player(employeeSheet, { x: spawn.x, z: spawn.z });
  scene.add(player.object3D);

  const npcs = npcData.map((data) => new NPC(npcSheetByName[data.sheet] ?? npcSheets[0], data));
  npcs.forEach((npc) => scene.add(npc.object3D));

  const boss = new Boss(bossSheet, { world, route: patrolRoute, navmesh });
  scene.add(boss.object3D);
  scene.add(boss.cone);

  const engine = createEngine({
    app,
    renderer,
    scene,
    lights: { ambient, hemi, key },
    player,
    boss,
    npcs,
    camera: view,
  });

  // -------- Labels: three tiers, so the diorama never drowns in signage ----
  // 1 = landmarks (salas, cafetería, baños, ascensores): always on
  // 2 = work zones: when the player is close, in the overview, or inspecting
  // 3 = service detail: inspect mode only
  let inspectMode = false;
  function toggleInspect() {
    inspectMode = !inspectMode;
    document.body.classList.toggle("inspect-mode", inspectMode);
  }

  createTouchControls(player, app, {
    onZoom: (delta) => view.zoomBy(delta),
    onInspect: toggleInspect,
  });

  // -------- Camera input --------
  window.addEventListener(
    "wheel",
    (e) => {
      if (engine.dialogue.isOpen) return;
      view.zoomBy(-e.deltaY * 0.0012);
    },
    { passive: true }
  );

  let pinchStartDist = null;
  let pinchStartFraming = 0;
  const pinchDistance = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = pinchDistance(e.touches);
        pinchStartFraming = view.framing;
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        const ratio = pinchDistance(e.touches) / pinchStartDist;
        view.setFraming(pinchStartFraming + (ratio - 1) * 0.9);
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      if (e.touches.length < 2) pinchStartDist = null;
    },
    { passive: true }
  );

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    view.setAspect(w / h);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m" && !engine.dialogue.isOpen) toggleInspect();
  });

  const LABEL_NEAR = 7 * S;
  const LABEL_FAR = 13 * S;
  // Sprites keep a fixed world size, so under a perspective camera a nearby
  // sign would balloon across the screen. Counter-scale by distance to keep
  // signage a constant, readable size wherever the camera is.
  const LABEL_REF_DIST = 46 * S;
  const labelWorldPos = new THREE.Vector3();

  function updateLabels() {
    const overview = !view.isFollowing;
    roomLabels.forEach((label) => {
      const priority = label.userData.priority ?? 2;
      let t;
      if (inspectMode || priority === 1) t = 1;
      else if (priority >= 3) t = 0;
      else if (overview) t = 1;
      else {
        const d = Math.hypot(
          label.userData.homeX - player.position.x,
          label.userData.homeZ - player.position.z
        );
        t = THREE.MathUtils.clamp((LABEL_FAR - d) / (LABEL_FAR - LABEL_NEAR), 0, 1);
      }
      label.material.opacity = t;
      label.visible = t > 0.02;

      const base = label.userData.baseScale;
      if (base && label.visible) {
        label.getWorldPosition(labelWorldPos);
        const comp = THREE.MathUtils.clamp(
          camera.position.distanceTo(labelWorldPos) / LABEL_REF_DIST,
          0.35,
          1.6
        );
        label.scale.set(base.x * comp, base.y * comp, 1);
      }
    });
  }

  const bobbingMeshes = [];
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.bob) bobbingMeshes.push(obj);
  });

  // Don't await: the story beat runs while the render loop is already going,
  // otherwise the first frame only appears after the intro is dismissed.
  engine.start();

  let last = performance.now();
  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    const frozen = engine.isPaused;
    if (!frozen) {
      player.update(dt, world);
      npcs.forEach((npc) => npc.update(dt, t));
    }
    engine.update(dt);

    bobbingMeshes.forEach((m) => {
      const b = m.userData.bob;
      m.position.y = b.base + Math.sin(t * b.speed + b.offset) * b.amp;
      m.rotation.y = t * 0.6 + b.offset;
    });

    updateLabels();
    view.update(dt, player.position);
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Exposed for the automated checks in tools/.
  window.__game = { world, navmesh, player, boss, engine, camera, scene, view };
  window.__floorplan = floorplan;
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement("div");
  msg.style.cssText =
    "position:absolute;inset:0;display:grid;place-items:center;color:#e6483f;font:14px sans-serif;text-align:center;padding:24px";
  msg.textContent = `No se pudo iniciar el juego: ${err.message ?? err}`;
  app.appendChild(msg);
});
