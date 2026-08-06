// La banda sonora del juego: riffs PROCEDURALES (soundtrackThemes.js), que se
// recombinan en vivo (bajo/lead/pad/perc) según el ánimo de la partida.
//
// Hubo una pista grabada real (mp3) que se remezclaba por ánimo además de
// estos riffs, pero sonaba encima del procedural y la mezcla resultante era
// un caos de dos pistas simultáneas — se quitó del todo. Todo el soundtrack
// pasa por aquí ahora, un único origen de sonido.
//
// Los stingers de victoria y derrota son siempre sintetizados, en su propio
// sintetizador.
import * as Tone from "tone";
import { getSettings, subscribeSettings } from "./settings.js";
import { THEMES } from "./soundtrackThemes.js";
import { getStepContent } from "./soundtrackPatterns.js";

let ready = false;
let started = false;
let currentThemeName = null;
let bassSynth, leadSynth, padSynth, percSynth, brassSynth, stringSynth, guitarSynth, fxSynth, pianoSynth, organSynth, choirSynth, stingerSynth;
let bassGain, leadGain, padGain, percGain, brassGain, stringGain, guitarGain, fxGain, pianoGain, organGain, choirGain, stingerGain;
let masterGain;
let mainLoop = null;
let percLoop = null;
let stepIndex = 0;
const synthByLayer = {};
const gainByLayer = {};

// Último instante (en segundos de audio) en que cada synth monofónico sonó de
// verdad. Un synth mono revienta si se le pide `triggerAttack` en un instante
// igual o anterior al último que ya atacó — y eso pasa de verdad cuando
// `Tone.Transport.bpm.rampTo` cambia de tempo justo entre dos ticks del loop:
// el siguiente tick puede recalcular un "time" que cae encima o antes del
// anterior. Sin este guardián el synth lanzaba, y esos golpes perdidos/rotos
// eran justo lo que se oía como "todo se mezcla mal" al cambiar de ánimo.
const lastTrigger = { bass: -1, lead: -1, pad: -1, perc: -1, brass: -1, string: -1, guitar: -1, fx: -1, piano: -1, organ: -1, choir: -1 };
function safeTrigger(synth, key, note, duration, time) {
  if (time <= lastTrigger[key]) return;
  lastTrigger[key] = time;
  try {
    synth.triggerAttackRelease(note, duration, time);
  } catch {
    // Colisión de instante interna de Tone (ver comentario arriba): se
    // pierde esta sola nota en vez de tumbar el resto del bucle de audio.
  }
}

function build() {
  if (ready) return;
  ready = true;

  masterGain = new Tone.Gain(getSettings().music ? 1 : 0).toDestination();

  bassGain = new Tone.Gain(0).connect(masterGain);
  leadGain = new Tone.Gain(0).connect(masterGain);
  padGain = new Tone.Gain(0).connect(masterGain);
  percGain = new Tone.Gain(0).connect(masterGain);
  brassGain = new Tone.Gain(0).connect(masterGain);
  stringGain = new Tone.Gain(0).connect(masterGain);
  guitarGain = new Tone.Gain(0).connect(masterGain);
  fxGain = new Tone.Gain(0).connect(masterGain);
  pianoGain = new Tone.Gain(0).connect(masterGain);
  organGain = new Tone.Gain(0).connect(masterGain);
  choirGain = new Tone.Gain(0).connect(masterGain);

  bassSynth = new Tone.FMSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.16, sustain: 0.16, release: 0.2 },
    modulation: { type: "sine" },
  }).connect(bassGain);

  leadSynth = new Tone.DuoSynth({
    vibratoAmount: 0.03,
    vibratoRate: 4,
    harmonicity: 1.02,
    voice0: {
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.12, sustain: 0.35, release: 0.16 },
    },
    voice1: {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.16, sustain: 0.32, release: 0.2 },
    },
  }).connect(leadGain);

  padSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.2 },
  }).connect(padGain);

  percSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
  }).connect(percGain);

  brassSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.008, decay: 0.22, sustain: 0.15, release: 0.2 },
  }).connect(brassGain);

  stringSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 1.0 },
  }).connect(stringGain);

  guitarSynth = new Tone.PluckSynth({ attackNoise: 0.32, dampening: 5600, resonance: 0.76 }).connect(guitarGain);

  fxSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0.08, release: 0.14 },
  }).connect(fxGain);

  pianoSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.35 },
  }).connect(pianoGain);

  organSynth = new Tone.FMSynth({
    harmonicity: 2.5,
    modulationIndex: 8,
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.004, decay: 0.2, sustain: 0.4, release: 0.1 },
    modulation: { type: "sine" },
  }).connect(organGain);

  choirSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.06, decay: 0.18, sustain: 0.55, release: 0.6 },
  }).connect(choirGain);

  synthByLayer.bass = bassSynth;
  synthByLayer.lead = leadSynth;
  synthByLayer.pad = padSynth;
  synthByLayer.perc = percSynth;
  synthByLayer.brass = brassSynth;
  synthByLayer.string = stringSynth;
  synthByLayer.guitar = guitarSynth;
  synthByLayer.fx = fxSynth;
  synthByLayer.piano = pianoSynth;
  synthByLayer.organ = organSynth;
  synthByLayer.choir = choirSynth;

  gainByLayer.bass = bassGain;
  gainByLayer.lead = leadGain;
  gainByLayer.pad = padGain;
  gainByLayer.perc = percGain;
  gainByLayer.brass = brassGain;
  gainByLayer.string = stringGain;
  gainByLayer.guitar = guitarGain;
  gainByLayer.fx = fxGain;
  gainByLayer.piano = pianoGain;
  gainByLayer.organ = organGain;
  gainByLayer.choir = choirGain;

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

  subscribeSettings((s) => {
    // Si music está desactivado (mute), volumen a 0. Si está activado, usar musicVolume (0-1)
    const targetVolume = s.music ? (s.musicVolume ?? 1) : 0;
    masterGain.gain.rampTo(targetVolume, 0.2);
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

function playLayerStep(theme, layer, time, stepIndex) {
  const synth = synthByLayer[layer];
  const gain = gainByLayer[layer];
  if (!synth || !gain) return;
  if (gain.gain.value <= 0.001) return;

  const contents = getStepContent(theme, layer, stepIndex);
  if (!contents.length) return;

  const baseVolume = theme.mix?.[layer] ?? 0.5;
  contents.forEach((event) => {
    const notes = event.notes ?? (event.note ? [event.note] : []);
    const noteList = (Array.isArray(notes) ? notes : [notes]).filter(Boolean);
    if (!noteList.length) return;
    const volume = Math.max(0.05, Math.min(1, (event.velocity ?? baseVolume) * 1.05));
    const duration = event.duration ?? "8n";
    const toPlay = noteList.length === 1 ? noteList[0] : noteList;
    if (layer === "perc") {
      safeTrigger(synth, layer, toPlay, duration, time);
      return;
    }
    if (volume <= 0) return;
    safeTrigger(synth, layer, toPlay, duration, time);
  });
}

// Un único Tone.Loop persistente por capa, en vez de un Tone.Sequence que se
// destruye y se recrea en cada cambio de ánimo. Lo segundo sonaba fatal:
// disposer + recrear mientras el Transport seguía corriendo hacía que Tone
// programara la primera nota de la secuencia nueva en un instante anterior al
// último ya programado para el mismo synth ("Start time must be strictly
// greater than previous start time"), y el intento de recuperarse de eso es
// lo que se oía como los temas mezclándose mal unos con otros. Ahora el loop
// nunca se destruye: cada tick simplemente lee el tema ACTUAL del paso
// actual, así que cambiar de ánimo solo cambia qué notas suenan, no cuándo.
function ensureLoops() {
  if (!mainLoop) {
    mainLoop = new Tone.Loop((time) => {
      const theme = THEMES[currentThemeName];
      if (!theme) return;
      ["bass", "lead", "pad", "brass", "guitar", "string", "fx", "piano", "organ", "choir"].forEach((layer) => {
        playLayerStep(theme, layer, time, stepIndex);
      });
      stepIndex++;
    }, "8n").start(0);
  }
  // La percusión de la persecución es una capa fija de corcheas, no un
  // patrón propio del tema — solo sube o baja de volumen.
  if (!percLoop) {
    percLoop = new Tone.Loop((time) => {
      if (time <= lastTrigger.perc) return;
      lastTrigger.perc = time;
      try {
        percSynth.triggerAttackRelease("16n", time);
      } catch {
        // Ver comentario en safeTrigger.
      }
    }, "8n").start(0);
  }
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
  ensureLoops();

  Tone.Transport.bpm.rampTo(theme.bpm, 0.6);

  const mix = theme.mix;
  bassGain.gain.rampTo(mix.bass ?? 0, 0.5);
  leadGain.gain.rampTo(mix.lead ?? 0, 0.5);
  padGain.gain.rampTo(mix.pad ?? 0, 0.5);
  percGain.gain.rampTo(mix.perc ?? 0, 0.5);
  brassGain.gain.rampTo(mix.brass ?? 0, 0.5);
  stringGain.gain.rampTo(mix.string ?? 0, 0.5);
  guitarGain.gain.rampTo(mix.guitar ?? 0, 0.5);
  fxGain.gain.rampTo(mix.fx ?? 0, 0.5);
  pianoGain.gain.rampTo(mix.piano ?? 0, 0.5);
  organGain.gain.rampTo(mix.organ ?? 0, 0.5);
  choirGain.gain.rampTo(mix.choir ?? 0, 0.5);

  if (Tone.Transport.state !== "started") Tone.Transport.start();
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
  Tone.Transport.stop();
}

/** Estado interno, solo para las comprobaciones de tools/. */
export function soundtrackState() {
  return {
    mood: currentThemeName,
    playing: Tone.Transport.state === "started",
    bpm: ready ? +Tone.Transport.bpm.value.toFixed(1) : null,
    mix: ready
      ? {
          bass: +bassGain.gain.value.toFixed(3),
          lead: +leadGain.gain.value.toFixed(3),
          pad: +padGain.gain.value.toFixed(3),
          perc: +percGain.gain.value.toFixed(3),
          brass: +brassGain.gain.value.toFixed(3),
          string: +stringGain.gain.value.toFixed(3),
          guitar: +guitarGain.gain.value.toFixed(3),
          fx: +fxGain.gain.value.toFixed(3),
          piano: +pianoGain.gain.value.toFixed(3),
          organ: +organGain.gain.value.toFixed(3),
          choir: +choirGain.gain.value.toFixed(3),
        }
      : null,
  };
}

/** Decide el ánimo a partir del estado de la partida (ver hud snapshot). Solo
 * cambia de tema en las transiciones — llamarla cada frame es barato. */
export function updateMoodFromSnapshot(state) {
  if (!state || state.gameOver) return;
  let mood = "calm";
  if (state.redAlert || state.bossState === "CHASE" || state.bossState === "SEARCH") {
    mood = "chase";
  } else if (state.suspicion / state.suspicionMax > 0.5) {
    mood = "tense";
  }
  setMood(mood);
}
