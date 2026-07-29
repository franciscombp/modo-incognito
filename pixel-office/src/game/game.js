import { activityStations, distractions, hidingSpots } from "../scene/floorplan.js";
import { BOSS_STATES } from "../entities/boss.js";

const LEVEL_DURATION = 240;
const MAX_WARNINGS = 3;
const SUSPICION_MAX = 100;
const DECAY_HIDDEN_OR_PRETENDING = 45;
const DECAY_IDLE = 12;
const SEEN_WHILE_HUNTED_RATE = 16;
const INTERACT_RADIUS = 1.4;
const DISTRACTION_EFFECT_DURATION = 7;

// Owns the core loop from section 5/6 of the design doc: suspicion meter,
// the five forbidden activities (objectives), hiding/pretending, distractions,
// and the win/lose conditions. Everything else (rendering, input capture,
// boss movement) lives in its own module and just gets read/poked here.
export class Game {
  constructor({ player, boss, npcs, hud }) {
    this.player = player;
    this.boss = boss;
    this.npcs = npcs;
    this.hud = hud;

    this.suspicion = 0;
    this.warnings = 0;
    this.timeLeft = LEVEL_DURATION;
    this.gameOver = false;
    this.win = false;

    this.objectives = activityStations.map((s) => ({ ...s, progress: 0, done: false }));
    this.distractionState = distractions.map((d) => ({ ...d, cooldownLeft: 0 }));

    this.nearStation = null;
    this.nearDistraction = null;
    this.message = null;

    this._prevInteractKey = false;
    this._caughtCooldown = 0;
  }

  update(dt) {
    if (this.gameOver) {
      this.hud.render(this._snapshot());
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this._caughtCooldown > 0) this._caughtCooldown -= dt;

    this.player.isHiding = hidingSpots.some(
      (h) => Math.hypot(h.x - this.player.position.x, h.z - this.player.position.z) < h.r
    );

    const holdingE = this.player.keys.has("e");
    const holdingF = this.player.keys.has("f");
    this.player.isPretending = holdingF;

    this.nearStation =
      this.objectives.find(
        (s) =>
          !s.done &&
          Math.hypot(s.x - this.player.position.x, s.z - this.player.position.z) < INTERACT_RADIUS
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
        (d) =>
          d.cooldownLeft <= 0 &&
          Math.hypot(d.x - this.player.position.x, d.z - this.player.position.z) < INTERACT_RADIUS
      ) ?? null;

    if (holdingE && !this._prevInteractKey && this.nearDistraction && !this.nearStation) {
      if (this.boss.distract({ x: this.nearDistraction.x, z: this.nearDistraction.z }, DISTRACTION_EFFECT_DURATION)) {
        this.nearDistraction.cooldownLeft = this.nearDistraction.cooldown;
        this._toast(`Distracción: ${this.nearDistraction.label}`);
      } else {
        this._toast("¡Ya te vio! Una distracción no lo detiene ahora.");
      }
    }
    this._prevInteractKey = holdingE;

    this.boss.update(dt, this.player, this.npcs);

    // ---- Suspicion ----
    if (this.boss.redAlert) {
      const rate = this.nearStation?.riskRate ?? 20;
      this.suspicion = Math.min(SUSPICION_MAX, this.suspicion + rate * dt);
    } else if (this.boss.state === BOSS_STATES.CHASE && this.boss.playerVisible) {
      // Being actively hunted keeps the pressure on even between activities.
      this.suspicion = Math.min(SUSPICION_MAX, this.suspicion + SEEN_WHILE_HUNTED_RATE * dt);
    } else if (this.player.isHiding || this.player.isPretending) {
      this.suspicion = Math.max(0, this.suspicion - DECAY_HIDDEN_OR_PRETENDING * dt);
    } else {
      this.suspicion = Math.max(0, this.suspicion - DECAY_IDLE * dt);
    }

    // ---- Getting caught ----
    const caught =
      this._caughtCooldown <= 0 &&
      this.boss.isHunting &&
      !this.player.isHiding &&
      this.boss.catches(this.player.position, this.player.radius);

    if (this.suspicion >= SUSPICION_MAX || caught) {
      this._warn();
    }

    if (!this.gameOver) {
      if (this.objectives.every((o) => o.done)) {
        this.gameOver = true;
        this.win = true;
      } else if (this.timeLeft <= 0) {
        this.gameOver = true;
        this.win = false;
      }
    }

    if (this.message) {
      this.message.timer -= dt;
      if (this.message.timer <= 0) this.message = null;
    }

    this.hud.render(this._snapshot());
  }

  _warn() {
    this.warnings += 1;
    this.suspicion = 0;
    this._caughtCooldown = 3;
    // He has made his point; back to the route (and she gets a moment to run).
    this.boss.resetToPatrol();

    if (this.warnings >= MAX_WARNINGS) {
      this.gameOver = true;
      this.win = false;
      this._toast("Tercera advertencia: despedida.");
    } else {
      this._toast(`Advertencia ${this.warnings}/${MAX_WARNINGS}`);
    }
  }

  _toast(text) {
    this.message = { text, timer: 2.6 };
  }

  _snapshot() {
    return {
      suspicion: this.suspicion,
      suspicionMax: SUSPICION_MAX,
      warnings: this.warnings,
      maxWarnings: MAX_WARNINGS,
      timeLeft: this.timeLeft,
      levelDuration: LEVEL_DURATION,
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
    };
  }
}
