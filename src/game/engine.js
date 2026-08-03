import { Game } from "./game.js";
import { createHud } from "./hud.js";
import { buzz } from "./settings.js";
import { setMood, playStinger, updateMoodFromSnapshot } from "./soundtrack.js";
import { createDialogue } from "./dialogue.js";
import { createSave } from "./save.js";
import { applyTheme, createThemeBlender } from "./themes.js";
import { createMenus } from "../ui/menus.js";
import { createGuides } from "../ui/guides.js";
import { createWorldPrompt } from "../ui/worldPrompt.js";
import { createLobby } from "../ui/lobby.js";
import { createMenuBar } from "../ui/menubar.js";
import { createEggReveal } from "../ui/eggReveal.js";
import { createMinigameRegistry } from "./minigames.js";
import {
  spawn,
  patrolRoute,
  routes,
  locationEggs,
  activityStations,
} from "../scene/floorplan.js";
import { WORLD_SCALE as S } from "../scene/config.js";

// Gabo te escribe por Teams cada tanto, sin que importe dónde esté él en el
// piso — es un chat, no un encuentro. El rango evita que se sienta ni un
// spam ni un evento raro que solo pasa una vez.
const GABO_TEAMS_INTERVAL = [22, 42];

/**
 * Campaign engine. Owns the flow — title menu, story beat, play the level,
 * story beat, results, next day — and everything that has to survive across
 * days (progress, easter eggs, theme). The render loop lives in main.js and
 * only calls `update`; nothing here touches Three.js beyond re-tinting the
 * lights for the day's theme.
 *
 * Content comes from JSON: `levels` and `codeEggs` are handed in by the data
 * loader, so a new day is a new file, not a code change.
 */
export function createEngine({
  app,
  canvas,
  lights,
  renderer,
  scene,
  player,
  boss,
  npcs,
  camera,
  levels,
  codeEggs = [],
  manifest = {},
  dialogues = { cast: {}, encounters: {}, barks: {} },
  looks = null,
  modes = {},
  bossConfig = null,
  playerSheet = "npc-camina",
  playerName = "Tú",
  minions = new Map(),
  onPopup = null,
  minigames = createMinigameRegistry(),
  pixels = null,
  onCharacter = null,
  baseModelsReady = Promise.resolve(),
  getModelsProgress = () => 100,
}) {
  const hud = createHud(app);
  const guides = createGuides(app, camera.camera);
  const worldPrompt = createWorldPrompt(app, camera.camera, {
    isTouch: matchMedia("(pointer: coarse)").matches,
  });
  const dialogue = createDialogue(app, { looks });
  const lobby = createLobby(app);
  const eggReveal = createEggReveal(app);
  // La barra de menú es el HUD de verdad y vive fuera de todo lo demás: se ve
  // en los menús, en el ascensor y jugando. Ver ui/menubar.js.
  const menuBar = createMenuBar(app, {
    title: manifest.title ?? "Modo Incógnito",
    onOpenPause: () => openPause(),
  });
  hud.attachMenuBar(menuBar);
  const save = createSave();
  let crossingActive = false;

  const eggIds = [...locationEggs.map((e) => e.id), ...codeEggs.map((e) => e.id)];

  // El retrato del diálogo prefiere el sprite del personaje al emoji: busca
  // la hoja por el nombre del hablante, o por su `speaker` si coincide con
  // algún nombre conocido del reparto (jefe, secuaces, npcs con historia).
  const nameToSheet = new Map(
    Object.values(dialogues.cast)
      .filter((c) => c.name && c.sheet)
      .map((c) => [c.name, c.sheet])
  );
  nameToSheet.set(playerName, playerSheet);
  nameToSheet.set("Tú", playerSheet);
  function withSprites(nodes) {
    if (!nodes) return nodes;
    return nodes.map((node) => {
      const sheet =
        node.sheet ?? (typeof node.speaker === "string" ? nameToSheet.get(node.speaker) : undefined);
      const options = node.options
        ? node.options.map((opt) => (opt.then ? { ...opt, then: withSprites(opt.then) } : opt))
        : undefined;
      return {
        ...node,
        ...(sheet ? { sheet } : {}),
        ...(options ? { options } : {}),
      };
    });
  }

  let dayIndex = Math.min(save.dayIndex, levels.length - 1);
  let game = null;
  let bossSpeedBonus = 1;
  let menuPaused = false;
  let inLevel = false;
  // El scrim de los menús es sólido antes de que exista una jornada que
  // enseñar detrás (título, elegir personaje) y translúcido una vez que sí
  // la hay (pausa, y cualquier pantalla a la que se llegue desde pausa,
  // como ajustes) — de ahí esta clase en vez de mirar solo qué pantalla
  // está activa.
  function setInLevel(value) {
    inLevel = value;
    document.body.classList.toggle("inc-game-active", value);
  }
  let teamsTimer = null;
  let lastTeamsMessage = null;

  const ctx = {
    setFlag: (name, value) => save.setFlag(name, value),
    getFlag: (name) => save.getFlag(name),
    // "m" | "f" | null del personaje elegido AHORA MISMO, para que el texto
    // concuerde con quien juega: los tokens {masculino|femenino} de las
    // líneas se resuelven con esto (ver `resolve` en dialogue.js). Función y
    // no valor: el personaje puede cambiar entre partidas sin recrear el ctx.
    getPlayerGender: () => looks?.get?.(save.character)?.gender ?? null,
    // El sprite del personaje elegido AHORA MISMO — nameToSheet.get(playerName)
    // ya se actualiza en selectCharacter, pero se resuelve como función (no
    // un valor guardado) para que las réplicas de diálogo escritas a mano en
    // dialogue.js (los "Tú" que arma un `reply`, no un node del JSON) también
    // sigan al personaje si cambia a media partida.
    getPlayerSheet: () => nameToSheet.get(playerName),
    // Dialogue options in the JSON name their effect as a string; route it to
    // whichever system owns it.
    applyEffect: (name) => {
      if (PROLOGUE_EFFECTS[name]) {
        prologueChoice = name;
        return;
      }
      game?.applyEffect(name);
    },
  };

  // The lift queue that opens each day. Each option trades time for risk.
  const PROLOGUE_EFFECTS = {
    wait: { timeDelta: -25, toast: "Llegaste con la fila. Menos jornada por delante." },
    stairs: { timeDelta: 0, tired: true, toast: "Siete pisos. Llegas entera pero lenta." },
    cut: { timeDelta: 15, risky: true, toast: "Te colaste. A ver si nadie lo comenta." },
  };
  let prologueChoice = null;

  const PERKS = {
    // Konami reward: the boss walks like it is 4:55pm for the rest of the day.
    slowBoss: () => {
      bossSpeedBonus = 0.78;
      applyBossTuning();
    },
  };

  /** A sidekick spotting you sends the real boss to that spot. */
  function onMinionSpot(watcher, at) {
    boss.distract(at, 6);
    game?.toast(`${watcher.name} te delató`);
  }
  minions.forEach((watcher) => {
    watcher.onSpot = onMinionSpot;
  });

  /** El personaje elegido en la pantalla de selección (modes.json). */
  function currentMode() {
    return modes[save.characterId] ?? modes.fran ?? null;
  }

  /**
   * Las reglas del día se fusionan con las del personaje elegido: lo que el
   * personaje no toca queda tal cual está en el nivel (ver modes.json).
   */
  function mergedRules(day) {
    const modeRules = currentMode()?.rules ?? {};
    const rules = { ...day.rules };
    if (modeRules.maxWarnings != null) rules.maxWarnings = modeRules.maxWarnings;
    if (modeRules.explore) rules.explore = true;
    if (modeRules.pretendAlways) rules.pretendAlways = true;
    rules.minionSuspicionMul = (day.rules?.minionSuspicionMul ?? 1) * (modeRules.minionSuspicionMul ?? 1);
    return rules;
  }

  function applyBossTuning() {
    const rules = levels[dayIndex].rules ?? {};
    const modeRules = currentMode()?.rules ?? {};
    const mul = (rules.bossSpeedMul ?? 1) * (modeRules.bossSpeedMul ?? 1) * bossSpeedBonus;
    boss.speed = boss.baseSpeeds.patrol * mul;
    boss.investigateSpeed = boss.baseSpeeds.investigate * mul;
    boss.chaseSpeed = boss.baseSpeeds.chase * mul;
    boss.searchSpeed = boss.baseSpeeds.search * mul;
    const visionMul = (rules.visionMul ?? 1) * (modeRules.visionMul ?? 1);
    boss.visionRange = boss.baseVisionRange * visionMul;
    // El nivel de búsqueda (game.js) multiplica desde esta base, no desde el
    // valor absoluto — así el ajuste por sospecha se suma al del día y al del
    // personaje, no los reemplaza.
    boss.dayTuning = { vision: boss.baseVisionRange * visionMul, speedMul: mul };

    // `bossRoute` acota su ronda a un ala concreta (ver scenes/*.json ->
    // routes) y `bossTether` lo ata a la jugadora: en vez de dar la vuelta al
    // piso, Gabo se pasa el día "casualmente" cerca de ella.
    if (rules.bossRoute && routes[rules.bossRoute]) boss.setRoute(routes[rules.bossRoute]);
    if (rules.bossTether) {
      const [near, far] = rules.bossTether;
      boss.setTether(player.position, { near: near * S, far: far * S });
    } else {
      boss.setTether(null);
    }

    // He drifts toward wherever the day's tasks are, so no wing is ever a
    // safe corner to farm quietly.
    const wanted = rules.objectives;
    const spots = activityStations
      .filter((s) => !wanted || wanted.includes(s.id))
      .map((s) => ({ x: s.x, z: s.z }));
    boss.setPointsOfInterest(spots);
  }

  // ---------------- Menus ----------------
  const menus = createMenus(app, {
    levels,
    save,
    modes,
    looks,
    title: manifest.title ?? "Modo Incógnito",
    subtitle: manifest.subtitle ?? "",
    actions: {
      play: (index) => startDay(index),
      resume: () => resumeFromMenu(),
      restart: () => startDay(dayIndex),
      toTitle: () => openTitle(),
      selectCharacter: (id) => {
        save.setCharacter(id);
        // El sprite se cambia en caliente: elegir personaje pasa con el juego
        // ya montado, no al arrancar. nameToSheet también, o el retrato de
        // diálogo se queda enseñando al personaje con el que se abrió el
        // juego para siempre, aunque elijas otro.
        const sheet = modes[id]?.sheet ?? playerSheet;
        nameToSheet.set(playerName, sheet);
        nameToSheet.set("Tú", sheet);
        onCharacter?.(id);
      },
    },
  });

  function openTitle() {
    setInLevel(false);
    menuPaused = false;
    game?.setPaused(true);
    hud.setVisible(false);
    hud.hideResult();
    setMood("title");
    const done = save.state.completedDays.length;
    menus.openTitle({
      hasProgress: done > 0 || save.dayIndex > 0,
      summary: `${done}/${levels.length} días superados · ${save.state.eggs.length}/${eggIds.length} secretos`,
    });
  }

  function openPause() {
    if (!inLevel || dialogue.isOpen || game?.gameOver) return;
    menuPaused = true;
    game?.setPaused(true);
    setMood("calm");
    menus.openPause(`Día ${levels[dayIndex].number} · ${levels[dayIndex].title}`);
  }

  function resumeFromMenu() {
    menus.close();
    if (!inLevel) return;
    menuPaused = false;
    hud.setVisible(true);
    if (!dialogue.isOpen && !game?.gameOver) game?.setPaused(false);
  }

  // ---------------- Easter eggs ----------------
  const codeBuffer = [];
  const onKey = (e) => {
    const key = e.key.toLowerCase();

    if (key === "escape") {
      e.preventDefault();
      // El cruce no tiene forma de pausarse (su bucle es propio, no pasa por
      // game.setPaused) — abrir el menú encima solo taparía el tráfico
      // seguir avanzando sin que se vea.
      if (crossingActive) return;
      if (menus.isOpen && menus.screen === "pause") resumeFromMenu();
      else if (!menus.isOpen) openPause();
      return;
    }
    // Las flechas del cruce podrían coincidir por accidente con un código
    // secreto (el Konami usa flechas también) y abrir un diálogo encima del
    // tráfico todavía en marcha.
    if (menus.isOpen || crossingActive) return;

    codeBuffer.push(key);
    if (codeBuffer.length > 12) codeBuffer.shift();
    for (const egg of codeEggs) {
      if (save.hasEgg(egg.id)) continue;
      if (codeBuffer.slice(-egg.keys.length).join(",") === egg.keys.join(",")) {
        codeBuffer.length = 0;
        triggerEgg(egg);
      }
    }
  };
  window.addEventListener("keydown", onKey);

  async function triggerEgg(egg) {
    if (!save.findEgg(egg.id)) return;
    if (egg.perk) PERKS[egg.perk]?.();
    // El bono de reloj ya lo enseña el popup flotante de game._grantTime();
    // esta tarjeta es solo la celebración del hallazgo, no una repetición
    // del número. Si el secreto trae su propia escena, se juega primero.
    if (egg.scene?.length) await withPause(() => dialogue.play(withSprites(egg.scene), ctx));
    eggReveal.show(save.state.eggs.length, eggIds.length);
  }

  /** Freeze the level while a story beat plays, then hand control back. */
  async function withPause(fn) {
    game?.setPaused(true);
    try {
      await fn();
    } finally {
      if (!menuPaused && !game?.gameOver) game?.setPaused(false);
    }
  }

  // ---------------- Day lifecycle ----------------
  function resetEntities() {
    player.position.x = spawn.x;
    player.position.z = spawn.z;
    player.keys.clear();
    player.touchAxis.x = 0;
    player.touchAxis.z = 0;
    player.speedMul = 1;
    player.isHiding = false;
    player.isPretending = false;
    player.isDoingActivity = false;

    // Start him at the patrol waypoint furthest from the lifts, so the day
    // doesn't open with the boss standing on top of the player. Con correa
    // (bossTether) es justo al revés: el chiste del día es que Gabo ya está
    // ahí cuando sales del ascensor, así que arranca en el punto más cercano.
    const tethered = !!levels[dayIndex].rules?.bossTether;
    let pick = 0;
    let pickD = tethered ? Infinity : -Infinity;
    patrolRoute.forEach((p, i) => {
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      if (tethered ? d < pickD : d > pickD) {
        pickD = d;
        pick = i;
      }
    });
    boss.position.x = patrolRoute[pick].x;
    boss.position.z = patrolRoute[pick].z;
    boss.routeIndex = pick;
    boss.resetToPatrol();
  }

  // Cuánto dura, como mínimo, la subida del ascensor una vez elegido cómo
  // llegar. Los modelos 3D pueden estar cargados de sobra para entonces (si
  // la jugadora se entretuvo en el menú), y sin un mínimo el marcador
  // saltaría de PB a 10 de golpe — la idea es que la subida SE VEA, no solo
  // que exista.
  const ELEVATOR_MIN_RIDE_MS = 1800;

  /**
   * Anima el cartel de piso del ascensor entre 0 y 100 combinando dos
   * fuentes: el progreso REAL de los modelos 3D (getModelsProgress) y un
   * mínimo por tiempo (ELEVATOR_MIN_RIDE_MS), y no resuelve hasta que las
   * dos llegan al 100% — así ni se congela esperando datos que ya llegaron
   * hace rato, ni salta de golpe si los modelos tardan menos que el paseo.
   */
  function rideElevator() {
    return new Promise((resolve) => {
      const start = performance.now();
      function tick() {
        const timeFrac = Math.min(1, (performance.now() - start) / ELEVATOR_MIN_RIDE_MS);
        const shown = Math.min(getModelsProgress(), timeFrac * 100);
        lobby.updateProgress(shown);
        if (shown >= 100) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      tick();
    });
  }

  /**
   * `skipMinigame` es una costura para las comprobaciones de tools/: el día 1
   * abre con el cruce de la avenida, que es un bucle propio esperando a que
   * alguien juegue, y ninguna prueba de la IA del piso llegaría nunca a
   * empezar. En la partida de verdad nadie lo pasa.
   */
  /**
   * `skipMinigame` es la costura por la que entran las comprobaciones de
   * tools/: sin ella se quedarían esperando a que alguien juegue el cruce de
   * la avenida. `skipPrologue` la sigue por defecto porque el prólogo del
   * ascensor es otra escena que espera un clic, y en cuanto se añadió dejó
   * colgadas a esas mismas comprobaciones — diez de ellas se quedaban en el
   * `waitForFunction` del `engine.game` sin que el fallo dijera por qué.
   * Quien quiera el prólogo con el minijuego saltado puede pedirlo aparte.
   */
  async function startDay(index, { skipMinigame = false, skipPrologue = skipMinigame } = {}) {
    dayIndex = Math.min(Math.max(index, 0), levels.length - 1);
    save.setDayIndex(dayIndex);
    const day = levels[dayIndex];

    menus.close();
    menuPaused = false;
    // Limpiar lo que dejó puesto el intento anterior ANTES de nada. Si el día
    // se perdió en el cruce, quedaban en pantalla el vestíbulo (con las
    // puertas cerradas) y la tarjeta de resultado; al reintentar, la avenida
    // se jugaba debajo de los dos y parecía que el juego se colgaba en el
    // ascensor. Antes esto solo se limpiaba al entrar al piso — es decir,
    // después del minijuego.
    lobby.reset();
    hud.hideResult();
    hud.setVisible(false);

    // Un minijuego del día (cruzar la avenida, etc.) pasa ANTES de entrar al
    // edificio: ni el vestíbulo ni el piso existen todavía para la jugadora.
    // Cada uno es una escena propia con su bucle; mientras dura, main.js deja
    // de dibujar el piso (ver engine.crossingActive).
    const mini = skipMinigame ? null : minigames.forDay(day);
    if (mini) {
      if (mini.spec.intro) await dialogue.play(withSprites(mini.spec.intro), ctx);
      if (mini.bodyClass) document.body.classList.add(mini.bodyClass);
      crossingActive = true;
      if (mini.mood) setMood(mini.mood);
      const outcome = await mini.play((s, c) => pixels?.render(s, c));
      crossingActive = false;
      if (mini.bodyClass) document.body.classList.remove(mini.bodyClass);
      if (outcome === "hit") {
        // Nunca llegaste a entrar: se ve el vestíbulo con las puertas
        // cerradas de fondo, no el piso (todavía no has "llegado").
        lobby.show();
        await minigameFailed(day, mini.spec.onFail);
        return;
      }
    }

    // Orden de carga: minijuego → ascensor → piso. El juego NO se crea hasta
    // que el lobby esté completamente oculto, así evitamos que el piso aparezca
    // y se superponga durante los diálogos del ascensor.

    prologueChoice = null;
    if (day.prologue && !skipPrologue) {
      lobby.show();
      const nodes = [...(day.prologue.intro ?? [])];
      if (save.hadWarningYesterday) {
        // Una amonestación se nota al día siguiente: nunca te toca el
        // ascensor vacío. "Recepción" ya no existe como personaje (era
        // confuso, se quitó del reparto); el comentario ahora es de Steven,
        // que es quien narra el resto del día.
        nodes.unshift({
          speaker: "Steven el Daddy",
          narrator: true,
          text: "Oye, el ascensor viene lleno otra vez. Después de lo de ayer, ya ni te guardan hueco.",
        });
      }
      if (day.prologue.choice) nodes.push(day.prologue.choice);
      await dialogue.play(withSprites(nodes), ctx);
      // El cartel se queda en PB mientras dura la elección de cómo llegar;
      // solo empieza a subir una vez que la jugadora ya decidió. Y la subida
      // se VISTE según la elección: pantalla de ascensor con "SUBIENDO"
      // titilando, o el hueco de la escalera con el cartel de cada rellano
      // si subes por las gradas (ver lobby.setMode).
      lobby.setMode(prologueChoice);
      await rideElevator();
    }

    // EL PISO SE PREPARA CON LAS PUERTAS AÚN CERRADAS.
    //
    // Antes se abrían primero y el día se montaba después, así que durante
    // el segundo y medio que dura la animación el hueco del ascensor
    // enseñaba el piso TAL COMO QUEDÓ del intento anterior — con la jugadora
    // ya plantada en el 10 antes de haber llegado. Ahora se abren sobre el
    // día que empieza.
    // Esperar a que los modelos 3D estén listos antes de crear el piso, así
    // los personajes aparecen visibles y no huecos. rideElevator() ya
    // esperó a que llegaran al 100%, así que en el camino normal esto
    // resuelve al instante; se deja como red de seguridad para cuando no
    // hay prólogo (rideElevator no corrió).
    await baseModelsReady;
    const onDuty = prepareFloor(day);
    // Y la elección del ascensor se aplica aquí, no antes: `applyPrologue`
    // arranca con `if (!game) return`, así que mientras se llamaba antes de
    // montar el día no hacía absolutamente nada — esperar, subir por las
    // escaleras o colarse daban todos lo mismo.
    applyPrologue(day);

    if (day.prologue && !skipPrologue) await lobby.hide();
    hud.setVisible(true);

    camera.setFraming(1);

    await dialogue.play(withSprites(day.intro ?? []), ctx);
    if (!menuPaused) game.setPaused(false);
  }

  /**
   * Monta el día en el piso y devuelve los secuaces de turno.
   *
   * Va aparte para poder llamarlo ANTES de abrir el ascensor: lo que las
   * puertas descubren tiene que ser ya el día que empieza.
   */
  function prepareFloor(day) {
    setInLevel(true);
    bossSpeedBonus = 1;
    applyTheme(day.theme, { renderer, scene, ...lights });
    hud.setDay(day);
    hud.hideResult();
    // Día nuevo: las alertas de "una sola vez" (media hora de nada, etc.)
    // vuelven a contar, y no arrastramos las de ayer en pantalla.
    menuBar.resetNotices();
    setMood("main");
    teamsTimer = null;
    lastTeamsMessage = null;
    resetEntities();
    applyBossTuning();

    const onDuty = configureMinions(day);

    game = new Game({
      player,
      boss,
      npcs,
      minions: onDuty,
      hud,
      canvas,
      config: bossConfig,
      rules: mergedRules(day),
      onFinish: (result) => finishDay(day, result),
      onEgg: (egg) => triggerEgg(egg),
      onPopup,
      onTalk: (npc, opts) => talkTo(npc, opts),
      onWarn: (info) => handleWarn(info),
    });
    // Pausado: el reloj no puede correr mientras se abren las puertas ni
    // durante la presentación de los secuaces.
    game.setPaused(true);
    return onDuty;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Turns the lift-queue choice into a real handicap for the day. */
  function applyPrologue(day) {
    const outcome = PROLOGUE_EFFECTS[prologueChoice];
    if (!game || !outcome) return;

    game.timeLeft = Math.max(60, game.timeLeft + outcome.timeDelta);
    if (outcome.tired) {
      player.speedMul = 0.85;
      setTimeout(() => {
        if (player.speedMul === 0.85) player.speedMul = 1;
      }, 30000);
    }
    if (outcome.risky && Math.random() < 0.35) {
      game.warnings = 1;
      game.toast("Te vieron colarte: advertencia 1");
    } else {
      game.toast(outcome.toast);
    }
  }

  /** Which sidekicks are on duty today, and on which round. */
  function configureMinions(day) {
    const onDuty = [];
    const wanted = day.rules?.objectives;
    const spots = activityStations
      .filter((s) => !wanted || wanted.includes(s.id))
      .map((s) => ({ x: s.x, z: s.z }));

    minions.forEach((watcher) => watcher.setActive(false));
    (day.minions ?? []).forEach((def) => {
      const watcher = minions.get(def.id);
      if (!watcher) return;
      const route = routes[def.route] ?? routes.jefe ?? patrolRoute;
      watcher.setRoute(route);
      watcher.setPointsOfInterest(spots);
      watcher.setActive(true);
      onDuty.push(watcher);
    });
    return onDuty;
  }

  /**
   * Al arrancar una conversación, jugadora y NPC/jefe se giran de frente:
   * hablar mirando a un lado o de espaldas se veía raro. El movimiento está
   * en pausa mientras dura el diálogo (ver withPause), así que esto se
   * mantiene solo con fijarlo una vez — nada más lo vuelve a tocar hasta que
   * termine. `facingDir` (jefe/secuaces) se actualiza además del sprite: si
   * solo se gira el muñeco, el primer frame tras cerrar el diálogo el jefe
   * vuelve a llamar a sprite.setHeading() con su `facingDir` viejo y se ve un
   * salto instantáneo antes de que retome el giro suave hacia donde toque.
   */
  function faceEachOther(npc) {
    const dx = npc.position.x - player.position.x;
    const dz = npc.position.z - player.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.001) return;
    const toNpc = { x: dx / len, z: dz / len };
    const toPlayer = { x: -toNpc.x, z: -toNpc.z };
    player.sprite.setHeading(toNpc.x, toNpc.z);
    npc.sprite.setHeading(toPlayer.x, toPlayer.z);
    if (npc.facingDir) npc.facingDir = toPlayer;
  }

  /** A colleague you walked up to (or a sidekick who caught you) talking. */
  async function talkTo(npc, opts) {
    // Minions won't talk until the day's gate is cleared and Gabo has
    // introduced them.
    if (game && !game.metGabo && ["crispo", "chispita", "washo"].includes(npc.cast)) {
      return;
    }

    const encounter = dialogues.encounters[npc.cast];
    if (!encounter?.scenes?.length) return;
    const seen = save.getFlag(`talk:${npc.cast}`) ?? 0;
    save.setFlag(`talk:${npc.cast}`, seen + 1);

    // Conocer al guardián de la puerta del día (ver rules.gate en el JSON del
    // día) desbloquea las tareas y activa la vigilancia del jefe y sus
    // secuaces. Un día sin `gate` ya empieza desbloqueado (game.metGabo lo
    // arranca en true), así que esto no hace nada en esos días.
    if (game?.gate && !game.metGabo && npc.cast === game.gate.guard) {
      game.metGabo = true;
      game.toast?.("Actividades desbloqueadas");
    }

    faceEachOther(npc);
    const persona = dialogues.cast[npc.cast];
    // Las escenas escritas NO se reciclan en bucle: agotadas, el personaje
    // corta con una despedida en personaje (dialogues.exhausted, o una
    // genérica) — "me encanta el chisme, pero Gabo me encargó algo". Volver
    // a la primera escena hacía que la cuarta charla repitiera la primera
    // palabra por palabra, que rompe la ilusión más que cualquier bug.
    // Un interrogatorio (te atraparon) sí rota sus escenas para siempre: es
    // castigo, no charla, y quedarse mudo sería peor.
    let scene;
    if (seen < encounter.scenes.length || opts?.caught) {
      scene = encounter.scenes[seen % encounter.scenes.length];
    } else {
      const pool = encounter.exhausted ??
        dialogues.exhausted ?? [
          [{ text: "Me encanta el chisme, de verdad, pero Gabo me encargó una cosa y me está mirando. Luego hablamos." }],
          [{ text: "Ahora no puedo, tengo una entrega. Bueno, \"tengo una entrega\". Ya sabes cómo es esto." }],
          [{ text: "Shhh. Ahí viene alguien. Hazte {el ocupado|la ocupada} y luego seguimos." }],
        ];
      scene = pool[(seen - encounter.scenes.length) % pool.length].map((n) => ({
        speaker: persona?.name ?? npc.displayName,
        ...n,
      }));
    }
    await withPause(() =>
      dialogue.play(
        withSprites(scene.map((node) => ({ color: persona?.color, sheet: persona?.sheet, ...node }))),
        ctx
      )
    );
    if (opts?.caught) buzz([15, 30, 15]);
  }

  // Segundos que el jefe pasa sin observar justo después de amonestar, para
  // que la escena del regaño no se resuelva en "te vuelve a pillar en el
  // mismo segundo".
  const BOSS_GRACE_AFTER_WARN = 5;

  /** El jefe te aborda de verdad: diálogo de regaño y luego un respiro. */
  async function handleWarn({ warnings }) {
    if (warnings === game.rules.maxWarnings) return; // el outro de "despedida" ya cubre este caso
    const encounter = dialogues.encounters.jefe;
    if (!encounter?.scenes?.length) {
      boss.grantGrace(BOSS_GRACE_AFTER_WARN);
      return;
    }

    // Decide: formal warning or casual intimidation? More casual as warnings pile up.
    const softChance = warnings === 1 ? 0 : warnings === 2 ? 0.3 : 0.6;
    const useSoft = Math.random() < softChance && encounter.softWarnings?.length;

    const persona = dialogues.cast.jefe;
    let scene;

    if (useSoft) {
      // Casual intimidation line
      const idx = Math.floor(Math.random() * encounter.softWarnings.length);
      scene = encounter.softWarnings[idx];
    } else {
      // Formal amonestación scene. scenes[0] es la bienvenida — la que ya
      // vio en el primer encuentro voluntario (talkTo) al conocerlo — así
      // que una amonestación nunca la repite; rota por el resto.
      const warnScenes = encounter.scenes.length > 1 ? encounter.scenes.slice(1) : encounter.scenes;
      const seen = save.getFlag("talk:jefe_warn") ?? 0;
      save.setFlag("talk:jefe_warn", seen + 1);
      scene = warnScenes[seen % warnScenes.length];
    }

    faceEachOther(boss);
    await withPause(() =>
      dialogue.play(
        withSprites(scene.map((node) => ({ color: persona?.color, sheet: persona?.sheet, ...node }))),
        ctx
      )
    );
    boss.grantGrace(BOSS_GRACE_AFTER_WARN);
  }

  /**
   * Perder el minijuego del día. Todo lo que se ve aquí (el diálogo, el
   * icono, el título y el cuerpo de la tarjeta) sale del JSON del día, en
   * `minigame.onFail` — así un minijuego nuevo no necesita código nuevo.
   */
  async function minigameFailed(day, onFail = {}) {
    playStinger("defeat");
    hud.setDay(day);
    hud.setVisible(true);
    if (onFail.dialogue) await dialogue.play(withSprites(onFail.dialogue), ctx);
    hud.showResult({
      icon: onFail.icon ?? "door",
      title: onFail.title ?? "Te ascendieron a cliente",
      body: onFail.body ?? "No llegaste a empezar la jornada.",
      win: false,
      actions: [
        { label: "Reintentar", primary: true, onClick: () => startDay(dayIndex) },
        { label: "Menú", onClick: () => openTitle() },
      ],
    });
  }

  async function finishDay(day, result) {
    setInLevel(false);
    playStinger(result.win ? "victory" : "defeat");
    save.setHadWarningYesterday(result.warnings > 0);
    const spare = Math.max(0, Math.round(result.timeLeft));
    if (result.win) save.completeDay(day.id, { seconds: Math.round(result.elapsed), spare });
    else save.recordSpare(day.id, spare);

    await dialogue.play(withSprites((result.win ? day.outroWin : day.outroLose) ?? []), ctx);

    const isLast = dayIndex >= levels.length - 1;
    const done = result.objectives.filter((o) => o.done).length;
    const actions = [];

    if (result.win && !isLast) {
      actions.push({
        label: `Día ${levels[dayIndex + 1].number} →`,
        primary: true,
        onClick: () => startDay(dayIndex + 1),
      });
    }
    actions.push({
      label: result.win ? "Repetir" : "Reintentar",
      primary: !result.win,
      onClick: () => startDay(dayIndex),
    });
    actions.push({ label: "Menú", onClick: () => openTitle() });

    hud.showResult({
      icon: result.win ? (isLast ? "trophy" : "party") : "door",
      title: result.win
        ? day.winTitle ?? (isLast ? "Semana completada" : `${day.title}: superado`)
        : "Te ascendieron a cliente",
      timeLeft: result.timeLeft,
      timeGained: result.timeGained,
      body: result.win
        ? `${done}/${result.objectives.length} actividades · ${result.eggsFound} secretos hoy`
        : result.warnings >= (day.rules?.maxWarnings ?? 3)
        ? "Sin advertencias de sobra: te ascienden a cliente."
        : "Se acabó la jornada con objetivos pendientes.",
      win: result.win,
      actions,
    });
  }

  function update(dt) {
    game?.update(dt);
    // Reuse the frame state the HUD just rendered instead of rebuilding it.
    const live = game && !menus.isOpen ? game.lastSnapshot : null;
    guides.update(live);
    worldPrompt.update(dialogue.isOpen ? null : live);
    if (live && !dialogue.isOpen) {
      updateMoodFromSnapshot(live);
      updateGabo(dt, live);
      updateDynamicTheme(live);
    }
    // Update boss/minion visibility based on story progress
    if (game) {
      updateCharacterVisibility(game);
    }
  }

  // La luz del día ya no salta por tramos: se funde de forma continua entre
  // los temas de la jornada, como el fondo dinámico de un Mac. Ver
  // createThemeBlender en themes.js.
  let themeBlender = null;
  function updateDynamicTheme(live) {
    themeBlender ??= createThemeBlender({ renderer, scene, ...lights });
    themeBlender.update(live.timeLeft, live.levelDuration);
  }

  // Hide boss/minion vision cones until player meets them
  function updateCharacterVisibility(g) {
    boss.cone.visible = g.metGabo;
    g.minions.forEach((m) => {
      if (m.id === "crispo") {
        m.cone.visible = g.metGabo;
      } else {
        m.cone.visible = true;
      }
    });
  }

  /** Gabo's Teams messages: fire on a timer, independent of his position. */
  function updateGabo(dt, live) {
    if (live.gameOver || game.rules.explore) return;
    if (teamsTimer == null) teamsTimer = randomTeamsDelay();
    teamsTimer -= dt;
    if (teamsTimer > 0) return;
    teamsTimer = randomTeamsDelay();
    const pool = dialogues.teamsMessages?.gabo ?? [];
    if (!pool.length) return;
    let text = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) {
      while (text === lastTeamsMessage) text = pool[Math.floor(Math.random() * pool.length)];
    }
    lastTeamsMessage = text;
    hud.showTeamsMessage(text);
  }

  function randomTeamsDelay() {
    const [min, max] = GABO_TEAMS_INTERVAL;
    return min + Math.random() * (max - min);
  }

  return {
    hud,
    dialogue,
    menus,
    guides,
    save,
    start: () => openTitle(),
    startDay,
    openPause,
    update,
    get game() {
      return game;
    },
    get isPaused() {
      return menus.isOpen || !!game?.paused;
    },
    get inLevel() {
      return inLevel;
    },
    get crossingActive() {
      return crossingActive;
    },
    get currentCharacterId() {
      return save.characterId;
    },
    dispose() {
      window.removeEventListener("keydown", onKey);
      dialogue.dispose();
    },
  };
}
