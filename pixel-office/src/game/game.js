import {
  activityStations,
  distractions,
  hidingSpots,
  nearestArea,
  areaAt,
} from "../scene/floorplan.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { BOSS_STATES } from "../entities/boss.js";
import { locationEggs } from "../content/easterEggs.js";

const SUSPICION_MAX = 100;
const DECAY_HIDDEN_OR_PRETENDING = 45;
const DECAY_IDLE = 12;
const SEEN_WHILE_HUNTED_RATE = 16;
const INTERACT_RADIUS = 1.5 * S;
const DISTRACTION_EFFECT_DURATION = 7;

const DEFAULT_RULES = {
  duration: 240,
  maxWarnings: 3,
  objectives: null, // null = every forbidden activity
  decayMul: 1,
  distractionsOff: false,
};

/**
 * One workday. Owns the suspicion meter, the forbidden activities,
 * hiding/pretending, distractions and the win/lose conditions. Everything
 * else (rendering, input capture, boss movement, story) lives elsewhere and
 * is only read/poked from here.
 *
 * All the knobs a day can change live in `rules`, so the campaign in
 * src/content/days.js can escalate difficulty without touching this file.
 */
export class Game {
  constructor({ player, boss, npcs, hud, rules = {}, onFinish = null, onEgg = null }) {
    this.player = player;
    this.boss = boss;
    this.npcs = npcs;
    this.hud = hud;
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.onFinish = onFinish;
    this.onEgg = onEgg;

    this.suspicion = 0;
    this.warnings = 0;
    this.timeLeft = this.rules.duration;
    this.gameOver = false;
    this.win = false;
    this.paused = false;
    this._finished = false;

    const wanted = this.rules.objectives;
    this.objectives = activityStations
      .filter((s) => !wanted || wanted.includes(s.id))
      .map((s) => ({ ...s, progress: 0, done: false }));

    this.distractionState = this.rules.distractionsOff
      ? []
      : distractions.map((d) => ({ ...d, cooldownLeft: 0 }));

    this.nearStation = null;
    this.nearDistraction = null;
    this.message = null;
    this.currentArea = null;

    this._prevInteractKey = false;
    this._caughtCooldown = 0;
    this._eggDwell = new Map();
    this._foundEggs = new Set();
  }

  /** Story beats freeze the world without tearing the level down. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) {
      // Drop held keys so the player doesn't resume mid-interaction.
      this.player.keys.clear();
      this.player.touchAxis.x = 0;
      this.player.touchAxis.z = 0;
    }
  }

  update(dt) {
    if (this.gameOver || this.paused) {
      this.hud.render(this._snapshot());
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this._caughtCooldown > 0) this._caughtCooldown -= dt;

    const pos = this.player.position;
    this.currentArea = areaAt(pos.x, pos.z) ?? nearestArea(pos.x, pos.z).area;

    this.player.isHiding = hidingSpots.some(
      (h) => Math.hypot(h.x - pos.x, h.z - pos.z) < h.r
    );

    const holdingE = this.player.keys.has("e");
    const holdingF = this.player.keys.has("f");
    this.player.isPretending = holdingF;

    this.nearStation =
      this.objectives.find(
        (s) => !s.done && Math.hypot(s.x - pos.x, s.z - pos.z) < INTERACT_RADIUS
      ) ?? null;

    if (this.nearStation && holdingE && !holdingF) {
      this.player.isDoingActivity = true;
      this.nearStation.progress = Math.min(this.nearStation.time, this.nearStation.progress + dt);
      if (this.nearStation.progress >= this.nearStation.time && !this.nearStation.done) {
        this.nearStation.done = true;
        this._toast(`Completado: ${this.nearStation.label}`);
      }
    } else {
      this.player.isDoingActivity = false;
    }

    this.distractionState.forEach((d) => {
      if (d.cooldownLeft > 0) d.cooldownLeft = Math.max(0, d.cooldownLeft - dt);
    });
    this.nearDistraction =
      this.distractionState.find(
        (d) => d.cooldownLeft <= 0 && Math.hypot(d.x - pos.x, d.z - pos.z) < INTERACT_RADIUS
      ) ?? null;

    if (holdingE && !this._prevInteractKey && this.nearDistraction && !this.nearStation) {
      const target = { x: this.nearDistraction.x, z: this.nearDistraction.z };
      if (this.boss.distract(target, DISTRACTION_EFFECT_DURATION)) {
        this.nearDistraction.cooldownLeft = this.nearDistraction.cooldown;
        this._toast(`Distracción: ${this.nearDistraction.label}`);
      } else {
        this._toast("¡Ya te vio! Una distracción no lo detiene ahora.");
      }
    }
    this._prevInteractKey = holdingE;

    this.boss.update(dt, this.player, this.npcs);
    this._updateEggs(dt);

    // ---- Suspicion ----
    const decay = this.rules.decayMul;
    if (this.boss.redAlert) {
      const rate = this.nearStation?.riskRate ?? 20;
      this.suspicion = Math.min(SUSPICION_MAX, this.suspicion + rate * dt);
    } else if (this.boss.state === BOSS_STATES.CHASE && this.boss.playerVisible) {
      this.suspicion = Math.min(SUSPICION_MAX, this.suspicion + SEEN_WHILE_HUNTED_RATE * dt);
    } else if (this.player.isHiding || this.player.isPretending) {
      this.suspicion = Math.max(0, this.suspicion - DECAY_HIDDEN_OR_PRETENDING * decay * dt);
    } else {
      this.suspicion = Math.max(0, this.suspicion - DECAY_IDLE * decay * dt);
    }

    const caught =
      this._caughtCooldown <= 0 &&
      this.boss.isHunting &&
      !this.player.isHiding &&
      this.boss.catches(pos, this.player.radius);

    if (this.suspicion >= SUSPICION_MAX || caught) this._warn();

    if (!this.gameOver) {
      if (this.objectives.every((o) => o.done)) this._finish(true);
      else if (this.timeLeft <= 0) this._finish(false);
    }

    if (this.message) {
      this.message.timer -= dt;
      if (this.message.timer <= 0) this.message = null;
    }

    this.hud.render(this._snapshot());
  }

  /** Standing still in the right spot for a beat reveals a hidden note. */
  _updateEggs(dt) {
    if (!this.onEgg) return;
    const pos = this.player.position;
    for (const egg of locationEggs) {
      if (this._foundEggs.has(egg.id)) continue;
      const inside = Math.hypot(egg.x - pos.x, egg.z - pos.z) < egg.radius;
      const dwell = (this._eggDwell.get(egg.id) ?? 0) + (inside ? dt : -dt * 2);
      this._eggDwell.set(egg.id, Math.max(0, dwell));
      if (dwell >= egg.dwell) {
        this._foundEggs.add(egg.id);
        this.onEgg(egg);
      }
    }
  }

  _warn() {
    this.warnings += 1;
    this.suspicion = 0;
    this._caughtCooldown = 3;
    this.boss.resetToPatrol();

    if (this.warnings >= this.rules.maxWarnings) {
      this._toast("Última advertencia: despedida.");
      this._finish(false);
    } else {
      this._toast(`Advertencia ${this.warnings}/${this.rules.maxWarnings}`);
    }
  }

  _finish(win) {
    if (this._finished) return;
    this._finished = true;
    this.gameOver = true;
    this.win = win;
    this.onFinish?.({
      win,
      warnings: this.warnings,
      timeLeft: this.timeLeft,
      elapsed: this.rules.duration - this.timeLeft,
      objectives: this.objectives,
    });
  }

  _toast(text) {
    this.message = { text, timer: 2.6 };
  }

  _snapshot() {
    return {
      suspicion: this.suspicion,
      suspicionMax: SUSPICION_MAX,
      warnings: this.warnings,
      maxWarnings: this.rules.maxWarnings,
      timeLeft: this.timeLeft,
      levelDuration: this.rules.duration,
      objectives: this.objectives,
      nearStation: this.nearStation,
      nearDistraction: this.nearDistraction,
      isPretending: this.player.isPretending,
      isHiding: this.player.isHiding,
      redAlert: this.boss.redAlert,
      bossState: this.boss.state,
      gameOver: this.gameOver,
      win: this.win,
      message: this.message,
      area: this.currentArea,
    };
  }
}
