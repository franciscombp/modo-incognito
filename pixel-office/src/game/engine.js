import { Game } from "./game.js";
import { createHud } from "./hud.js";
import { buzz } from "./settings.js";
import { setMood, playStinger, updateMoodFromSnapshot } from "./soundtrack.js";
import { createDialogue } from "./dialogue.js";
import { createSave } from "./save.js";
import { applyTheme } from "./themes.js";
import { createMenus, rankFor } from "../ui/menus.js";
import { createGuides } from "../ui/guides.js";
import { createWorldPrompt } from "../ui/worldPrompt.js";
import { createLobby } from "../ui/lobby.js";
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
}) {
  const hud = createHud(app);
  const guides = createGuides(app, camera.camera);
  const worldPrompt = createWorldPrompt(app, camera.camera, {
    isTouch: matchMedia("(pointer: coarse)").matches,
  });
  const dialogue = createDialogue(app, { looks });
  const lobby = createLobby(app);
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
  let teamsTimer = null;
  let lastTeamsMessage = null;

  const ctx = {
    setFlag: (name, value) => save.setFlag(name, value),
    getFlag: (name) => save.getFlag(name),
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
    inLevel = false;
    menuPaused = false;
    game?.setPaused(true);
    hud.setVisible(false);
    hud.hideResult();
    setMood("main");
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
    await withPause(() =>
      dialogue.play(
        withSprites([
          ...(egg.scene ?? []),
          {
            speaker: "Secreto encontrado",
            portrait: "🥚",
            text: `Llevas ${save.state.eggs.length} de ${eggIds.length}. +250 puntos.`,
          },
        ]),
        ctx
      )
    );
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
        // ascensor vacío.
        nodes.unshift({
          speaker: "Recepción",
          sheet: "reception",
          text: "El ascensor viene lleno otra vez. Después de lo de ayer, ya ni te guardan hueco.",
        });
      }
      if (day.prologue.choice) nodes.push(day.prologue.choice);
      await dialogue.play(withSprites(nodes), ctx);
      applyPrologue(day);
      await lobby.hide();
    }

    // Ahora sí: configurar el piso y crear el Game.
    inLevel = true;
    bossSpeedBonus = 1;
    applyTheme(day.theme, { renderer, scene, ...lights });
    hud.setDay(day);
    hud.setVisible(true);
    hud.hideResult();
    setMood("calm");
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
      config: bossConfig,
      rules: mergedRules(day),
      onFinish: (result) => finishDay(day, result),
      onEgg: (egg) => triggerEgg(egg),
      onPopup,
      onTalk: (npc, opts) => talkTo(npc, opts),
      onWarn: (info) => handleWarn(info),
    });
    game.setPaused(true);

    camera.setFraming(1);

    await introduceMinions(onDuty);
    await dialogue.play(withSprites(day.intro ?? []), ctx);
    if (!menuPaused) game.setPaused(false);
  }

  /**
   * Un breve zoom de cámara a cada secuaz de turno, con su nombre y su forma
   * de vigilar, antes de que empiece el día — así se presentan como
   * amenazas propias en vez de aparecer de la nada en mitad de la partida.
   */
  async function introduceMinions(onDuty) {
    if (!onDuty.length) return;
    camera.setFraming(0.55);
    for (const m of onDuty) {
      camera.setFocus(m.position);
      hud.showIntroCard({ icon: m.name ? "👁️" : "❓", name: m.name, blurb: dialogues.cast[m.cast]?.blurb });
      await wait(1250);
    }
    hud.hideIntroCard();
    camera.setFocus(null);
    camera.setFraming(1);
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

  /** A colleague you walked up to (or a sidekick who caught you) talking. */
  async function talkTo(npc, opts) {
    const encounter = dialogues.encounters[npc.cast];
    if (!encounter?.scenes?.length) return;
    const seen = save.getFlag(`talk:${npc.cast}`) ?? 0;
    save.setFlag(`talk:${npc.cast}`, seen + 1);
    const scene = encounter.scenes[seen % encounter.scenes.length];
    const persona = dialogues.cast[npc.cast];
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
  async function handleWarn({ final }) {
    if (final) return; // el outro de "despedida" ya cubre este caso
    const encounter = dialogues.encounters.jefe;
    if (encounter?.scenes?.length) {
      const seen = save.getFlag("talk:jefe_warn") ?? 0;
      save.setFlag("talk:jefe_warn", seen + 1);
      const scene = encounter.scenes[seen % encounter.scenes.length];
      const persona = dialogues.cast.jefe;
      await withPause(() =>
        dialogue.play(
          withSprites(scene.map((node) => ({ color: persona?.color, sheet: persona?.sheet, ...node }))),
          ctx
        )
      );
    }
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
      icon: onFail.icon ?? "🚪",
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
    inLevel = false;
    playStinger(result.win ? "victory" : "defeat");
    save.setHadWarningYesterday(result.warnings > 0);
    const target = result.targetScore ?? 1000;
    const rank = rankFor(result.score, target);
    if (result.win) save.completeDay(day.id, { seconds: Math.round(result.elapsed), score: result.score });
    else save.recordScore(day.id, result.score);

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
      icon: result.win ? (isLast ? "🏆" : "🎉") : "🚪",
      // `winTitle` deja que el día ponga su propio titular: con la campaña
      // recortada al día 1 (ver manifest.json), "Semana completada" mentía.
      title: result.win
        ? day.winTitle ?? (isLast ? "Semana completada" : `${day.title}: superado`)
        : "Te ascendieron a cliente",
      rank: result.win ? rank : null,
      score: result.score,
      target,
      body: result.win
        ? `${done}/${result.objectives.length} actividades · ${result.eggsFound} secretos hoy · objetivo ${target} pts`
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
    }
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
