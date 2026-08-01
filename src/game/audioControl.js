/**
 * Sistema de control de audio para el juego
 * - Muted por defecto hasta que el usuario interactúe
 * - Control de volumen con slider
 * - Sincroniza SFX y música
 */

import { getSettings, setSettings, subscribeSettings } from "./settings.js";

let isMuted = true;
let volume = 0.7; // Volumen por defecto cuando no está muteado
let unmuteCallback = null;

/**
 * Obtiene el estado actual de mute
 */
export function isMutedState() {
  return isMuted;
}

/**
 * Obtiene el volumen actual (0-1)
 */
export function getVolume() {
  return volume;
}

/**
 * Activa/desactiva el sonido
 */
export function setMuted(muted) {
  isMuted = muted;
  updateAudioSettings();
}

/**
 * Establece el volumen (0-1)
 */
export function setVolume(newVolume) {
  volume = Math.max(0, Math.min(1, newVolume));
  updateAudioSettings();
}

/**
 * Desactiva el mute con volumen especificado
 */
export function unmute(volumeLevel = 0.7) {
  isMuted = false;
  volume = Math.max(0, Math.min(1, volumeLevel));
  updateAudioSettings();
  if (unmuteCallback) unmuteCallback();
}

/**
 * Registra callback para cuando el usuario desmutea por primera vez
 */
export function onFirstUnmute(callback) {
  unmuteCallback = callback;
}

/**
 * Actualiza las configuraciones de audio
 */
function updateAudioSettings() {
  if (isMuted) {
    setSettings({ sound: false, music: false });
  } else {
    setSettings({
      sound: true,
      music: true,
      soundVolume: volume,
      musicVolume: volume
    });
  }
}

// Sincroniza cambios externos de configuración
subscribeSettings((settings) => {
  if (settings.sound !== undefined && settings.music !== undefined) {
    isMuted = !settings.sound && !settings.music;
  }
  if (settings.soundVolume !== undefined) {
    volume = settings.soundVolume;
  }
});

// Inicializa como muteado
updateAudioSettings();
