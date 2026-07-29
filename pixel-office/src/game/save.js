// Persistent progress. Kept deliberately tiny and defensive: a corrupted or
// blocked localStorage must never stop the game from booting.

const KEY = "modo-incognito:progress:v1";

const EMPTY = {
  dayIndex: 0,
  completedDays: [],
  eggs: [],
  flags: {},
  bestTimes: {},
  bestScores: {},
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
    completeDay(dayId, { seconds, score } = {}) {
      if (!state.completedDays.includes(dayId)) state.completedDays.push(dayId);
      if (seconds != null) {
        const prev = state.bestTimes[dayId];
        if (prev == null || seconds < prev) state.bestTimes[dayId] = seconds;
      }
      if (score != null) {
        const prev = state.bestScores[dayId];
        if (prev == null || score > prev) state.bestScores[dayId] = score;
      }
      write(state);
    },
    recordScore(dayId, score) {
      const prev = state.bestScores[dayId];
      if (prev == null || score > prev) {
        state.bestScores[dayId] = score;
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
    reset() {
      state = { ...EMPTY, completedDays: [], eggs: [], flags: {}, bestTimes: {}, bestScores: {} };
      write(state);
    },
  };
}
