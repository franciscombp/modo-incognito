// La banda sonora del juego, en dos capas que se eligen solas:
//
//  1. La PISTA compuesta (soundtrackTrack.js -> public/audio/*.mp3). Es la que
//     suena normalmente. No se limita a sonar: se le hace remezcla vertical
//     ligera — filtro y volumen por ánimo — para que siga reaccionando a la
//     partida, que es de lo que iba el soundtrack desde el principio.
//  2. Los riffs PROCEDURALES de soundtrackThemes.js, como plan B. Si el mp3
//     no está o no carga, el juego sigue teniendo música en vez de quedarse
//     mudo, y ahí sí se recombinan capas en vivo (bajo/lead/pad/perc).
//
// Los stingers de victoria y derrota son siempre sintetizados, en su propio
// sintetizador, así que suenan con o sin pista.
import * as Tone from "tone";
import { getSettings, subscribeSettings } from "./settings.js";
import { THEMES } from "./soundtrackThemes.js";
import { createTrackPlayer } from "./soundtrackTrack.js";

let ready = false;
let started = false;
let currentThemeName = null;
let bassSynth, leadSynth, padSynth, percSynth, stingerSynth;
let bassGain, leadGain, padGain, percGain, stingerGain;
let bassSeq, leadSeq, padSeq;
let masterGain;
let percSeqBuilt = false;
let track = null;

// Con una pista compuesta disponible manda ella y los riffs sintetizados se
// callan; si el archivo falta o no carga, `track.failed` deja que el
// soundtrack procedural siga siendo el plan B, sin que el juego se entere.
function useTrack() {
  return track && !track.failed;
}

function build() {
  if (ready) return;
  ready = true;

  masterGain = new Tone.Gain(getSettings().music ? 1 : 0).toDestination();

  bassGain = new Tone.Gain(0).connect(masterGain);
  leadGain = new Tone.Gain(0).connect(masterGain);
  padGain = new Tone.Gain(0).connect(masterGain);
  percGain = new Tone.Gain(0).connect(masterGain);

  bassSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 },
  }).connect(bassGain);

  // Pizzicato/ukulele: PluckSynth es justo esa cuerda pulsada y corta que le
  // da al riff su aire de "mockumentary de oficina" en vez de sonar a videojuego serio.
  leadSynth = new Tone.PluckSynth({ attackNoise: 0.6, dampening: 3200, resonance: 0.82 }).connect(
    leadGain
  );

  padSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.2 },
  }).connect(padGain);

  percSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  }).connect(percGain);

  // Los stingers (victoria/derrota) tienen su propio sintetizador a
  // propósito. Compartir `leadSynth` con el bucle hacía que Tone lanzara
  // "The time must be greater than or equal to the last scheduled time":
  // el stinger reserva ~1.4 s de notas futuras y, mientras tanto, la
  // secuencia del tema seguía pidiéndole notas en instantes anteriores.
  stingerGain = new Tone.Gain(1).connect(masterGain);
  stingerSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.4 },
  }).connect(stingerGain);

  track = createTrackPlayer(masterGain);

  subscribeSettings((s) => {
    masterGain.gain.rampTo(s.music ? 1 : 0, 0.2);
  });
}

async function ensureStarted() {
  build();
  if (started) return;
  try {
    await Tone.start();
    started = true;
  } catch {
    // Sin gesto de usuario todavía: se reintenta en el próximo setMood/playStinger.
    // En Safari este error es común incluso después de un gesto.
  }
}

// Reintenta iniciar Tone en cada gesto de usuario, especialmente en Safari donde
// el contexto de audio se bloquea por ahorro de batería.
["click", "keydown", "touchstart"].forEach((event) => {
  document.addEventListener(event, () => ensureStarted(), { passive: true });
});

function makeSequence(pattern, steps, synth, isChord) {
  if (!pattern || !pattern.length) return null;
  return new Tone.Sequence(
    (time, note) => {
      if (note == null) return;
      synth.triggerAttackRelease(note, "8n", time);
    },
    pattern,
    `${steps === 8 ? "8n" : "16n"}`
  ).start(0);
}

function disposeSequences() {
  [bassSeq, leadSeq, padSeq].forEach((seq) => seq?.dispose());
  bassSeq = leadSeq = padSeq = null;
}

/** Cambia de tema (calm/tense/chase/title...), con una transición suave de
 * tempo y volumen en vez de un corte — así el motor puede llamarla cada
 * frame sin que suene a interruptor. No hace nada si ya es el tema activo. */
export async function setMood(name) {
  const theme = THEMES[name];
  if (!theme || !theme.bass) return; // victory/defeat son stingers, no temas
  if (name === currentThemeName) return;
  currentThemeName = name;

  await ensureStarted();
  build();

  // La pista compuesta lleva la voz cantante. Solo si no hay archivo se
  // recurre a los riffs de soundtrackThemes.js.
  if (track) {
    track.apply(name);
    if (useTrack()) {
      silenceSynthLayers();
      return;
    }
  }

  Tone.Transport.bpm.rampTo(theme.bpm, 0.6);

  disposeSequences();
  bassSeq = makeSequence(theme.bass, theme.steps, bassSynth, false);
  leadSeq = makeSequence(theme.lead, theme.steps, leadSynth, false);
  padSeq = makeSequence(theme.pad, theme.steps, padSynth, true);
  // La percusión de la persecución es una capa fija de corcheas, no un patrón
  // propio del tema — solo sube o baja de volumen.
  if (!percSeqBuilt) {
    percSeqBuilt = true;
    new Tone.Sequence((time) => percSynth.triggerAttackRelease("16n", time), [0], "8n").start(0);
  }

  const mix = theme.mix;
  bassGain.gain.rampTo(mix.bass, 0.5);
  leadGain.gain.rampTo(mix.lead, 0.5);
  padGain.gain.rampTo(mix.pad, 0.5);
  percGain.gain.rampTo(mix.perc, 0.5);

  if (Tone.Transport.state !== "started") Tone.Transport.start();
}

/** Baja las capas sintetizadas: con pista real no deben sonar encima. */
function silenceSynthLayers() {
  [bassGain, leadGain, padGain, percGain].forEach((g) => g?.gain.rampTo(0, 0.4));
  disposeSequences();
  if (Tone.Transport.state === "started") Tone.Transport.stop();
}

/** Un puñado de notas sueltas (victoria/derrota), no un bucle. */
export async function playStinger(name) {
  const theme = THEMES[name];
  if (!theme?.notes) return;
  await ensureStarted();
  build();
  const now = Tone.now();
  theme.notes.forEach((note, i) => {
    stingerSynth.triggerAttackRelease(note, "8n", now + i * (theme.noteDuration + theme.gap));
  });
}

export function stopSoundtrack() {
  currentThemeName = null;
  track?.stop();
  Tone.Transport.stop();
  disposeSequences();
}

/** Estado interno, solo para las comprobaciones de tools/. */
export function soundtrackState() {
  return {
    mood: currentThemeName,
    usingTrack: useTrack(),
    trackReady: !!track?.ready,
    trackFailed: !!track?.failed,
    playing: track?.isPlaying ?? false,
    cutoff: track?.cutoff ?? null,
    rate: track?.rate ?? null,
  };
}

/** Decide el ánimo a partir del estado de la partida (ver hud snapshot). Solo
 * cambia de tema en las transiciones — llamarla cada frame es barato. */
export function updateMoodFromSnapshot(state) {
  if (!state || state.gameOver) return;
  // Si la pista ya cargó pero aún no suena (el contexto de audio tardó en
  // desbloquearse), se reintenta aquí en vez de esperar a un cambio de ánimo
  // que quizá no llegue en toda la partida.
  if (track && !track.failed && !track.isPlaying) track.nudge();
  let mood = "calm";
  if (state.redAlert || state.bossState === "CHASE" || state.bossState === "SEARCH") {
    mood = "chase";
  } else if (state.suspicion / state.suspicionMax > 0.5) {
    mood = "tense";
  }
  setMood(mood);
}
