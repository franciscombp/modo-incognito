import {
  activityStations,
  distractions,
  hidingSpots,
  coartadas,
  safeSpots,
  locationEggs,
  nearestArea,
  areaAt,
  areas,
} from "../scene/floorplan.js";
import { nearestFreeSeat } from "../scene/furniture.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { getCameraSettings } from "../scene/cameraSettings.js";
import { BOSS_STATES } from "../entities/boss.js";
import { buzz } from "./settings.js";
import { sfxComplete, sfxWarn, sfxDistraction } from "./sfx.js";
import { runEffect } from "./effects.js";
import { createActivityPulse } from "./activityGame.js";
import { createActivityGesture } from "./gestures.js";

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
// EL SALTO DE UNA DELACIÓN: lo que sube el medidor compartido de golpe
// cuando un secuaz cruza su umbral y va con el cuento. Es un SUCESO, no un
// goteo — ver el bloque de la delación en `update()`. Calibrado contra
// `chaseSuspicionFloor` (40): dos delaciones te dejan al borde y la tercera
// pone al jefe a cazar, así que el día ESCALA en vez de encenderse solo.
const DELATION_JUMP = 18;

// VIGILANCIA INDIVIDUAL de cada secuaz (`Boss.localHeat`, 0–1): aparte del
// medidor de arriba, cada vigilante acumula SU PROPIA sospecha, que es lo
// que pinta su halo y lo que le hace romper la ronda para seguirte (ver
// boss.js). Pillarte en plena actividad prohibida la dispara rápido; verte
// suelta fuera de tu puesto, más despacio; y decae sola en cuanto deja de
// verte — así un secuaz que te perdió de vista un rato no sigue "sabiendo"
// que andas mal.
const MINION_HEAT_RISE_CAUGHT = 0.22; // ratio/seg — a su umbral (0.55) en ~2.5s
const MINION_HEAT_RISE_SEEN = 0.07; // ratio/seg — a su umbral en ~8s
const MINION_HEAT_DECAY = 0.12; // ratio/seg, sin verte
// Los topes del CAMUFLAJE (ver `Game._camuflaje`). El suelo importa: sin él,
// juntar dos coartadas te volvía prácticamente invisible al paseo y
// esconderse dejaba de tener sentido. El techo evita que ir cargada de botín
// convierta cruzar el pasillo en imposible.
const CAMUFLAJE_MIN = 0.3;
const CAMUFLAJE_MAX = 2.2;
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

// Sin fuerzas se arrastra: por debajo de este % de energía empieza a ir más
// lenta, cuesta abajo hasta ENERGY_SLOW_MUL_FLOOR justo antes de dormirse.
// No es un salto (a las 3 de la tarde se nota, no de golpe) — es la misma
// idea que ya usa Washo, pero disparada por ti misma, no por un vigilante.
const ENERGY_SLOW_THRESHOLD = 0.35;
const ENERGY_SLOW_MUL_FLOOR = 0.55;

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

// Lo que cuesta que se te acabe la cuenta atrás de una tarea. El MARGEN es lo
// que garantiza que la amenaza llegue: el jefe no caza por debajo de su
// umbral (`chaseSuspicionFloor`, 40), así que el pico tiene que dejarte por
// encima o la cuenta atrás sería un adorno que no convoca a nadie.
const TIMEOUT_HEAT = 26;
const TIMEOUT_HEAT_MARGIN = 14;
const PERK_DURATION = 15;

// EL AGUANTE: activada la actividad (minijuego superado), el mundo vuelve a
// correr y cada segundo que la sostienes A LA VISTA paga extra. Es la
// calificación por atreverse: activar ya cumple la misión, aguantar la borda.
const AGUANTE_RATE = 1.6; // ENERGÍA por segundo aguantado (antes era reloj)
const AGUANTE_MAX = 12; // techo: a partir de aquí se banca sola

// EL SABOR DE FINGIR: solo texto, nunca mecánica — fingir sigue siendo
// gratis e inmediato (es el colchón del juego, no puede tener fricción).
// Un toast rotativo al empezar cada sesión de fingir, para que "mantén
// espacio" no se sienta un gesto vacío: estás borrando mails, cerrando
// pestañas, lo de siempre.
const PRETEND_FLAVOR = [
  "Borras unos mails viejos. Se ve productivo.",
  "Cierras diecisiete pestañas de un timeline que no ibas a leer.",
  "Archivas correos sin abrir. El bandeja de entrada baja de número, que es lo que importa.",
  "Mueves el mouse cada tanto para que la lucecita del chat siga en verde.",
  "Reescribes el mismo asunto de correo tres veces sin mandarlo.",
];

const DEFAULT_RULES = {
  // DOS MINUTOS, y son FIJOS. La jornada ya no se alarga: dura lo que dura
  // y a las seis se sale (ver CLOSING_HOUR). Lo que dan las tareas ahora es
  // ENERGÍA, no reloj — ver ENERGY_* más abajo.
  duration: 120,
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

// ── LAS SEIS: TODO EL MUNDO A CASA ───────────────────────────────────
// A las 6 el piso se vacía y la jornada deja de ir de hacer tareas: va de
// SALIR. Los compañeros recogen y se van por los ascensores, y tú tienes
// que llegar a los tuyos antes de que se acabe el reloj.
//
// Es lo que le faltaba al reloj: un DESTINO. Antes la jornada se terminaba
// sola en el sitio donde estuvieras —terminar las tareas ganaba al
// instante— así que los últimos segundos no se jugaban, se miraban. Ahora
// el último tramo es una carrera hacia la puerta con el jefe todavía
// dentro.
//
// Quedarte encerrada NO es un despido: baja el guardia, te saca, y eso es
// una amonestación. Castigo con nombre y cara, no una pantalla de derrota.
const CLOSING_HOUR = 18; // 6:00 p.m.

// ── DOS MEDIDORES, DOS TRABAJOS DISTINTOS ────────────────────────────
//
// La energía NO sustituyó al reloj. Son dos medidores a la vez, y cada uno
// responde a una pregunta distinta:
//
// EL RELOJ te GUÍA: dice por dónde va el día (9:00 → 6:00) y cuándo toca
// salir por el ascensor. Es el mapa de la jornada, y lo que lo alarga es
// hacer tu TRABAJO — las misiones siguen pagando en segundos.
//
// LA ENERGÍA es lo que HACE FALTA para llegar al final. Baja sola desde
// que entras y solo la reponen los escaqueos — el café, sobre todo. De ahí
// que todos los días haya que bajar por un café: no es un adorno del día,
// es el requisito para terminarlo.
//
// El reparto es el chiste entero: cumplir te compra DÍA, escaquearte te
// compra AGUANTE, y no puedes vivir de una sola de las dos cosas.
//
// A cero te DUERMES en el sitio, y ahí está el chiste: dormirse en la
// oficina no te mata, te deja tirada a la vista de todos. Si el jefe te
// pilla dormida, amonestación. Despertarte cuesta unos segundos en los que
// no controlas nada, que es la peor moneda posible con alguien rondando.
//
// ── LOS NÚMEROS, Y POR QUÉ ESTOS ─────────────────────────────────────
// Estuvieron en 4,5/s con 70 de salida, o sea que se aguantaban 15 de los
// 120 segundos de jornada: OCHO siestas por día, injugable. La cuenta que
// manda es esta: con el arranque (75) aguantas ~44 s de los 120, así que
// la jornada NO se termina sin reponer — pero un café (+45) compra otros
// ~26 s y dos o tres paradas bien puestas la cubren de sobra. Necesario
// pero no asfixiante, que es donde vive la decisión.
const ENERGY_MAX = 100;
const ENERGY_START = 75; // se entra con sueño, no a tope: hay que ir a por el café
// EL GASTO DE ENERGÍA, recalibrado (agosto 2026).
//
// Estaba en 1.7/s: con los 75 de arranque eran 44 segundos de una jornada de
// 240, o sea que a la quinta parte del día ya te estabas durmiendo. Eso no
// es administrar un recurso, es una cuenta atrás — no daba tiempo ni a
// llegar a la cafetería, y el sueño dejaba de ser consecuencia de tus
// decisiones para ser el guion.
//
// Ahora los 75 del arranque dan ~121 s: **la MITAD justa de la jornada**.
// Sigue sin alcanzar para el día entero —bajar a por el café sigue siendo
// obligatorio, que es el invariante— pero la primera mitad la eliges tú.
const ENERGY_DRAIN = 0.62; // por segundo — 75 de energía dan ~121 s de 240
const ENERGY_DRAIN_PRETEND = 0.95; // fingir cansa MÁS que trabajar, y ese es el chiste
const SLEEP_SECONDS = 4; // lo que tardas en espabilar

/** La primera zona de un tipo (los ascensores, para la salida). */
function areaByKind(kind) {
  return areas.find((a) => a.kind === kind) ?? null;
}

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
    canvas = null,
    // Los puestos con silla de verdad (scene/furniture.js). Fingir que
    // trabajas te sienta en uno si lo hay a mano.
    seats = [],
    rules = {},
    config = null,
    onFinish = null,
    onEgg = null,
    onPopup = null,
    onTalk = null,
    onWarn = null,
    onHeatAlert = null,
  }) {
    this.player = player;
    this.boss = boss;
    this.npcs = npcs;
    this.minions = minions;
    this.onTalk = onTalk;
    this.onWarn = onWarn;
    this.onHeatAlert = onHeatAlert;
    this.hud = hud;
    this.canvas = canvas;
    this.seats = seats;
    // La silla en la que estás fingiendo ahora mismo, si es que hay una.
    this._pretendSeat = null;
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
    // Las seis: la salida abierta y la tarea de irse (ver _updateClosingTime).
    this.closingAnnounced = false;
    this.exitOpen = false;
    this.exitTask = null;

    this.timeGained = 0; // reloj regalado hoy; es lo que enseña el HUD
    // Segundos de jornada CONSUMIDOS. El reloj de pared (9:00 → 7:00) sale
    // de aquí y no de `duration - timeLeft`, que es lo que había: en cuanto
    // ganas más reloj del que llevas gastado esa resta se vuelve NEGATIVA y
    // el HUD se ponía a marcar horas imposibles ("-6:00 a.m."). Con la
    // jornada en 60 segundos y combos de hasta x4, una sola tarea temprana
    // ya te mete ahí, así que dejó de ser un caso raro. Este contador solo
    // sube, y el reloj con él.
    this.timeSpent = 0;
    // La energía de aguantar el día. A cero te duermes de pie (ver
    // `_updateEnergy`), y dormida eres presa fácil.
    this.energy = ENERGY_START;
    this.energyMax = ENERGY_MAX;
    this.asleepFor = 0;
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
    // La "puerta" del día: mientras no esté superada, ni las tareas ni la
    // vigilancia del jefe/secuaces están activas — solo existe la tarea de
    // conocerlo. Es un bloque del `rules` del día (`gate.guard` + `gate.task`),
    // así que un día sin `gate` arranca desbloqueado del todo (el
    // comportamiento de siempre). Ver dia-1.json para el único caso real hoy.
    this.gate = rules.gate ?? null;
    this.metGabo = !this.gate; // ha conocido al guardián de la puerta (el jefe)
    this._gateObjectives = this.gate
      ? [
          {
            id: this.gate.task?.id ?? "gate",
            label: this.gate.task?.label ?? "Buscar al jefe",
            icon: this.gate.task?.icon ?? "person",
            type: "meet",
            done: false,
            progress: 0,
            time: 1,
          },
        ]
      : null;

    const wanted = this.rules.objectives;
    // Todas las estaciones del plano, para que la campaña pueda añadir una
    // que el día no traía (una misión desbloqueada en caliente).
    this._allStations = activityStations;
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
    // La misión SEGUIDA a mano (teclas 1–3 en el HUD): si está pendiente,
    // gana a la más cercana. null = automático de siempre.
    this.preferredObjectiveId = null;
    this.message = null;
    // El interruptor de fingir (un toque sienta, otro levanta). Nace en
    // false EXPLÍCITO: sin esto, `player.isPretending` era undefined los
    // primeros frames — falsy de chiripa, pero mentira como dato.
    this._pretendToggle = false;
    // El ANUNCIO a pantalla, estilo "¡RANGER PELIGROSO!" de Sasquatch:
    // texto grande centrado para los golpes que hay que leer SÍ o SÍ
    // (te vieron, amonestación, te falta el objeto). El toast queda para
    // lo secundario. `key` crece para que el HUD sepa reiniciar la
    // animación aunque el texto se repita.
    this.bigMessage = null;
    this._bigMsgSeq = 0;
    this._msgSeq = 0;
    this._prevBossState = null;
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

    // El pulso de la actividad (game/activityGame.js). Corre SIN pausar el
    // mundo a propósito: una tarea tiene que exponerte, y un minijuego que
    // congela al jefe convertiría las estaciones en el sitio más seguro del
    // piso. Un fallo hace ruido, y el ruido entra por la misma puerta que
    // todo lo demás: la sospecha.
    this.pulse = createActivityPulse({
      onNoise: (n) => {
        this.suspicion = Math.min(this.suspicionConfig.max, this.suspicion + n);
        buzz(30);
      },
      onFeedback: (tipo) => {
        if (tipo === "acierto") sfxComplete();
        else sfxWarn();
      },
    });

    // EL GESTO (game/gestures.js), el otro verbo de una actividad. Una
    // estación juega a uno o al otro, nunca a los dos: lo decide su JSON.
    // El ruido del gesto se cobra por SEGUNDO —te están oyendo mientras no
    // lo corrijas— así que entra ya multiplicado por dt.
    this.gesture = createActivityGesture({
      onNoise: (n) => {
        this.suspicion = Math.min(this.suspicionConfig.max, this.suspicion + n);
      },
      onFeedback: (tipo) => {
        if (tipo === "dentro") sfxComplete();
      },
    });

    this._prevInteractKey = false;
    this._caughtCooldown = 0;
    this._eggDwell = new Map();
    this._foundEggs = new Set();

    // ── EL BUCLE v2 DE LAS ACTIVIDADES: conseguir → activar → aguantar ──
    // Una actividad puede pedir un OBJETO antes (activities[].objeto en el
    // JSON de escena): el HDMI para la peli está en una sala, el café se le
    // compra a alguien. El inventario es del DÍA — mañana vuelves a
    // conseguirlo, que es donde vive la dinámica.
    this.inventario = new Set();
    // id -> factor de sospecha de lo que llevas encima (ver `_camuflaje`).
    this._factorLlevado = new Map();
    this.nearItem = null;
    // Los puntos de recogida: cada objeto con `en.sala` apunta a un lugar
    // seguro del plano; robarlo exige que la sala NO esté ocupada (una
    // distracción la vacía — ver _triggerDistraction).
    this._itemSpots = [];
    // TODO lo que se puede llevar encima, por id — incluido lo que se
    // consigue HABLANDO (`objeto.de`), que no tiene sitio en el piso y por
    // eso no entra en `_itemSpots`. La placa necesita esta lista para poder
    // enseñar qué llevas: sin ella, el café del Parce y el snack de César se
    // quedaban fuera y el camuflaje volvía a ser una estadística oculta.
    this._carriables = new Map();
    for (const st of this.objectives) {
      if (st.objeto?.id) this._carriables.set(st.objeto.id, st.objeto);
    }
    for (const c of coartadas) this._carriables.set(c.id, { ...c, coartada: true });
    for (const st of this.objectives) {
      const o = st.objeto;
      if (!o?.en?.sala) continue;
      const idx = safeSpots.findIndex((s) => s.id === o.en.sala);
      if (idx < 0) continue;
      this._itemSpots.push({ ...o, x: safeSpots[idx].x, z: safeSpots[idx].z, salaIndex: idx });
    }
    // LAS COARTADAS van a la MISMA lista: se recogen con la misma tecla y el
    // mismo radio que el botín. La diferencia no está en cómo se cogen, está
    // en su factor `sospecha` (< 1 enfría, > 1 delata) y en que estas no
    // cuelgan de ninguna actividad, así que no se gastan nunca.
    for (const c of coartadas) this._itemSpots.push({ ...c, coartada: true });
    // MIENTRAS SE ACTIVA una actividad, el mundo se CONGELA (jefe, secuaces,
    // reloj, sospecha pasiva) y lo único que corre es el minijuego y su
    // cuenta atrás (`limite`) — el temporizador es lo que impide quedarse a
    // vivir en la activación. La exposición vive ANTES (conseguir el objeto)
    // y DESPUÉS (el aguante, con el mundo ya vivo).
    this.worldFrozen = false;
    this._faltaToastAt = new Map();
    this._wasPretending = false;
  }

  /**
   * RECOGER algo, sea coartada o botín. Un solo camino a propósito: los dos
   * se cogen igual y lo único que los separa es su factor `sospecha`.
   *
   * El factor se guarda aparte del inventario porque el inventario es un
   * conjunto de ids —lo que preguntan las actividades— y aquí hace falta el
   * NÚMERO. Guardar el objeto entero en el Set obligaría a buscarlo por id
   * en cada comprobación de "¿tengo el HDMI?", que corren por frame.
   */
  _recoger(item) {
    if (this.inventario.has(item.id)) return;
    this.inventario.add(item.id);
    if (item.sospecha != null) this._factorLlevado.set(item.id, item.sospecha);
    const efecto =
      item.sospecha == null || item.sospecha === 1
        ? ""
        : item.sospecha < 1
          ? " · tapadera: llamas menos la atención"
          : " · te delata mientras lo lleves";
    this.toast(`Conseguiste: ${item.nombre}${efecto}`);
    if (item.pista && item.coartada) this.toast(item.pista);
  }

  /**
   * EL CAMUFLAJE: cuánto multiplica lo que llevas encima a la sospecha que
   * acumula un secuaz por VERTE PASAR. Es el equivalente de oficina a la
   * ropa del mapache en Sneaky Sasquatch — la progresión que hace que el
   * piso apriete menos según inviertes, en vez de apretar igual en el
   * minuto 1 que en el 4.
   *
   * Multiplica en vez de sumar para que acumular coartadas rinda cada vez
   * menos (0.55 × 0.7 = 0.39, no 0.25) y llevar botín y tapadera a la vez
   * se compense de verdad. El suelo evita que dos papeles te vuelvan
   * invisible: por debajo de eso, esconderse dejaría de tener sentido.
   */
  _camuflaje() {
    let f = 1;
    for (const v of this._factorLlevado.values()) f *= v;
    return Math.max(CAMUFLAJE_MIN, Math.min(CAMUFLAJE_MAX, f));
  }

  /**
   * BANCAR una actividad encendida: la misión cae y el AGUANTE pagado.
   * Cuanto más tiempo la sostuviste con el mundo vivo, más reloj — la
   * calificación por aguantar que pide el diseño.
   */
  _bankActivity(st) {
    if (st.done) return;
    st.done = true;
    st.progress = st.time;
    st.limiteLeft = null;
    const held = st.aguante ?? 0;
    this.announce(`¡${st.label.toUpperCase()}: LISTO!`, "ok");
    this._completeActivity(st);
    // EL AGUANTE SE PAGA EN ENERGÍA, no en reloj. Antes alargaba la jornada,
    // y la jornada ya no se alarga: dura siempre lo mismo. La energía es
    // ahora el único recurso que se administra, así que es la moneda con la
    // que tiene sentido premiar haber sostenido algo prohibido a la vista.
    const extra = Math.round(held * AGUANTE_RATE);
    if (extra > 0) {
      this.energy = Math.min(this.energyMax, this.energy + extra);
      this._grantTime(0, {
        at: this.player.position,
        label: `+${extra} energía`,
        sub: `aguantaste ${Math.round(held)}s`,
        kind: "nerve",
      });
    }
    // EL BOTÍN SE GASTA. Le da su arco al contrabando: lo robas y desde ese
    // momento te delata (factor > 1), hasta que lo USAS en su actividad y
    // vuelves a estar limpia. Dejarlo en el inventario todo el día lo
    // convertiría en un castigo permanente por haber jugado bien.
    if (st.objeto?.id) {
      this.inventario.delete(st.objeto.id);
      this._factorLlevado.delete(st.objeto.id);
    }
    this.onMissionDone?.(st.id);
  }

  /**
   * El aviso de "te falta el objeto", sin ametrallar: uno cada pocos
   * segundos. En DOS niveles, para que no haya que interpretar nada:
   * el anuncio grande dice QUÉ te falta, y el toast dice DÓNDE o CON
   * QUIÉN se consigue (la `pista` del JSON, o se deduce de `de`/`en`).
   */
  _faltaObjeto(st) {
    const now = performance.now();
    if (now - (this._faltaToastAt.get(st.id) ?? 0) < 4000) return;
    this._faltaToastAt.set(st.id, now);
    const o = st.objeto;
    this.announce(`TE FALTA: ${o.nombre.toUpperCase()}`, "warn");
    const donde =
      o.pista ??
      (o.de ? `pídeselo a ${o.de[0].toUpperCase()}${o.de.slice(1)}` : null) ??
      (o.en?.sala ? `búscalo en ${o.en.sala}` : null);
    if (donde) this.toast(`Cómo conseguirlo: ${donde}`);
  }

  /** Story beats and menus freeze the world without tearing the level down. */
  setPaused(paused) {
    this.paused = paused;
    if (paused) {
      // Drop held keys so the player doesn't resume mid-interaction.
      this.player.keys.clear();
      this.player.touchAxis.x = 0;
      this.player.touchAxis.z = 0;
      // Y se devuelve el paso. Con `update()` saliendo antes por la pausa, el
      // bloqueo del gesto se quedaría puesto: quien pausara a mitad de una
      // tarea volvería sin poder andar hasta tocar una estación otra vez.
      this.player.inputLocked = false;
      this.pulse.end();
      this.gesture.end();
    }
  }

  update(dt) {
    if (this.gameOver || this.paused) {
      // El pulso se apaga al pausar. Sin esto la tira se quedaba encendida
      // ENCIMA del menú de pausa y del aviso de alarma —`update` sale por
      // aquí antes de llegar a apagarla— y además dejaba al motor creyendo
      // que sigues en la actividad después de reanudar desde otro sitio.
      this.pulse.end();
      this.hud.render(this._snapshot());
      return;
    }

    // El tiempo pasa más rápido cuando finges trabajo. Y pasa SIEMPRE: el
    // reloj de jornada ya no se detiene mientras activas una actividad —
    // parar el día para jugar un minijuego era otra forma de que la estación
    // fuera el sitio más seguro del piso.
    const effectiveDt = dt * (this.player.isPretending ? PRETEND_TIME_SPEED : 1);
    this.timeLeft = Math.max(0, this.timeLeft - effectiveDt);
    this.timeSpent += effectiveDt;
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
    // SPACE/ENTER es la tecla unificada para acciones y fingir (según contexto)
    const holdingSpace = this.player.keys.has(" ") || this.player.keys.has("enter");
    // Fingir/sentarse es un INTERRUPTOR, no una tecla que sostener: un toque
    // te sienta y te quedas así hasta que (a) vuelves a tocar la tecla, (b)
    // sales del sitio o deja de ser usable (se ocupa, se gasta), o (c) algo
    // te fuerza a levantarte (una amonestación). Mantenerla apretada un
    // minuto entero era agotador de verdad con el pulgar en móvil, y no
    // aportaba nada que un interruptor no diera igual de bien.
    const spacePressedEdge = holdingSpace && !this._prevInteractKey;
    const inUsableSpot = this._standingInUsableSafeSpot(pos);
    if (spacePressedEdge) {
      this._pretendToggle = this._pretendToggle ? false : inUsableSpot;
    } else if (this._pretendToggle && !inUsableSpot) {
      // Te moviste fuera, o el sitio se ocupó/gastó bajo tus pies: de pie.
      this._pretendToggle = false;
    }
    this.player.isPretending = this._pretendToggle;
    // El sabor, en la TRANSICIÓN a false→true — una vez por sesión de fingir,
    // no cada frame que mantienes la tecla. Puro texto: no toca timeLeft,
    // energy ni suspicion, así que fingir sigue siendo el colchón gratis.
    if (this.player.isPretending && !this._wasPretending) {
      this.toast(PRETEND_FLAVOR[Math.floor(Math.random() * PRETEND_FLAVOR.length)]);
    }
    this._wasPretending = this.player.isPretending;

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
    this._updateCampaignObjectives(dt);

    // "Tu sitio" ya no es media planta: es exactamente el lugar seguro en el
    // que estás. Fuera de ahí, estás fuera de tu puesto.
    this.inWorkspace = !!this.currentSafeSpot;

    // Con la puerta sin superar no hay estación que valga: las tareas reales
    // ni existen todavía para la jugadora (ver `_snapshot`, que en su lugar
    // enseña la tarea de conocer al jefe).
    // SOLO estaciones de verdad: una misión DINÁMICA (fingir, hablar con
    // alguien) ancla su marcador a lo que tenga más cerca — el fingir-101 se
    // pegaba al lugar seguro en el que estuvieras y, como "nearStation",
    // bloqueaba recoger objetos y hablaba en nombre de una estación que no
    // existe. Las dinámicas se cumplen por su propio camino
    // (_updateCampaignObjectives / completeTalk), no por esta vía.
    this.nearStation = this.metGabo
      ? this.objectives.find(
          (s) => !s.done && !s.dynamic && Math.hypot(s.x - pos.x, s.z - pos.z) < INTERACT_RADIUS
        ) ?? null
      : null;

    // The compass always points at the closest thing still to do, so you are
    // never left wondering where the next task is. Un `for` sencillo en vez
    // de filter+reduce+Object.assign: eso corría cada frame y de paso
    // mutaba los objetivos con un campo `_d` que nadie leía después.
    this.focusStation = null;
    if (!this.metGabo && this.gate) {
      // Antes de conocerlo, la flecha apunta al propio jefe: es la única
      // "tarea" que existe.
      const t = this._gateObjectives[0];
      this.focusStation = { x: this.boss.position.x, z: this.boss.position.z, label: t.label, icon: t.icon };
    } else {
      // Si la jugadora eligió una misión con las teclas 1–3, la brújula la
      // respeta mientras siga pendiente; si no (o ya está hecha), vuelve al
      // automático: la pendiente más cercana.
      const preferred = this.preferredObjectiveId
        ? this.objectives.find((s) => s.id === this.preferredObjectiveId && !s.done)
        : null;
      if (preferred) {
        this.focusStation = preferred;
      } else {
        let focusDist = Infinity;
        for (const s of this.objectives) {
          if (s.done) continue;
          const d = Math.hypot(s.x - pos.x, s.z - pos.z);
          if (d < focusDist) {
            focusDist = d;
            this.focusStation = s;
          }
        }
      }
    }

    this.worldFrozen = false;
    // ── LA GRACIA DEL TOQUE ──────────────────────────────────────────
    // El pulso se juega SOLTANDO y volviendo a tocar la MISMA tecla que
    // sostiene la actividad. Sin esta gracia, el frame en que sueltas caía
    // en la rama de "te fuiste": pulse.end(), y el begin() del re-toque
    // reseteaba los aciertos — o sea que tocar al ritmo, lo que el juego
    // te PIDE hacer, era literalmente imposible por teclado. El test lo
    // tapaba llamando a hit() directo. Solo aplica al PULSO (el gesto se
    // suelta en el acto, como siempre): 0.35 s de margen entre toques, y
    // se anula al agotarse el plazo de la activación (_activityTimeout).
    const TAP_GRACE = 0.35;
    const enActividad = this.nearStation && !this.player.isPretending && this.metGabo;
    if (enActividad && holdingSpace) {
      this._tapGrace = TAP_GRACE;
    } else if (
      enActividad &&
      this.player.isDoingActivity &&
      !this.nearStation.gesto &&
      (this._tapGrace ?? 0) > 0
    ) {
      this._tapGrace -= dt;
    } else {
      this._tapGrace = 0;
    }
    const sosteniendoActividad = enActividad && (holdingSpace || this._tapGrace > 0);
    if (sosteniendoActividad) {
      const st = this.nearStation;
      // ── CONSEGUIR primero: sin el objeto no hay actividad ──
      if (st.objeto && !this.inventario.has(st.objeto.id)) {
        this._faltaObjeto(st);
        this.pulse.end();
        this.gesture.end();
        this.player.inputLocked = false;
        this.player.isDoingActivity = false;
        this._updatePretendPose();
      } else {
        this.canvas?.focus?.();
        this.player.isDoingActivity = true;
        // La pose sale del JSON de la actividad (`pose`, ver scenes/*.json); si
        // el personaje no tiene hoja de acciones, sprite.js la ignora.
        this.player.pose = st.pose ?? null;
        // DE CARA A LA CÁMARA, con su giro normal de andar (setHeading hace
        // el tween — nada se teletransporta). La cámara ya NO orbita durante
        // las acciones (solo se acerca): el que se mueve para que la pose se
        // vea de frente es el personaje, que es más barato y nunca marea.
        const camYaw = (getCameraSettings().yawDeg * Math.PI) / 180;
        this.player.sprite.setHeading(Math.sin(camYaw), Math.cos(camYaw));

        if (st.encendida && !st.done) {
          // ── AGUANTAR: la actividad YA está activada y el mundo VIVE ──
          // Cada segundo sostenida a la vista paga extra; al techo se banca
          // sola (soltar o irte también banca — ver el barrido de abajo).
          this.pulse.end();
          this.gesture.end();
          this.player.inputLocked = false;
          st.aguante = Math.min(AGUANTE_MAX, (st.aguante ?? 0) + dt);
          if (st.aguante >= AGUANTE_MAX) this._bankActivity(st);
        } else if (!st.done) {
          // ── ACTIVAR: el minijuego, CON EL PISO VIVO ──────────────────
          // Esto congelaba el mundo entero (jefe, secuaces, reloj, sospecha)
          // y era el fallo que rompía la captura: mantener espacio en
          // cualquier estación dejaba a Gabo de estatua a un palmo, en rojo,
          // sin llegar a tocarte nunca. Y vaciaba el propio minijuego —sin
          // nadie acercándose no hay nada que apretar—, que es justo lo que
          // `activityGame.js` lleva avisado desde el principio: «un minijuego
          // que congela al jefe convierte las estaciones en el sitio MÁS
          // SEGURO del piso». Lo era. Ahora una tarea EXPONE, que es su
          // función. La cuenta atrás (`limite`) sigue siendo el freno.
          // Una estación juega al GESTO o al PULSO, según su JSON. Nunca a
          // los dos: pedir ritmo y pulso firme a la vez no es difícil, es
          // ruido.
          const conGesto = !!st.gesto;
          let ritmo = 1;
          if (conGesto) {
            this.pulse.end();
            this.gesture.begin(st);
            // El paso se bloquea MIENTRAS dura el gesto: el eje del mando
            // queda libre y no hace falta tecla nueva. Se sale soltando la
            // tecla de acción (la rama `else` de fuera lo devuelve).
            this.player.inputLocked = true;
            ritmo = this.gesture.update(dt, this.player.readIntent());
          } else {
            this.gesture.end();
            this.pulse.begin(st);
            this.pulse.update(dt);
            // MANTENER YA NO TERMINA LA TAREA. Avanza a paso de tortuga —lo
            // justo para que soltar no sea un castigo— y lo que la termina
            // son los toques al ritmo. Con esto en 1, que es como estuvo, el
            // pulso era decoración: se podía jugar el día entero sin tocar
            // un solo minijuego. (Cambia el invariante viejo de «mantener la
            // termina igual, lento»: era el suelo, y el suelo se había
            // comido el juego.)
            ritmo = this.pulse.ritmoMantenido;
          }

          this._updateActivityDeadline(dt, st);
          st.progress = Math.min(st.time, st.progress + dt * ritmo);
          if (st.progress >= st.time && !st.encendida) {
            // ¡ENCENDIDA! El minijuego cobró su limpieza; el mundo vuelve a
            // correr y empieza el aguante. La misión cae al BANCAR, no aquí.
            st.encendida = true;
            st.aguante = 0;
            const bonus = conGesto ? this.gesture.bonusReloj() : this.pulse.bonusReloj();
            if (bonus > 0) {
              this._grantTime(bonus, {
                at: this.player.position,
                sub: "sin que se note",
                kind: "nerve",
              });
            }
            this.pulse.end();
            this.gesture.end();
            this.player.inputLocked = false;
            st.limiteLeft = null;
            this.toast(`${st.label}: en marcha. AGUANTA para que cuente más.`);
          }
        }
      }
    } else {
      this.pulse.end();
      this.gesture.end();
      this.player.inputLocked = false;
      this.player.isDoingActivity = false;
      this._updatePretendPose();
    }

    // BANCAR lo encendido que ya no sostienes: soltaste la tecla, te fuiste
    // o te sacaron — el aguante acumulado se cobra y la misión cae. Vive
    // fuera de la rama para cubrir TODAS las formas de soltar.
    for (const o of this.objectives) {
      if (!o.encendida || o.done) continue;
      if (o === this.nearStation && this.player.isDoingActivity) continue;
      this._bankActivity(o);
    }

    // LA CUENTA ATRÁS SIGUE CORRIENDO AUNQUE TE VAYAS. Es lo que la convierte
    // en presión de verdad: empezaste algo prohibido, y dejarlo a medias para
    // huir del jefe no congela el reloj de la tarea — vuelves con lo que
    // queda. Por eso vive aquí fuera y no dentro de la rama de arriba.
    for (const o of this.objectives) {
      if (o === this.nearStation && this.player.isDoingActivity) continue;
      if (o.done || o.limiteLeft == null) continue;
      this._updateActivityDeadline(dt, o);
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
    // Mientras la puerta del día siga sin superar, el guardián (el jefe) es
    // la ÚNICA excepción: se le puede abordar como a un amigo, porque
    // "encontrarlo" es literalmente la tarea. Una vez conocido, vuelve a su
    // trato normal (solo habla si te amonesta).
    const guardApproachable =
      this.gate &&
      !this.metGabo &&
      this.boss.cast === this.gate.guard &&
      !this.boss.isHunting &&
      (this.talkCooldowns.get(this.boss.id ?? this.boss.cast) ?? 0) <= 0 &&
      Math.hypot(this.boss.position.x - pos.x, this.boss.position.z - pos.z) < INTERACT_RADIUS * 1.3
        ? this.boss
        : null;
    this.nearNpc =
      this.npcs.find(
        (n) =>
          n.active !== false && // el doble del personaje elegido está apagado
          n.cast &&
          (this.talkCooldowns.get(n.id) ?? 0) <= 0 &&
          Math.hypot(n.position.x - pos.x, n.position.z - pos.z) < INTERACT_RADIUS * 1.3
      ) ?? guardApproachable;

    // Los OBJETOS por recoger (bucle v2: conseguir → activar → aguantar).
    // El punto de recogida es la sala que los guarda; robarlo exige que NO
    // esté ocupada — con gente dentro, alguien te vería llevártelo.
    this.nearItem = null;
    if (this.metGabo) {
      for (const it of this._itemSpots) {
        if (this.inventario.has(it.id)) continue;
        if (Math.hypot(it.x - pos.x, it.z - pos.z) < INTERACT_RADIUS * 1.2) {
          this.nearItem = it;
          break;
        }
      }
    }

    if (holdingSpace && !this._prevInteractKey && this.nearNpc && !this.nearStation) {
      this.canvas?.focus?.();
      const npc = this.nearNpc;
      this.talkCooldowns.set(npc.id ?? npc.cast, npc.talkCooldown ?? 40);
      this.onTalk?.(npc);
    } else if (holdingSpace && !this._prevInteractKey && this.nearItem && !this.nearStation) {
      const it = this.nearItem;
      if (this.safeSpotState[it.salaIndex]?.busyLeft > 0) {
        this.toast(`${it.nombre}: la sala está OCUPADA. Una distracción los sacaría…`);
      } else {
        this._recoger(it);
        sfxComplete();
      }
    } else if (holdingSpace && !this._prevInteractKey && this.nearDistraction && !this.nearStation) {
      const target = { x: this.nearDistraction.x, z: this.nearDistraction.z };
      if (this.boss.distract(target, DISTRACTION_EFFECT_DURATION)) {
        this.nearDistraction.cooldownLeft = this.nearDistraction.cooldown;
        this.toast(`Distracción: ${this.nearDistraction.label}`);
        sfxDistraction();
        this.award(40, "Distracción", this.player.position);
        // Y LA GENTE SALE A MIRAR: las salas ocupadas cercanas se vacían un
        // rato — la ventana para robarte lo que guardan (el HDMI de la peli).
        safeSpots.forEach((s, i) => {
          const st = this.safeSpotState[i];
          if (st.busyLeft > 0 && Math.hypot(s.x - target.x, s.z - target.z) < 12 * S) {
            st.busyLeft = 0;
            st.nextBusy = (s.busyEvery ?? 60) * (0.6 + Math.random() * 0.5);
            this.toast(`${s.label}: salieron a mirar el alboroto.`);
          }
        });
      } else {
        this.toast("¡Ya te vio! Una distracción no lo detiene ahora.", 2, "danger");
      }
    } else if (holdingSpace && !this._prevInteractKey && this.nearStation && this.pulse.active) {
      // EL TOQUE DEL PULSO. Es un flanco de subida sobre la MISMA tecla que
      // mantiene la actividad: mantener pulsado avanza lento, y soltar y
      // volver a pulsar al ritmo avanza rápido. Una tecla, dos niveles de
      // implicación — y quien no se entere de que existe termina la tarea
      // igual, que era la condición para poder meter esto.
      this.pulse.hit();
    }
    this._prevInteractKey = holdingSpace;

    // El jefe necesita saber cuánta sospecha hay YA para decidir si tantea
    // (fase lenta) o va con todo (fase rápida, ver boss.js/_speed()).
    this.boss.suspicion = this.suspicion;
    // Y en qué FRACCIÓN del medidor va: el halo se tiñe con ella (verdoso
    // tranquilo → ámbar → rojo) para que el nivel de sospecha se lea del
    // suelo, sin mirar el HUD. El jefe ES el medidor compartido, así que su
    // halo sigue leyendo directamente de él. Cada secuaz, en cambio, lleva
    // SU PROPIO `localHeat` — se actualiza más abajo, junto al resto de la
    // sospecha, porque necesita `outOfPlace` (y por qué es individual está
    // explicado ahí).
    this.boss.localHeat = this.suspicion / (this.suspicionConfig.max || 100);

    // Un NPC apagado (el doble del personaje elegido) tampoco tapa la vista
    // del jefe: no está ahí para nadie. Se reutiliza el mismo array entre
    // frames en vez de `.filter()` (que aloja uno nuevo cada vez) — el jefe
    // y cada secuaz vuelven a pedir esta lista todos los frames.
    this._liveNpcsBuf = this._liveNpcsBuf ?? [];
    this._liveNpcsBuf.length = 0;
    for (const n of this.npcs) if (n.active !== false) this._liveNpcsBuf.push(n);
    const liveNpcs = this._liveNpcsBuf;
    // Boss is inactive (won't pursue) until player meets them
    this.boss._playerMetBoss = this.metGabo;
    // CON EL MUNDO CONGELADO (activando una actividad) los vigilantes no se
    // mueven ni abordan: el modo de juego es suyo, y su amenaza es el
    // temporizador — la caza vuelve en cuanto la actividad se enciende.
    // ── EL MUNDO YA NO SE CONGELA ───────────────────────────────────
    // `worldFrozen` paraba al jefe, a los secuaces y al reloj mientras
    // ACTIVABAS una actividad. Sobre el papel era «el minijuego es su propio
    // modo»; en la mano era el fallo que rompía la captura: bastaba con
    // mantener espacio en cualquier estación para que Gabo se quedara de
    // estatua a un palmo de ti, en rojo, sin llegar a tocarte nunca. Y de
    // paso vaciaba el minijuego, porque sin nadie acercándose no hay nada
    // que apretar.
    //
    // Es, literalmente, lo que el propio motor llevaba avisado desde antes
    // del bucle v2: «un minijuego que congela al jefe convertiría las
    // estaciones en el sitio más seguro del piso». Lo era.
    //
    // La bandera se queda (la leen el HUD y las comprobaciones) pero ya no
    // detiene a nadie: una tarea TIENE que exponerte.
    {
      this.boss.update(dt, this.player, liveNpcs);
      this.minions.forEach((m) => {
        if (m.id === "crispo") {
          m._playerMetMinion = this.metGabo;
        }
        m.update(dt, this.player, liveNpcs);
      });
      this._updateMinionCatch();
      this._updateMinionApproach();
      // El plazo de silencio tras delatar. Va aquí, con el mundo VIVO: con
      // el mundo congelado (activando una actividad) nadie observa nada, así
      // que tampoco se le debe descontar el plazo a nadie.
      for (const m of this.minions) {
        if ((m._delacionCooldown ?? 0) > 0) m._delacionCooldown = Math.max(0, m._delacionCooldown - dt);
      }
    }
    this._updateEggs(dt);
    this._updateBumps(dt);
    this._updateCrowdSeparation();
    this._updateSpeedMul();

    // ---- Suspicion ----
    const susCfg = this.suspicionConfig;
    if (this.gate && !this.metGabo) {
      // Antes de conocer al guardián de la puerta del día no hay nada que
      // reprochar todavía: ni tareas que hacer mal, ni vigilancia activa.
      this.suspicion = 0;
      this._decayMinionHeat(dt);
    } else if (this.rules.explore) {
      // Kiara ya renunció: nada de esto le afecta.
      this.suspicion = 0;
      this._decayMinionHeat(dt);
    } else if (this.inSafeSpot) {
      // Bebedero / baño / tu propia mesa: el jefe puede verte ahí y no cuenta.
      this.suspicion = Math.max(0, this.suspicion - susCfg.decayIdle * this.rules.decayMul * dt);
      this._decayMinionHeat(dt);
    } else {
      const decay = this.rules.decayMul;
      const outOfPlace = !this.player.isPretending && !this.inWorkspace;
      const highHeat = this.suspicion >= susCfg.captureThreshold;

      // VIGILANCIA INDIVIDUAL: cada secuaz acumula SU PROPIO calor aparte
      // de lo de abajo — es lo que pinta SU halo y lo que le hace romper la
      // ronda para seguirte (ver boss.js). Que te pille en plena actividad
      // prohibida lo dispara rápido; que te vea suelta fuera de tu puesto,
      // más despacio; si no te ve, decae.
      // El camuflaje SOLO tapa el paseo. Que te pillen en plena actividad
      // prohibida va por `MINION_HEAT_RISE_CAUGHT` y no se puede disimular:
      // nadie para a quien cruza el pasillo con un acta en la mano, pero
      // llevarla no salva a quien está viendo una película en la sala.
      const camuflaje = this._camuflaje();
      for (const m of this.minions) {
        const rising = m.redAlert
          ? MINION_HEAT_RISE_CAUGHT
          : m.playerVisible && outOfPlace
            ? MINION_HEAT_RISE_SEEN * camuflaje
            : 0;
        m.localHeat =
          rising > 0
            ? Math.min(1, m.localHeat + rising * dt)
            : Math.max(0, m.localHeat - MINION_HEAT_DECAY * dt);
      }

      // ── LA DELACIÓN ─────────────────────────────────────────────────
      // El medidor compartido es LO QUE GABO SABE, no un ambiente. Y a Gabo
      // se le entera de dos maneras: viéndolo él (más abajo) o porque
      // alguien se lo CUENTE.
      //
      // Antes esto era un goteo: mientras algún secuaz tuviera su umbral
      // cruzado, el HUD subía solo, unos puntos por segundo. Se leía como
      // clima —la barra sube porque sí— y no había un instante al que
      // señalar. Ahora es un SUCESO, como el campista de Sneaky Sasquatch
      // que llena su barra y va a buscar al guardabosques: cuando un secuaz
      // CRUZA su umbral (flanco, no estado) pega el aviso de una vez, con
      // nombre y apellido en pantalla, y se calla un rato (`reportingCooldown`).
      //
      // Que sea un salto y no una rampa es lo que le da escalada al día: con
      // `chaseSuspicionFloor` en 40, dos delaciones te dejan cerca y la
      // tercera pone a Gabo a cazar. Y como el aro del globo se llena a la
      // vista (alertIcon.js), la delación se puede VER venir — que es la
      // mitad del trato: te avisamos, tú decides si te da tiempo.
      const minionCaught = this.minions.some((m) => m.redAlert);
      if (minionCaught && !this.boss.redAlert) {
        this.suspicion = Math.min(
          susCfg.max,
          this.suspicion + MINION_CAUGHT_RATE * this.rules.minionSuspicionMul * dt
        );
      }
      for (const m of this.minions) {
        const cruzado = m.localHeat >= m.followThreshold;
        const flanco = cruzado && !m._yaDelataba;
        m._yaDelataba = cruzado;
        if (!flanco || this.boss.redAlert || (m._delacionCooldown ?? 0) > 0) continue;
        m._delacionCooldown = this.boss.reportingCooldown ?? 6.5;
        this.suspicion = Math.min(
          susCfg.max,
          this.suspicion + DELATION_JUMP * this.rules.minionSuspicionMul
        );
        this.announce(`¡${(m.displayName ?? "ALGUIEN").toUpperCase()} TE DELATÓ!`, "danger");
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

    // CON EL MEDIDOR EN CERO (SOSTENIDO) LA CAZA SE ACABA. Si lograste
    // enfriar la sospecha del todo, el jefe ya no tiene nada que reprocharte
    // y quedarse plantado a tu lado bloqueaba el resto de tareas: suelta la
    // presa, respira (gracia) y vuelve a su ronda. El sostenido (1.5 s en
    // cero seguidos) evita que un lockedOn recién ganado con el medidor aún
    // frío se esfume en un frame — esconderse sigue sin salvarte en caliente.
    // No aplica si te está viendo EN FALTA ahora mismo (redAlert).
    if (this.suspicion <= 0 && this.boss.isHunting && !this.boss.redAlert) {
      this._coldFor = (this._coldFor ?? 0) + dt;
      if (this._coldFor >= 1.5) {
        this._coldFor = 0;
        this.boss.breakPursuit();
        this.boss.grantGrace(3);
        this.toast("Gabo se aburrió: vuelve a su ronda.");
      }
    } else {
      this._coldFor = 0;
    }

    // El nivel de búsqueda tampoco corre congelado: sus soplos mandan al
    // jefe a tu posición, y un jefe quieto recibiendo chivatazos los
    // ejecutaría todos de golpe al descongelar.
    this._updateHeat(dt);

    // Fingiendo con poca sospecha eres intocable, y un escondite o un lugar
    // seguro te cubren MIENTRAS el jefe todavía no te tiene en la mira ni te
    // persigue. Pero en cuanto entra en caza activa (CHASE/SEARCH), ya sabe
    // dónde estás o adónde ibas: fingir o escondes no sirve, solo un lugar
    // seguro de verdad corta la persecución. `pretendAlways` (un modo de
    // personaje futuro) es la única excepción explícita a esa regla.
    const pretendAlwaysImmune = this.player.isPretending && this.rules.pretendAlways;
    // ── POR QUÉ NO SOLO `isHunting` ──────────────────────────────────
    // Esto exigía que el jefe estuviera CAZANDO (CHASE/SEARCH), y por
    // debajo de `chaseSuspicionFloor` no caza nunca: se plantaba encima de
    // ti mientras hacías algo prohibido y no pasaba absolutamente nada.
    // Con la correa del día 1 —que lo mantiene rondándote— eso es la mitad
    // de la jornada, y se leía como que el juego a veces no amonesta.
    //
    // `redAlert` cierra el hueco sin tocar el respiro: sigue sin CORRER a
    // por ti con la sospecha baja, pero si te tiene delante y te está
    // viendo en falta, te amonesta. Que es lo que haría un jefe.
    const caught =
      !this.rules.explore &&
      this._caughtCooldown <= 0 &&
      (this.boss.isHunting || this.boss.redAlert) &&
      !this.inSafeSpot &&
      !pretendAlwaysImmune &&
      this.boss.catches(pos, this.player.radius);

    // La amonestación llega cuando el jefe te aborda de verdad, no en cuanto
    // el medidor toca el tope: al 100% ya viene a por ti con toda su furia
    // (nivel de búsqueda 4), así que el encuentro no tarda, pero es el
    // encuentro el que cuenta.
    if (caught) this._warn();

    // LA AMONESTACIÓN ES FÍSICA, SIEMPRE: solo cae cuando el jefe te TOCA
    // (boss.catches, arriba). Hubo un atajo que la disparaba sola tras unos
    // segundos con el medidor clavado en 100 ("te vieron desde la otra
    // punta"), y en la práctica se sentía arbitrario: te caía el castigo sin
    // que nadie llegara. Al 100% el jefe ya viene a por ti con el nivel de
    // búsqueda al máximo; que tenga que alcanzarte ES el juego.

    this._updateEnergy(dt, caught);

    if (!this.gameOver && !this.rules.explore) {
      this._updateClosingTime();
      if (this.exitOpen && this.currentArea?.kind === "elevator") this._finish(true);
      else if (this.timeLeft <= 0) this._lockedIn();
    }

    if (this.message) {
      this.message.timer -= dt;
      if (this.message.timer <= 0) this.message = null;
    }
    if (this.bigMessage) {
      this.bigMessage.timer -= dt;
      if (this.bigMessage.timer <= 0) this.bigMessage = null;
    }
    if (this._actionFlash) {
      this._actionFlash.timer -= dt;
      if (this._actionFlash.timer <= 0) this._actionFlash = null;
    }

    // LAS CARITAS: te lo estás pasando bien. Salen mientras ACTIVAS una
    // actividad y mientras la AGUANTAS encendida — las dos mitades del
    // escaqueo. Es el reverso del Zzz, que sale cuando el día te ha podido:
    // los dos globos hablan de tu estado y juntos cuentan el bucle entero.
    // Fingir que trabajas NO cuenta: es lo que más cansa (ENERGY_DRAIN_
    // PRETEND), y premiarlo con caritas contradiría el chiste.
    this.player.isEnjoying =
      !this.gameOver &&
      (this.player.isDoingActivity || this.objectives.some((o) => o.encendida && !o.done));

    // ── LA SIESTA TAMBIÉN LLEVA ZZZ, Y NO CARITA ─────────────────────────
    // Echarte una cabezada en el escritorio es dormir, aunque lo hayas
    // elegido tú: lo cuenta el ZZZ sobre la cabeza, que es lo que se lee
    // desde el otro lado del piso. Antes lo contaba una CAMA que la pose
    // montaba a tus pies — un colchón apareciendo en tu puesto se leía como
    // un fallo, así que se retiró del motor (ver POSE_LIBRARY).
    //
    // Va DESPUÉS de `_updateEnergy`, que pone `isAsleep = false` cuando no
    // estás agotada: escrito antes, se borraría en el mismo cuadro.
    // Solo mientras la ESTÁS haciendo, no mientras siga encendida: una
    // actividad encendida sigue corriendo aunque te alejes, y un Zzz sobre
    // alguien que camina por el pasillo diría que va dormida andando.
    const siesta =
      !this.gameOver && this.player.isDoingActivity && this._enSiesta(this.nearStation);
    if (siesta) {
      this.player.isAsleep = true;
      // Los dos globos son excluyentes: dormida no te lo estás pasando bien
      // (`player.js` ya lo respeta, pero se apaga aquí para que el snapshot
      // no diga las dos cosas a la vez).
      this.player.isEnjoying = false;
    }

    // "¡GABO TE VIO!": el momento en que arranca una caza es EL golpe del
    // juego, y merece el anuncio grande — no un cambio de color que hay que
    // notar de reojo. Solo en la TRANSICIÓN a CHASE, nunca cada frame. Y si
    // ESTE MISMO frame ya gritó otra cosa (el ¡TE ATRAPÓ! de una captura a
    // bocajarro: caza y toque en el mismo instante), esa gana — anunciar
    // "te vio" cuando ya te tiene era pisar el golpe grande con el chico.
    if (this.boss.state !== this._prevBossState) {
      const yaGrito = this.bigMessage && this.bigMessage.timer > 2.1;
      if (this.boss.state === BOSS_STATES.CHASE && this.metGabo && !this.gameOver && !yaGrito) {
        this.announce(`¡${(this.boss.displayName ?? "GABO").toUpperCase()} TE VIO!`, "danger");
      }
      this._prevBossState = this.boss.state;
    }

    this.hud.render(this._snapshot());
  }

  /**
   * LA CUENTA ATRÁS DE UNA TAREA.
   *
   * Empieza en el momento en que te pones, y desde ahí ya no para: es lo que
   * hace que empezar algo prohibido sea una DECISIÓN y no un trámite. Solo
   * las actividades que declaran `limite` en el JSON la tienen.
   *
   * El límite es SIEMPRE mayor que `time`, y eso lo comprueba
   * `npm run check:gesto`: si fuera al revés, mantener espacio dejaría de
   * poder terminar la tarea y el suelo del minijuego —lo único que garantiza
   * que nadie se quede encallado— se caería sin que nada fallara a la vista.
   */
  _updateActivityDeadline(dt, station) {
    if (!station || station.done || !(station.limite > 0)) return;
    if (station.limiteLeft == null) station.limiteLeft = station.limite;
    station.limiteLeft = Math.max(0, station.limiteLeft - dt);
    if (station.limiteLeft <= 0) this._activityTimeout(station);
  }

  /**
   * SE TE FUE EL TIEMPO, Y AHORA VIENE.
   *
   * Pierdes lo hecho y el jefe se pone en camino. Ojo con CÓMO se pone en
   * camino, porque es donde se cruzan dos invariantes:
   *
   *  - La amonestación es SIEMPRE física (`boss.catches`, un toque). Esto NO
   *    amonesta: te manda al jefe. Si llegas a un lugar seguro antes que él,
   *    no pasa nada — y esa carrera es justo el juego.
   *  - El jefe no persigue con la sospecha baja, y la puerta está en UN sitio
   *    (`Boss._mayChase`). Así que aquí no se salta la puerta: se SUBE la
   *    sospecha por encima del umbral y luego se llama a `startChase()` por
   *    la vía normal. Con el pico por debajo del suelo, la amenaza no
   *    llegaría nunca y la cuenta atrás sería un adorno.
   */
  _activityTimeout(station) {
    station.progress = 0;
    station.limiteLeft = null; // se puede reintentar, empezando de cero
    this.pulse.end();
    this.gesture.end();
    this.player.inputLocked = false;
    // SE SUELTA LA TECLA A LA FUERZA. Sin esto, el CUADRO SIGUIENTE volvía a
    // encontrar `holdingSpace && nearStation` true (nada le impide seguir
    // mash/holding tras fallar) y reentraba en ACTIVAR — worldFrozen otra
    // vez, con boss.update() saltado ANTES de que el jefe se hubiera movido
    // un centímetro desde que se puso "en camino". El resultado, medido: el
    // jefe se queda con state=CHASE/lockedOn=true para siempre y la
    // distancia no varía ni un milímetro en 40s de simulación — «el jefe no
    // captura», tal cual lo reportó la jugadora. Soltar la tecla obliga a un
    // gesto NUEVO de la jugadora para reintentar, y de paso dibuja bien el
    // fallo: espacio deja de sostener nada hasta que vuelva a pulsarlo.
    this.player.keys.delete(" ");
    this.player.keys.delete("enter");
    // Y la GRACIA del toque también se anula: si no, el mundo seguía
    // congelado sus últimas décimas después de agotarse el plazo — el
    // mismo agujero que las teclas, por la puerta de al lado.
    this._tapGrace = 0;

    const floor = this.boss.chaseSuspicionFloor ?? 0;
    this.suspicion = Math.min(
      this.suspicionConfig.max,
      Math.max(this.suspicion + TIMEOUT_HEAT, floor + TIMEOUT_HEAT_MARGIN)
    );
    this.boss.lastSeenPlayerPos = { x: this.player.position.x, z: this.player.position.z };
    // EL ORDEN IMPORTA. `_mayChase()` lee la sospecha DEL JEFE, y game.js se
    // la copia más abajo en el frame (junto al `localHeat`): sin este empujón
    // a mano, `startChase()` vería el valor del cuadro anterior, se quedaría
    // por debajo del umbral y saldría por la rama de "se acerca a mirar". O
    // sea: la cuenta atrás se agotaría y no vendría nadie.
    this.boss.suspicion = this.suspicion;
    this.boss.startChase();

    this.toast(`${station.label}: se te acabó el tiempo`, 2, "danger");
    this.hud?.menuBar?.notify?.({
      icon: "alert",
      text: `${station.label}: te descubrieron. Viene hacia ti.`,
      tone: "bad",
    });
    sfxWarn();
    buzz([40, 60, 40]);
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

    // `energy`, no `time` ni `reward`: `time` es lo que TARDA la actividad y
    // `reward` era lo que pagaba cuando esto daba reloj.
    //
    // Un escaqueo paga en ENERGÍA, y cuánto es un campo PROPIO porque las dos
    // escalas no se parecen: reutilizar `reward` dejaba al café —el más
    // barato de la lista, 17— como la peor recarga del piso, justo lo
    // contrario de lo que tiene que ser. `reward` se queda de suelo por si
    // una escena vieja no declara `energy`. El descaro sigue pagando: el
    // combo y el `nerve` de hacerlo con el jefe cerca multiplican igual.
    const bruto = (station.energy ?? station.reward ?? 20) * (this.combo + nerve);
    const gained = this.grantEnergy(bruto, station);

    this.combo = Math.min(COMBO_MAX, this.combo + COMBO_STEP);
    this.comboLeft = COMBO_WINDOW;

    if (station.perk) this.applyPerk(station.perk);

    buzz([12, 40, 18]);
    sfxComplete();
    this.toast(`${station.label}${nerveLabel} · +${gained} energía`);
    this._actionFlash = {
      icon: station.icon ?? "question",
      label: station.label,
      pose: station.pose ?? null,
      timer: 1.1,
    };
  }

  /**
   * EL RECONOCIMIENTO de que algo salió bien. **Ya no regala reloj.**
   *
   * LA JORNADA DURA SIEMPRE LO MISMO (decisión de diseño, agosto 2026). Antes
   * cada misión, secreto o distracción alargaba el día, y eso tenía dos
   * problemas: el reloj dejaba de significar «qué hora es» para significar
   * «cuánto has rendido» —o sea que había DOS medidores de rendimiento y
   * ninguno de tiempo—, y hacía imposible saber cuánto te queda, que es
   * justo lo que un reloj tiene que decir. La presión ahora la lleva la
   * ENERGÍA, que es la que se puede administrar.
   *
   * La función se queda porque sigue siendo la única puerta del «bien
   * hecho»: el globito sobre el sitio y su sonido. Lo que ya no hace es
   * tocar `timeLeft`. El globo dice QUÉ pasó, no cuántos segundos, que
   * además serían mentira.
   */
  _grantTime(seconds, { at, label = "", sub = "", kind = "minor" } = {}) {
    if (at) {
      const texto = label || sub || "¡bien!";
      this.onPopup?.({ text: texto.toUpperCase(), sub: label && sub ? sub : "", x: at.x, z: at.z, kind });
    }
    return 0;
  }

  /** El «bien hecho» de siempre. Ya NO alarga la jornada: ver `_grantTime`. */
  award(seconds, label, at) {
    return this._grantTime(seconds, { at, label, kind: "minor" });
  }

  /**
   * El peaje del trayecto: lo que tardaste EN LLEGAR se descuenta de la
   * jornada. Es lo que hace que el cruce de la avenida no sea gratis —
   * dudar en la acera también es llegar tarde a la oficina.
   *
   * No pasa por `_grantTime` a propósito: aquello mantiene `timeGained`
   * (lo GANADO, que enseña el HUD) y esto no es un premio negativo, es
   * presupuesto que nunca llegó a existir. Se descuenta del arranque, con
   * un suelo del 60% de la jornada para que un cruce desastroso nunca
   * deje el día perdido de antemano — castigar sí, sentenciar no.
   *
   * @param {number} seconds Tardanza a descontar, ya sin la gracia.
   * @returns {number} Lo descontado de verdad, tras el suelo.
   */
  applyCommuteDelay(seconds) {
    if (!(seconds > 0)) return 0;
    const floor = this.rules.duration * 0.6;
    const cut = Math.min(Math.round(seconds), Math.max(0, this.timeLeft - floor));
    this.timeLeft -= cut;
    if (cut > 0) {
      this.toast(`Llegaste tarde: -${cut}s de jornada`);
    }
    return cut;
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
    const bossBroke = this.boss.breakPursuit();
    let broke = bossBroke;
    for (const m of this.minions) broke = m.breakPursuit() || broke;
    // Y EL JEFE SE ALEJA, no solo suelta: sin esto retomaba la ronda en el
    // waypoint de al lado y "llegar a tu puesto" no cambiaba nada en
    // pantalla. Ver Boss.retreatFrom.
    if (bossBroke) {
      this.boss.retreatFrom(this.player.position);
      // Y el SOPLO espera: con búsqueda ≥2, _updateHeat manda al jefe a tu
      // posición cada tanto ("alguien le ha dicho por dónde andas") — y su
      // primer aviso caía justo después de soltar, pisando la retirada en
      // el mismo segundo. Acabas de sentarte donde te corresponde: el
      // chivatazo pierde frescura unos segundos.
      this._huntTimer = Math.max(this._huntTimer, 8);
      this.toast("A salvo: Gabo se aleja", 1, "ok");
    } else if (broke) {
      this.toast("Lugar seguro: dejan de perseguirte", 1, "ok");
    }
    return broke;
  }

  _updateSpeedMul() {
    // El radar de Washo frena por ÁREA, no por mirada: basta con estar dentro
    // de su alcance, mires por donde mires y mire él por donde mire. Es
    // exactamente lo que dibujan sus ondas en el suelo, así que el efecto se
    // entiende sin explicarlo.
    const washo = this.minions.find((m) => m.cast === "washo");
    const inRadar = washo?.active !== false && washo?.inRange(this.player.position);
    // Sin fuerzas, se arrastra: de ENERGY_SLOW_THRESHOLD a 0 interpola hasta
    // el suelo de velocidad. Lineal y sin corte — la energía ya se agota sin
    // avisar, no hace falta que además dé un salto.
    const eRatio = this.energyMax > 0 ? this.energy / this.energyMax : 1;
    const t = Math.max(0, Math.min(1, eRatio / ENERGY_SLOW_THRESHOLD));
    const energyMul = eRatio >= ENERGY_SLOW_THRESHOLD ? 1 : ENERGY_SLOW_MUL_FLOOR + (1 - ENERGY_SLOW_MUL_FLOOR) * t;
    this.player.speedMul = this._perkSpeedMul * energyMul * (inRadar ? WASHO_SLOW_MUL : 1);
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
        this.toast(`Nivel de búsqueda ${level}`, 1, "warn");
        // NIVEL 3 = ALARMA GENERAL, y eso no cabe en un toast que nadie ve
        // mientras esquiva mesas: el juego se PAUSA con un aviso a pantalla
        // completa (lo pinta el engine, ver onHeatAlert) y no sigue hasta
        // que pulses "Entendido" — y entonces, a correr. Solo salta una vez
        // por subida: se rearma al enfriarte por debajo del nivel 3.
        if (level >= 3 && !this._heatAlertShown && !this.gameOver) {
          this._heatAlertShown = true;
          this.setPaused(true);
          this.onHeatAlert?.(level);
        }
      }
      this.heat = level;
    }
    if (this.heat < 3) this._heatAlertShown = false;

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
   * FINGIR QUE TRABAJAS, SENTADA EN UNA SILLA DE VERDAD.
   *
   * Antes esto era una línea: pose `work` (de pie, tecleando en el aire) y
   * girarse de cara a la cámara. Ahora, si el lugar seguro en el que estás
   * tiene una silla libre a mano, te SIENTAS en ella — la del puesto, la que
   * ya está puesta en la mesa, no una que aparezca contigo.
   *
   * Se sienta en el FLANCO de subida y no cada cuadro, a propósito: fijar la
   * posición todos los frames dejaría el movimiento bloqueado mientras
   * mantienes espacio. Así te deslizas a la silla una vez y sigues siendo
   * dueña de tus piernas.
   *
   * Y solo vale una silla DENTRO del radio del propio lugar seguro: eso es
   * lo que garantiza que sentarte no te saque de él (que sería quitarte la
   * cobertura justo al usarla).
   *
   * Sin silla cerca —media planta no tiene— se queda en lo de siempre: de
   * pie, tecleando, de cara a la cámara para que el gesto se vea.
   */
  _updatePretendPose() {
    if (!this.player.isPretending) {
      this._pretendSeat = null;
      this.player.pose = null;
      return;
    }

    if (!this._pretendSeat) {
      const spot = this.currentSafeSpot;
      const seat = spot
        ? nearestFreeSeat(this.seats, this.player.position.x, this.player.position.z, spot.radius)
        : null;
      if (seat) {
        this._pretendSeat = seat;
        this.player.position.x = seat.x;
        this.player.position.z = seat.z;
        // Sentada de cara a SU MESA: es la única orientación en la que
        // sentarse a un escritorio significa algo. Se pierde el "de frente a
        // la cámara" de la versión de pie, y es un cambio buscado — un
        // muñeco sentado y tecleando en un puesto real se lee como trabajo
        // mucho antes que uno flotando de cara a ti.
        this.player.sprite.setHeading(Math.sin(seat.facing), Math.cos(seat.facing));
      }
    }

    if (this._pretendSeat) {
      this.player.pose = "sitWork";
      return;
    }

    // De pie: la pose de estar en el portátil, y de cara a la cámara —
    // mismo criterio que las actividades, el gesto es el premio y se ve de
    // frente sin que la cámara tenga que girar a buscarlo.
    this.player.pose = "work";
    const camYaw = (getCameraSettings().yawDeg * Math.PI) / 180;
    this.player.sprite.setHeading(Math.sin(camYaw), Math.cos(camYaw));
  }

  /**
   * Deja que la vigilancia individual de cada secuaz se enfríe sola cuando
   * ni siquiera hay sospecha compartida que gestionar (puerta sin superar,
   * modo exploración, lugar seguro): sin esto, un secuaz que te vio justo
   * antes de que entraras a la sala de reuniones se quedaba "sabiendo" que
   * andabas mal mientras fingías dentro, y salía siguiéndote al segundo de
   * pisar la puerta.
   */
  _decayMinionHeat(dt) {
    for (const m of this.minions) m.localHeat = Math.max(0, m.localHeat - MINION_HEAT_DECAY * dt);
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
   * CHOQUES ENTRE PERSONAJES, al estilo Overcooked: los cuerpos ocupan sitio.
   * Si te metes en un compañero (o en el jefe), los dos se empujan, salta un
   * "¡!" sobre cada uno y el arrollado se tambalea un instante. Es puro
   * feedback — no sube sospecha por sí mismo — pero hace físico un piso que
   * antes se atravesaba como niebla.
   */
  _updateBumps(dt) {
    this._bumpCooldowns ??= new Map();
    for (const [k, left] of this._bumpCooldowns) {
      if (left > 0) this._bumpCooldowns.set(k, left - dt);
    }
    const p = this.player;
    const others = [];
    for (const n of this.npcs) if (n.active !== false) others.push(n);
    for (const m of this.minions) if (m.active !== false) others.push(m);
    others.push(this.boss);

    for (const o of others) {
      const dx = o.position.x - p.position.x;
      const dz = o.position.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      const minDist = (o.radius ?? 0.3) + p.radius;
      if (dist >= minDist || dist < 1e-4) continue;

      // Separación: la mitad del solape cada uno. Al NPC se le mueve la casa
      // NO — solo la posición actual; su ciclo de paseo ya sabe volver.
      const push = (minDist - dist) / 2;
      const nx = dx / dist;
      const nz = dz / dist;
      p.position.x -= nx * push;
      p.position.z -= nz * push;
      o.position.x += nx * push;
      o.position.z += nz * push;
      // El empujón TAMBIÉN respeta las paredes: sin esto, un choque metía
      // al jefe (o a un NPC) dentro de un mueble o al otro lado de un
      // tabique — era la forma más fácil de verlo "atravesar" sitios.
      const world = this.boss?.world;
      if (world) {
        world.resolveCircle(p.position, p.radius);
        world.resolveCircle(o.position, o.radius ?? 0.3);
      }
      o.sprite?.setPosition(o.position.x, o.position.z);

      const key = o.id ?? o.cast ?? "boss";
      if ((this._bumpCooldowns.get(key) ?? 0) > 0) continue;
      this._bumpCooldowns.set(key, 1.4);
      // "¡!" sobre los dos y un toque de vibración. A uno SENTADO el golpe
      // no lo tambalea: la silla de rueditas se lo LLEVA rodando en la
      // dirección del empujón (y su computadora se queda trabajando sola).
      this.onPopup?.({ text: "!", x: o.position.x, z: o.position.z, kind: "bump" });
      this.onPopup?.({ text: "!", x: p.position.x, z: p.position.z, kind: "bump" });
      if (o.isSeated && o.rollAway) o.rollAway(nx, nz);
      else o.stumble?.();
      buzz(12);
    }
  }

  /**
   * SEPARACIÓN ENTRE PERSONAJES (el punto flojo nº2 de MOTOR.md §9).
   * `_updateBumps` ya hace físico el choque jugadora↔resto; esto cubre lo que
   * faltaba: el resto ENTRE SÍ. El jefe cruzaba un corrillo de NPC como
   * niebla y dos paseantes se atravesaban limpiamente.
   *
   * La regla que manda aquí es de JUEGO, no de física: **quien está de
   * servicio NO CEDE**. El contacto del jefe y de los secuaces es mecánica
   * —la amonestación es un toque, y la persecución exige cerrar distancia—,
   * así que apartarlos un centímetro por un figurante sería dejar que el
   * decorado empuje a las reglas. El jefe y los secuaces son inamovibles y
   * el NPC de fondo absorbe el empujón entero. Un NPC SENTADO tampoco cede
   * (nadie se desliza de su silla porque pasen a su lado); si se cruzan dos
   * inamovibles, no pasa nada — ese solape ya no es de esta capa.
   *
   * Sin popups ni tambaleos a propósito: eso es feedback de la JUGADORA
   * (_updateBumps). Aquí solo cuerpos que ocupan sitio, en silencio.
   */
  _updateCrowdSeparation() {
    const list = (this._crowdBuf ??= []);
    list.length = 0;
    for (const n of this.npcs) if (n.active !== false) list.push(n);
    for (const m of this.minions) if (m.active !== false) list.push(m);
    list.push(this.boss);
    const onDuty = (this._onDutySet ??= new Set());
    onDuty.clear();
    for (const m of this.minions) onDuty.add(m);
    onDuty.add(this.boss);

    const world = this.boss?.world;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const minDist = (a.radius ?? 0.3) + (b.radius ?? 0.3);
        // Descarte por caja ANTES de la raíz: son ~400 pares por frame y casi
        // todos están lejos.
        if (Math.abs(dx) >= minDist || Math.abs(dz) >= minDist) continue;
        const dist = Math.hypot(dx, dz);
        if (dist >= minDist || dist < 1e-4) continue;

        const aFija = onDuty.has(a) || a.isSeated;
        const bFija = onDuty.has(b) || b.isSeated;
        if (aFija && bFija) continue;

        const nx = dx / dist;
        const nz = dz / dist;
        const solape = minDist - dist;
        // El empujón respeta las paredes igual que en _updateBumps: sin el
        // resolveCircle, separar a alguien junto a un tabique lo mete dentro.
        if (aFija) {
          b.position.x += nx * solape;
          b.position.z += nz * solape;
          world?.resolveCircle(b.position, b.radius ?? 0.3);
          b.sprite?.setPosition(b.position.x, b.position.z);
        } else if (bFija) {
          a.position.x -= nx * solape;
          a.position.z -= nz * solape;
          world?.resolveCircle(a.position, a.radius ?? 0.3);
          a.sprite?.setPosition(a.position.x, a.position.z);
        } else {
          const mitad = solape / 2;
          a.position.x -= nx * mitad;
          a.position.z -= nz * mitad;
          b.position.x += nx * mitad;
          b.position.z += nz * mitad;
          world?.resolveCircle(a.position, a.radius ?? 0.3);
          world?.resolveCircle(b.position, b.radius ?? 0.3);
          a.sprite?.setPosition(a.position.x, a.position.z);
          b.sprite?.setPosition(b.position.x, b.position.z);
        }
      }
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

      // ── QUIETA. ─────────────────────────────────────────────────────
      // Meterte en el escondite no basta: hay que DEJAR DE MOVERSE. Es la
      // regla del arbusto de Sneaky Sasquatch, y es lo que convierte la
      // huida en una decisión en vez de una carrera — hay un instante en el
      // que tienes que soltar el mando y aguantar con el jefe cerca.
      //
      // Se mira la INTENCIÓN del mando y no la velocidad real: empujada
      // contra una pared la velocidad es cero y el escondite seguiría
      // cubriendo mientras forcejeas, que es justo el hueco por el que se
      // colaría "entro corriendo y no suelto".
      const intento = this.player.readIntent();
      const moviendose = Math.hypot(intento.right ?? 0, intento.up ?? 0) > 0.12;
      if (moviendose) {
        // Moverse dentro NO gasta el escondite: lo que se gasta es estar
        // escondida. Si consumiera igual, cruzarlo de paso te lo quemaría
        // sin haberte cubierto ni un segundo.
        this._avisoQuietud = (this._avisoQuietud ?? 0) - dt;
        if (this._avisoQuietud <= 0 && this.boss.isHunting) {
          this._avisoQuietud = 4;
          this.toast("Estás dentro, pero moviéndote: QUÉDATE QUIETA.");
        }
        return;
      }

      state.usedFor += dt;
      if (state.usedFor >= HIDE_MAX_USE) {
        state.cooldownLeft = HIDE_COOLDOWN;
        this.toast("Ese escondite se quemó. Busca otro.", 2, "warn");
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
            // TU PUESTO también se ocupa (alguien se sentó en tu silla), y
            // eso se avisa SIEMPRE, estés donde estés: es tu plan B el que
            // acaba de caerse, y enterarte al llegar corriendo con el jefe
            // detrás era descubrirlo en el peor momento posible. Las salas
            // solo avisan si estás dentro — que se ocupen es rutina.
            if (spot.kind === "desk") {
              this.toast(`${spot.label}: alguien se sentó en tu sitio. Búscate otro.`);
            } else if (this._insideSafeSpot(spot, pos)) {
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

  /** El lugar seguro USABLE más cercano, o null. Para la guía de refugio. */
  _nearestUsableSafeSpot(pos) {
    let best = null;
    let bestD = Infinity;
    safeSpots.forEach((spot, i) => {
      const state = this.safeSpotState[i];
      if (state.spent || state.busyLeft > 0) return;
      const d = Math.hypot(spot.x - pos.x, spot.z - pos.z);
      if (d < bestD) {
        bestD = d;
        best = { x: spot.x, z: spot.z, label: spot.label ?? "Lugar seguro", icon: spot.icon };
      }
    });
    return best;
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
    buzz([40, 60, 40]);
    sfxWarn();

    // EL TACLEO, en tres tiempos y los tres LEGIBLES:
    //  1. AHORA — el impacto: los dos cuerpos se tambalean (la embestida),
    //     el anuncio grande grita ¡TE ATRAPÓ! y el jefe se queda ENCIMA de
    //     ti (nada de resetToPatrol todavía: durante el regaño se le ve
    //     plantado a tu lado, que es lo que vende que te alcanzó).
    //  2. El REGAÑO — engine.js abre el diálogo del jefe (onWarn).
    //  3. Al cerrarlo — engine llama a `seatAtDesk()`: te lleva a tu
    //     puesto, sentada y "trabajando", con su propio anuncio. Antes el
    //     teletransporte pasaba AQUÍ, tapado por el diálogo, y nadie
    //     entendía por qué aparecía en otra parte del piso.
    this.boss.stumble();
    this.player.sprite.setPose?.(null);
    this.announce(
      `¡${(this.boss.displayName ?? "GABO").toUpperCase()} TE ATRAPÓ! (${this.warnings}/${this.rules.maxWarnings})`,
      "danger"
    );

    const final = this.warnings >= this.rules.maxWarnings;
    if (final) {
      this.toast("Última advertencia: te ascienden a cliente.", 2, "danger");
    } else {
      this.toast("Amonestación por escrito. Van a la carpeta.", 1, "danger");
    }
    // El motor (engine.js) muestra el diálogo del regaño y, cuando lo cierra,
    // le da al jefe unos segundos sin observar — si lo hiciéramos aquí, ese
    // respiro se gastaría mientras el diálogo está en pausa, sin servir de nada.
    this.onWarn?.({ warnings: this.warnings, maxWarnings: this.rules.maxWarnings, final });
    if (final) this._finish(false);
  }

  /**
   * El tercer tiempo del tacleo: GABO TE SIENTA A TRABAJAR. Lo llama
   * engine.js al cerrar el diálogo del regaño — te planta en tu puesto,
   * sentada y fingiendo, y ÉL vuelve a su ronda. Con su anuncio, para que
   * el cambio de sitio se entienda como lo que es: te llevó él.
   */
  seatAtDesk() {
    this.boss.resetToPatrol();
    const desk = safeSpots.find((s) => s.kind === "desk");
    if (!desk) return;
    this.player.position.x = desk.x;
    this.player.position.z = desk.z;
    this.player.keys.clear();
    this.player.touchAxis.x = 0;
    this.player.touchAxis.z = 0;
    this._pretendSeat = null;
    this._pretendToggle = true;
    this.player.isPretending = true;
    // La pose de sentada la resuelve _updatePretendPose en el próximo
    // frame (busca la silla libre del puesto); aquí solo se anuncia.
    this.announce("TE SENTÓ EN TU PUESTO: A TRABAJAR", "warn");
  }

  /**
   * LA ENERGÍA, Y EL SUEÑO.
   *
   * Baja sola mientras juegas —más deprisa fingiendo que trabajas, que es
   * lo que más cansa— y la reponen las actividades. A cero te duermes: unos
   * segundos sin control, plantada donde estabas.
   *
   * Dormirse no castiga por sí solo. Lo que castiga es dormirse DONDE TE
   * VEN: si el jefe te tiene a la vista mientras roncas, amonestación. En
   * un lugar seguro puedes dar una cabezada y no pasa nada, que es
   * exactamente el tipo de decisión que el juego quiere que tomes — echarte
   * una siesta es legítimo, elegir mal el sitio no.
   *
   * @param {boolean} yaAmonestada Si el jefe ya te pilló ESTE cuadro por
   *   otra vía, para no cobrar dos amonestaciones por el mismo instante.
   */
  /**
   * ¿Esta estación es una siesta? Se mira el `type` de la actividad y no su
   * `pose`: la pose es cómo se ve, el tipo es qué es. Así cambiar la postura
   * en el JSON no apaga el Zzz sin querer.
   */
  _enSiesta(st) {
    return !!st && st.type === "sleep" && !st.done;
  }

  _updateEnergy(dt, yaAmonestada) {
    if (this.rules.explore || this.gameOver) return;

    if (this.asleepFor > 0) {
      this.asleepFor -= dt;
      this.player.isAsleep = true;
      // `doze`: la cabezada de pie. La cama se RETIRÓ del motor entera (ver
      // POSE_LIBRARY) — lo que cuenta que duermes es el ZZZ sobre la cabeza,
      // no un colchón apareciendo a tus pies. También la siesta del
      // escritorio usa esta pose y su Zzz.
      this.player.pose = "doze";
      // Dormida no se anda: se sueltan las teclas para que no siga
      // caminando sola mientras dura la cabezada.
      this.player.keys.clear();
      this.player.touchAxis.x = 0;
      this.player.touchAxis.z = 0;
      // Y si te ven así, el castigo VIENE A POR TI, no te cae del cielo:
      // ver a una empleada dormida es flagrante, así que la sospecha salta
      // al piso de caza y Gabo cruza el piso a despertarte ÉL. La
      // amonestación sigue siendo FÍSICA — la pone el toque de `catches`
      // cuando llega (dormida no puedes huir, así que llega seguro). Antes
      // caía aquí mismo con solo verte desde la otra punta del piso: era
      // la última vía a distancia que quedaba y rompía la regla de
      // MOTOR.md («la amonestación es SIEMPRE física») sin que se notara.
      if (!yaAmonestada && !this.inSafeSpot && this.boss.playerVisible && !this.boss.lockedOn) {
        this.suspicion = Math.max(
          this.suspicion,
          this.boss.chaseSuspicionFloor + TIMEOUT_HEAT_MARGIN
        );
        this.boss.suspicion = this.suspicion;
        this.boss.startChase();
        this.toast("Gabo te vio dormida: viene a despertarte.", 2, "danger");
      }
      if (this.asleepFor <= 0) {
        this.player.isAsleep = false;
        this.player.pose = null;
        // Se despierta con lo justo para llegar a la máquina de café. Con
        // cero se volvería a dormir en el cuadro siguiente, en bucle.
        this.energy = Math.max(this.energy, ENERGY_MAX * 0.25);
      }
      return;
    }

    this.player.isAsleep = false;
    const gasto = this.player.isPretending ? ENERGY_DRAIN_PRETEND : ENERGY_DRAIN;
    this.energy = Math.max(0, this.energy - gasto * dt);

    if (this.energy <= 0) {
      this.asleepFor = SLEEP_SECONDS;
      this.announce("TE QUEDASTE DORMIDA", "warn");
      this.toast("Sin energía: come o toma algo para reponerte.", 2, "warn");
      sfxWarn();
      buzz([30, 40, 30]);
    }
  }

  /** Reponer energía. Lo llaman las actividades al completarse. */
  grantEnergy(amount, at) {
    const antes = this.energy;
    this.energy = Math.min(ENERGY_MAX, this.energy + amount);
    const ganado = Math.round(this.energy - antes);
    if (ganado > 0 && at) {
      this.onPopup?.({ text: `+${ganado} energía`, x: at.x, z: at.z, kind: "nerve" });
    }
    return ganado;
  }

  /**
   * Las seis de la tarde. Abre la salida y manda a todo el mundo a casa.
   *
   * La salida se abre por DOS caminos, y basta uno: terminar tus tareas (te
   * puedes ir antes, que es el premio de ir rápido) o que den las seis (te
   * vas hayas hecho lo que hayas hecho). Lo que no cambia es que hay que
   * llegar al ascensor: la jornada ya no se acaba donde estés parada.
   */
  _updateClosingTime() {
    const tareasHechas = this.objectives.length > 0 && this.objectives.every((o) => o.done);
    const sonLasSeis = this.getCurrentHour() >= CLOSING_HOUR;

    if (sonLasSeis && !this.closingAnnounced) {
      this.closingAnnounced = true;
      this.toast("Las seis. Todo el mundo a casa — sal por el ascensor.", 2, "warn");
      sfxWarn();
      // Los compañeros recogen y se van. El jefe y sus secuaces NO: el
      // último en irse es siempre el que vigila, y quedarte sola en un piso
      // vacío CON él es mejor final de jornada que quedarte sola a secas.
      const salida = areaByKind("elevator");
      this.npcs.forEach((n, i) => n.leaveFloor?.(salida, 0.35 * i));
    }

    if ((tareasHechas || sonLasSeis) && !this.exitOpen) {
      this.exitOpen = true;
      const salida = areaByKind("elevator");
      this.exitTask = {
        id: "__salida",
        label: "Salir por el ascensor",
        icon: "elevator",
        x: salida?.x ?? this.player.position.x,
        z: salida?.z ?? this.player.position.z,
        done: false,
      };
      if (!sonLasSeis) this.toast("Tareas listas. Puedes irte por el ascensor.");
    }
  }

  /**
   * Se acabó el reloj y sigues dentro: baja el guardia y te saca. Es una
   * AMONESTACIÓN, no un despido — salvo que sea la que colma el vaso, en
   * cuyo caso `_warn()` ya se encarga de cerrar el día por su cuenta.
   */
  _lockedIn() {
    this.toast("Te quedaste encerrada. Baja el guardia y te saca del piso.", 2, "danger");
    this._warn();
    if (!this._finished) this._finish(false);
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

  /**
   * Una línea de mensaje. Por defecto es AMBIENTE y sale en el carril
   * lateral (`ui/messages.js`); solo sube al centro lo que se marque
   * urgente, y eso se decide aquí, en quien lo lanza — no en el HUD, que no
   * puede saber si «+12 energía» importa más que «viene a por ti».
   *
   * Lleva `key` por lo mismo que `announce`: el snapshot lo pasa como
   * ESTADO con temporizador, y sin llave el HUD lo re-dispararía en cada
   * cuadro mientras dure.
   */
  toast(text, urgencia = 0, tone = "info") {
    this.message = { text, timer: 2.6, urgencia, tone, key: ++this._msgSeq };
  }

  /**
   * El anuncio GRANDE centrado (estilo "¡RANGER PELIGROSO!"): para los
   * golpes que hay que leer sin buscarlos. `tone`: "danger" (rojo urge),
   * "warn" (ámbar), "ok" (verde, celebración). Uno a la vez: el nuevo
   * pisa al anterior, que para un anuncio es lo correcto.
   */
  announce(text, tone = "danger") {
    this.bigMessage = { text, tone, timer: 2.2, key: ++this._bigMsgSeq };
  }

  /**
   * The HUD, the compass and the debug tools all read the same frame state.
   * It is cached rather than rebuilt per consumer: this runs every frame and
   * allocating several objects per frame is exactly the kind of garbage that
   * shows up as stutter on a tablet.
   */
  /** Hora actual del día (número, ej. 13.5 = 1:30 p.m.), según cuánto ha pasado. */
  getCurrentHour() {
    // Del tiempo GASTADO, no de lo que queda: alargar la jornada no puede
    // hacer retroceder el reloj de pared (ver `timeSpent`). Y topado en las
    // dos puntas, que quien banque más de una jornada entera de reloj no
    // debe empujar la hora más allá del cierre.
    const frac =
      this.rules.duration > 0
        ? Math.min(1, Math.max(0, this.timeSpent / this.rules.duration))
        : 0;
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

  /**
   * Objetivos de CAMPAÑA que no son estaciones del plano (docs/CAMPANA.md):
   *
   * · "como" (personaje): hablar con ese NPC lo cumple. Su posición en la
   *   lista y en la brújula es LA DEL NPC, que se mueve — se refresca por
   *   frame en `_updateCampaignObjectives`.
   * · "que" con accion "fingir": el tutorial de la mecánica central. Se
   *   cumple acumulando unos segundos fingiendo en un lugar seguro; su
   *   posición apunta al lugar seguro usable más cercano.
   *
   * Entran por `addCampaignObjectives` (al arrancar el día o al
   * desbloquearse en caliente) y comparten lista con las estaciones: el
   * HUD, el tracker y las medallas no saben de dónde vino cada uno.
   */
  addCampaignObjectives(missions) {
    for (const m of missions) {
      // La misión de la PUERTA del día (meet-gabo) ya la enseña el gate con
      // su propia tarea: duplicarla dejaba una fila fantasma sin cumplir.
      // Se compara por ID DE TAREA — comparar por guard fallaba porque el
      // guard es el cast del jefe ("jefe"), no el personaje de la misión.
      if (m.id === (this.gate?.task?.id ?? null)) continue;
      if (this.objectives.some((o) => o.id === m.id)) continue;
      if (m.estacion) {
        // Estación del plano: si el día no la traía (wanted), se añade.
        const st = this._allStations?.find((s) => s.id === m.estacion);
        if (st && !this.objectives.some((o) => o.id === st.id)) {
          this.objectives.push({ ...st, id: m.id, label: m.titulo ?? st.label, icon: m.icono ?? st.icon, kind: m.tipo, progress: 0, done: false });
        }
        continue;
      }
      this.objectives.push({
        id: m.id,
        label: m.titulo,
        icon: m.icono ?? (m.tipo === "como" ? "chat" : "star"),
        kind: m.tipo,
        npcId: m.personaje ?? null,
        accion: m.accion ?? null,
        segundosNeeded: m.segundos ?? 3,
        reward: m.recompensa?.reloj ?? 20,
        // sin x/z todavia: los pone _updateCampaignObjectives
        x: this.player.position.x,
        z: this.player.position.z,
        time: m.segundos ?? 3,
        progress: 0,
        done: false,
        dynamic: true,
      });
    }
  }

  _updateCampaignObjectives(dt) {
    for (const o of this.objectives) {
      if (o.done || !o.dynamic) continue;
      if (o.npcId) {
        const npc = this.npcs.find((n) => n.cast === o.npcId && n.active !== false);
        if (npc) {
          o.x = npc.position.x;
          o.z = npc.position.z;
        }
      } else if (o.accion === "fingir") {
        const spot = this._nearestUsableSafeSpot(this.player.position);
        if (spot) {
          o.x = spot.x;
          o.z = spot.z;
        }
        if (this.player.isPretending && this.inSafeSpot) {
          o.progress = Math.min(o.time, o.progress + dt);
          if (o.progress >= o.time) {
            o.done = true;
            this._grantTime(o.reward, { at: this.player.position, kind: "score" });
            this.toast?.(`${o.label}: hecho`);
            this.onMissionDone?.(o.id);
          }
        }
      }
    }
  }

  /**
   * SUPERAR LA PUERTA DEL DÍA (rules.gate: encontrar a Gabo el día 1).
   *
   * Son DOS cosas, y hay que hacer las dos: levantar la bandera —que abre las
   * tareas, la vigilancia del jefe y la de los secuaces— y avisar de que la
   * misión de la puerta cayó, que es lo que hace a la campaña soltar el plan
   * del día. Poner solo `metGabo = true` deja el piso desbloqueado y la lista
   * de tareas VACÍA: el día se gana solo o no se puede jugar, según por dónde
   * caiga. Es exactamente lo que le pasó a media suite de `tools/` cuando
   * entró la campaña, así que el paso doble vive aquí y no repetido en cada
   * sitio que necesita abrir la puerta.
   */
  clearGate() {
    if (this.metGabo) return false;
    this.metGabo = true;
    this.onMissionDone?.(this.gate?.task?.id ?? "meet-gabo");
    return true;
  }

  /** El diálogo con un NPC cumple su misión "como", si estaba pendiente. */
  completeTalk(npcId) {
    // COMPRAR POR CHARLA: un objeto con `de` se consigue hablando con ese
    // personaje — el café no se sirve, se le compra al Parce.
    for (const st of this.objectives) {
      const ob = st.objeto;
      if (ob?.de === npcId && !this.inventario.has(ob.id)) {
        this._recoger(ob);
      }
    }
    const o = this.objectives.find((x) => x.npcId === npcId && !x.done);
    if (!o) return false;
    o.done = true;
    o.progress = o.time;
    this._grantTime(o.reward ?? 20, { at: this.player.position, kind: "score" });
    this.onMissionDone?.(o.id);
    return true;
  }

  /**
   * El siguiente paso de la misión SEGUIDA (la elegida con 1–3, o la
   * primera pendiente — el mismo criterio que usa el HUD para marcar la
   * fila). Devuelve { id, text } o null. Una frase, imperativa, que dice
   * exactamente qué hacer AHORA: es la pieza que lleva de la mano.
   */
  _guiaSeguida() {
    // Con la caza encima no hay misión que valga: la guía dice lo único
    // que salva, y se cuelga de la fila que esté visible (la seguida).
    const shown = !this.metGabo
      ? this._gateObjectives
      : this.exitTask
        ? [...this.objectives, this.exitTask]
        : this.objectives;
    const seguido =
      (this.preferredObjectiveId
        ? shown.find((o) => o.id === this.preferredObjectiveId && !o.done)
        : null) ?? shown.find((o) => !o.done);
    if (!seguido) return null;
    if (this.boss.isHunting && !this.inSafeSpot) {
      return { id: seguido.id, text: "¡CORRE a un lugar seguro (medalla verde)!" };
    }
    return { id: seguido.id, text: this._guiaDe(seguido) };
  }

  _guiaDe(o) {
    if (!this.metGabo) return "Sigue la flecha hasta Gabo y HABLA con él (espacio)";
    if (o.id === "__salida") return "Al ASCENSOR: la jornada está cerrada";
    if (o.dynamic) {
      if (o.accion === "fingir") {
        return this.player.isPretending
          ? "Así: quieta fingiendo unos segundos más…"
          : "Ve a TU PUESTO (o una sala) y TOCA espacio para sentarte a fingir";
      }
      if (o.npcId) {
        const npc = this.npcs?.find((n) => n.cast === o.npcId);
        const nombre = npc?.displayName ?? o.npcId;
        return `Busca a ${nombre} (sigue la flecha) y acércate a HABLAR: espacio`;
      }
    }
    if (o.objeto && !this.inventario.has(o.objeto.id)) {
      const ob = o.objeto;
      const donde =
        ob.pista ??
        (ob.de ? `pídeselo a ${ob.de[0].toUpperCase()}${ob.de.slice(1)}` : null) ??
        (ob.en?.sala ? `búscalo en ${ob.en.sala}` : "búscalo por el piso");
      return `Primero consigue «${ob.nombre}»: ${donde}`;
    }
    if (o.encendida) return "¡En marcha! AGUANTA cerca: cada segundo paga más reloj";
    if (this.nearStation?.id === o.id) {
      return o.gesto
        ? "MANTÉN espacio y ajusta con el mando: dentro de la zona"
        : "MANTÉN espacio · suelta y toca en la ZONA CLARA para ir más rápido";
    }
    return "Ve hasta la medalla ámbar (sigue la flecha) y MANTÉN espacio";
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
      // Mientras la puerta del día no esté superada, el HUD no enseña tareas
      // que todavía no se pueden hacer: solo la de encontrar al guardián.
      // Y con la salida abierta, IRSE es una tarea más de la lista — se
      // añade solo aquí (ver `exitTask`), nunca a `this.objectives`.
      objectives: !this.metGabo
        ? this._gateObjectives
        : this.exitTask
          ? [...this.objectives, this.exitTask]
          : this.objectives,
      // LA GUÍA: el SIGUIENTE PASO de la misión que sigues, dicho con
      // todas las letras ("consigue el café hablándole al Parce", "mantén
      // espacio", "aguanta"). Es lo que lleva de la mano: la lista dice
      // QUÉ, esto dice CÓMO se hace AHORA MISMO. Con caza encima, la guía
      // cambia a lo único que importa: correr a un lugar seguro.
      guia: this._guiaSeguida(),
      nearStation: this.nearStation,
      // El pulso de la actividad en marcha, o null. Va por el MISMO snapshot
      // por frame que todo lo demás: no hay una segunda verdad que se pueda
      // desincronizar del motor.
      pulse: this.pulse.snapshot(),
      gesture: this.gesture.snapshot(),
      // El bucle v2: qué llevas encima, si el mundo está congelado
      // (activando) y qué actividad está encendida aguantando.
      inventario: [...this.inventario],
      // LO QUE LLEVAS ENCIMA, para la placa: no basta con los ids. Sin ver
      // qué llevas y qué te hace, el camuflaje sería una estadística oculta
      // — la jugadora notaría que a veces la fichan antes y nunca sabría
      // por qué.
      llevado: [...this._carriables.values()]
        .filter((it) => this.inventario.has(it.id))
        .map((it) => ({
          id: it.id,
          nombre: it.nombre,
          icon: it.icon ?? (it.coartada ? "notebook" : "eye"),
          sospecha: it.sospecha ?? 1,
        })),
      camuflaje: this._camuflaje(),
      worldFrozen: this.worldFrozen,
      aguantando: (() => {
        const st = this.objectives.find((o) => o.encendida && !o.done);
        return st
          ? { id: st.id, label: st.label, icon: st.icon, aguante: st.aguante ?? 0, max: AGUANTE_MAX }
          : null;
      })(),
      // La cuenta atrás de la tarea que tienes entre manos. Se enseña la de
      // la estación en curso; las que dejaste a medias siguen corriendo por
      // dentro y se ven al volver.
      deadline: (() => {
        const st = this.player.isDoingActivity ? this.nearStation : null;
        if (!st || !(st.limite > 0) || st.limiteLeft == null) return null;
        return { left: st.limiteLeft, total: st.limite, label: st.label ?? "" };
      })(),
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
      // La salida se AÑADE aquí y no a `this.objectives`, que es lo que mira
      // "ya terminaste todo": metida ahí, la jornada nunca podría darse por
      // hecha porque siempre quedaría una tarea sin cumplir.
      closing: this.closingAnnounced,
      exitOpen: this.exitOpen,
      // La energía y la siesta: lo que de verdad gasta la jornada ahora.
      energy: this.energy,
      energyMax: this.energyMax,
      asleep: this.asleepFor > 0,
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
      // El lugar seguro usable más cercano: con la sospecha alta, la guía
      // de tarea redirige ahí — "ve a fingir que trabajas" ES la tarea.
      refugeSpot: this._nearestUsableSafeSpot(this.player.position),
      currentAction: this._currentAction(),
      redAlert: this.boss.redAlert,
      bossState: this.boss.state,
      gameOver: this.gameOver,
      win: this.win,
      message: this.message,
      bigMessage: this.bigMessage,
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
