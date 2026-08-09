// Persistent progress. Kept deliberately tiny and defensive: a corrupted or
// blocked localStorage must never stop the game from booting.
//
// ── TRES SLOTS NUMERADOS, COMO UNA CONSOLA ───────────────────────────
// El progreso vive en TRES ranuras (1, 2, 3) y el personaje va DENTRO de
// cada una. Es el modelo de Sneaky Sasquatch: entras, eliges ranura, y si
// está vacía creas una partida nueva eligiendo con quién la juegas.
//
// Antes la ranura ERA el personaje: había tantas carreras como gente en el
// reparto y no se podían tener dos partidas con Giuli, ni empezar de cero
// sin borrar la anterior. Con ranuras numeradas «empezar de nuevo» deja de
// ser destructivo — te vas a la 2 y la 1 sigue donde estaba.
//
// ── QUÉ SE MIGRA ─────────────────────────────────────────────────────
// Los dos formatos anteriores se recogen la primera vez y NO se borran:
// conservarlos no cuesta nada y hace la migración inocua si algo falla a
// mitad. Se rellenan las ranuras por orden, la que más ha jugado primero.

const LEGACY_KEY = "modo-incognito:progress:v1";
const LEGACY_POINTER = "modo-incognito:progress:who:v1";

export const SLOT_COUNT = 3;
const SLOT_KEY = "modo-incognito:slot:v2";
const ACTIVE_KEY = "modo-incognito:slot:active:v2";
const MIGRATED_KEY = "modo-incognito:slot:migrated:v2";

function slotKey(n) {
  return `${SLOT_KEY}:${n}`;
}

const EMPTY = {
  dayIndex: 0,
  completedDays: [],
  eggs: [],
  flags: {},
  bestTimes: {},
  // Lo mejor de un día ya no son puntos: es el tiempo que te SOBRÓ al
  // terminarlo. Los saves antiguos traen un `bestScores` en puntos que ya no
  // lee nadie; `read()` los fusiona sobre EMPTY, así que estorbar no estorba.
  bestSpare: {},
  characterId: null,
  hadWarningYesterday: false,
  // La carrera (docs/CAMPANA.md): temporada, día dentro de ella y las
  // misiones ÚNICAS ya hechas. El guardado es por progreso de TAREAS: una
  // única se escribe aquí en el acto, no al cerrar el día.
  campaign: { temporada: 1, dia: 1, unicas: [] },
  // Cuándo se tocó por última vez, para que la ranura pueda decir "ayer".
  playedAt: null,
};

/** Un estado virgen SIN aliasing: cada llamada trae sus propios arrays.
    `{ ...EMPTY }` a secas compartía `completedDays` y compañía entre
    estados — mutar uno era mutar todos. */
function freshEmpty() {
  return {
    ...EMPTY,
    completedDays: [],
    eggs: [],
    flags: {},
    bestTimes: {},
    bestSpare: {},
    campaign: { temporada: 1, dia: 1, unicas: [] },
  };
}

function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return { ...freshEmpty(), ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function writeKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota: progress is a nice-to-have, not a requirement */
  }
}

/** ¿Esta ranura tiene algo que perder? Vacía = nunca se eligió personaje. */
function isUsed(s) {
  return !!s && !!s.characterId;
}

/**
 * Recoge los guardados de los dos formatos anteriores y los reparte por las
 * ranuras. Corre UNA vez (deja su propia marca) y no borra nada de lo viejo.
 */
function migrateOnce() {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
  } catch {
    return; // sin localStorage no hay nada que migrar
  }

  const found = [];
  // Formato 2: una clave por personaje (`...:v1:<id>`).
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(`${LEGACY_KEY}:`)) continue;
      const s = readKey(key);
      if (isUsed(s)) found.push(s);
    }
  } catch {
    /* ignore */
  }
  // Formato 1: una sola clave global.
  const global = readKey(LEGACY_KEY);
  if (isUsed(global) && !found.some((s) => s.characterId === global.characterId)) {
    found.push(global);
  }

  // La que más ha jugado, a la ranura 1: si alguien solo mira la primera,
  // que sea la suya de verdad.
  found.sort((a, b) => (b.completedDays?.length ?? 0) - (a.completedDays?.length ?? 0));
  found.slice(0, SLOT_COUNT).forEach((s, i) => writeKey(slotKey(i + 1), s));

  let active = null;
  try {
    active = localStorage.getItem(LEGACY_POINTER);
  } catch {
    /* ignore */
  }
  const at = found.findIndex((s) => s.characterId === active);
  writeKey(ACTIVE_KEY, at >= 0 ? at + 1 : found.length ? 1 : null);
  writeKey(MIGRATED_KEY, true);
}

/**
 * Resumen de SOLO LECTURA de cada ranura, para pintarlas en el menú. Nunca
 * cambia la ranura activa: la pantalla de partidas se dibuja sin cargar
 * ninguna.
 */
export function listSlots() {
  migrateOnce();
  const out = [];
  for (let n = 1; n <= SLOT_COUNT; n++) {
    const s = readKey(slotKey(n));
    out.push(
      isUsed(s)
        ? {
            index: n,
            empty: false,
            characterId: s.characterId,
            dayIndex: s.dayIndex ?? 0,
            completedDays: s.completedDays?.length ?? 0,
            temporada: s.campaign?.temporada ?? 1,
            dia: s.campaign?.dia ?? 1,
            unicas: s.campaign?.unicas?.length ?? 0,
            eggs: s.eggs?.length ?? 0,
            playedAt: s.playedAt ?? null,
          }
        : { index: n, empty: true }
    );
  }
  return out;
}

/** La ranura que se estaba jugando, o null si aún no se ha elegido. */
export function activeSlot() {
  migrateOnce();
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    const n = Number(JSON.parse(raw));
    return n >= 1 && n <= SLOT_COUNT ? n : null;
  } catch {
    return null;
  }
}

export function createSave() {
  migrateOnce();
  // Se arranca SIN ranura a propósito: el juego abre en el menú y es la
  // pantalla de partidas quien decide cuál se juega. Cargar la última por
  // su cuenta haría que "Jugar" se saltara la elección, que es justo lo que
  // esta pantalla existe para no hacer.
  let slot = null;
  let state = freshEmpty();

  function write(next = state) {
    if (!slot) return; // sin ranura elegida el estado vive en memoria
    next.playedAt = Date.now();
    writeKey(slotKey(slot), next);
  }

  return {
    get slot() {
      return slot;
    },
    get state() {
      return state;
    },
    get dayIndex() {
      return state.dayIndex;
    },
    setDayIndex(i) {
      state.dayIndex = i;
      write(state);
    },
    get characterId() {
      return state.characterId;
    },
    get campaign() {
      return state.campaign ?? { temporada: 1, dia: 1, unicas: [] };
    },
    set campaign(c) {
      state.campaign = c;
      write(state);
    },
    /**
     * Entrar en una ranura: se guarda lo que hubiera abierto, se mueve el
     * puntero y se carga esa carrera — o una vacía si es nueva.
     */
    useSlot(n) {
      if (n === slot) return state;
      write(state);
      slot = n;
      writeKey(ACTIVE_KEY, n);
      state = readKey(slotKey(n)) ?? freshEmpty();
      return state;
    },
    /** Vaciar una ranura. Si es la abierta, se queda abierta y en blanco. */
    clearSlot(n) {
      try {
        localStorage.removeItem(slotKey(n));
      } catch {
        /* private mode */
      }
      if (n === slot) state = freshEmpty();
    },
    /**
     * El personaje con el que se juega ESTA ranura. Ya no cambia de slot:
     * la ranura es la partida y el personaje es una propiedad suya, así que
     * cambiarlo a mitad de carrera conserva el progreso.
     */
    setCharacter(id) {
      state.characterId = id;
      write(state);
    },
    get hadWarningYesterday() {
      return !!state.hadWarningYesterday;
    },
    setHadWarningYesterday(value) {
      state.hadWarningYesterday = !!value;
      write(state);
    },
    completeDay(dayId, { seconds, spare } = {}) {
      if (!state.completedDays.includes(dayId)) state.completedDays.push(dayId);
      if (seconds != null) {
        const prev = state.bestTimes[dayId];
        if (prev == null || seconds < prev) state.bestTimes[dayId] = seconds;
      }
      if (spare != null) {
        const prev = state.bestSpare[dayId];
        if (prev == null || spare > prev) state.bestSpare[dayId] = spare;
      }
      write(state);
    },
    /** Cuánto reloj te sobró, aunque no completaras el día. */
    recordSpare(dayId, spare) {
      if (spare == null) return;
      const prev = state.bestSpare[dayId];
      if (prev == null || spare > prev) {
        state.bestSpare[dayId] = spare;
        write(state);
      }
    },
    hasCompleted(dayId) {
      return state.completedDays.includes(dayId);
    },
    findEgg(eggId) {
      if (state.eggs.includes(eggId)) return false;
      state.eggs.push(eggId);
      write(state);
      return true;
    },
    hasEgg(eggId) {
      return state.eggs.includes(eggId);
    },
    setFlag(name, value = true) {
      state.flags[name] = value;
      write(state);
    },
    getFlag(name) {
      return state.flags[name];
    },
    /**
     * Borra el estado de CONVERSACIÓN (talk:/caught:), y solo ese. Se llama
     * al arrancar cada día: las charlas vuelven a empezar — Gabo se
     * PRESENTA en vez de saltar a una línea de seguimiento como si el
     * reintento no hubiera pasado. Los flags de historia (elecciones,
     * secretos) no se tocan.
     */
    resetTalkFlags() {
      for (const key of Object.keys(state.flags)) {
        if (key.startsWith("talk:") || key.startsWith("caught:")) delete state.flags[key];
      }
      write(state);
    },
    /**
     * "Reiniciar progreso" de verdad: días completados, secretos, mejores
     * tiempos, con quién ya hablaste y cuántas amonestaciones llevas — todo
     * lo que hace que un día 1 nuevo no se sienta nuevo. El personaje
     * elegido se conserva a propósito: es una preferencia, no progreso, y
     * pedirlo de nuevo cada vez que reinicias es fricción sin motivo.
     */
    reset() {
      // Solo la RANURA ABIERTA: reiniciar tu partida no toca las otras dos.
      state = { ...freshEmpty(), characterId: state.characterId };
      write(state);
    },
  };
}
