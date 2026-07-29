import { Game } from "./game.js";
import { createHud } from "./hud.js";
import { createDialogue } from "./dialogue.js";
import { createSave } from "./save.js";
import { applyTheme } from "./themes.js";
import { days } from "../content/days.js";
import { codeEggs, allEggIds } from "../content/easterEggs.js";
import { spawn, patrolRoute } from "../scene/floorplan.js";

/**
 * Campaign engine. Owns the day loop — story beat, play the level, story
 * beat, advance — and everything that has to survive across days (progress,
 * easter eggs, theme). The render loop lives in main.js and only calls
 * `update`; nothing here touches Three.js beyond re-tinting the lights.
 */
export function createEngine({ app, lights, renderer, scene, player, boss, npcs, camera }) {
  const hud = createHud(app);
  const dialogue = createDialogue(app);
  const save = createSave();

  let dayIndex = Math.min(save.dayIndex, days.length - 1);
  let game = null;
  let bossSpeedBonus = 1;

  const ctx = {
    setFlag: (name, value) => save.setFlag(name, value),
    getFlag: (name) => save.getFlag(name),
    grantSlowMotionBoss: () => {
      // Konami reward: the boss walks like it is 4:55pm for the rest of the day.
      bossSpeedBonus = 0.78;
      applyBossTuning();
    },
  };

  function applyBossTuning() {
    const rules = days[dayIndex].rules ?? {};
    const mul = (rules.bossSpeedMul ?? 1) * bossSpeedBonus;
    boss.speed = 2.4 * baseScale * mul;
    boss.investigateSpeed = 3.2 * baseScale * mul;
    boss.chaseSpeed = 4.9 * baseScale * mul;
    boss.searchSpeed = 3.0 * baseScale * mul;
    boss.visionRange = baseVision * (rules.visionMul ?? 1);
  }

  // Captured before any day tweaks them, so multipliers always compose from
  // the same baseline instead of stacking day after day.
  const baseScale = boss.speed / 2.4;
  const baseVision = boss.visionRange;

  // ---------- Easter eggs ----------
  const codeBuffer = [];
  const onEggKey = (e) => {
    const key = e.key.toLowerCase();
    codeBuffer.push(key);
    if (codeBuffer.length > 12) codeBuffer.shift();
    for (const egg of codeEggs) {
      if (save.hasEgg(egg.id)) continue;
      const tail = codeBuffer.slice(-egg.keys.length).join(",");
      if (tail === egg.keys.join(",")) {
        codeBuffer.length = 0;
        triggerEgg(egg);
      }
    }
  };
  window.addEventListener("keydown", onEggKey);

  async function triggerEgg(egg) {
    if (!save.findEgg(egg.id)) return;
    egg.effect?.(ctx);
    await withPause(() =>
      dialogue.play(
        [
          ...egg.scene,
          {
            speaker: "Easter egg",
            portrait: "🥚",
            text: `Encontrados ${save.state.eggs.length} de ${allEggIds.length}.`,
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
      game?.setPaused(false);
    }
  }

  // ---------- Day lifecycle ----------
  function resetEntities() {
    player.position.x = spawn.x;
    player.position.z = spawn.z;
    player.keys.clear();
    player.touchAxis.x = 0;
    player.touchAxis.z = 0;
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
    dayIndex = Math.min(Math.max(index, 0), days.length - 1);
    save.setDayIndex(dayIndex);
    const day = days[dayIndex];

    bossSpeedBonus = 1;
    applyTheme(day.theme, { renderer, scene, ...lights });
    hud.setDay(day);
    hud.hideResult();
    resetEntities();
    applyBossTuning();

    game = new Game({
      player,
      boss,
      npcs,
      hud,
      rules: day.rules,
      onFinish: (result) => finishDay(day, result),
      onEgg: (egg) => triggerEgg(egg),
    });
    game.setPaused(true);

    camera.setFraming(camera.camera.aspect >= 1.15 ? 0.35 : 0.8);
    await dialogue.play(day.intro ?? [], ctx);
    game.setPaused(false);
  }

  async function finishDay(day, result) {
    if (result.win) save.completeDay(day.id, Math.round(result.elapsed));

    await dialogue.play((result.win ? day.outroWin : day.outroLose) ?? [], ctx);

    const isLast = dayIndex >= days.length - 1;
    const done = result.objectives.filter((o) => o.done).length;
    const actions = [];

    if (result.win && !isLast) {
      actions.push({
        label: `Ir al día ${days[dayIndex + 1].number}`,
        primary: true,
        onClick: () => startDay(dayIndex + 1),
      });
    }
    actions.push({
      label: result.win ? "Repetir día" : "Reintentar",
      primary: !result.win,
      onClick: () => startDay(dayIndex),
    });
    if (dayIndex > 0) {
      actions.push({ label: "Día anterior", onClick: () => startDay(dayIndex - 1) });
    }

    hud.showResult({
      icon: result.win ? (isLast ? "🏆" : "🎉") : "🚪",
      title: result.win
        ? isLast
          ? "Semana completada"
          : `${day.title}: superado`
        : "Despedida",
      body: result.win
        ? `${done}/${result.objectives.length} actividades de ocio completadas. Eggs: ${save.state.eggs.length}/${allEggIds.length}.`
        : result.warnings >= (day.rules?.maxWarnings ?? 3)
        ? "Te quedaste sin advertencias."
        : "Se acabó la jornada con objetivos pendientes.",
      win: result.win,
      actions,
    });
  }

  function update(dt) {
    game?.update(dt);
  }

  return {
    hud,
    dialogue,
    save,
    start: () => startDay(dayIndex),
    startDay,
    update,
    get game() {
      return game;
    },
    get isPaused() {
      return !!game?.paused;
    },
    dispose() {
      window.removeEventListener("keydown", onEggKey);
      dialogue.dispose();
    },
  };
}
