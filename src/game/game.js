import {
  activityStations,
  distractions,
  hidingSpots,
  safeSpots,
  locationEggs,
  nearestArea,
  areaAt,
} from "../scene/floorplan.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { BOSS_STATES } from "../entities/boss.js";
import { buzz } from "./settings.js";
import { sfxComplete, sfxWarn, sfxDistraction } from "./sfx.js";
import { runEffect } from "./effects.js";

const SUSPICION_MAX = 100;
const DECAY_HIDDEN_OR_PRETENDING = 45;
const DECAY_IDLE = 12;
const SEEN_WHILE_HUNTED_RATE = 16;
const MINION_CAUGHT_RATE = 12; // secuaz te pilla en una actividad prohibida
// Que te vean fuera de tu puesto, sin fingir, también debe levantar sospecha
// aunque no estés haciendo nada prohibido — antes solo subía si el jefe te
// pillaba en plena actividad, así que quedarte plantada en medio del pasillo
// mirándolo a los ojos no hacía nada.
const SEEN_IDLE_BOSS_RATE = 9;
const SEEN_IDLE_MINION_RATE = 5;
const INTERACT_RADIUS = 1.5 * S;
const DISTRACTION_EFFECT_DURATION = 7;
// A hiding spot is a one-shot breather, not a safe room: once you have used
// it, it needs to cool off before it hides you again.
const HIDE_MAX_USE = 6; // seconds of cover before the spot burns out
const HIDE_COOLDOWN = 14;

// Nivel de búsqueda, al estilo de las estrellas de GTA. Sube con la sospecha
// y endurece al jefe: ve más lejos, camina más rápido y a partir del nivel 2
// deja de fiarse de la ronda y va derecho a tu zona.
const HEAT_THRESHOLDS = [12, 34, 58, 80];
const HEAT_TUNING = [
  { vision: 1, speed: 1, huntEvery: Infinity },
  { vision: 1.08, speed: 1.05, huntEvery: Infinity },
  { vision: 1.2, speed: 1.14, huntEvery: 12 },
  { vision: 1.32, speed: 1.22, huntEvery: 8 },
  { vision: 1.48, speed: 1.32, huntEvery: 5 },
];

// Fingir que trabajas solo cuela en un LUGAR SEGURO: una sala de reuniones o
// tu propio puesto (ver `safeSpots` en el JSON de escena). En mitad del
// pasillo, en la cafetería o en el baño no engañas a nadie — antes valía
// cualquier zona de tipo oficina o sala, que era medio piso.
// Fingiendo con poca sospecha no te aborda nadie: por debajo del umbral eres
// intocable. Por encima, "si estabas con más, valiste".
const PRETEND_IMMUNE_THRESHOLD = 30;

// Los secuaces no esperan a que les hables: te abordan ellos. Pero solo
// cuando TE TOCAN, no cuando te ven de lejos. Antes el umbral era
// INTERACT_RADIUS * 1.4 (unas dos unidades de plano) y Crispo abordaba desde
// el otro lado del pasillo, sin haberse acercado siquiera. Ahora es contacto
// de verdad: la suma de los dos radios más un dedo de margen.
const MINION_TOUCH_PAD = 0.3 * S;
function minionTouches(minion, player) {
  const d = Math.hypot(minion.position.x - player.position.x, minion.position.z - player.position.z);
  return d <= minion.radius + player.radius + MINION_TOUCH_PAD;
}

// Washo casi no anda, pero mientras estés en su mira te pesan las piernas.
const WASHO_SLOW_MUL = 0.55;

// Cupo por defecto de una sala de reuniones, si su JSON no trae `budget`. No
// se recarga: agotado, esa sala está quemada hasta mañana.
const SAFE_SPOT_BUDGET = 25;

// La única moneda es el RELOJ. No hay puntos: cada cosa prohibida que haces
// te alarga la jornada, y el descaro paga — hacerla con el jefe encima vale
// varias veces hacerla en un ala vacía, y encadenarlas sin que te pillen
// multiplica. Perder aquí es quedarte sin reloj, no quedarte corto de puntos.
const EGG_TIME_BONUS = 45; // un secreto encontrado vale su buen rato
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
  // Personaje elegido (modes.json), fusionado sobre las reglas del día.
  minionSuspicionMul: 1,
  explore: false, // Kiara: ya renunció, nada le afecta
  pretendAlways: false,
};

// El tiempo pasa más rápido cuando aparentas trabajo: ganas puntos saliendo
// antes pero necesitas pasar tiempo fingiendo para bajar sospecha.
const PRETEND_TIME_SPEED = 1.5; // 50% más rápido cuando finges

// El reloj de la jornada: la duración del nivel (en segundos de juego) se
// reparte proporcionalmente entre estas dos horas, así el HUD siempre puede
// mostrar "9:14 a.m." aunque el nivel dure 4 minutos reales.
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 19; // 7:00 p.m.

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
  constructor({
    player,
    boss,
    npcs,
    minions = [],
    hud,
    rules = {},
    config = null,
    onFinish = null,
    onEgg = null,
    onPopup = null,
    onTalk = null,
    onWarn = null,
  }) {
    this.player = player;
    this.boss = boss;
    this.npcs = npcs;
    this.minions = minions;
    this.onTalk = onTalk;
    this.onWarn = onWarn;
    this.hud = hud;
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.onFinish = onFinish;
    this.onEgg = onEgg;
    this.onPopup = onPopup;

    // data/boss-config.json, con los valores de siempre como respaldo si el
    // archivo no carga (offline, typo, etc.) — el juego nunca debe romperse
    // por un JSON de balance.
    const sc = config?.suspicion ?? {};
    this.suspicionConfig = {
      max: sc.max ?? SUSPICION_MAX,
      seenOutOfPlaceRate: sc.seenOutOfPlaceRate ?? SEEN_IDLE_BOSS_RATE,
      seenOutOfPlaceHighHeatRate: sc.seenOutOfPlaceHighHeatRate ?? SEEN_IDLE_BOSS_RATE * 2,
      seenDoingActivityRate: sc.seenDoingActivityRate ?? 20,
      decayHiddenOrPretending: sc.decayHiddenOrPretending ?? DECAY_HIDDEN_OR_PRETENDING,
      decayIdle: sc.decayIdle ?? DECAY_IDLE,
      pretendImmuneThreshold: sc.pretendImmuneThreshold ?? PRETEND_IMMUNE_THRESHOLD,
      captureThreshold: sc.captureThreshold ?? 90,
    };
    const gc = config?.gameplay ?? {};
    this.dayStartHour = gc.dayStartHour ?? DAY_START_HOUR;
    this.dayEndHour = gc.dayEndHour ?? DAY_END_HOUR;

    this.suspicion = 0;
    this.warnings = 0;
    this.timeLeft = this.rules.duration;
    this.gameOver = false;
    this.win = false;
    this.paused = false;
    this._finished = false;

    this.timeGained = 0; // reloj regalado hoy; es lo que enseña el HUD
    this.combo = 1;
    this.comboLeft = 0;
    this.perk = null;
    this.perkLeft = 0;
    this._perkSpeedMul = 1; // perks (café); se combina con la lentitud de Washo
    this.revealBossUntil = 0;
    this.heat = 0;
    this.inWorkspace = false;
    this.inSafeSpot = false;
    this.currentSafeSpot = null; // el lugar seguro utilizable en el que estás
    this._huntTimer = 0;

    const wanted = this.rules.objectives;
    this.objectives = activityStations
      .filter((s) => !wanted || wanted.includes(s.id))
      .map((s) => ({ ...s, progress: 0, done: false }));

    this.distractionState = this.rules.distractionsOff
      ? []
      : distractions.map((d) => ({ ...d, cooldownLeft: 0 }));

    this.nearStation = null;
    this.nearDistraction = null;
    this.nearNpc = null;
    this.focusStation = null;
    this.message = null;
    this._actionFlash = null;
    this.currentArea = null;
    this.talkCooldowns = new Map();
    this.hideState = hidingSpots.map(() => ({ cooldownLeft: 0, usedFor: 0 }));
    // Bound once so the per-frame snapshot never allocates a new closure.
    this._hidingCharge = (i) => this.hidingCharge(i);
    this.safeSpotState = safeSpots.map((spot) => ({
      left: spot.kind === "desk" ? Infinity : spot.budget ?? SAFE_SPOT_BUDGET,
      spent: false,
      // Las salas se ocupan solas cada tanto: llega gente a reunirse de
      // verdad y dejas de tener excusa para estar ahí.
      busyLeft: 0,
      nextBusy: spot.busyEvery ? spot.busyEvery * (0.5 + Math.random()) : Infinity,
    }));
    this._safeSpotCharge = (i) => this.safeSpotCharge(i);

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

    // El tiempo pasa más rápido cuando finges trabajo
    const effectiveDt = dt * (this.player.isPretending ? PRETEND_TIME_SPEED : 1);
    this.timeLeft = Math.max(0, this.timeLeft - effectiveDt);
    if (this._caughtCooldown > 0) this._caughtCooldown -= dt;

    if (this.revealBossUntil > 0) this.revealBossUntil -= dt;
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

    this.player.isHiding = this._updateHiding(dt, pos);

    // El orden importa: fingir solo se puede DENTRO de un lugar seguro, y a
    // la vez tu puesto solo te cubre MIENTRAS finges. Así que primero se mira
    // dónde estás (una pasada que no gasta nada), luego se decide si estás
    // fingiendo, y con eso ya se resuelve el lugar seguro de verdad.
    const holdingE = this.player.keys.has("e");
    const holdingF = this.player.keys.has("f");
    this.player.isPretending = holdingF && this._standingInUsableSafeSpot(pos);

    this.inSafeSpot = this._updateSafeSpot(dt, pos);
    // Estar en un lugar seguro es la ÚNICA forma de quitarte de encima una
    // persecución ya comprometida: el jefe y sus secuaces sueltan la presa y
    // vuelven a la ronda. (Esconderse o fingir sirven para que no te fichen,
    // no para escaparte una vez te tienen.)
    //
    // Se comprueba cada frame, no solo al ENTRAR: si te fichan estando ya
    // dentro (te ve desde lejos mientras estás en el bebedero), la
    // persecución tiene que morir igual — con detección de flanco, ese caso
    // se quedaba perseguido para siempre.
    if (this.inSafeSpot) this._breakAllPursuits();

    // "Tu sitio" ya no es media planta: es exactamente el lugar seguro en el
    // que estás. Fuera de ahí, estás fuera de tu puesto.
    this.inWorkspace = !!this.currentSafeSpot;

    this.nearStation =
      this.objectives.find(
        (s) => !s.done && Math.hypot(s.x - pos.x, s.z - pos.z) < INTERACT_RADIUS
      ) ?? null;

    // The compass always points at the closest thing still to do, so you are
    // never left wondering where the next task is. Un `for` sencillo en vez
    // de filter+reduce+Object.assign: eso corría cada frame y de paso
    // mutaba los objetivos con un campo `_d` que nadie leía después.
    this.focusStation = null;
    let focusDist = Infinity;
    for (const s of this.objectives) {
      if (s.done) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < focusDist) {
        focusDist = d;
        this.focusStation = s;
      }
    }

    if (this.nearStation && holdingE && !holdingF) {
      this.player.isDoingActivity = true;
      // La pose sale del JSON de la actividad (`pose`, ver scenes/*.json); si
      // el personaje no tiene hoja de acciones, sprite.js la ignora.
      this.player.pose = this.nearStation.pose ?? null;
      this.nearStation.progress = Math.min(this.nearStation.time, this.nearStation.progress + dt);
      if (this.nearStation.progress >= this.nearStation.time && !this.nearStation.done) {
        this.nearStation.done = true;
        this._completeActivity(this.nearStation);
      }
    } else {
      this.player.isDoingActivity = false;
      // Fingir que trabajas es, literalmente, la pose de estar en el portátil.
      this.player.pose = holdingF ? "work" : null;
    }

    this.distractionState.forEach((d) => {
      if (d.cooldownLeft > 0) d.cooldownLeft = Math.max(0, d.cooldownLeft - dt);
    });
    this.nearDistraction =
      this.distractionState.find(
        (d) => d.cooldownLeft <= 0 && Math.hypot(d.x - pos.x, d.z - pos.z) < INTERACT_RADIUS
      ) ?? null;

    this.talkCooldowns.forEach((left, id) => {
      if (left > 0) this.talkCooldowns.set(id, Math.max(0, left - dt));
    });
    // A los amigos les hablas tú; los secuaces te abordan solos (más abajo).
    this.nearNpc =
      this.npcs.find(
        (n) =>
          n.active !== false && // el doble del personaje elegido está apagado
          n.cast &&
          (this.talkCooldowns.get(n.id) ?? 0) <= 0 &&
          Math.hypot(n.position.x - pos.x, n.position.z - pos.z) < INTERACT_RADIUS * 1.3
      ) ?? null;

    if (holdingE && !this._prevInteractKey && this.nearNpc && !this.nearStation) {
      const npc = this.nearNpc;
      this.talkCooldowns.set(npc.id ?? npc.cast, npc.talkCooldown ?? 40);
      this.onTalk?.(npc);
    } else if (holdingE && !this._prevInteractKey && this.nearDistraction && !this.nearStation) {
      const target = { x: this.nearDistraction.x, z: this.nearDistraction.z };
      if (this.boss.distract(target, DISTRACTION_EFFECT_DURATION)) {
        this.nearDistraction.cooldownLeft = this.nearDistraction.cooldown;
        this.toast(`Distracción: ${this.nearDistraction.label}`);
        sfxDistraction();
        this.award(40, "Distracción", this.player.position);
      } else {
        this.toast("¡Ya te vio! Una distracción no lo detiene ahora.");
      }
    }
    this._prevInteractKey = holdingE;

    // El jefe necesita saber cuánta sospecha hay YA para decidir si tantea
    // (fase lenta) o va con todo (fase rápida, ver boss.js/_speed()).
    this.boss.suspicion = this.suspicion;

    // Un NPC apagado (el doble del personaje elegido) tampoco tapa la vista
    // del jefe: no está ahí para nadie. Se reutiliza el mismo array entre
    // frames en vez de `.filter()` (que aloja uno nuevo cada vez) — el jefe
    // y cada secuaz vuelven a pedir esta lista todos los frames.
    this._liveNpcsBuf = this._liveNpcsBuf ?? [];
    this._liveNpcsBuf.length = 0;
    for (const n of this.npcs) if (n.active !== false) this._liveNpcsBuf.push(n);
    const liveNpcs = this._liveNpcsBuf;
    this.boss.update(dt, this.player, liveNpcs);
    this.minions.forEach((m) => m.update(dt, this.player, liveNpcs));
    this._updateMinionCatch();
    this._updateMinionApproach();
    this._updateEggs(dt);
    this._updateSpeedMul();

    // ---- Suspicion ----
    const susCfg = this.suspicionConfig;
    if (this.rules.explore) {
      // Kiara ya renunció: nada de esto le afecta.
      this.suspicion = 0;
    } else if (this.inSafeSpot) {
      // Bebedero / baño / tu propia mesa: el jefe puede verte ahí y no cuenta.
      this.suspicion = Math.max(0, this.suspicion - susCfg.decayIdle * this.rules.decayMul * dt);
    } else {
      const decay = this.rules.decayMul;
      const outOfPlace = !this.player.isPretending && !this.inWorkspace;
      const highHeat = this.suspicion >= susCfg.captureThreshold;

      // Un secuaz te ve: si te pilla en una actividad prohibida sube fuerte;
      // si solo te ve fuera de tu puesto sin fingir, sube más despacio. Antes
      // solo existía la primera rama, así que pasearte delante de un secuaz
      // sin tocar nada prohibido no levantaba nada.
      const minionCaught = this.minions.some((m) => m.redAlert);
      const minionSeenIdle = !minionCaught && outOfPlace && this.minions.some((m) => m.playerVisible);
      if (minionCaught && !this.boss.redAlert) {
        this.suspicion = Math.min(
          susCfg.max,
          this.suspicion + MINION_CAUGHT_RATE * this.rules.minionSuspicionMul * dt
        );
      } else if (minionSeenIdle && !this.boss.redAlert) {
        this.suspicion = Math.min(
          susCfg.max,
          this.suspicion + SEEN_IDLE_MINION_RATE * this.rules.minionSuspicionMul * dt
        );
      }

      if (this.boss.redAlert) {
        const rate = this.nearStation?.riskRate ?? susCfg.seenDoingActivityRate;
        this.suspicion = Math.min(susCfg.max, this.suspicion + rate * dt);
      } else if (this.boss.state === BOSS_STATES.CHASE && this.boss.playerVisible) {
        this.suspicion = Math.min(susCfg.max, this.suspicion + SEEN_WHILE_HUNTED_RATE * dt);
      } else if (this.boss.playerVisible && outOfPlace) {
        // Te ve fuera de tu puesto sin fingir: sospecha, aunque no estés
        // haciendo nada prohibido. Con la sospecha ya alta (>= umbral de
        // captura) cada segundo cuenta el doble: no hay margen de sobra.
        const rate = highHeat ? susCfg.seenOutOfPlaceHighHeatRate : susCfg.seenOutOfPlaceRate;
        this.suspicion = Math.min(susCfg.max, this.suspicion + rate * dt);
      } else if (this.player.isHiding) {
        this.suspicion = Math.max(0, this.suspicion - susCfg.decayHiddenOrPretending * decay * dt);
      } else if (this.player.isPretending) {
        // Fingir ya solo es posible dentro de un lugar seguro, así que
        // siempre cuela: no hace falta descontar credibilidad.
        this.suspicion = Math.max(0, this.suspicion - susCfg.decayHiddenOrPretending * decay * dt);
      }
      // Sin escondite, sin fingir y sin lugar seguro: la sospecha se queda
      // donde está. No baja sola por quedarte quieta o pasearte — solo la
      // bajan las acciones que de verdad la justifican (fingir, esconderte,
      // un lugar seguro o hablar con quien corresponda).
    }

    this._updateHeat(dt);

    // Fingiendo con poca sospecha eres intocable, y un escondite o un lugar
    // seguro te cubren MIENTRAS el jefe todavía no te tiene en la mira ni te
    // persigue. Pero en cuanto entra en caza activa (CHASE/SEARCH), ya sabe
    // dónde estás o adónde ibas: fingir o escondes no sirve, solo un lugar
    // seguro de verdad corta la persecución. `pretendAlways` (un modo de
    // personaje futuro) es la única excepción explícita a esa regla.
    const pretendAlwaysImmune = this.player.isPretending && this.rules.pretendAlways;
    const caught =
      !this.rules.explore &&
      this._caughtCooldown <= 0 &&
      this.boss.isHunting &&
      !this.inSafeSpot &&
      !pretendAlwaysImmune &&
      this.boss.catches(pos, this.player.radius);

    // La amonestación llega cuando el jefe te aborda de verdad, no en cuanto
    // el medidor toca el tope: al 100% ya viene a por ti con toda su furia
    // (nivel de búsqueda 4), así que el encuentro no tarda, pero es el
    // encuentro el que cuenta.
    if (caught) this._warn();

    if (!this.gameOver && !this.rules.explore) {
      if (this.objectives.every((o) => o.done)) this._finish(true);
      else if (this.timeLeft <= 0) this._finish(false);
    }

    if (this.message) {
      this.message.timer -= dt;
      if (this.message.timer <= 0) this.message = null;
    }
    if (this._actionFlash) {
      this._actionFlash.timer -= dt;
      if (this._actionFlash.timer <= 0) this._actionFlash = null;
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

    // `reward`, no `time`: `time` es lo que TARDA la actividad, no lo que da.
    const gained = this._grantTime(station.reward ?? 20, {
      at: station,
      sub: this.combo > 1 ? `x${this.combo.toFixed(1)}` : "",
      kind: nerve ? "nerve" : "score",
      extraMul: nerve,
    });

    this.combo = Math.min(COMBO_MAX, this.combo + COMBO_STEP);
    this.comboLeft = COMBO_WINDOW;

    if (station.perk) this.applyPerk(station.perk);

    buzz([12, 40, 18]);
    sfxComplete();
    this.toast(`${station.label}${nerveLabel} · +${gained}s`);
    this._actionFlash = {
      icon: station.icon ?? "question",
      label: station.label,
      pose: station.pose ?? null,
      timer: 1.1,
    };
  }

  /**
   * La ÚNICA puerta por la que se regala reloj.
   *
   * Ya no hay puntos: todo lo que antes puntuaba ahora alarga la jornada. Pasa
   * todo por aquí para que `timeGained` (lo que enseña el HUD) no se pueda
   * quedar desincronizado de `timeLeft` — que es justo lo que pasaba cuando
   * cada sitio sumaba por su cuenta.
   */
  _grantTime(seconds, { at, label = "", sub = "", kind = "minor", extraMul = 0 } = {}) {
    const gained = Math.max(1, Math.round(seconds * (this.combo + extraMul)));
    this.timeLeft += gained;
    this.timeGained += gained;
    if (at) {
      this.onPopup?.({ text: `+${gained}s`, sub: sub || label, x: at.x, z: at.z, kind });
    }
    return gained;
  }

  /** Alarga la jornada. `seconds` es el bono base, antes del combo. */
  award(seconds, label, at) {
    return this._grantTime(seconds, { at, label, kind: "minor" });
  }

  applyPerk(perk) {
    this._clearPerk();
    this.perk = perk;
    this.perkLeft = PERK_DURATION;
    if (perk === "caffeine") {
      this._perkSpeedMul = 1.35;
      this.toast("Cafeína: +35% de velocidad");
    }
  }

  _clearPerk() {
    if (this.perk === "caffeine") this._perkSpeedMul = 1;
    this.perk = null;
  }

  /**
   * La velocidad del jugador combina el perk activo (café) con la lentitud
   * que impone Washo mientras te tiene en la mira — ninguno de los dos debe
   * pisar al otro, así que se recalculan juntos cada frame en vez de que cada
   * efecto escriba `speedMul` por su cuenta.
   */
  /** Todo el que te venga persiguiendo se rinde al verte en lugar seguro. */
  _breakAllPursuits() {
    let broke = this.boss.breakPursuit();
    for (const m of this.minions) broke = m.breakPursuit() || broke;
    if (broke) this.toast("Lugar seguro: dejan de perseguirte");
    return broke;
  }

  _updateSpeedMul() {
    // El radar de Washo frena por ÁREA, no por mirada: basta con estar dentro
    // de su alcance, mires por donde mires y mire él por donde mire. Es
    // exactamente lo que dibujan sus ondas en el suelo, así que el efecto se
    // entiende sin explicarlo.
    const washo = this.minions.find((m) => m.cast === "washo");
    const inRadar = washo?.active !== false && washo?.inRange(this.player.position);
    this.player.speedMul = this._perkSpeedMul * (inRadar ? WASHO_SLOW_MUL : 1);
    this.inWashoRadar = !!inRadar;
  }

  /**
   * Nivel de búsqueda. Traduce la sospecha en presión real: cuanto más alto,
   * más lejos ve el jefe, más rápido anda y más a menudo abandona la ronda
   * para venir derecho a por ti.
   */
  _updateHeat(dt) {
    const level = HEAT_THRESHOLDS.filter((t) => this.suspicion >= t).length;
    if (level !== this.heat) {
      if (level > this.heat) {
        buzz([20, 30, 20]);
        this.toast(`Nivel de búsqueda ${level}`);
      }
      this.heat = level;
    }

    const tuning = HEAT_TUNING[this.heat];
    const base = this.boss.dayTuning ?? { vision: this.boss.baseVisionRange, speedMul: 1 };
    this.boss.visionRange = base.vision * tuning.vision;
    const mul = base.speedMul * tuning.speed;
    this.boss.speed = this.boss.baseSpeeds.patrol * mul;
    this.boss.investigateSpeed = this.boss.baseSpeeds.investigate * mul;
    this.boss.chaseSpeed = this.boss.baseSpeeds.chase * mul;
    this.boss.searchSpeed = this.boss.baseSpeeds.search * mul;

    // A partir del nivel 2, "alguien le ha dicho por dónde andas".
    this._huntTimer -= dt;
    if (this._huntTimer <= 0 && Number.isFinite(tuning.huntEvery)) {
      this._huntTimer = tuning.huntEvery;
      if (!this.player.isHiding) {
        this.boss.distract({ x: this.player.position.x, z: this.player.position.z }, 8);
      }
    }
  }

  /**
   * Interrogatorio: un secuaz que te ve (redAlert) te sigue de verdad — está
   * en CHASE, camina hacia ti — y su diálogo (la respuesta que elijas decide
   * cuánto sube o baja la sospecha) solo se dispara cuando de verdad llega a
   * tu lado, igual que la amonestación del jefe exige contacto real
   * (boss.catches()). Antes bastaba con mantenerte un ratito en su mira
   * aunque estuviera lejos (Washo te ve desde el otro extremo del ala y
   * jamás llega a tiempo); ahora, si rompes la línea de visión o sales
   * corriendo antes de que te alcance, no pasa nada — tienes que dejar que
   * te agarre para que cuente.
   */
  _updateMinionCatch() {
    if (!this.onTalk) return;
    const pos = this.player.position;
    for (const m of this.minions) {
      // `redAlert` se apaga en cuanto te escondes, pero un secuaz ya
      // comprometido (lockedOn) viene igual: sin esta segunda condición se
      // quedaba persiguiéndote para siempre sin llegar a interrogarte nunca,
      // porque su "captura" es justamente este diálogo.
      if (!m.redAlert && !m.lockedOn) continue;
      if (m.active === false || !m.cast) continue;
      if ((this.talkCooldowns.get(m.id ?? m.cast) ?? 0) > 0) continue;
      if (!minionTouches(m, this.player)) continue; // sigue persiguiendo
      this.talkCooldowns.set(m.id ?? m.cast, m.talkCooldown ?? 35);
      this.onTalk(m, { caught: true });
      // Ya te interrogó: vuelve a su ronda en vez de quedarse pegada a ti en
      // plena persecución, que es donde el atasco físico la hacía "huir" al
      // rato con un empujón aleatorio (ver _updateStuck en boss.js).
      m.resetToPatrol();
      return;
    }
  }

  /**
   * Los secuaces te paran ellos: no hace falta pulsar nada. Esta es la
   * cháchara casual (Washo comentando el ala, etc.), así que un secuaz que
   * ahora mismo te tiene en la mira (redAlert, ya sea disparando su propio
   * temporizador de interrogatorio o a punto de hacerlo) queda fuera: si no,
   * la charla amistosa se colaba antes que el interrogatorio real y daba la
   * sensación de que "hablan antes de atraparte" sin haber pasado nada.
   */
  _updateMinionApproach() {
    if (!this.onTalk) return;
    const pos = this.player.position;
    for (const m of this.minions) {
      if (m.active === false) continue; // no está de turno / desactivado
      if (m.redAlert) continue; // eso lo resuelve _updateMinionCatch
      if (!m.cast || (this.talkCooldowns.get(m.id ?? m.cast) ?? 0) > 0) continue;
      if (!minionTouches(m, this.player)) continue;
      this.talkCooldowns.set(m.id ?? m.cast, m.talkCooldown ?? 35);
      this.onTalk(m, { unsolicited: true });
      return;
    }
  }

  /**
   * Cover with a duty cycle. Sitting inside a spot drains it; once drained it
   * stops hiding you and has to recharge, so the answer to being chased can
   * never be "park on the green circle and wait".
   */
  _updateHiding(dt, pos) {
    let hidden = false;
    hidingSpots.forEach((spot, i) => {
      const state = this.hideState[i];
      const inside = Math.hypot(spot.x - pos.x, spot.z - pos.z) < spot.r;

      if (state.cooldownLeft > 0) {
        state.cooldownLeft = Math.max(0, state.cooldownLeft - dt);
        if (state.cooldownLeft === 0) state.usedFor = 0;
        return;
      }

      if (!inside) {
        // Recovers slowly while you are away, so short dips stay cheap.
        state.usedFor = Math.max(0, state.usedFor - dt * 0.6);
        return;
      }

      state.usedFor += dt;
      if (state.usedFor >= HIDE_MAX_USE) {
        state.cooldownLeft = HIDE_COOLDOWN;
        this.toast("Ese escondite se quemó. Busca otro.");
        buzz(30);
        return;
      }
      hidden = true;
    });
    return hidden;
  }

  /** Per-spot readout for the floor markers: 0 = burnt out, 1 = fresh. */
  hidingCharge(i) {
    const state = this.hideState[i];
    if (!state) return 1;
    if (state.cooldownLeft > 0) return 0;
    return 1 - state.usedFor / HIDE_MAX_USE;
  }

  /**
   * Lugares seguros: bebedero, baño, tu propia mesa. El jefe puede verte ahí
   * sin que suba la sospecha, pero tienen un cupo de segundos al día — no un
   * enfriamiento como los escondites — y una vez gastado no vuelve hasta
   * mañana.
   */
  _updateSafeSpot(dt, pos) {
    let current = null;
    safeSpots.forEach((spot, i) => {
      const state = this.safeSpotState[i];

      // Las salas se ocupan solas cada tanto, estés dentro o no.
      if (state.nextBusy !== Infinity && !state.spent) {
        if (state.busyLeft > 0) {
          state.busyLeft -= dt;
          if (state.busyLeft <= 0) state.nextBusy = spot.busyEvery * (0.7 + Math.random() * 0.6);
        } else {
          state.nextBusy -= dt;
          if (state.nextBusy <= 0) {
            state.busyLeft = spot.busyFor ?? 12;
            if (this._insideSafeSpot(spot, pos)) {
              this.toast(`${spot.label}: llegó gente a reunirse de verdad.`);
            }
          }
        }
      }

      if (state.spent || state.busyLeft > 0) return;
      if (!this._insideSafeSpot(spot, pos)) return;
      current = { spot, state, index: i };
    });

    this.currentSafeSpot = current?.spot ?? null;
    if (!current) return false;

    // Tu puesto no se gasta, pero solo te cubre mientras finges de verdad.
    if (current.spot.kind === "desk") return this.player.isPretending;

    current.state.left = Math.max(0, current.state.left - dt);
    if (current.state.left === 0) {
      current.state.spent = true;
      this.toast(`${current.spot.label}: ya la usaste demasiado hoy.`);
    }
    return true;
  }

  /**
   * ¿Estás dentro de algún lugar seguro que hoy siga sirviendo? Es la
   * condición para poder fingir. No consume nada: solo mira.
   */
  _standingInUsableSafeSpot(pos) {
    return safeSpots.some((spot, i) => {
      const state = this.safeSpotState[i];
      return !state.spent && state.busyLeft <= 0 && this._insideSafeSpot(spot, pos);
    });
  }

  _insideSafeSpot(spot, pos) {
    return Math.hypot(spot.x - pos.x, spot.z - pos.z) < spot.radius;
  }

  /** Per-spot readout for the floor markers: 0 = agotado u ocupado, 1 = intacto. */
  safeSpotCharge(i) {
    const state = this.safeSpotState[i];
    if (!state) return 1;
    if (state.spent || state.busyLeft > 0) return 0;
    if (state.left === Infinity) return 1; // tu puesto no se gasta
    const budget = safeSpots[i]?.budget ?? SAFE_SPOT_BUDGET;
    return state.left / budget;
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
        this._grantTime(EGG_TIME_BONUS, { at: egg, sub: "secreto", kind: "nerve" });
        this.onEgg(egg);
      }
    }
  }

  _warn() {
    if (this.rules.explore) return; // ya renunció, nada le afecta
    this.warnings += 1;
    this.suspicion = 0;
    this._caughtCooldown = 3;
    this.combo = 1;
    this.comboLeft = 0;
    this.boss.resetToPatrol();
    buzz([40, 60, 40]);
    sfxWarn();

    const final = this.warnings >= this.rules.maxWarnings;
    if (final) {
      this.toast("Última advertencia: te ascienden a cliente.");
    } else {
      this.toast(`Advertencia ${this.warnings}/${this.rules.maxWarnings}`);
    }
    // El motor (engine.js) muestra el diálogo del regaño y, cuando lo cierra,
    // le da al jefe unos segundos sin observar — si lo hiciéramos aquí, ese
    // respiro se gastaría mientras el diálogo está en pausa, sin servir de nada.
    this.onWarn?.({ warnings: this.warnings, maxWarnings: this.rules.maxWarnings, final });
    if (final) this._finish(false);
  }

  _finish(win) {
    if (this._finished) return;
    this._finished = true;
    this.gameOver = true;
    this.win = win;
    this._clearPerk();

    this.onFinish?.({
      win,
      warnings: this.warnings,
      timeLeft: this.timeLeft,
      timeGained: this.timeGained,
      // Lo vivido de verdad: la jornada base MÁS lo que te regalaste, menos lo
      // que queda. Sin sumar `timeGained` la cuenta salía corta en todo lo que
      // hubieras ganado durante el día.
      elapsed: this.rules.duration + this.timeGained - this.timeLeft,
      objectives: this.objectives,
      eggsFound: this._foundEggs.size,
    });
  }

  /**
   * Effects that dialogue options in the JSON are allowed to trigger. El
   * catálogo vive en effects.js: añadir uno nuevo no toca este archivo.
   */
  applyEffect(name) {
    runEffect(name, this);
  }

  /**
   * Chispita no te atrapa, te delata. El jefe no siempre le hace caso, y si
   * al final resulta que era una falsa alarma (aún no habías cumplido ningún
   * objetivo, o te abordó mientras fingías que trabajabas), se harta de ella
   * y la encierra en una sala de reuniones el resto del día.
   */
  chispitaReport() {
    const chispita = this.minions.find((m) => m.cast === "chispita");
    if (Math.random() < 0.45) {
      this.toast("Chispita corre a avisar al jefe… que pasa de ella.");
      return;
    }
    const objectivesStarted = this.objectives.some((o) => o.done);
    const falseAlarm = !objectivesStarted || this.player.isPretending;
    if (falseAlarm && chispita) {
      chispita.setActive(false);
      this.toast("El jefe se harta de falsas alarmas: encierra a Chispita en una sala. Hoy no molesta más.");
    } else {
      this.boss.distract({ x: this.player.position.x, z: this.player.position.z }, 10);
      this.toast("¡Chispita avisó al jefe! Viene para acá.");
    }
  }

  toast(text) {
    this.message = { text, timer: 2.6 };
  }

  /**
   * The HUD, the compass and the debug tools all read the same frame state.
   * It is cached rather than rebuilt per consumer: this runs every frame and
   * allocating several objects per frame is exactly the kind of garbage that
   * shows up as stutter on a tablet.
   */
  /** Hora actual del día (número, ej. 13.5 = 1:30 p.m.), según cuánto ha pasado. */
  getCurrentHour() {
    const elapsed = this.rules.duration - this.timeLeft;
    const frac = this.rules.duration > 0 ? elapsed / this.rules.duration : 0;
    return this.dayStartHour + frac * (this.dayEndHour - this.dayStartHour);
  }

  /** "9:05 a.m." / "5:42 p.m." — así se ve en el reloj del HUD. */
  formatTime() {
    const hour = this.getCurrentHour();
    let h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    const suffix = h >= 12 ? "p.m." : "a.m.";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
  }

  /**
   * Qué se está "viendo" ahora mismo en la escena grande de acción: una
   * actividad prohibida en curso (usa su icono/id propio, uno por tarea) o,
   * si no hay ninguna, fingir que trabajas (un solo "id" genérico). null si
   * no estás haciendo ninguna de las dos.
   */
  _currentAction() {
    if (this.player.isDoingActivity && this.nearStation) {
      return {
        id: this.nearStation.id,
        icon: this.nearStation.icon ?? "question",
        label: this.nearStation.label,
        pose: this.nearStation.pose ?? null,
        progress: this.nearStation.progress / this.nearStation.time,
        done: false,
      };
    }
    if (this._actionFlash) {
      return {
        id: `done-${this._actionFlash.label}`,
        icon: this._actionFlash.icon,
        label: this._actionFlash.label,
        pose: this._actionFlash.pose ?? null,
        progress: 1,
        done: true,
      };
    }
    if (this.player.isPretending) {
      return {
        id: "pretend",
        icon: "keyboard",
        label: "Fingiendo que trabajas",
        pose: "work",
        progress: null,
        done: false,
      };
    }
    return null;
  }

  _snapshot() {
    this.lastSnapshot = {
      suspicion: this.suspicion,
      suspicionMax: this.suspicionConfig.max,
      warnings: this.warnings,
      maxWarnings: this.rules.maxWarnings,
      timeLeft: this.timeLeft,
      levelDuration: this.rules.duration,
      currentHour: this.getCurrentHour(),
      currentTime: this.formatTime(),
      objectives: this.objectives,
      nearStation: this.nearStation,
      nearDistraction: this.nearDistraction,
      nearNpc: this.nearNpc,
      focusStation: this.focusStation,
      playerPos: this.player.position,
      bossPos: this.boss.position,
      bossDistance: Math.hypot(
        this.boss.position.x - this.player.position.x,
        this.boss.position.z - this.player.position.z
      ),
      heat: this.heat,
      maxHeat: HEAT_THRESHOLDS.length,
      inWorkspace: this.inWorkspace,
      minionAlert: this.minions.some((m) => m.redAlert),
      minionPositions: this.minions.map((m) => m.position),
      hidingCharge: this._hidingCharge,
      safeSpotCharge: this._safeSpotCharge,
      inSafeSpot: this.inSafeSpot,
      worldScale: S,
      revealBoss: this.revealBossUntil > 0,
      isPretending: this.player.isPretending,
      isHiding: this.player.isHiding,
      currentAction: this._currentAction(),
      redAlert: this.boss.redAlert,
      bossState: this.boss.state,
      gameOver: this.gameOver,
      win: this.win,
      message: this.message,
      area: this.currentArea,
      timeGained: this.timeGained,
      combo: this.combo,
      comboLeft: this.comboLeft,
      comboWindow: COMBO_WINDOW,
      perk: this.perk,
      perkLeft: this.perkLeft,
      perkDuration: PERK_DURATION,
    };
    return this.lastSnapshot;
  }
}
