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
  quality: {
    label: "Calidad gráfica",
    type: "choice",
    options: ["auto", "alto", "medio", "bajo"],
    hint: "Auto baja sola si el dispositivo no da abasto",
  },
  pixelSize: {
    label: "Tamaño de píxel",
    type: "range",
    min: 1,
    max: 6,
    step: 1,
    hint: "1 = 3D nítido · 4+ = pixel art grueso",
  },
  colorLevels: {
    label: "Niveles de color",
    type: "range",
    min: 6,
    max: 64,
    step: 2,
    hint: "Menos niveles = paleta más marcada",
  },
  showLabels: { label: "Rótulos de zona", type: "toggle" },
  showMarkers: { label: "Marcas de suelo", type: "toggle" },
  vibration: { label: "Vibración (móvil)", type: "toggle" },
  screenShake: { label: "Sacudida de cámara", type: "toggle" },
};

const DEFAULTS = Object.freeze({
  quality: "auto",
  pixelSize: 1,
  colorLevels: 24,
  showLabels: false,
  showMarkers: true,
  vibration: true,
  screenShake: true,
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
