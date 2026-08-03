import * as THREE from "three";
import { DioramaCamera } from "./scene/camera.js";
import { buildOffice } from "./scene/builder.js";
import { createCollisionWorld } from "./scene/collision.js";
import { buildNavmesh } from "./scene/navmesh.js";
import { PixelPipeline } from "./scene/pixelPipeline.js";
import { createCrossing3D } from "./scene/crossing3d.js";
import { createMinigameRegistry } from "./game/minigames.js";
import { WORLD_SCALE as S } from "./scene/config.js";
import { skyTexture, ATMOSPHERE } from "./scene/cozy.js";
import * as floorplan from "./scene/floorplan.js";
import { setActiveScene } from "./scene/floorplan.js";
import * as iso from "./scene/iso.js";
import { loadGameData, preloadBaseModels } from "./data/loader.js";
import { Player } from "./entities/player.js";
import { NPC } from "./entities/npc.js";
import { Boss } from "./entities/boss.js";
import { Character3D, POSES, HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES, ACCESSORIES, DEFAULT_RECIPE } from "./entities/character3d.js";
import * as baseModel from "./entities/baseModel.js";
import * as face from "./entities/face.js";
import { createEngine } from "./game/engine.js";
import { createSave } from "./game/save.js";
import { createTouchControls } from "./game/touchControls.js";
import { getSettings, subscribeSettings, resolveQuality, setSettings } from "./game/settings.js";
import { createPopups } from "./ui/popups.js";
import { isMutedState, setMuted, getVolume, unmute } from "./game/audioControl.js";
import { soundtrackState } from "./game/soundtrack.js";
import { initTheme } from "./game/theme.js";

// Cuanto antes: pone `data-theme` en <html> antes del primer paint, para
// que el arranque no empiece con el tema por defecto y salte al guardado
// medio segundo después.
initTheme();

const BASE = import.meta.env.BASE_URL ?? "/";
// Ver vite.config.js: sella los archivos de `public/`, que no llevan hash.
const BUILD = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const canvas = document.getElementById("scene");
const app = document.getElementById("app");
const boot0 = document.getElementById("boot");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
const quality0 = resolveQuality();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality0.maxPixelRatio));
renderer.shadowMap.enabled = quality0.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
// Cielo y niebla cálidos desde el primer frame: el tema del día los reajusta
// (ver game/themes.js), pero el arranque ya no es una pantalla negra.
scene.background = skyTexture();
scene.fog = new THREE.Fog(new THREE.Color(ATMOSPHERE.fog), 60, 190);

// -------- Luz cozy: mucho relleno suave y cálido, y una key floja que apenas
// marca sombras. Un contraste fuerte endurece los muñecos de color plano y
// rompe justo la sensación que buscamos. El tema del día la re-tinta. -----
const ambient = new THREE.AmbientLight(0xfff6ea, 1.15);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xf0e6ff, 0xd8c4a8, 0.95);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xfff0d4, 1.1);
key.position.set(26 * S, 40 * S, 20 * S);
key.castShadow = true;
key.shadow.mapSize.set(quality0.shadowMap, quality0.shadowMap);
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

  // Los cuerpos esculpidos van por su cuenta: pesan, y el juego tiene que
  // poder arrancar mientras llegan. Ver `preloadBaseModels`. El ascensor
  // (ui/lobby.js) enseña este progreso como los pisos que va marcando.
  let modelsProgress = 0;
  const baseModelsReady = preloadBaseModels(data.looks, ({ progress }) => {
    modelsProgress = progress;
  });
  const firstLevel = data.levels[0];
  setActiveScene(data.scenes.get(firstLevel.scene));

  const world = createCollisionWorld();
  const { roomLabels, markerGroup, hidingMarkers, safeSpotMarkers } = buildOffice(scene, world);
  const navmesh = buildNavmesh(world, { radius: 0.3 * S });

  // Pull every authored point onto walkable floor. A waypoint buried in a
  // table is a boss who stands still forever, and an activity inside a
  // collider is a task you can never reach — both were happening.
  const snapInPlace = (points) =>
    points.forEach((p) => {
      const fixed = navmesh.snap(p.x, p.z);
      p.x = fixed.x;
      p.z = fixed.z;
    });
  snapInPlace(floorplan.patrolRoute);
  Object.values(floorplan.routes).forEach(snapInPlace);
  snapInPlace(floorplan.activityStations);
  snapInPlace(floorplan.distractions);
  snapInPlace(floorplan.hidingSpots);
  snapInPlace(floorplan.safeSpots);

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
  // Ya no hay pliegos que precargar: un personaje es su RECETA (ver
  // data/characters3d.json) y el muñeco se monta con primitivas en el momento.
  // Por eso cambiar de personaje en caliente es gratis.
  const looks = data.looks;

  const save = createSave();
  // El personaje elegido manda sobre la receta base de characters.json. Hasta
  // que se pasa por la pantalla de selección, `save.characterId` es null, así
  // que el id se resuelve UNA vez aquí y de ahí salen tanto el modo como la
  // receta — si no, `looks.get(null)` devolvía el compañero genérico y la
  // jugadora empezaba la partida con cara de figurante.
  const DEFAULT_MODE = "giu";
  const modeIdOf = (id) => (data.modes?.[id] ? id : DEFAULT_MODE);
  const modeOf = (id) => data.modes?.[modeIdOf(id)] ?? null;
  const lookOf = (id) => looks.get(modeIdOf(id));
  // El rig (data/sprites/<id>.json) dice qué poses usa cada personaje y cómo
  // se queda esperando cuando lleva un rato sin hacer nada.
  const rigOf = (who) => (who?.rig ? data.rigs.get(who.rig) : null) ?? null;
  // El HUD todavía no existe cuando esto corre por primera vez (el jugador se
  // crea antes que el motor), así que se rellena más abajo y se vuelve a
  // aplicar. Un `engine?.` aquí no valdría: `engine` es un const posterior y
  // tocarlo antes revienta por zona muerta temporal.
  let hudRef = null;

  function applyCharacterSprite(id) {
    const mode = modeOf(id);
    const rig = rigOf(mode);
    const look = lookOf(id);
    player.sprite.setRecipe(look);
    player.sprite.setRig(rig);
    crossing3D.setPlayerLook(look, rig);
    hideOwnDouble(id);
  }

  // Cruzar la avenida es una escena 3D aparte, con cámara propia (por detrás
  // del hombro) pero los mismos sprites — se crea aquí, donde ya tenemos las
  // hojas cargadas.
  const crossing3D = createCrossing3D(app, lookOf(save.characterId), {
    playerRig: rigOf(modeOf(save.characterId)),
    // Gente llenando la acera: las mismas variantes de relleno que pueblan el
    // piso, así que la calle y la oficina parecen la misma ciudad.
    crowd: [0, 1, 2, 3, 4, 5].map((i) => looks.extra(i)),
  });
  crossing3D.resize(window.innerWidth / window.innerHeight);

  // Los minijuegos se registran aquí; el motor solo los busca por el id que
  // pida el JSON del día (ver game/minigames.js). Añadir otro es una línea
  // más, sin tocar engine.js.
  const minigames = createMinigameRegistry();
  minigames.register("crossing", {
    play: (renderFn) => crossing3D.play(renderFn),
    mood: "crossing",
    bodyClass: "crossing-open",
  });

  const player = new Player(lookOf(save.characterId), {
    x: floorplan.spawn.x,
    z: floorplan.spawn.z,
    radius: chars.player.radius,
    height: chars.player.height,
    speed: chars.player.speed,
  });
  scene.add(player.object3D);

  // Todos los NPC se crean siempre; el que coincide con el personaje elegido
  // se APAGA en caliente. Antes se filtraban aquí una sola vez, al arrancar,
  // usando el personaje guardado — pero elegir personaje pasa después, con el
  // juego ya montado, así que quien empezaba de cero y escogía a Giuli se
  // encontraba a Giuli paseando por el piso mientras la jugaba.
  const npcs = floorplan.npcs
    .map((def, i) => {
      const stats = chars.npcs[def.sheet] ?? {};
      const persona = data.dialogues.cast[def.cast];
      // Los compañeros con nombre llevan su receta; el relleno va rotando
      // entre las variantes de `extras` para que el piso no salga clonado
      // (en el plano, nueve de los diez NPC compartían el mismo pliego gris).
      const look = def.cast ? looks.get(def.cast) : looks.extra(i);
      const npc = new NPC(look, { ...def, radius: stats.radius, height: stats.height, navmesh });
      // Named colleagues can be talked to; the rest are set dressing.
      npc.cast = def.cast ?? null;
      npc.displayName = persona?.name ?? stats.name ?? "Compañero";
      npc.talkCooldown = data.dialogues.encounters[def.cast]?.cooldown ?? 40;
      return npc;
    });
  npcs.forEach((npc) => scene.add(npc.object3D));

  /** Apaga al doble del personaje elegido: no puede haber dos Giulis. */
  function hideOwnDouble(id) {
    const cast = modeOf(id)?.npc ?? null;
    npcs.forEach((npc) => {
      const isDouble = !!cast && npc.cast === cast;
      npc.active = !isDouble;
      npc.object3D.visible = !isDouble;
    });
  }

  applyCharacterSprite(save.characterId);

  const boss = new Boss(looks.get("gabo"), {
    world,
    route: floorplan.patrolRoute,
    navmesh,
    radius: chars.boss.radius,
    height: chars.boss.height,
    speeds: chars.boss.speeds,
    visionRange: chars.boss.visionRange,
    visionHalfAngleDeg: chars.boss.visionHalfAngleDeg,
    config: data.bossConfig?.boss,
  });
  boss.cast = "jefe"; // Identificador para diálogos/encuentros
  boss.displayName = "Gabo";
  boss.sprite.setRig(rigOf(chars.boss));
  scene.add(boss.object3D);
  scene.add(boss.cone);

  // One watcher per sidekick, created up front and parked out of sight. Days
  // switch them on and hand them a route; nothing is added to or removed from
  // the scene graph mid-game.
  const minionColors = { chispita: 0xf2c744, washo: 0x45e0d0, crispo: 0xc08457 };
  const minions = new Map();
  for (const [id, def] of Object.entries(chars.minions ?? {})) {
    const watcher = new Boss(looks.get(id), {
      world,
      route: floorplan.routes[id] ?? floorplan.patrolRoute,
      navmesh,
      role: "minion",
      name: def.name ?? id,
      coneColor: minionColors[id] ?? 0x9fb4c9,
      radius: def.radius,
      height: def.height,
      speeds: def.speeds,
      visionRange: def.visionRange,
      visionHalfAngleDeg: def.visionHalfAngleDeg,
      visionShape: def.visionShape,
      config: data.bossConfig?.boss,
    });
    // Sidekicks are characters, not just threats: you can walk up and talk.
    watcher.cast = id;
    watcher.id = id;
    watcher.displayName = def.name ?? id;
    watcher.talkCooldown = data.dialogues.encounters[id]?.cooldown ?? 35;
    watcher.sprite.setRig(rigOf(def));
    watcher.setActive(false);
    scene.add(watcher.object3D);
    scene.add(watcher.cone);
    minions.set(id, watcher);
  }

  const popups = createPopups(app, camera);

  // El control de sonido ya no es un widget suelto en la esquina: es un
  // menulet de la barra (ver ui/menubar.js), como en macOS. Flotando aparte
  // chocaba con los paneles de la propia barra y duplicaba su función.

  const engine = createEngine({
    app,
    canvas,
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
    dialogues: data.dialogues,
    looks: data.looks,
    modes: data.modes,
    bossConfig: data.bossConfig,
    playerSheet: modeOf(save.characterId)?.sheet ?? chars.player.sheet,
    onCharacter: (id) => applyCharacterSprite(id),
    playerName: chars.player.name ?? "Tú",
    minions,
    onPopup: (p) => popups.spawn(p),
    minigames,
    pixels,
    baseModelsReady,
    getModelsProgress: () => modelsProgress,
  });

  // El primer applyCharacterSprite() corrió antes de que existiera el motor
  // (el jugador se crea antes que el HUD), así que aquí se le pasa el rig.
  hudRef = engine.hud;
  applyCharacterSprite(save.characterId);

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
    crossing3D.resize(w / h);
  }
  window.addEventListener("resize", resize);

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "m" && !engine.dialogue.isOpen && !engine.menus.isOpen) {
      toggleInspect();
    }
  });

  // iOS ignores user-scalable=no, so a quick double tap zooms the whole page
  // and wrecks the layout. Swallow the second tap ourselves, and block the
  // pinch-zoom gestures Safari fires outside the canvas.
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd < 320) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
  ["gesturestart", "gesturechange", "gestureend"].forEach((type) =>
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  );
  document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });

  subscribeSettings((s) => {
    pixels.setPixelSize(s.pixelSize);
    pixels.setLevels(s.colorLevels);
    if (markerGroup) markerGroup.visible = s.showMarkers;

    const q = resolveQuality(s.quality);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
    renderer.shadowMap.enabled = q.shadows;
    if (key.shadow.mapSize.x !== q.shadowMap) {
      key.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) obj.castShadow = obj.castShadow && q.shadows;
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    pixels.setSize(window.innerWidth, window.innerHeight);
  });

  // Frame-rate watchdog. On "auto" a device that cannot hold ~30fps for a
  // few seconds gets stepped down instead of heating up until the browser
  // kills the WebGL context — which is what happened on tablets.
  let slowFrames = 0;
  let downgraded = false;
  function watchPerformance(dt) {
    if (downgraded || getSettings().quality !== "auto") return;
    slowFrames = dt > 0.033 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 180) {
      downgraded = true;
      setSettings({ quality: "bajo", pixelSize: Math.max(2, getSettings().pixelSize) });
      console.info("Calidad reducida automáticamente para mantener la fluidez.");
    }
  }

  const LABEL_NEAR = 7 * S;
  const LABEL_FAR = 13 * S;
  // Sprites keep a fixed world size, so under a perspective camera a nearby
  // sign would balloon across the screen. Counter-scale by distance to keep
  // signage a constant, readable size wherever the camera is.
  const LABEL_REF_DIST = 46 * S;
  const labelWorldPos = new THREE.Vector3();

  function updateLabels() {
    const overview = !view.isFollowing;
    // Por defecto solo quedan los hitos de navegación (salas, baños,
    // ascensores, cafetería): la barra de tarea activa ya dice en qué mesa
    // estás, así que repetirlo flotando sobre cada una era ruido. El ajuste
    // "Rótulos de zona" reactiva también las mesas de trabajo.
    const labelsOn = getSettings().showLabels;
    roomLabels.forEach((label) => {
      const priority = label.userData.priority ?? 2;
      let t;
      if (inspectMode) t = 1;
      else if (priority === 1) t = 1;
      else if (priority >= 3) t = 0;
      else if (!labelsOn) t = 0;
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

  // Cover markers dim as they are used up and go grey while recharging, so
  // "that circle no longer works" is visible on the floor, not just a toast.
  const HIDE_READY = new THREE.Color(0x4caf6a);
  const HIDE_SPENT = new THREE.Color(0x555f6e);
  function updateHidingMarkers() {
    const game = engine.game;
    if (!game || !hidingMarkers) return;
    hidingMarkers.forEach((ring, i) => {
      const charge = game.hidingCharge(i);
      ring.material.color.copy(HIDE_SPENT).lerp(HIDE_READY, charge);
      ring.material.opacity = 0.28 + charge * 0.62;
      ring.scale.setScalar(0.82 + charge * 0.18);
    });
  }

  // Los lugares seguros gastan su carga del día y no se recuperan hasta
  // mañana: cuando se acaban se quedan grises, sin parpadeo de "ya vuelve".
  const SAFE_READY = new THREE.Color(0x4a9de0);
  const SAFE_SPENT = new THREE.Color(0x555f6e);
  function updateSafeSpotMarkers() {
    const game = engine.game;
    if (!game || !safeSpotMarkers) return;
    safeSpotMarkers.forEach((ring, i) => {
      const charge = game.safeSpotCharge(i);
      ring.material.color.copy(SAFE_SPENT).lerp(SAFE_READY, charge);
      ring.material.opacity = 0.22 + charge * 0.63;
      ring.scale.setScalar(0.82 + charge * 0.18);
    });
  }

  const bobbingMeshes = [];
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.bob) bobbingMeshes.push(obj);
  });

  boot0?.remove();
  engine.start();

  // Los cuerpos esculpidos suelen llegar antes que la jugadora a la pantalla
  // de selección, pero si no, esas tarjetas están enseñando el pliego: en
  // cuanto están, se vuelven a dibujar con el muñeco 3D.
  baseModelsReady.then(() => engine.menus.refreshCharacters());

  // Los controles de abajo son una nota de bienvenida: se apagan en cuanto la
  // jugadora se mueve por su cuenta (o tras un rato, si se queda mirando), y
  // así dejan de pelearse por la esquina con la tarjeta de tarea.
  // Solo las teclas de movimiento cuentan: player.keys guarda TODAS las
  // pulsadas, así que mirar su tamaño habría dado por "ya sabe andar" a
  // quien solo apretó espacio para pasar un diálogo.
  const MOVE_KEYS = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"];
  let hintPlayTime = 0;
  function updateHints(dt) {
    if (document.body.classList.contains("hints-done")) return;
    if (!engine.inLevel || engine.isPaused) return;
    hintPlayTime += dt;
    const moved =
      MOVE_KEYS.some((k) => player.keys.has(k)) ||
      Math.hypot(player.touchAxis.x, player.touchAxis.z) > 0.08;
    if (moved || hintPlayTime > 18) document.body.classList.add("hints-done");
  }

  let last = performance.now();
  function animate(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // Cruzar la avenida es una escena 3D aparte con su propio bucle de
    // dibujado (ver crossing3d.js): mientras dura, el piso ni se actualiza
    // ni se pinta, para que los dos lienzos no se peleen por el mismo canvas.
    if (!engine.crossingActive) {
      if (!engine.isPaused) {
        player.update(dt, world);
        npcs.forEach((npc) => npc.update(dt, t));
      }

      bobbingMeshes.forEach((m) => {
        const b = m.userData.bob;
        m.position.y = b.base + Math.sin(t * b.speed + b.offset) * b.amp;
        m.rotation.y = t * 0.6 + b.offset;
      });

      watchPerformance(dt);
      updateHints(dt);
      updateHidingMarkers();
      updateSafeSpotMarkers();
      updateLabels();
      view.setActionZoom(!!(engine.game?.player.isDoingActivity || engine.game?.player.isPretending));
      view.update(dt, player.position);
      popups.update(dt);
      pixels.render(scene, camera);
    }
    engine.update(dt);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // ---- Fullscreen & Privacy Controls (Modo Incógnito) ----
  // F11 = fullscreen toggle
  // M = mute/unmute
  // Window blur = pause music (stealth mode - someone might be watching)

  window.addEventListener("keydown", (e) => {
    if (e.key === "F11" || (e.ctrlKey && e.shiftKey && e.key === "f")) {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(err => {
          console.log("Fullscreen denied:", err);
        });
      } else {
        document.exitFullscreen?.();
      }
    }
  });

  // Mute toggle with 'V' key (Volume control).
  //
  // Funciona SIEMPRE, también con un menú o un diálogo abiertos: silenciar es
  // un control global (el chiste del juego es que alguien puede estar
  // mirando tu pantalla), y bloquearlo en los menús lo hacía inservible
  // justo donde más se usa — el título, que es donde arranca la música.
  // Ninguna pantalla acepta texto libre, así que la V no le hace falta a
  // nadie más; el diálogo solo escucha espacio/enter/E.
  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "v" || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    if (isMutedState()) unmute(getVolume());
    else setMuted(true);
  });

  // Modo Incógnito: pause music when window loses focus
  // (someone else might see the screen, keep it quiet)
  window.addEventListener("blur", () => {
    // Pause music - stealth mode: silently mute without affecting user's volume preference
    const wasMuted = isMutedState();
    if (!wasMuted) {
      setMuted(true);
      window.__audioMutedByFocus = true; // Flag to restore when focus returns
    }
  });

  window.addEventListener("focus", () => {
    // Restore audio if we muted it due to blur
    if (window.__audioMutedByFocus) {
      unmute(getVolume());
      window.__audioMutedByFocus = false;
    }
  });

  // Expose audio control functions for external access
  window.__audioControl = {
    isMutedState,
    getVolume,
    setMuted,
    unmute,
  };

  // Exposed for the automated checks in tools/.
  window.__game = { world, navmesh, player, boss, engine, camera, scene, view, pixels, data, crossing3D, soundtrackState };
  window.__floorplan = floorplan;
  // Para las herramientas de tools/ que montan personajes fuera del juego
  // (retratos del reparto, comprobación de poses) sin rehacer el motor.
  window.__three = THREE;
  window.__char3d = { Character3D, POSES, HAIR_STYLES, TOP_STYLES, BOTTOM_STYLES, ACCESSORIES, DEFAULT_RECIPE };
  window.__base = baseModel;
  window.__face = face;
  // Solo para las comprobaciones de tools/: poder pasar de coordenadas de
  // suelo a pantalla sin duplicar la matriz de la cámara oblicua.
  window.__iso = iso;
}

boot().catch((err) => {
  console.error(err);
  const msg = document.createElement("div");
  msg.className = "boot-error";
  msg.innerHTML = `<b>No se pudo iniciar el juego</b><br>${err.message ?? err}`;
  (boot0 ?? app).replaceChildren(msg);
});
