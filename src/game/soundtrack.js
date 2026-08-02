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

let ready = false;
let started = false;
let currentThemeName = null;
let bassSynth, leadSynth, padSynth, percSynth, brassSynth, stringSynth, stingerSynth;
let bassGain, leadGain, padGain, percGain, brassGain, stringGain, stingerGain;
let masterGain;
let mainLoop = null;
let percLoop = null;
let stepIndex = 0;
// Último instante (en segundos de audio) en que cada synth monofónico sonó de
// verdad. Un synth mono revienta si se le pide `triggerAttack` en un instante
// igual o anterior al último que ya atacó — y eso pasa de verdad cuando
// `Tone.Transport.bpm.rampTo` cambia de tempo justo entre dos ticks del loop:
// el siguiente tick puede recalcular un "time" que cae encima o antes del
// anterior. Sin este guardián el synth lanzaba, y esos golpes perdidos/rotos
// eran justo lo que se oía como "todo se mezcla mal" al cambiar de ánimo.
const lastTrigger = { bass: -1, lead: -1, pad: -1, perc: -1, brass: -1, string: -1 };
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

  // Trompetas de fanfarria: diente de sierra con ataque duro, el "¡pa-pa!"
  // festivo de una banda de pop-rock, no un pad ni un lead más.
  brassSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.008, decay: 0.22, sustain: 0.15, release: 0.2 },
  }).connect(brassGain);

  // Strings sintetizados: onda cuadrada suave para acordes sostenidos
  // tipo violín sintético (tímbrica más cálida que pad puro).
  stringSynth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "square" },
    envelope: { attack: 0.3, decay: 0.2, sustain: 0.7, release: 1.0 },
  }).connect(stringGain);

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
      // Cada capa lee su PROPIA longitud, no `theme.steps`: lead trae el
      // doble de pasos que bass (una frase de dos vueltas de bajo en vez de
      // una), y modular todo por `theme.steps` (8) recortaba esa segunda
      // mitad de la melodía sin que sonara ningún error — simplemente nunca
      // se tocaba.
      const bassNote = theme.bass?.length ? theme.bass[stepIndex % theme.bass.length] : null;
      if (bassNote != null) safeTrigger(bassSynth, "bass", bassNote, "8n", time);
      const leadNote = theme.lead?.length ? theme.lead[stepIndex % theme.lead.length] : null;
      if (leadNote != null) safeTrigger(leadSynth, "lead", leadNote, "8n", time);
      const padNote = theme.pad?.length ? theme.pad[stepIndex % theme.pad.length] : null;
      if (padNote != null) safeTrigger(padSynth, "pad", padNote, "8n", time);
      const brassNote = theme.brass?.length ? theme.brass[stepIndex % theme.brass.length] : null;
      if (brassNote != null) safeTrigger(brassSynth, "brass", brassNote, "8n", time);
      const stringNote = theme.string?.length ? theme.string[stepIndex % theme.string.length] : null;
      if (stringNote != null) safeTrigger(stringSynth, "string", stringNote, "8n", time);
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
  bassGain.gain.rampTo(mix.bass, 0.5);
  leadGain.gain.rampTo(mix.lead, 0.5);
  padGain.gain.rampTo(mix.pad, 0.5);
  percGain.gain.rampTo(mix.perc, 0.5);
  brassGain.gain.rampTo(mix.brass ?? 0, 0.5);
  stringGain.gain.rampTo(mix.string ?? 0, 0.5);

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
