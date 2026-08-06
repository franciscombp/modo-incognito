// Player-facing options that are not the camera: look, feel and assists.
// Same shape as cameraSettings.js — a tiny observable store backed by
// localStorage, so the menus can bind straight to it.

const KEY = "modo-incognito:settings:v1";

export const QUALITY_LEVELS = {
  auto: { label: "Auto" },
  alto: { label: "Alto", shadows: true, shadowMap: 2048, maxPixelRatio: 2 },
  medio: { label: "Medio", shadows: true, shadowMap: 1024, maxPixelRatio: 1.5 },
  bajo: { label: "Bajo", shadows: false, shadowMap: 512, maxPixelRatio: 1 },
};

export const SETTINGS_SCHEMA = {
  stageSize: {
    label: "Tamaño de la interfaz",
    type: "choice",
    options: ["1280", "1920", "auto"],
    hint: "1280 = todo más grande · 1920 = más piso a la vista · se aplica al recargar",
  },
  quality: {
    label: "Calidad gráfica",
    type: "choice",
    options: ["auto", "alto", "medio", "bajo"],
    hint: "Auto baja sola si el dispositivo no da abasto",
  },
  pixelSize: {
    label: "Tamaño de píxel",
    type: "range",
    min: 0,
    max: 6,
    step: 1,
    hint: "0 = sin pixelar · 4+ = pixel art grueso",
  },
  colorLevels: {
    label: "Niveles de color",
    type: "range",
    min: 6,
    max: 256,
    step: 2,
    hint: "64 = color continuo · menos niveles = paleta más marcada",
  },
  showLabels: { label: "Rótulos de zona", type: "toggle" },
  showMarkers: { label: "Marcas de suelo", type: "toggle" },
  vibration: { label: "Vibración (móvil)", type: "toggle" },
  screenShake: { label: "Sacudida de cámara", type: "toggle" },
  sound: { label: "Sonido (efectos)", type: "toggle" },
  music: { label: "Música", type: "toggle" },
};

const DEFAULTS = Object.freeze({
  // 1280 POR DEFECTO, no "auto".
  //
  // El lienzo pequeño no es un modo degradado: es el MISMO diseño sobre una
  // rejilla menor, así que cada elemento ocupa más fracción de pantalla y
  // todo —HUD, diálogo, botones— se lee más grande. En el grande el texto
  // acababa por debajo de lo cómodo en cuanto la ventana no era enorme.
  // Quien quiera ver más piso a la vez tiene 1920 en Ajustes.
  stageSize: "1280",
  quality: "auto",
  pixelSize: 0,
  colorLevels: 256,
  showLabels: false,
  showMarkers: true,
  vibration: true,
  screenShake: true,
  sound: true,
  music: true,
});

function coerce(values) {
  const out = { ...DEFAULTS, ...values };
  for (const [k, def] of Object.entries(SETTINGS_SCHEMA)) {
    if (def.type === "range") {
      const n = Number(out[k]);
      out[k] = Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, n)) : DEFAULTS[k];
    } else if (def.type === "choice") {
      out[k] = def.options.includes(out[k]) ? out[k] : DEFAULTS[k];
    } else {
      out[k] = !!out[k];
    }
  }
  return out;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return coerce(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();
const listeners = new Set();

export function getSettings() {
  return current;
}

export function setSettings(patch) {
  current = coerce({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetSettings() {
  return setSettings({ ...DEFAULTS });
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

/**
 * Resolves "auto" against the device. Phones and tablets are the ones that
 * were stalling, so they start at medium and the frame-rate watchdog in
 * main.js can drop them further.
 */
export function resolveQuality(name = current.quality) {
  if (name !== "auto") return QUALITY_LEVELS[name] ?? QUALITY_LEVELS.medio;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const smallMemory = (navigator.deviceMemory ?? 8) <= 4;
  const fewCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  if (coarse || smallMemory || fewCores) return QUALITY_LEVELS.medio;
  return QUALITY_LEVELS.alto;
}

/** Short haptic tap, honouring the player's preference and device support. */
export function buzz(pattern = 12) {
  if (!current.vibration) return;
  navigator.vibrate?.(pattern);
}
