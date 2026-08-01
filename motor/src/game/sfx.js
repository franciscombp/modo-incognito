// Efectos de sonido 8-bit sintetizados con WebAudio — no hay archivos que
// cargar, así que nunca hay un sonido roto o un asset por subir. La música de
// fondo (esa sí en archivo) vive en music.js.
import { getSettings, subscribeSettings } from "./settings.js";

let ctx = null;
let enabled = getSettings().sound;
subscribeSettings((s) => {
  enabled = s.sound;
});

/** El audio no puede arrancar sin un gesto del usuario: se crea al primer sonido pedido. */
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // Safari y otros navegadores pueden rechazar resume si no hay gesto activo.
      // El contexto seguirá suspendido pero el juego no rompe.
    });
  }
  return ctx;
}

// Safari requiere intentos agresivos de resume después de cualquier gesto. En
// iOS/Safari, el AudioContext se suspende como medida de ahorro de batería y
// solo se reactiva después de un gesto. Reintentamos en cada interacción.
function attemptContextResume() {
  if (ctx?.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

// Reintenta resume en cada gesto de usuario (click, keydown, etc).
["click", "keydown", "touchstart"].forEach((event) => {
  document.addEventListener(event, attemptContextResume, { passive: true });
});

/**
 * Un tono cuadrado/triangular con ataque y caída instantáneos, al estilo
 * consola de 8 bits. `slideTo`, si se da, desliza la frecuencia durante toda
 * la nota (para los "blip" ascendentes/descendentes de menú).
 */
function tone({ freq, duration = 0.09, type = "square", volume = 0.16, slideTo = null, delay = 0 }) {
  if (!enabled) return;
  const c = getCtx();
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.linearRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Varios tonos en secuencia, cada uno con su propio retraso. */
function chime(notes) {
  notes.forEach((n) => tone(n));
}

export function sfxMove() {
  tone({ freq: 340, duration: 0.045, type: "square", volume: 0.1 });
}

export function sfxSelect() {
  chime([
    { freq: 520, duration: 0.06, volume: 0.14 },
    { freq: 780, duration: 0.08, volume: 0.14, delay: 0.05 },
  ]);
}

export function sfxBack() {
  tone({ freq: 300, duration: 0.1, slideTo: 160, volume: 0.13 });
}

export function sfxOpen() {
  tone({ freq: 260, duration: 0.12, slideTo: 520, volume: 0.12 });
}

/** Un "tick" muy corto por letra del texto, como las novelas visuales clásicas. */
export function sfxType() {
  tone({ freq: 900 + Math.random() * 120, duration: 0.02, type: "square", volume: 0.05 });
}

export function sfxAdvance() {
  tone({ freq: 440, duration: 0.05, volume: 0.1 });
}

/** Completar una actividad prohibida: un arpegio ascendente y contento. */
export function sfxComplete() {
  chime([
    { freq: 523, duration: 0.09, volume: 0.16 },
    { freq: 659, duration: 0.09, volume: 0.16, delay: 0.07 },
    { freq: 784, duration: 0.16, volume: 0.18, delay: 0.14 },
  ]);
}

/** Distracción aceptada: dos notas cómplices. */
export function sfxDistraction() {
  chime([
    { freq: 660, duration: 0.07, volume: 0.14 },
    { freq: 880, duration: 0.09, volume: 0.14, delay: 0.06 },
  ]);
}

/** El jefe te amonesta: descenso brusco, tipo "game over" corto. */
export function sfxWarn() {
  chime([
    { freq: 300, duration: 0.12, volume: 0.2 },
    { freq: 220, duration: 0.16, volume: 0.2, delay: 0.1 },
    { freq: 140, duration: 0.22, volume: 0.2, delay: 0.22 },
  ]);
}
