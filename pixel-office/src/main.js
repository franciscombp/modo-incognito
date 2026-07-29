import * as THREE from "three";
import { DioramaCamera } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { createCollisionWorld } from "./scene/collision.js";
import { buildNavmesh } from "./scene/navmesh.js";
import { PixelPipeline } from "./scene/pixelPipeline.js";
import { WORLD_SCALE as S } from "./scene/config.js";
import * as floorplan from "./scene/floorplan.js";
import { setActiveScene } from "./scene/floorplan.js";
import { loadGameData } from "./data/loader.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { loadSheet } from "./entities/sprite.js";
import { createEngine } from "./game/engine.js";
import { createTouchControls } from "./game/touchControls.js";
import { getSettings, subscribeSettings } from "./game/settings.js";
import { createPopups } from "./ui/popups.js";

const BASE = import.meta.env.BASE_URL ?? "/";
const sheetUrl = (name) => `${BASE}sprites/${name}.png`;

const canvas = document.getElementById("scene");
const app = document.getElementById("app");
const boot0 = document.getElementById("boot");

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

async function boot() {
  // ---- Content: everything the game is made of comes from public/data ----
  const data = await loadGameData();
  const firstLevel = data.levels[0];
  setActiveScene(data.scenes.get(firstLevel.scene));

  const world = createCollisionWorld();
  const { roomLabels, markerGroup } = buildOffice(scene, world);
  const navmesh = buildNavmesh(world, { radius: 0.3 * S });

  const aspect = window.innerWidth / window.innerHeight;
  const view = new DioramaCamera(aspect);
  const camera = view.camera;

  const pixels = new PixelPipeline(renderer, {
    pixelSize: getSettings().pixelSize,
    levels: getSettings().colorLevels,
  });
  pixels.setSize(window.innerWidth, window.innerHeight);

  // ---- Characters, straight from data/characters.json ----
  const chars = data.characters;
  const needed = new Set([
    chars.player.sheet,
    chars.boss.sheet,
    ...floorplan.npcs.map((n) => n.sheet),
  ]);
  const sheets = new Map();
  await Promise.all(
    [...needed].map(async (name) => sheets.set(name, await loadSheet(sheetUrl(name))))
  );

  const player = new Player(sheets.get(chars.player.sheet), {
    x: floorplan.spawn.x,
    z: floorplan.spawn.z,
    radius: chars.player.radius,
    height: chars.player.height,
    speed: chars.player.speed,
  });
  scene.add(player.object3D);

  const npcs = floorplan.npcs.map((data_) => {
    const def = chars.npcs[data_.sheet] ?? {};
    return new NPC(sheets.get(def.sheet ?? data_.sheet) ?? sheets.values().next().value, {
      ...data_,
      radius: def.radius,
      height: def.height,
    });
  });
  npcs.forEach((npc) => scene.add(npc.object3D));

  const boss = new Boss(sheets.get(chars.boss.sheet), {
    world,
    route: floorplan.patrolRoute,
    navmesh,
    radius: chars.boss.radius,
    height: chars.boss.height,
    speeds: chars.boss.speeds,
    visionRange: chars.boss.visionRange,
    visionHalfAngleDeg: chars.boss.visionHalfAngleDeg,
  });
  scene.add(boss.object3D);
  scene.add(boss.cone);

  const popups = createPopups(app, camera);

  const engine = createEngine({
    app,
    renderer,
    scene,
    lights: { ambient, hemi, key },
    player,
    boss,
    npcs,
    camera: view,
    levels: data.levels,
    codeEggs: data.codeEggs,
    manifest: data.manifest,
    onPopup: (p) => popups.spawn(p),
  });

  // -------- Labels: three tiers, so the diorama never drowns in signage ----
  let inspectMode = false;
  function toggleInspect() {
    inspectMode = !inspectMode;
    document.body.classList.toggle("inspect-mode", inspectMode);
  }

  createTouchControls(player, app, {
    onZoom: (delta) => view.zoomBy(delta),
    onInspect: toggleInspect,
    onPause: () => engine.openPause(),
  });

  // -------- Camera input: zoom (wheel/pinch) and orbit (right-drag / 2 fingers)
  window.addEventListener(
    "wheel",
    (e) => {
      if (engine.dialogue.isOpen || engine.menus.isOpen) return;
      view.zoomBy(-e.deltaY * 0.0012);
    },
    { passive: true }
  );

  let orbitPointer = null;
  let orbitLast = { x: 0, y: 0 };
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 2 || engine.menus.isOpen) return;
    orbitPointer = e.pointerId;
    orbitLast = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerId !== orbitPointer) return;
    view.orbitBy((e.clientX - orbitLast.x) * 0.25, -(e.clientY - orbitLast.y) * 0.2);
    orbitLast = { x: e.clientX, y: e.clientY };
  });
  const endOrbit = (e) => {
    if (e.pointerId === orbitPointer) orbitPointer = null;
  };
  canvas.addEventListener("pointerup", endOrbit);
  canvas.addEventListener("pointercancel", endOrbit);

  // Two-finger drag orbits, two-finger pinch zooms — both from the same
  // gesture, decided by whether the fingers move together or apart.
  let pinchStartDist = null;
  let pinchStartFraming = 0;
  let twoFingerCentre = null;
  const touchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const touchCentre = (t) => ({
    x: (t[0].clientX + t[1].clientX) / 2,
    y: (t[0].clientY + t[1].clientY) / 2,
  });

  canvas.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = touchDist(e.touches);
        pinchStartFraming = view.framing;
        twoFingerCentre = touchCentre(e.touches);
      }
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 2 || !pinchStartDist) return;
      const dist = touchDist(e.touches);
      const centre = touchCentre(e.touches);
      const spread = Math.abs(dist / pinchStartDist - 1);
      const drag = Math.hypot(centre.x - twoFingerCentre.x, centre.y - twoFingerCentre.y);
      if (spread * 400 > drag) {
        view.setFraming(pinchStartFraming + (dist / pinchStartDist - 1) * 0.9);
      } else {
        view.orbitBy((centre.x - twoFingerCentre.x) * 0.3, -(centre.y - twoFingerCentre.y) * 0.25);
      }
      twoFingerCentre = centre;
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

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    pixels.setSize(w, h);
    view.setAspect(w / h);
  }
  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m" && !engine.dialogue.isOpen && !engine.menus.isOpen) {
      toggleInspect();
    }
  });

  subscribeSettings((s) => {
    pixels.setPixelSize(s.pixelSize);
    pixels.setLevels(s.colorLevels);
    if (markerGroup) markerGroup.visible = s.showMarkers;
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
    const labelsOn = getSettings().showLabels;
    roomLabels.forEach((label) => {
      const priority = label.userData.priority ?? 2;
      let t;
      if (!labelsOn && !inspectMode) t = 0;
      else if (inspectMode || priority === 1) t = 1;
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

  boot0?.remove();
  engine.start();

  let last = performance.now();
  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    if (!engine.isPaused) {
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
    popups.update(dt);
    pixels.render(scene, camera);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Exposed for the automated checks in tools/.
  window.__game = { world, navmesh, player, boss, engine, camera, scene, view, pixels, data };
  window.__floorplan = floorplan;
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement("div");
  msg.className = "boot-error";
  msg.innerHTML = `<b>No se pudo iniciar el juego</b><br>${err.message ?? err}`;
  (boot0 ?? app).replaceChildren(msg);
});
