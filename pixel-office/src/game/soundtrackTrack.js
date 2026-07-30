// La banda sonora "de verdad": un tema grabado que suena en bucle y REACCIONA
// al juego, en vez de los riffs sintetizados de soundtrackThemes.js.
//
// Por qué existiendo ya el soundtrack procedural: un tema compuesto tiene
// gancho, y el procedural nunca lo va a tener. Pero la petición original era
// que la música respondiera a lo que pasa en la partida, así que aquí no se
// reproduce y ya — se le hace *remezcla vertical ligera*: un filtro y un
// volumen por ánimo. Con el jefe lejos el tema suena apagado, como si viniera
// de otra sala; cuando te caza se abre del todo y sube el tempo. Es la misma
// pieza, pero se nota cuándo estás en problemas.
//
// Si el archivo no está, esto no rompe nada: soundtrack.js se queda con los
// riffs sintetizados (ver USE_TRACK / trackFailed).
import * as Tone from "tone";

const BASE = import.meta.env.BASE_URL ?? "/";

// Medido sobre el propio archivo: 136 BPM y 16 compases exactos de bucle
// (0 -> 28.235 s), que es justo antes del fundido final del tema. Si cambias
// de pista, recalcula esto o el bucle se oirá cortado.
export const TRACK = {
  url: `${BASE}audio/stapler-sprint.mp3`,
  bpm: 136,
  loopStart: 0,
  loopEnd: 28.235,
};

// Un ajuste por ánimo. `cutoff` es el filtro paso bajo en Hz (bajo = lejano y
// sordo), `rate` el multiplicador de velocidad de reproducción.
export const TRACK_MOODS = {
  title: { volume: 0.85, cutoff: 20000, rate: 1.0 },
  calm: { volume: 0.6, cutoff: 900, rate: 1.0 },
  tense: { volume: 0.8, cutoff: 2600, rate: 1.02 },
  chase: { volume: 1.0, cutoff: 20000, rate: 1.08 },
  crossing: { volume: 0.95, cutoff: 20000, rate: 1.04 },
};

export function createTrackPlayer(destination) {
  let player = null;
  let filter = null;
  let gain = null;
  let failed = false;
  let ready = false;
  // El ánimo pedido más reciente. Se guarda porque el primer `apply()` llega
  // casi siempre ANTES de que el mp3 termine de decodificarse: sin esto la
  // pista se quedaba cargada pero muda para siempre, ya que solo se
  // intentaba arrancar en el momento del cambio de ánimo.
  let wantedMood = null;

  function build() {
    if (player || failed) return;
    gain = new Tone.Gain(0).connect(destination);
    filter = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -12 }).connect(gain);
    player = new Tone.Player({
      url: TRACK.url,
      loop: true,
      loopStart: TRACK.loopStart,
      loopEnd: TRACK.loopEnd,
      autostart: false,
      onload: () => {
        ready = true;
        sync(); // ya se puede arrancar el ánimo que estuviera esperando
      },
      onerror: () => {
        // Sin pista no hay drama: el soundtrack procedural toma el relevo.
        failed = true;
      },
    }).connect(filter);
  }

  /** Pone la pista a sonar (si ya cargó) y la ajusta al ánimo pendiente. */
  function sync() {
    if (failed || !player || !wantedMood) return;
    const m = TRACK_MOODS[wantedMood] ?? TRACK_MOODS.calm;
    if (ready && player.state !== "started") {
      try {
        player.start();
      } catch {
        /* el contexto aún no arrancó; el próximo sync lo reintenta */
      }
    }
    gain.gain.rampTo(m.volume, 1.2);
    filter.frequency.rampTo(m.cutoff, 1.2);
    player.playbackRate = m.rate;
  }

  return {
    get failed() {
      return failed;
    },
    get ready() {
      return ready;
    },
    // Expuesto para tools/check-*: confirma que suena de verdad y que el
    // ánimo mueve filtro y velocidad, no solo que el archivo exista.
    get isPlaying() {
      return !!player && player.state === "started";
    },
    get cutoff() {
      return filter ? Math.round(filter.frequency.value) : null;
    },
    get rate() {
      return player ? +player.playbackRate.toFixed(3) : null;
    },

    /** Arranca (si hace falta) y adapta la mezcla al ánimo pedido. */
    apply(mood) {
      build();
      if (failed || !player) return false;
      wantedMood = mood;
      sync();
      return true;
    },

    /** Reintenta arrancar: lo llama el motor por si el audio aún no podía sonar. */
    nudge() {
      sync();
    },

    stop() {
      wantedMood = null;
      if (player && player.state === "started") player.stop();
      if (gain) gain.gain.rampTo(0, 0.3);
    },
  };
}
