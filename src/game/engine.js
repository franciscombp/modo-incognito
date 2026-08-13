import { Game } from "./game.js";
import { createHud } from "./hud.js";
import { buzz } from "./settings.js";
import { setMood, playStinger, updateMoodFromSnapshot } from "./soundtrack.js";
import { createDialogue } from "./dialogue.js";
import { createDialogueCamera } from "../scene/dialogueCamera.js";
import { createSave } from "./save.js";
import { applyTheme, createThemeBlender } from "./themes.js";
import { createMenus } from "../ui/menus.js";
import { createGuides } from "../ui/guides.js";
import { createMinimap } from "../ui/minimap.js";
import { createWorldPrompt } from "../ui/worldPrompt.js";
import { createLobby } from "../ui/lobby.js";
import { createGameHud } from "../ui/gamehud.js";
import { createCampaign } from "./campaign.js";
import { createHrCourse } from "../ui/hrCourse.js";
import { createReview } from "../ui/review.js";
import { createRetirement } from "../ui/retirement.js";
import { createLevelling } from "../ui/levelling.js";
import { createLibreta } from "../ui/libreta.js";
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
  campaignData = null,
  libretaData = null,
  playerSheet = "npc-camina",
  playerName = "Tú",
  minions = new Map(),
  // Los puestos con silla de verdad del piso (scene/furniture.js): fingir
  // que trabajas sienta a la jugadora en uno si lo tiene a mano.
  seats = [],
  onPopup = null,
  minigames = createMinigameRegistry(),
  pixels = null,
  onCharacter = null,
  baseModelsReady = Promise.resolve(),
  getModelsProgress = () => 100,
}) {
  const hud = createHud(app);
  const guides = createGuides(app, camera.camera);
  const minimap = createMinimap(app);
  const worldPrompt = createWorldPrompt(app, camera.camera, {
    isTouch: matchMedia("(pointer: coarse)").matches,
  });
  // LA CÁMARA DE DIÁLOGO. El retrato flotante se retiró: quien habla se
  // encuadra EN EL ESCENARIO (ver scene/dialogueCamera.js). `hablantes` es
  // quién está en escena para esta conversación, y lo pone quien la abre.
  const dialogueCam = createDialogueCamera(camera, {
    onDrama: (on) => document.body.classList.toggle("inc-dialogue-drama", on),
  });
  /** { yo, otro } — los muñecos de esta charla, o null si es un soliloquio. */
  let hablantes = { yo: null, otro: null };

  const dialogue = createDialogue(app, {
    looks,
    /**
     * Cada línea avisa de quién tiene la palabra. Con DOS en escena se
     * encuadran los dos y se ponen de frente; con uno, primer plano y el
     * personaje GIRA A CÁMARA — la cuarta pared se rompe girando al muñeco,
     * nunca moviendo el ojo.
     */
    onSpeaker: ({ narrator }) => {
      // El narrador (Steven el Daddy) no está en el piso: no hay a quién
      // encuadrar, así que se deja el plano como esté.
      if (narrator) return;
      const otro = hablantes.otro;
      // POR DEFECTO, SOLILOQUIO DE LA JUGADORA. Casi todas las escenas del
      // juego que no declaran reparto son suyas: el guion de apertura, el
      // cierre del día, el pensamiento al encontrar un secreto. Antes esto
      // exigía declararlo en cada `dialogue.play` —nueve sitios— y el que se
      // olvidara se quedaba sin encuadre sin que nada fallara a la vista.
      const yo = hablantes.yo ?? player;
      if (!yo) return;
      if (otro) {
        dialogueCam.enter(yo.position, otro.position);
      } else {
        dialogueCam.enter(yo.position, null);
        // LA CUARTA PARED: en un soliloquio el personaje se gira A CÁMARA.
        // La cámara no rota nunca — el que rota es él.
        dialogueCam.faceCamera(yo);
      }
    },
    onClose: () => dialogueCam.exit(),
  });
  const lobby = createLobby(app);
  const eggReveal = createEggReveal(app);
  // El HUD de partida (ui/gamehud.js): la placa con la cara viva, la lista
  // de misiones, el reloj centrado y el nombre de zona. Sustituye a la barra
  // de menú tipo macOS — el equipo creativo fue por un HUD de juego (ver
  // docs/HUD.md). Mantiene la interfaz de la barra (render/notify/...), así
  // que hud.js no cambia de contrato.
  const menuBar = createGameHud(app, {
    onOpenPause: () => openPause(),
    playerLook: null, // la pone setPlayerLook en cuanto exista `save` (abajo)
  });
  hud.attachMenuBar(menuBar);
  const save = createSave();
  // El director de campaña (docs/CAMPANA.md): misiones encadenadas, Qués y
  // Cómos, la nota de RRHH. Sin datos de temporada, `active` es false y el
  // juego se comporta como siempre — la campaña es opt-in por datos.
  const campaign = createCampaign({ save, data: campaignData });
  const hrCourse = createHrCourse(app);
  const review = createReview(app);
  const retirement = createRetirement(app);
  // LA LIBRETA (data/libreta.json): el diario de chismes. Solo LEE el save;
  // quien escribe páginas es `anotarPista`, más abajo.
  const libreta = createLibreta(app, { save, data: libretaData });

  // Índices de la libreta por fuente, para que anotar sea O(1) y el dato
  // decida qué charla/misión/secreto tiene página — el motor no sabe nada.
  const pistaPorFuente = new Map(
    (libretaData?.pistas ?? []).map((p) => [`${p.fuente?.tipo}:${p.fuente?.ref}`, p])
  );

  /**
   * Algo pasó que podría merecer página: si el dato la tiene y aún no está
   * anotada, se escribe (permanente, por ranura) y cae el aviso. Si la
   * página completa EL PROYECTO, se anuncia — es el momento Sasquatch de
   * juntar la última pieza.
   */
  function anotarPista(tipo, ref) {
    const p = pistaPorFuente.get(`${tipo}:${ref}`);
    if (!p || !save.addPista(p.id)) return;
    hud.menuBar?.notify?.({ icon: "notebook", text: `La libreta: «${p.titulo}»`, tone: "info" });
    const { hechas, total } = libreta.piezasProyecto();
    const esPieza = (libretaData?.proyecto?.piezas ?? []).some((x) => x.pista === p.id);
    if (esPieza && hechas === total) {
      hud.menuBar?.notify?.({
        icon: "notebook",
        text: "EL PROYECTO: última pieza. Léelo todo junto en la libreta (L).",
        tone: "warn",
        ttl: 7000,
      });
    } else if (esPieza) {
      hud.menuBar?.notify?.({
        icon: "search",
        text: `El proyecto: ${hechas}/${total} piezas`,
        tone: "info",
      });
    }
  }

  /** Abrir la libreta pausa el piso, como cualquier lectura. */
  async function openLibreta() {
    if (!libreta.disponible) return;
    await withPause(() => libreta.show());
  }
  const levelling = createLevelling(app, {
    minigames,
    render: (s, c) => pixels?.render(s, c),
    setBusy: (v) => {
      crossingActive = v;
    },
  });
  // Con el guardado ya leído se sabe qué personaje es la jugadora: la placa
  // del HUD enseña SU cara desde el primer frame, no la del por defecto.
  menuBar.setPlayerLook?.(save.characterId ? looks?.get?.(save.characterId) : null);
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
  let stevenTimer = null;
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
    // El NOMBRE del personaje elegido ("Giuli", "Fran"…), para que sus
    // réplicas firmen como ella y la charla se lea como dos personajes
    // hablando — el rótulo "Tú" rompía esa ilusión (estilo Sasquatch:
    // el mapache se llama Mapache, no "Él").
    getPlayerName: () => modes[save.characterId]?.name ?? null,
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
      openLibreta: () => openLibreta(),
      // Abrir una hoja de vida: se carga esa carrera y, si ya trae
      // personaje, se pone su cara antes de entrar — si no lo hiciéramos
      // aquí, la primera partida de la sesión arrancaría con el muñeco por
      // defecto aunque la hoja diga otra cosa.
      chooseSlot: (n) => {
        save.useSlot(n);
        if (save.characterId) applyCharacter(save.characterId);
      },
      clearSlot: (n) => save.clearSlot(n),
      selectCharacter: (id) => {
        save.setCharacter(id);
        applyCharacter(id);
      },
    },
  });

  /**
   * Poner la cara de alguien en el juego ya montado. Lo llaman DOS caminos:
   * elegir personaje (firmar el contrato) y abrir una hoja de vida que ya
   * traía uno. Estaba solo dentro de `selectCharacter`, así que cargar una
   * partida guardada dejaba el muñeco por defecto hasta que volvieras a
   * pasar por la pantalla de personaje.
   */
  function applyCharacter(id) {
    // El sprite se cambia en caliente: elegir personaje pasa con el juego
    // ya montado, no al arrancar. nameToSheet también, o el retrato de
    // diálogo se queda enseñando al personaje con el que se abrió el
    // juego para siempre, aunque elijas otro.
    const sheet = modes[id]?.sheet ?? playerSheet;
    nameToSheet.set(playerName, sheet);
    nameToSheet.set("Tú", sheet);
    // La placa del HUD enseña la CARA del personaje elegido: cambia con él.
    menuBar.setPlayerLook?.(looks?.get?.(id) ?? null);
    onCharacter?.(id);
  }

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
      // Con campaña, el pie del título habla el idioma de la CARRERA
      // (rango, temporada, día) — «0/2 días superados» era el modelo viejo
      // asomando en la portada. Sin campaña, el resumen de siempre.
      summary: campaign.active
        ? `${campaign.rango} · Temporada ${campaign.temporada} · Día ${campaign.dia} · ${save.state.eggs.length}/${eggIds.length} secretos`
        : `${done}/${levels.length} días superados · ${save.state.eggs.length}/${eggIds.length} secretos`,
    });
  }

  function openPause() {
    if (!inLevel || dialogue.isOpen || game?.gameOver) return;
    menuPaused = true;
    game?.setPaused(true);
    setMood("calm");
    // La pausa dice DÓNDE VAS en la carrera, no solo qué día es: rango,
    // calendario y libreta — que es la puerta de la jubilación, así que
    // verla aquí es saber qué te falta para el final.
    const carrera = campaign.active
      ? ` · ${campaign.rango} (T${campaign.temporada}·D${campaign.dia}) · Libreta ${save.libreta.length}/${(libretaData?.pistas ?? []).length}`
      : "";
    menus.openPause(`Día ${levels[dayIndex].number} · ${levels[dayIndex].title}${carrera}`);
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

    // LA LIBRETA con su tecla (ver ui/controls.js, la lista única). Solo en
    // partida, sin diálogo delante y con el piso VIVO: si el juego ya está
    // en pausa es que otra cosa lo pausó (la alarma de nivel 3, una escena)
    // — abrir la libreta encima y cerrarla reanudaría por debajo de ese
    // aviso. Desde la pausa del menú se entra por su botón, que sí sabe
    // devolver la pausa como estaba.
    if (key === "l" && inLevel && !dialogue.isOpen && !game?.gameOver && !game?.paused) {
      e.preventDefault();
      openLibreta();
      return;
    }

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
    // Un secreto hallado puede tener página en la libreta (data/libreta.json).
    anotarPista("secreto", egg.id);
    if (egg.perk) PERKS[egg.perk]?.();
    // El bono de reloj ya lo enseña el popup flotante de game._grantTime();
    // esta tarjeta es solo la celebración del hallazgo, no una repetición
    // del número. Si el secreto trae su propia escena, se juega primero.
    // SOLILOQUIO: solo ella. Primer plano y se gira a cámara.
    if (egg.scene?.length) {
      await withPause(() => dialogue.play(withSprites(egg.scene), ctx), { yo: player, otro: null });
    }
    eggReveal.show(save.state.eggs.length, eggIds.length);
  }

  /** Freeze the level while a story beat plays, then hand control back. */
  /**
   * Congelar el piso mientras dura una escena.
   *
   * `enEscena` dice QUIÉN habla, para que la cámara sepa a quién encuadrar:
   * `{ yo, otro }` con los muñecos, o nada si es un soliloquio del sistema.
   * Se limpia en el `finally` junto con la cámara — un diálogo que termina
   * mal (una excepción, un día que se cierra) no puede dejar el piso
   * encuadrado sobre alguien que ya no está hablando.
   */
  async function withPause(fn, enEscena = null) {
    game?.setPaused(true);
    hablantes = enEscena ?? { yo: null, otro: null };
    try {
      await fn();
    } finally {
      dialogueCam.exit();
      hablantes = { yo: null, otro: null };
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
  // Techo de espera en el ascensor: con red lenta los .glb pueden tardar
  // una eternidad, y quedarse mirando "SUBIENDO" no es un juego. Pasado
  // esto se abre igual: cada personaje ya se monta asíncrono y aparece
  // solo en cuanto llega su cuerpo — mejor un piso a medio vestir que un
  // ascensor eterno.
  const ELEVATOR_MAX_WAIT_MS = 30000;

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
        const elapsed = performance.now() - start;
        const timeFrac = Math.min(1, elapsed / ELEVATOR_MIN_RIDE_MS);
        // Pasado el techo, el progreso real deja de mandar: se fuerza el 100
        // y se abre con lo que haya llegado.
        const models = elapsed > ELEVATOR_MAX_WAIT_MS ? 100 : getModelsProgress();
        const shown = Math.min(models, timeFrac * 100);
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
    // Lo que TARDES en el minijuego se paga en reloj de jornada: dudar en
    // la acera también es llegar tarde. El cronómetro arranca al empezar a
    // jugar (la intro no cuenta — leer no es dudar) y hay un tiempo de
    // gracia por debajo del cual cruzar sale gratis. Ver
    // `game.applyCommuteDelay`, que además pone el suelo.
    const COMMUTE_GRACE_S = 20;
    let commuteDelay = 0;
    if (mini) {
      if (mini.spec.intro) await dialogue.play(withSprites(mini.spec.intro), ctx);
      if (mini.bodyClass) document.body.classList.add(mini.bodyClass);
      crossingActive = true;
      if (mini.mood) setMood(mini.mood);
      const crossStart = performance.now();
      const outcome = await mini.play((s, c) => pixels?.render(s, c));
      commuteDelay = Math.max(0, (performance.now() - crossStart) / 1000 - COMMUTE_GRACE_S);
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

    // Día nuevo (o reintento): las conversaciones empiezan de cero. Sin esto,
    // Gabo saludaba el reintento con una línea de seguimiento en vez de
    // presentarse, y el gate del día se sentía roto.
    save.resetTalkFlags();

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
    // hay prólogo (rideElevator no corrió). CON TECHO: si en 30s no han
    // llegado, el día empieza igual — cada personaje se monta asíncrono y
    // aparece en cuanto llega su cuerpo.
    await Promise.race([baseModelsReady, wait(30000)]);
    const onDuty = prepareFloor(day);
    // El peaje del cruce se cobra recién ahora, porque el juego no existía
    // mientras se cruzaba. Va ANTES de applyPrologue para que cualquier
    // bono del ascensor se calcule sobre la jornada ya descontada.
    if (commuteDelay > 0) game.applyCommuteDelay(commuteDelay);
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
    stevenTimer = null;
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
      seats,
      config: bossConfig,
      rules: mergedRules(day),
      onFinish: (result) => finishDay(day, result),
      onEgg: (egg) => triggerEgg(egg),
      onPopup,
      onTalk: (npc, opts) => talkTo(npc, opts),
      onWarn: (info) => handleWarn(info),
      onHeatAlert: () => showHeatAlert(),
    });

    // ── LA CAMPAÑA TOMA EL DÍA (docs/CAMPANA.md) ──
    // El plan de hoy sustituye a las tareas sueltas del JSON del día: las
    // misiones elegibles (cadena `requiere` satisfecha, únicas no hechas)
    // entran como objetivos; el resto se desbloquea EN CALIENTE al caer sus
    // requisitos, con su aviso — la zanahoria de la cadena.
    if (campaign.active && !game.rules.explore) {
      const plan = campaign.startDay();
      game.objectives.length = 0;
      game.addCampaignObjectives(plan);
      game.onMissionDone = (id) => {
        // El objetivo en pantalla también se marca: algunas misiones se
        // cumplen fuera de la lista (la puerta del día) y sin esto quedaba
        // la fila como pendiente para siempre.
        const obj = game.objectives.find((o) => o.id === id);
        if (obj && !obj.done) {
          obj.done = true;
          obj.progress = obj.time ?? 1;
        }
        const nuevas = campaign.complete(id);
        // Un encargo del arco puede tener su página en la libreta.
        anotarPista("mision", id);
        if (!nuevas.length) return;
        game.addCampaignObjectives(nuevas);
        for (const n of nuevas) {
          hud.menuBar?.notify?.({
            icon: n.icono ?? "star",
            text: `Nueva misión: ${n.titulo}`,
            tone: "info",
          });
        }
      };
    }

    // Pausado: el reloj no puede correr mientras se abren las puertas ni
    // durante la presentación de los secuaces.
    game.setPaused(true);
    return onDuty;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Nivel de búsqueda 3: el mundo se congela (game.setPaused, lo hizo ya
   * game.js antes de llamar aquí) y cae un aviso A PANTALLA COMPLETA con la
   * misma tarjeta de juego del fin de día — Gabo enorme, título de alarma y
   * un único botón. Nada avanza hasta pulsar "¡Entendido, a correr!", y al
   * soltar sí que toca correr: el nivel 3 sigue activo y el jefe viene.
   */
  function showHeatAlert() {
    hud.showResult({
      look: looks?.get?.("gabo") ?? null,
      pose: "phone",
      icon: "siren",
      title: "¡ALARMA EN EL PISO!",
      win: false,
      body:
        "Nivel de búsqueda 3: Gabo dio la orden y todo el mundo te está " +
        "buscando. Escóndete o finge que trabajas hasta que se enfríe — " +
        "si te alcanzan, amonestación directa.",
      actions: [
        {
          label: "¡Entendido, a correr!",
          primary: true,
          onClick: () => {
            hud.hideResult();
            game?.setPaused(false);
          },
        },
      ],
    });
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
      game.clearGate();
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
    if (opts?.caught && encounter.caughtScenes?.length) {
      // Te ATRAPARON: el interrogatorio tiene su propio pozo, que rota para
      // siempre (es castigo, no charla). Antes reciclaba las escenas de
      // conversación y Chispita te "capturaba" contándote sus pasos diarios.
      const c = save.getFlag(`caught:${npc.cast}`) ?? 0;
      save.setFlag(`caught:${npc.cast}`, c + 1);
      scene = encounter.caughtScenes[c % encounter.caughtScenes.length];
    } else if (seen < encounter.scenes.length || opts?.caught) {
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
    // DOS EN ESCENA: la cámara los encuadra a los dos y `faceEachOther` (más
    // arriba) ya los puso de frente.
    await withPause(
      () =>
        dialogue.play(
          withSprites(scene.map((node) => ({ color: persona?.color, sheet: persona?.sheet, ...node }))),
          ctx
        ),
      { yo: player, otro: npc }
    );
    if (opts?.caught) buzz([15, 30, 15]);
    // Hablar con un colega puede SER la misión (un "cómo" de la campaña):
    // se cumple al cerrar la charla, no al abrirla — interrumpirla no vale.
    if (!opts?.caught) game?.completeTalk?.(npc.cast);
    // Y puede escribir su página de chisme en la libreta. Un interrogatorio
    // NO cuenta: es castigo, no chisme.
    if (!opts?.caught) anotarPista("charla", npc.cast);
  }

  // Segundos que el jefe pasa sin observar justo después de amonestar, para
  // que la escena del regaño no se resuelva en "te vuelve a pillar en el
  // mismo segundo".
  const BOSS_GRACE_AFTER_WARN = 5;

  /** El jefe te aborda de verdad: diálogo de regaño y luego un respiro. */
  async function handleWarn({ warnings }) {
    if (warnings === game.rules.maxWarnings) return; // el outro de "despedida" ya cubre este caso
    // Si la ALARMA de nivel 3 estaba en pantalla, se cierra sola: acaban de
    // atraparte, así que "te están buscando" ya no informa de nada — y su
    // tarjeta quedaba ENCIMA del regaño comiéndose los clics del diálogo.
    hud.hideResult?.();
    const encounter = dialogues.encounters.jefe;
    if (!encounter?.scenes?.length) {
      // Sin regaño escrito, el tercer tiempo del tacleo llega igual: te
      // sienta a trabajar (ver game.seatAtDesk) y él vuelve a su ronda.
      game.seatAtDesk();
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
      // La amonestación FORMAL sale de su propio pozo (`warnScenes`): las
      // `scenes` son charla de pasillo, y regañarte con un "te ves
      // concentrada, sigue así" era el bug más desconcertante del juego.
      // Sin pozo propio (contenido viejo), se cae a las scenes saltando la
      // bienvenida, como antes.
      const warnScenes =
        encounter.warnScenes?.length
          ? encounter.warnScenes
          : encounter.scenes.length > 1
            ? encounter.scenes.slice(1)
            : encounter.scenes;
      const seen = save.getFlag("talk:jefe_warn") ?? 0;
      save.setFlag("talk:jefe_warn", seen + 1);
      scene = warnScenes[seen % warnScenes.length];
    }

    faceEachOther(boss);
    await withPause(
      () =>
        dialogue.play(
          withSprites(scene.map((node) => ({ color: persona?.color, sheet: persona?.sheet, ...node }))),
          ctx
        ),
      { yo: player, otro: boss }
    );
    // El tercer tiempo del tacleo: cerrado el regaño, te sienta a trabajar
    // en tu puesto (con su anuncio) y el jefe vuelve a su ronda sin mirarte
    // unos segundos. El orden importa — sentarla ANTES del diálogo era un
    // teletransporte tapado por la caja que nadie entendía.
    game.seatAtDesk();
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
      look: looks?.get?.("gabo"),
      pose: "phone",
      title: onFail.title ?? "Te ascendieron a cliente",
      body: onFail.body ?? "No llegaste a empezar la jornada.",
      win: false,
      actions: [
        { label: "Reintentar", primary: true, onClick: () => startDay(dayIndex, { skipPrologue: true }) },
        { label: "Menú", onClick: () => openTitle() },
      ],
    });
  }

  async function finishDay(day, result) {
    // TRES AMONESTACIONES YA NO DESPIDEN: te mandan a RRHH (docs/CAMPANA.md
    // §7). El curso del botón-que-huye es el castigo; al terminarlo, el DÍA
    // se reinicia — pierdes el progreso de HOY, pero las misiones únicas ya
    // completadas quedaron guardadas en el acto (guardado por tareas). El
    // alcance es el DÍA a propósito: la temporada entera sería brutal y la
    // carrera lo volvería un roguelike.
    const fired = !result.win && result.warnings >= (day.rules?.maxWarnings ?? 3);
    if (fired && campaign.active) {
      setInLevel(false);
      playStinger("defeat");
      const strikes = save.getFlag("rrhh") ?? 0;
      save.setFlag("rrhh", strikes + 1);
      await dialogue.play(
        withSprites([
          {
            speaker: "Gabo (Barbie Malibú)",
            text: "Tres amonestaciones. No te despido porque el proceso es LARGUÍSIMO: te mando al curso de cumplimiento. Otra vez.",
          },
        ]),
        ctx
      );
      await hrCourse.play({ strikes });
      startDay(dayIndex, { skipPrologue: true });
      return;
    }

    setInLevel(false);
    playStinger(result.win ? "victory" : "defeat");
    save.setHadWarningYesterday(result.warnings > 0);
    const spare = Math.max(0, Math.round(result.timeLeft));
    if (result.win) save.completeDay(day.id, { seconds: Math.round(result.elapsed), spare });
    else save.recordSpare(day.id, spare);

    await dialogue.play(withSprites((result.win ? day.outroWin : day.outroLose) ?? []), ctx);

    const isLast = dayIndex >= levels.length - 1;
    const done = result.objectives.filter((o) => o.done).length;
    // La EVALUACIÓN de RRHH: nota por los dos ejes (Qués y Cómos) y avance
    // de calendario — AAA salta la temporada, A asciende por antigüedad.
    // La libreta viaja al cierre porque es LA PUERTA de la jubilación: el
    // último ascenso se retiene mientras queden chismes por descubrir
    // (campaign.endDay), así que el juego no se acaba hasta tenerlo todo.
    const pistasTotal = (libretaData?.pistas ?? []).length;
    const libretaCompleta = pistasTotal === 0 || (save.libreta?.length ?? 0) >= pistasTotal;
    const evalRes = campaign.active
      ? campaign.endDay({ win: result.win, libretaCompleta })
      : null;
    // La evaluación se FIRMA en el expediente de la ranura en el acto: es la
    // memoria larga de la carrera, y la hoja de vida la lee para escribirse
    // sola. Se alimenta aquí y no desde la pantalla que la enseña — una
    // pantalla no debe escribir progreso.
    if (evalRes) {
      save.addReview({
        temporada: evalRes.temporada,
        dia: evalRes.dia,
        nota: evalRes.nota,
        rango: evalRes.rango,
        ques: evalRes.ques,
        comos: evalRes.comos,
      });
    }
    // La EVALUACIÓN va ANTES del panel de resultado, y en su propia pantalla.
    // Estaba como una línea dentro del cuerpo del panel: el chiste central
    // del juego —los dos ejes por separado, «cumples pero no eres de
    // equipo»— pasaba de largo en letra pequeña.
    if (evalRes) await review.show(evalRes);

    // LA JUBILACIÓN: el último ascenso de la escalera. Solo llega con la
    // libreta completa (la puerta vive en campaign.endDay), así que esta
    // pantalla ES el final del juego — felicidades, y a empezar de cero si
    // quieres. "Quedarme de visita" te deja seguir en el piso jubilada.
    if (evalRes?.jubilacion) {
      setInLevel(false);
      const { restart } = await retirement.show({
        jornadas: save.cv?.historial?.length ?? 0,
        chismes: save.libreta?.length ?? 0,
        chismesTotal: pistasTotal,
        secretos: save.eggs?.length ?? 0,
      });
      if (restart) {
        save.reset();
        openTitle();
        return;
      }
      openTitle();
      return;
    }

    // PLAN DE NIVELACIÓN: cinco días sin cerrar la temporada. No se pierde
    // la partida — es la red de seguridad (CAMPANA §5.1). La tanda sale del
    // JSON de la temporada, así que el motor no sabe qué pruebas son.
    if (evalRes?.nota === "Nivelación") {
      setInLevel(false);
      await levelling.run({
        pruebas: campaignData?.nivelacion?.pruebas ?? [],
        temporada: evalRes.temporada,
      });
      campaign.afterLevelling();
      startDay(dayIndex, { skipPrologue: true });
      return;
    }

    const actions = [];

    if (result.win && !isLast) {
      actions.push({
        label: `Día ${levels[dayIndex + 1].number} →`,
        primary: true,
        onClick: () => startDay(dayIndex + 1),
      });
    }
    // Con la campaña viva, ganar el día ofrece SIGUIENTE JORNADA como
    // primaria: la carrera continúa con el calendario ya avanzado. Decía
    // "Repetir", que sonaba a rejugar lo mismo — nadie entendía que el
    // juego seguía. La carrera solo termina en la jubilación.
    const campaignGoesOn = result.win && isLast && campaign.active;
    if (campaignGoesOn) {
      actions.push({
        label: "Siguiente jornada →",
        primary: true,
        onClick: () => startDay(dayIndex, { skipPrologue: true }),
      });
    }
    actions.push({
      label: result.win ? (campaignGoesOn ? "Repetir día" : "Repetir") : "Reintentar",
      primary: !result.win,
      // REINTENTAR cae DIRECTO al piso: el ascensor y su elección ya los
      // viviste hoy, y repetirlos en cada despido convertía el castigo en
      // trámite. La intro completa queda para quien empieza de cero
      // ("Reiniciar progreso" del menú) o entra al día por primera vez.
      onClick: () => startDay(dayIndex, { skipPrologue: true }),
    });
    actions.push({ label: "Menú", onClick: () => openTitle() });

    hud.showResult({
      icon: result.win ? (isLast ? "trophy" : "party") : "door",
      // La pantalla la protagoniza un PERSONAJE, como en un juego de
      // verdad: tú celebrando con tu café, o Gabo llamando a RRHH.
      look: result.win ? looks?.get?.(save.character) : looks?.get?.("gabo"),
      pose: result.win ? "coffee" : "phone",
      title: result.win
        ? day.winTitle ?? (campaignGoesOn ? "Jornada superada" : isLast ? "Semana completada" : `${day.title}: superado`)
        : "Te ascendieron a cliente",
      timeLeft: result.timeLeft,
      timeGained: result.timeGained,
      body: (result.win
        ? `${done}/${result.objectives.length} misiones · ${result.eggsFound} secretos hoy`
        : result.warnings >= (day.rules?.maxWarnings ?? 3)
        ? "Sin advertencias de sobra: te ascienden a cliente."
        : "Se acabó la jornada con objetivos pendientes.") +
        // Solo la LETRA: el detalle ya lo contó la pantalla de evaluación, y
        // repetirlo aquí entero lo convertía en ruido.
        (evalRes ? `\nEvaluación del ciclo: ${evalRes.nota}` : "") +
        // La puerta de la jubilación, DICHA: sin esto, quien cerró la última
        // temporada con la libreta a medias veía "ascenso" y luego nada —
        // el juego parecía roto justo en su final.
        (evalRes?.jubilacionBloqueada
          ? `\nRRHH retiene tu jubilación: faltan ${pistasTotal - (save.libreta?.length ?? 0)} chismes en la libreta (L).`
          : ""),
      win: result.win,
      actions,
    });
  }

  function update(dt) {
    game?.update(dt);
    // Reuse the frame state the HUD just rendered instead of rebuilding it.
    const live = game && !menus.isOpen ? game.lastSnapshot : null;
    guides.update(live);
    minimap.update(live);
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

  // Hide boss/minion vision cones (y su globo de alerta, misma regla) hasta
  // que la jugadora los conoce.
  function updateCharacterVisibility(g) {
    boss.cone.visible = g.metGabo;
    if (!g.metGabo) boss.alertIcon.visible = false;
    g.minions.forEach((m) => {
      if (m.id === "crispo") {
        m.cone.visible = g.metGabo;
        if (!g.metGabo) m.alertIcon.visible = false;
      } else {
        m.cone.visible = true;
      }
    });
  }

  /**
   * Los Teams que te llegan durante la jornada, cada uno con su reloj:
   * Gabo escribe al canal del equipo y Steven te escribe A TI. Los dos son
   * NOTIFICACIONES (la burbuja de chat, que se va sola y nunca roba el
   * foco): lo importante de Steven ya sale en primer plano como tarjeta de
   * narrador dentro de las escenas del día — un mensaje de pasillo jamás
   * debe interrumpir la partida.
   */
  function updateGabo(dt, live) {
    if (live.gameOver || game.rules.explore) return;
    if (teamsTimer == null) teamsTimer = randomTeamsDelay();
    teamsTimer -= dt;
    if (teamsTimer <= 0) {
      teamsTimer = randomTeamsDelay();
      const text = pickTeams(dialogues.teamsMessages?.gabo);
      if (text) hud.showTeamsMessage(text);
    }
    // Steven escribe menos que Gabo (un amigo no microgestiona) y arranca
    // desfasado, para que los dos relojes no suenen a la vez.
    if (stevenTimer == null) stevenTimer = randomTeamsDelay() * 1.6;
    stevenTimer -= dt;
    if (stevenTimer <= 0) {
      stevenTimer = randomTeamsDelay() * 2.2;
      const text = pickTeams(dialogues.teamsMessages?.steven);
      if (text) hud.showTeamsMessage(text, "Steven el Daddy");
    }
  }

  function pickTeams(pool) {
    if (!pool?.length) return null;
    let text = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) {
      while (text === lastTeamsMessage) text = pool[Math.floor(Math.random() * pool.length)];
    }
    lastTeamsMessage = text;
    // La burbuja no pasa por el visor de diálogo, así que los tokens
    // {masculino|femenino} se concuerdan aquí con la misma regla.
    const fem = ctx.getPlayerGender?.() === "f";
    return text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m, f) => (fem ? f : m));
  }

  function randomTeamsDelay() {
    const [min, max] = GABO_TEAMS_INTERVAL;
    return min + Math.random() * (max - min);
  }

  return {
    // El bucle de render pregunta si hay una escena en primer plano: es
    // quien llama a `setActionZoom`, y ese mando tiene UN solo dueño.
    get cinematic() {
      return dialogueCam.cinematic;
    },
    hud,
    dialogue,
    menus,
    guides,
    minimap,
    save,
    // La campaña se expone para las comprobaciones de tools/: la nota y el
    // calendario se pueden verificar sin jugar cinco días seguidos.
    campaign,
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
