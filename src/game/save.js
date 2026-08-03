// Persistent progress. Kept deliberately tiny and defensive: a corrupted or
// blocked localStorage must never stop the game from booting.

const KEY = "modo-incognito:progress:v1";

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
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode / quota: progress is a nice-to-have, not a requirement */
  }
}

export function createSave() {
  let state = read();

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
     * "Reiniciar progreso" de verdad: días completados, secretos, mejores
     * tiempos, con quién ya hablaste y cuántas amonestaciones llevas — todo
     * lo que hace que un día 1 nuevo no se sienta nuevo. El personaje
     * elegido se conserva a propósito: es una preferencia, no progreso, y
     * pedirlo de nuevo cada vez que reinicias es fricción sin motivo.
     */
    reset() {
      state = { ...EMPTY, characterId: state.characterId, completedDays: [], eggs: [], flags: {}, bestTimes: {}, bestSpare: {} };
      write(state);
    },
  };
}
