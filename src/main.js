import * as THREE from "three";
import { DioramaCamera } from "./scene/camera.js";
import { updateBeacons } from "./scene/beacons.js";
import { buildOffice } from "./scene/builder.js";
import { claimNearestSeat } from "./scene/furniture.js";
import { createCollisionWorld } from "./scene/collision.js";
import { buildNavmesh } from "./scene/navmesh.js";
import { PixelPipeline } from "./scene/pixelPipeline.js";
import { createWorldLighting } from "./scene/lighting.js";
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
import { createStage, applyStageScale, stageScale, STAGE_W, STAGE_H } from "./ui/stage.js";
import { controlsLine } from "./ui/controls.js";
import { createFocusNav } from "./ui/focusNav.js";
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
// La escala del lienzo, ANTES del primer frame: sin esto el arranque se ve
// un instante sin escalar (o recortado) hasta que corre el resto del setup.
applyStageScale();
const boot0 = document.getElementById("boot");

// El arranque es el BOOT de una computadora (la interfaz ES un sistema
// operativo de mentira): un log en monoespaciada que va soltando líneas con
// su estado, como el de maldonado.pro. Es teatro — no mide la carga real,
// que la barra ya insinúa — pero convierte la espera en el primer chiste.
const bootLog = document.getElementById("boot-log");
if (bootLog) {
  const LINES = [
    ["> iniciando INCÓGNITO//OS", "ok"],
    ["> conectando con el Piso 10", "ok"],
    ["> contratando al reparto", "sin sueldo"],
    ["> abriendo hoja de cálculo de coartada", "ok"],
    ["> localizando a GABO", "mejor no"],
  ];
  LINES.forEach(([text, status], i) => {
    setTimeout(() => {
      if (!bootLog.isConnected) return;
      const row = document.createElement("div");
      row.className = "boot-line";
      const t = document.createElement("span");
      t.className = "boot-line-t";
      t.textContent = text;
      const dots = document.createElement("span");
      dots.className = "boot-line-dots";
      const s = document.createElement("em");
      s.className = "boot-line-s";
      s.textContent = status;
      row.append(t, dots, s);
      bootLog.appendChild(row);
    }, 140 + i * 340);
  });
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
const quality0 = resolveQuality();
/**
 * EL LIENZO FIJO: el canvas mide 1920×1080 en coordenadas de lienzo y el
 * CSS lo escala entero. Para que el 3D no salga borroso, el BUFFER se
 * dimensiona a resolución real: pixelRatio = dpr × escala del lienzo (con
 * el tope de calidad de siempre). setSize va con updateStyle=false — el
 * tamaño CSS lo manda el design system, no Three.
 */
function stagePixelRatio(maxPR) {
  return Math.min(window.devicePixelRatio, maxPR) * Math.min(stageScale(), 2);
}
renderer.setPixelRatio(stagePixelRatio(quality0.maxPixelRatio));
renderer.shadowMap.enabled = quality0.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(STAGE_W, STAGE_H, false);

const scene = new THREE.Scene();
// Cielo y niebla cálidos desde el primer frame: el tema del día los reajusta
// (ver game/themes.js), pero el arranque ya no es una pantalla negra.
scene.background = skyTexture();
scene.fog = new THREE.Fog(new THREE.Color(ATMOSPHERE.fog), 60, 190);

// La luz del piso se monta en scene/lighting.js — es ARTE, y se calibra en
// muchas pasadas seguidas, así que tenerla aquí hacía chocar cada ajuste de
// luz con cualquier cambio de arranque. Ver docs/ARTE.md.
// El objeto que devuelve es el mismo que el motor derrama en applyTheme, así
// que añadir una luz allí llega sola a game/themes.js sin tocar este archivo.
const lights = createWorldLighting(scene, quality0, S);
// Solo el sol se vuelve a tocar desde aquí, y solo para el mapa de sombras
// cuando cambia la calidad. El color y el ángulo los manda game/themes.js.
const { key } = lights;

async function boot() {
  // PWA a la carta: el service worker cachea SOLO los .glb (una descarga de
  // los cuerpos y listos) y además va cacheando el resto al usarse, así que
  // el juego FUNCIONA SIN RED una vez visitado — ver public/sw.js. Si el
  // navegador no lo soporta, no pasa nada.
  //
  // El `?v=BUILD` del registro es el corazón del flujo de versiones: un
  // build nuevo cambia la URL del script, el navegador lo trata como worker
  // nuevo y `updatefound` dispara la NOTA de «nueva versión» — que no
  // impone nada: actualiza cuando la jugadora la toca (o en el siguiente
  // arranque, si la ignora).
  // Bajo automatización (navigator.webdriver: Playwright, los checks de
  // tools/) el worker NO se registra: los checks reescriben datos
  // interceptando la red con page.route, y las peticiones que hace un
  // service worker no pasan por esa intercepción — check-retry parchea
  // dia-1.json al vuelo y con SW nunca veía su parche, con red-primero o
  // sin él. Los checks prueban el JUEGO; el worker se prueba a mano.
  if ("serviceWorker" in navigator && !navigator.webdriver) {
    navigator.serviceWorker
      .register(`${BASE}sw.js?v=${BUILD}`)
      .then((reg) => {
        const offerUpdate = (worker) => {
          // Solo si ya había un worker controlando: en la primera visita el
          // "nuevo" es el único y no hay nada que anunciar.
          if (!navigator.serviceWorker.controller) return;
          const note = document.createElement("button");
          note.type = "button";
          note.className = "inc-update-note";
          note.textContent = "Nueva versión lista — toca para actualizar";
          note.addEventListener("click", () => {
            note.disabled = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          });
          document.body.appendChild(note);
        };
        // Puede que la actualización ya estuviera esperando de una visita
        // anterior; si no, se vigila la próxima.
        if (reg.waiting) offerUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w?.addEventListener("statechange", () => {
            if (w.state === "installed") offerUpdate(w);
          });
        });
        // Cuando el worker nuevo toma el control (la jugadora aceptó), se
        // recarga UNA vez para arrancar ya con la versión nueva.
        let reloaded = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloaded) return;
          reloaded = true;
          location.reload();
        });
      })
      .catch(() => {});
  }

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
  const {
    roomLabels,
    markerGroup,
    hidingMarkers,
    safeSpotMarkers,
    activityMarkers,
    alibiMarkers,
    seats,
    moveSeatChair,
  } =
    buildOffice(scene, world);
  const navmesh = buildNavmesh(world, { radius: 0.3 * S });
  // ── EL PLANO DE LOS VIGILANTES ────────────────────────────────────────
  // Gabo y sus secuaces caminan sobre OTRO navmesh: el mismo piso, menos
  // las salas. Una sala es un ESCONDITE, y un escondite en el que el jefe
  // puede entrar no es un escondite. Antes bastaba con que no persiguiera
  // dentro, pero empezar el día sentado en la Sala 1 lo dejó plantado justo
  // en el sitio al que vas a huir de él — y encerrado, porque la puerta de
  // una sala es un hueco estrecho y su ruta lo llevaba a la pared.
  //
  // Es un plano aparte y no una regla suelta a propósito: con el mismo
  // navmesh, el A* seguiría trazando la ruta por dentro y el jefe se
  // pasaría el día empujando un tabique.
  const salas = floorplan.areas
    .filter((a) => a.kind === "meeting")
    .map((a) => ({ x: a.x, z: a.z, w: a.w, d: a.d }));
  const navVigilancia = buildNavmesh(world, { radius: 0.3 * S, excluir: salas });

  // Pull every authored point onto walkable floor. A waypoint buried in a
  // table is a boss who stands still forever, and an activity inside a
  // collider is a task you can never reach — both were happening.
  const snapInPlace = (points, nav = navmesh) =>
    points.forEach((p) => {
      const fixed = nav.snap(p.x, p.z);
      p.x = fixed.x;
      p.z = fixed.z;
    });
  // LAS RONDAS SE PEGAN AL PLANO DE LOS VIGILANTES, no al de todos. Con el
  // plano general, un punto de ronda que cayera dentro de una sala se
  // quedaba ahí: el jefe no puede llegar, así que empujaba contra el
  // tabique el día entero avanzando un palmo cada diez segundos, y desde
  // fuera parecía que se había roto la IA. La ronda tiene que estar
  // expresada en el piso por el que ESE personaje puede andar.
  snapInPlace(floorplan.patrolRoute, navVigilancia);
  Object.values(floorplan.routes).forEach((r) => snapInPlace(r, navVigilancia));
  snapInPlace(floorplan.activityStations);
  snapInPlace(floorplan.distractions);
  snapInPlace(floorplan.hidingSpots);
  snapInPlace(floorplan.safeSpots);
  // LOS PUESTOS, al plano de los VIGILANTES: es donde se planta Gabo, y quien
  // se planta ahí camina sobre ese plano. Sin snap, el punto de recepción
  // caía medio metro dentro del bloque de los ascensores: Gabo se quedaba
  // clavado en la puerta, sin ruta posible hacia ningún sitio, y la escena de
  // «te acompaño a tu puesto» no llegaba a arrancar. Un punto autor no tiene
  // por qué caer en suelo pisable — por eso existe este barrido.
  snapInPlace(floorplan.puestos, navVigilancia);

  // El encuadre es SIEMPRE 16:9: forma parte del contrato del lienzo. Lo
  // que cambia con la pantalla son las bandas negras, nunca lo que se ve.
  const view = new DioramaCamera(STAGE_W / STAGE_H);
  const camera = view.camera;

  const pixels = new PixelPipeline(renderer, {
    pixelSize: getSettings().pixelSize,
    levels: getSettings().colorLevels,
  });
  pixels.setSize(STAGE_W, STAGE_H);

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
    // El MISMO stick que mueve a la jugadora en el piso. Va como función
    // porque `player` se crea unas líneas más abajo, y esto solo se llama
    // con el cruce ya en marcha.
    getTouchAxis: () => player?.touchAxis,
  });
  crossing3D.resize(STAGE_W / STAGE_H);

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
  scene.add(player.sleepIcon);
  scene.add(player.happyIcon);

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
      // Quien va a trabajar sentado se queda con un PUESTO de verdad: el
      // asiento libre más cercano a donde lo puso el plano. El JSON sigue
      // decidiendo en qué mesa se sienta cada quien; el asiento, el
      // centímetro exacto. Sin ninguno cerca (2 unidades es media mesa) se
      // queda donde estaba, de pie — mejor eso que sentado en el aire.
      const wantsSeat = def.pose === undefined || def.pose === "sitWork";
      const seat = wantsSeat ? claimNearestSeat(seats, def.x, def.z, 2) : null;
      const npc = new NPC(look, {
        ...def,
        radius: stats.radius,
        height: stats.height,
        navmesh,
        seat,
        moveSeatChair,
      });
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
    navmesh: navVigilancia,
    vetadas: salas,
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
  scene.add(boss.alertIcon);

  // One watcher per sidekick, created up front and parked out of sight. Days
  // switch them on and hand them a route; nothing is added to or removed from
  // the scene graph mid-game.
  const minionColors = { chispita: 0xf2c744, washo: 0x45e0d0, crispo: 0xc08457 };
  const minions = new Map();
  for (const [id, def] of Object.entries(chars.minions ?? {})) {
    const watcher = new Boss(looks.get(id), {
      world,
      route: floorplan.routes[id] ?? floorplan.patrolRoute,
      navmesh: navVigilancia,
      vetadas: salas,
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
    scene.add(watcher.alertIcon);
    minions.set(id, watcher);
  }

  const popups = createPopups(app, camera);

  // El control de sonido ya no es un widget suelto en la esquina: vive en la
  // pausa (ver ui/gamehud.js y su atajo `V`). Flotando aparte chocaba con los
  // paneles y duplicaba su función.

  const engine = createEngine({
    app,
    canvas,
    renderer,
    scene,
    lights,
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
    campaignData: data.campaign,
    libretaData: data.libreta,
    chismesData: data.chismes ?? [],
    playerSheet: modeOf(save.characterId)?.sheet ?? chars.player.sheet,
    onCharacter: (id) => applyCharacterSprite(id),
    playerName: chars.player.name ?? "Tú",
    minions,
    seats,
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
  // La tecla M ("plano") abre el MAPA de terminal (ui/minimap.js) y a la vez
  // enciende los rótulos del piso: el modo consulta completo, de un golpe.
  let inspectMode = false;
  function toggleInspect() {
    inspectMode = !inspectMode;
    document.body.classList.toggle("inspect-mode", inspectMode);
    if (engine.minimap.isOpen !== inspectMode) engine.minimap.toggle();
  }

  const focusNav = createFocusNav();
  const touch = createTouchControls(player, app, {
    onZoom: (delta) => view.zoomBy(delta),
    onInspect: toggleInspect,
    onPause: () => engine.openPause(),
    // EL MANDO DEL PULGAR TAMBIÉN MANEJA LOS MENÚS. El cursor ya estaba
    // preparado para esto —expone `empujar`/`aceptar` y su comentario dice
    // «para la palanca de pantalla»— pero nadie se lo había enchufado, así
    // que en un teléfono había pantallas a las que solo se llegaba con un
    // teclado que no existe.
    focusNav,
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
    const k = 1 / Math.max(stageScale(), 0.001);
    view.orbitBy((e.clientX - orbitLast.x) * 0.25 * k, -(e.clientY - orbitLast.y) * 0.2 * k);
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
    // Con el lienzo fijo, el resize ya no cambia el LAYOUT (siempre
    // 1920×1080): solo la densidad del buffer, que sigue a la escala.
    const q = resolveQuality(getSettings().quality);
    renderer.setPixelRatio(stagePixelRatio(q.maxPixelRatio));
    renderer.setSize(STAGE_W, STAGE_H, false);
    pixels.setSize(STAGE_W, STAGE_H);
    view.setAspect(STAGE_W / STAGE_H);
    crossing3D.resize(STAGE_W / STAGE_H);
  }
  window.addEventListener("resize", resize);

  // La cortina de orientación pausa el juego mientras el teléfono esté en
  // vertical, y lo suelta al girar. Fuera del lienzo a propósito.
  createStage({
    onCover(covered) {
      if (covered) engine.game?.setPaused(true);
      else if (!engine.menus.isOpen && !engine.dialogue.isOpen) engine.game?.setPaused(false);
    },
  });

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
    renderer.setPixelRatio(stagePixelRatio(q.maxPixelRatio));
    renderer.shadowMap.enabled = q.shadows;
    if (key.shadow.mapSize.x !== q.shadowMap) {
      key.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      key.shadow.map?.dispose();
      key.shadow.map = null;
    }
    scene.traverse((obj) => {
      if (obj.isMesh || obj.isInstancedMesh) obj.castShadow = obj.castShadow && q.shadows;
    });
    renderer.setSize(STAGE_W, STAGE_H, false);
    pixels.setSize(STAGE_W, STAGE_H);
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
    // POR DEFECTO NO HAY RÓTULOS. Eran cajas de texto flotando por todo el
    // piso: tapaban el escenario, se solapaban entre ellas y obligaban a
    // LEER justo cuando no se puede leer, con el jefe detrás. Lo que hace
    // falta saber —dónde fingir, dónde hay café, dónde esconderse— lo dicen
    // ahora las medallas (ver scene/beacons.js), que se entienden de un
    // vistazo y desde lejos.
    //
    // Siguen existiendo para dos casos: el ajuste "Rótulos de zona", y el
    // modo inspección (la vista de plano), donde sí estás leyendo el piso a
    // propósito y un nombre ayuda.
    const labelsOn = getSettings().showLabels;
    roomLabels.forEach((label) => {
      const priority = label.userData.priority ?? 2;
      let t;
      if (inspectMode) t = 1;
      else if (!labelsOn) t = 0;
      else if (priority === 1) t = 1;
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

  // Cover markers dim as they are used up and go grey while recharging, so
  // "that circle no longer works" is visible on the floor, not just a toast.
  const HIDE_READY = new THREE.Color(0x4caf6a);
  const HIDE_SPENT = new THREE.Color(0x555f6e);
  function updateHidingMarkers() {
    const game = engine.game;
    if (!game || !hidingMarkers) return;
    // Ahora son MEDALLAS (sprites), no anillos de suelo: la recarga se lee
    // en la opacidad. Teñir el material tiraría el color del icono, que va
    // dentro de la textura.
    hidingMarkers.forEach((medal, i) => {
      const charge = game.hidingCharge(i);
      medal.material.opacity = 0.3 + charge * 0.7;
    });
  }

  // Los lugares seguros son ahora MEDALLAS flotantes (ver beacons.js): la
  // sala gastada u ocupada se apaga bajando su opacidad, pero NO desaparece
  // — que se siga sabiendo que ahí había un sitio donde fingir.
  function updateSafeSpotMarkers() {
    const game = engine.game;
    if (!game || !safeSpotMarkers) return;
    safeSpotMarkers.forEach((label, i) => {
      const charge = game.safeSpotCharge(i);
      const mats = Array.isArray(label.material) ? label.material : [label.material];
      for (const m of mats) {
        if (!m) continue;
        m.transparent = true;
        m.opacity = 0.35 + charge * 0.65;
      }
    });
  }

  // Las medallas de tarea solo se encienden para las ACTIVAS del día: marcar
  // lo que no toca era ruido, no guía.
  function updateActivityMarkers() {
    if (!activityMarkers) return;
    const game = engine.game;
    activityMarkers.forEach((icon) => {
      const objective = game?.objectives?.find((o) => o.id === icon.userData.stationId);
      icon.visible = !!objective && !objective.done && !game.gameOver;
    });
    // La medalla de una coartada se apaga en cuanto la recoges: ya no hay
    // nada ahí. Se mira el inventario y no una bandera propia, para que no
    // haya dos verdades sobre si la llevas encima.
    alibiMarkers?.forEach((medal) => {
      medal.visible = !!game && !game.gameOver && !game.inventario?.has(medal.userData.itemId);
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

  // La píldora se RELLENA desde la lista única de mandos (ui/controls.js).
  // Estaba escrita a mano en index.html y por eso podía decir una tecla
  // mientras el juego escuchaba otra.
  const hintEl = document.getElementById("hint");
  if (hintEl) hintEl.textContent = controlsLine();

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

  // ── EL PRESUPUESTO DE FRAMES, O POR QUÉ EL TELÉFONO QUEMABA ──────────
  // rAF dispara a la tasa del PANEL: en un móvil de 120 Hz eso era pintar
  // el piso entero 120 veces por segundo — y seguía haciéndolo en los
  // menús, donde el 3D de fondo es un decorado quieto tras un velo. De ahí
  // el recalentamiento. El juego se sella a 60 fps (más no aporta nada a
  // un juego de sigilo), y en pausa/menús baja a 30, que para un fondo
  // estático es invisible y deja la GPU respirar.
  const FRAME_MS_ACTIVE = 1000 / 60;
  const FRAME_MS_IDLE = 1000 / 30;
  let last = performance.now();
  let lastFrame = 0;
  function animate(now) {
    const budget = engine.isPaused || engine.menus.isOpen ? FRAME_MS_IDLE : FRAME_MS_ACTIVE;
    // El medio milisegundo de margen evita saltarse frames legítimos por
    // el redondeo del reloj de rAF (que en 60 Hz llega a 16.6, no a 16.7).
    if (now - lastFrame < budget - 0.5) {
      requestAnimationFrame(animate);
      return;
    }
    lastFrame = now;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;

    // EL CURSOR, fuera de todo lo demás: se sondea aunque el juego esté en
    // pausa o en una escena aparte, porque justo entonces es cuando hay un
    // menú que recorrer. Si no hay nada abierto no hace nada.
    focusNav.update(dt);

    // Cruzar la avenida es una escena 3D aparte con su propio bucle de
    // dibujado (ver crossing3d.js): mientras dura, el piso ni se actualiza
    // ni se pinta, para que los dos lienzos no se peleen por el mismo canvas.
    if (!engine.crossingActive) {
      if (!engine.isPaused) {
        player.update(dt, world);
        // Con el mundo congelado (activando una actividad) los compañeros
        // también se quedan quietos: un piso donde solo tú existes es la
        // señal visual de que estás DENTRO del modo de juego.
        // Los compañeros se paran con el resto del mundo mientras hay una
        // pantalla de minijuego abierta: si el jefe se para y ellos no, el
        // piso detrás sigue moviéndose y la pausa se ve rota a medias.
        if (!engine.game?.enMinijuego) npcs.forEach((npc) => npc.update(dt, t));
      }

      bobbingMeshes.forEach((m) => {
        const b = m.userData.bob;
        m.position.y = b.base + Math.sin(t * b.speed + b.offset) * b.amp;
        m.rotation.y = t * 0.6 + b.offset;
      });
      // Las medallas flotan y "respiran" aparte: son sprites y no giran (un
      // sprite ya mira siempre a la cámara), así que no entran en el bucle
      // de arriba.
      updateBeacons(markerGroup, t);

      watchPerformance(dt);
      updateHints(dt);
      updateHidingMarkers();
      updateSafeSpotMarkers();
      updateActivityMarkers();
      updateLabels();
      // Durante una acción la cámara SOLO SE ACERCA (setActionZoom, un lerp
      // suave); ya no orbita. El giro automático era el latigazo que se veía
      // cuando un abordaje interrumpía la acción a mitad del tween — la
      // vuelta y la ida se peleaban por el yaw. Ahora quien gira es el
      // PERSONAJE, que se pone de cara a la cámara con su giro normal de
      // andar (ver game.js), así que la pose se ve de frente igual.
      const acting = !!(engine.game?.player.isDoingActivity || engine.game?.player.isPretending);
      view.setActionZoom(acting);
      // El plano de CONVERSACIÓN es otro mando: cierra mucho más y sube la
      // mirada al pecho. Reutilizar el de acción daba «primer plano» con
      // medio personaje detrás de la caja y un techo enorme encima. Se
      // pregunta en vez de que el diálogo lo escriba, para no tener dos
      // escritores peleándose por el mismo valor cada cuadro.
      view.setCinematic(!!engine.cinematic);
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
  window.__game = { world, navmesh, navVigilancia, player, boss, engine, camera, scene, view, pixels, data, crossing3D, soundtrackState };
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
