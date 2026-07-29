import {
  activityStations,
  distractions,
  hidingSpots,
  locationEggs,
  nearestArea,
  areaAt,
} from "../scene/floorplan.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { BOSS_STATES } from "../entities/boss.js";
import { buzz } from "./settings.js";

const SUSPICION_MAX = 100;
const DECAY_HIDDEN_OR_PRETENDING = 45;
const DECAY_IDLE = 12;
const SEEN_WHILE_HUNTED_RATE = 16;
const INTERACT_RADIUS = 1.5 * S;
const DISTRACTION_EFFECT_DURATION = 7;

// Scoring. The fun is in *how* you slack off, not just whether you finish, so
// the score rewards nerve: doing a forbidden thing with the boss breathing
// down your neck is worth several times doing it in an empty wing, and
// chaining activities without a warning stacks a multiplier.
const COMBO_WINDOW = 22; // seconds to chain the next activity
const COMBO_STEP = 0.5; // +0.5x per link
const COMBO_MAX = 4;
const NERVE_NEAR = 11 * S; // boss this close = "nerve" bonus
const NERVE_BONUS = 0.8;
const SEEN_NERVE_BONUS = 1.4; // ...and in his cone, which is madness
const PERK_DURATION = 15;

const DEFAULT_RULES = {
  duration: 240,
  maxWarnings: 3,
  objectives: null, // null = every forbidden activity
  decayMul: 1,
  distractionsOff: false,
  targetScore: 1000,
};

/**
 * One workday. Owns the suspicion meter, the forbidden activities, scoring,
 * hiding/pretending, distractions and the win/lose conditions. Everything
 * else (rendering, input capture, boss movement, story) lives elsewhere and
 * is only read/poked from here.
 *
 * All the knobs a day can change live in `rules`, which come straight from
 * the level's JSON — so the campaign escalates without touching this file.
 */
export class Game {
  constructor({ player, boss, npcs, hud, rules = {}, onFinish = null, onEgg = null, onPopup = null }) {
    this.player = player;
    this.boss = boss;
    this.npcs = npcs;
    this.hud = hud;
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.onFinish = onFinish;
    this.onEgg = onEgg;
    this.onPopup = onPopup;

    this.suspicion = 0;
    this.warnings = 0;
    this.timeLeft = this.rules.duration;
    this.gameOver = false;
    this.win = false;
    this.paused = false;
    this._finished = false;

    this.score = 0;
    this.combo = 1;
    this.comboLeft = 0;
    this.perk = null;
    this.perkLeft = 0;

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

  /** Story beats and menus freeze the world without tearing the level down. */
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

    if (this.comboLeft > 0) {
      this.comboLeft = Math.max(0, this.comboLeft - dt);
      if (this.comboLeft === 0) this.combo = 1;
    }
    if (this.perkLeft > 0) {
      this.perkLeft = Math.max(0, this.perkLeft - dt);
      if (this.perkLeft === 0) this._clearPerk();
    }

    const pos = this.player.position;
    this.currentArea = areaAt(pos.x, pos.z) ?? nearestArea(pos.x, pos.z).area;

    this.player.isHiding = hidingSpots.some((h) => Math.hypot(h.x - pos.x, h.z - pos.z) < h.r);

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
        this._completeActivity(this.nearStation);
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
        this._award(40, "Distracción", this.player.position);
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

  // ---------------------------------------------------------------- scoring
  _completeActivity(station) {
    const distToBoss = Math.hypot(
      this.boss.position.x - this.player.position.x,
      this.boss.position.z - this.player.position.z
    );

    let nerve = 0;
    let nerveLabel = "";
    if (this.boss.playerVisible) {
      nerve = SEEN_NERVE_BONUS;
      nerveLabel = " · ¡EN SUS NARICES!";
    } else if (distToBoss < NERVE_NEAR) {
      nerve = NERVE_BONUS;
      nerveLabel = " · con el jefe cerca";
    }

    const base = station.points ?? 120;
    const gained = Math.round(base * (this.combo + nerve));
    this.score += gained;

    this.combo = Math.min(COMBO_MAX, this.combo + COMBO_STEP);
    this.comboLeft = COMBO_WINDOW;

    if (station.perk) this._applyPerk(station.perk);

    buzz([12, 40, 18]);
    this._toast(`${station.label} ✔${nerveLabel}`);
    this.onPopup?.({
      text: `+${gained}`,
      sub: this.combo > 1 ? `x${this.combo.toFixed(1)}` : "",
      x: station.x,
      z: station.z,
      kind: nerve ? "nerve" : "score",
    });
  }

  _award(points, label, at) {
    const gained = Math.round(points * this.combo);
    this.score += gained;
    this.onPopup?.({ text: `+${gained}`, sub: label, x: at.x, z: at.z, kind: "minor" });
  }

  _applyPerk(perk) {
    this._clearPerk();
    this.perk = perk;
    this.perkLeft = PERK_DURATION;
    if (perk === "caffeine") {
      this.player.speedMul = 1.35;
      this._toast("☕ Cafeína: +35% de velocidad");
    }
  }

  _clearPerk() {
    if (this.perk === "caffeine") this.player.speedMul = 1;
    this.perk = null;
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
        this.score += 250;
        this.onEgg(egg);
      }
    }
  }

  _warn() {
    this.warnings += 1;
    this.suspicion = 0;
    this._caughtCooldown = 3;
    this.combo = 1;
    this.comboLeft = 0;
    this.boss.resetToPatrol();
    buzz([40, 60, 40]);

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
    this._clearPerk();

    // Finishing early is worth something: the clock you didn't need is a
    // bonus, so speed and nerve both pay off.
    if (win) this.score += Math.round(this.timeLeft * 4);

    this.onFinish?.({
      win,
      score: this.score,
      targetScore: this.rules.targetScore,
      warnings: this.warnings,
      timeLeft: this.timeLeft,
      elapsed: this.rules.duration - this.timeLeft,
      objectives: this.objectives,
      eggsFound: this._foundEggs.size,
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
      score: this.score,
      combo: this.combo,
      comboLeft: this.comboLeft,
      comboWindow: COMBO_WINDOW,
      perk: this.perk,
      perkLeft: this.perkLeft,
      perkDuration: PERK_DURATION,
      targetScore: this.rules.targetScore,
    };
  }
}
