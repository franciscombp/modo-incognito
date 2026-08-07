// Persistent progress. Kept deliberately tiny and defensive: a corrupted or
// blocked localStorage must never stop the game from booting.
//
// ── UN SLOT POR PERSONAJE ────────────────────────────────────────────
// El progreso ya no es uno global: cada personaje guarda SU carrera en su
// propia clave, y un puntero aparte dice quién está activo. Elegir a
// alguien en el expediente es cargar su slot; empezar con otro no borra el
// del anterior — vuelves con el primero y sigues donde ibas. Es lo que
// convierte "reiniciar" en "cambiar de empleado".
//
// El guardado viejo (una sola clave global) se MIGRA la primera vez: se
// copia al slot del personaje que llevaba dentro y se deja donde estaba —
// borrarlo no gana nada y conservarlo hace la migración inocua si algo
// sale mal a mitad.

const LEGACY_KEY = "modo-incognito:progress:v1";
const POINTER_KEY = "modo-incognito:progress:who:v1";

function slotKey(characterId) {
  return `${LEGACY_KEY}:${characterId}`;
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

/** Quién está activo. Migra el guardado global viejo la primera vez. */
function readPointer() {
  try {
    const who = localStorage.getItem(POINTER_KEY);
    if (who) return who;
    // Sin puntero: puede haber un guardado de la era de un-solo-slot. Si
    // llevaba personaje dentro, ese es su dueño; se copia a su slot. Sin
    // personaje no llegó a jugarse nada que valga la pena conservar.
    const legacy = readKey(LEGACY_KEY);
    if (legacy?.characterId) {
      localStorage.setItem(slotKey(legacy.characterId), JSON.stringify(legacy));
      localStorage.setItem(POINTER_KEY, legacy.characterId);
      return legacy.characterId;
    }
  } catch {
    /* private mode: se arranca vacío, como siempre */
  }
  return null;
}

export function createSave() {
  let who = readPointer();
  let state = (who && readKey(slotKey(who))) || { ...freshEmpty(), characterId: who };

  function write(next = state) {
    try {
      // Sin personaje elegido aún no hay slot donde escribir: el estado
      // vive en memoria y se persiste al elegir. Antes de la elección lo
      // único que pasa es navegar menús, así que no se pierde nada real.
      if (who) localStorage.setItem(slotKey(who), JSON.stringify(next));
    } catch {
      /* private mode / quota: progress is a nice-to-have, not a requirement */
    }
  }

  return {
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
     * Cambiar de personaje es CAMBIAR DE SLOT: se guarda la carrera del
     * actual, se mueve el puntero y se carga la del nuevo — o una vacía si
     * es su primer día. Volver al anterior retoma exactamente donde iba.
     */
    setCharacter(id) {
      if (id === who) return;
      write(state); // la carrera del actual, a salvo antes de soltar
      who = id;
      try {
        localStorage.setItem(POINTER_KEY, id);
      } catch {
        /* private mode: el cambio vale para la sesión */
      }
      state = readKey(slotKey(id)) ?? freshEmpty();
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
      // Solo el SLOT ACTIVO: reiniciar tu carrera no toca la de nadie más.
      state = { ...freshEmpty(), characterId: state.characterId };
      write(state);
    },
  };
}

/**
 * Mirilla de SOLO LECTURA a la carrera guardada de un personaje, sin
 * cambiar el slot activo. Es lo que usa el expediente para poner debajo de
 * cada cuenta "Día 3 · 2 misiones únicas" — o nada, si nunca ha fichado.
 */
export function peekSlot(characterId) {
  if (!characterId) return null;
  const s = readKey(slotKey(characterId));
  if (!s) return null;
  return {
    dayIndex: s.dayIndex ?? 0,
    completedDays: s.completedDays?.length ?? 0,
    unicas: s.campaign?.unicas?.length ?? 0,
    dia: s.campaign?.dia ?? 1,
  };
}
