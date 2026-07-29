import { Game } from "./game.js";
import { createHud } from "./hud.js";
import { createDialogue } from "./dialogue.js";
import { createSave } from "./save.js";
import { applyTheme } from "./themes.js";
import { createMenus, rankFor } from "../ui/menus.js";
import { createGuides } from "../ui/guides.js";
import { createWorldPrompt } from "../ui/worldPrompt.js";
import {
  spawn,
  patrolRoute,
  routes,
  locationEggs,
  activityStations,
} from "../scene/floorplan.js";

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
  minions = new Map(),
  onPopup = null,
}) {
  const hud = createHud(app);
  const guides = createGuides(app, camera.camera);
  const worldPrompt = createWorldPrompt(app, camera.camera, {
    isTouch: matchMedia("(pointer: coarse)").matches,
  });
  const dialogue = createDialogue(app);
  const save = createSave();

  const eggIds = [...locationEggs.map((e) => e.id), ...codeEggs.map((e) => e.id)];

  let dayIndex = Math.min(save.dayIndex, levels.length - 1);
  let game = null;
  let bossSpeedBonus = 1;
  let menuPaused = false;
  let inLevel = false;

  const ctx = {
    setFlag: (name, value) => save.setFlag(name, value),
    getFlag: (name) => save.getFlag(name),
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
    game?._toast(`${watcher.name} te delató`);
  }
  minions.forEach((watcher) => {
    watcher.onSpot = onMinionSpot;
  });

  function applyBossTuning() {
    const rules = levels[dayIndex].rules ?? {};
    const mul = (rules.bossSpeedMul ?? 1) * bossSpeedBonus;
    boss.speed = boss.baseSpeeds.patrol * mul;
    boss.investigateSpeed = boss.baseSpeeds.investigate * mul;
    boss.chaseSpeed = boss.baseSpeeds.chase * mul;
    boss.searchSpeed = boss.baseSpeeds.search * mul;
    boss.visionRange = boss.baseVisionRange * (rules.visionMul ?? 1);
    // El nivel de búsqueda (game.js) multiplica desde esta base, no desde el
    // valor absoluto — así el ajuste por sospecha se suma al del día, no lo
    // reemplaza.
    boss.dayTuning = { vision: boss.baseVisionRange * (rules.visionMul ?? 1), speedMul: mul };

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
    title: manifest.title ?? "Modo Incógnito",
    subtitle: manifest.subtitle ?? "",
    actions: {
      play: (index) => startDay(index),
      resume: () => resumeFromMenu(),
      restart: () => startDay(dayIndex),
      toTitle: () => openTitle(),
    },
  });

  function openTitle() {
    inLevel = false;
    menuPaused = false;
    game?.setPaused(true);
    hud.setVisible(false);
    hud.hideResult();
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
      if (menus.isOpen && menus.screen === "pause") resumeFromMenu();
      else if (!menus.isOpen) openPause();
      return;
    }
    if (menus.isOpen) return;

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
        [
          ...(egg.scene ?? []),
          {
            speaker: "Secreto encontrado",
            portrait: "🥚",
            text: `Llevas ${save.state.eggs.length} de ${eggIds.length}. +250 puntos.`,
          },
        ],
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
    // doesn't open with the boss standing on top of the player.
    let far = 0;
    let farD = -Infinity;
    patrolRoute.forEach((p, i) => {
      const d = Math.hypot(p.x - spawn.x, p.z - spawn.z);
      if (d > farD) {
        farD = d;
        far = i;
      }
    });
    boss.position.x = patrolRoute[far].x;
    boss.position.z = patrolRoute[far].z;
    boss.routeIndex = far;
    boss.resetToPatrol();
  }

  async function startDay(index) {
    dayIndex = Math.min(Math.max(index, 0), levels.length - 1);
    save.setDayIndex(dayIndex);
    const day = levels[dayIndex];

    menus.close();
    menuPaused = false;
    inLevel = true;
    bossSpeedBonus = 1;
    applyTheme(day.theme, { renderer, scene, ...lights });
    hud.setDay(day);
    hud.setVisible(true);
    hud.hideResult();
    resetEntities();
    applyBossTuning();

    const onDuty = configureMinions(day);

    game = new Game({
      player,
      boss,
      npcs,
      minions: onDuty,
      hud,
      rules: day.rules,
      onFinish: (result) => finishDay(day, result),
      onEgg: (egg) => triggerEgg(egg),
      onPopup,
      onTalk: (npc) => talkTo(npc),
    });
    game.setPaused(true);

    camera.setFraming(camera.camera.aspect >= 1.15 ? 0.35 : 0.8);

    // The lift queue first, then the day proper.
    prologueChoice = null;
    if (day.prologue) {
      const nodes = [...(day.prologue.intro ?? [])];
      if (day.prologue.choice) nodes.push(day.prologue.choice);
      await dialogue.play(nodes, ctx);
      applyPrologue(day);
    }

    await dialogue.play(day.intro ?? [], ctx);
    if (!menuPaused) game.setPaused(false);
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
      game._toast("Te vieron colarte: advertencia 1");
    } else {
      game._toast(outcome.toast);
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

  /** A colleague you walked up to and pressed USAR on. */
  async function talkTo(npc) {
    const encounter = dialogues.encounters[npc.cast];
    if (!encounter?.scenes?.length) return;
    const seen = save.getFlag(`talk:${npc.cast}`) ?? 0;
    save.setFlag(`talk:${npc.cast}`, seen + 1);
    const scene = encounter.scenes[seen % encounter.scenes.length];
    const persona = dialogues.cast[npc.cast];
    await withPause(() =>
      dialogue.play(
        scene.map((node) => ({ color: persona?.color, ...node })),
        ctx
      )
    );
  }

  async function finishDay(day, result) {
    inLevel = false;
    const target = result.targetScore ?? 1000;
    const rank = rankFor(result.score, target);
    if (result.win) save.completeDay(day.id, { seconds: Math.round(result.elapsed), score: result.score });
    else save.recordScore(day.id, result.score);

    await dialogue.play((result.win ? day.outroWin : day.outroLose) ?? [], ctx);

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
      title: result.win ? (isLast ? "Semana completada" : `${day.title}: superado`) : "Despedida",
      rank: result.win ? rank : null,
      score: result.score,
      target,
      body: result.win
        ? `${done}/${result.objectives.length} actividades · ${result.eggsFound} secretos hoy · objetivo ${target} pts`
        : result.warnings >= (day.rules?.maxWarnings ?? 3)
        ? "Te quedaste sin advertencias."
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
    dispose() {
      window.removeEventListener("keydown", onKey);
      dialogue.dispose();
    },
  };
}
