// Música de fondo en bucle. A diferencia de sfx.js (sintetizado), esto sí
// necesita archivos reales: cae uno por día en public/audio/music/<id>.mp3
// (título: public/audio/music/title.mp3). Mientras no exista el archivo, o
// mientras la jugadora tenga la música apagada en Ajustes, no suena nada —
// nunca un error visible, igual que las ilustraciones de acción en hud.js.
import { getSettings, subscribeSettings } from "./settings.js";

const BASE = import.meta.env.BASE_URL ?? "/";
let audio = null;
let currentSrc = null;
let enabled = getSettings().music;

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.loop = true;
  audio.volume = 0.35;
  audio.onerror = () => {
    currentSrc = null;
  };
  return audio;
}

subscribeSettings((s) => {
  enabled = s.music;
  if (!audio) return;
  if (!enabled) audio.pause();
  else if (currentSrc) audio.play().catch(() => {});
});

/** Cambia de pista (o no hace nada si ya es la que suena). Silencioso si falta el archivo. */
export function playMusic(id) {
  const src = `${BASE}audio/music/${id}.mp3`;
  if (currentSrc === src) return;
  currentSrc = src;
  const el = ensureAudio();
  el.src = src;
  if (enabled) el.play().catch(() => {});
}

export function stopMusic() {
  currentSrc = null;
  audio?.pause();
}
