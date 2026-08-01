import { CAMERA_PRESET } from "./config.js";

// Live, tweakable camera parameters.
//
// The in-game camera panel writes here, the camera and the input mapping read
// from here, and everything is persisted to localStorage — so you can nudge
// the framing until it looks right, copy the resulting block and paste it
// into config.js as the new default.

const KEY = "modo-incognito:camera:v1";

export const CAMERA_LIMITS = {
  fov: { min: 14, max: 70, step: 1, label: "Campo de visión", unit: "°" },
  yawDeg: { min: -180, max: 180, step: 1, label: "Rotación (yaw)", unit: "°" },
  pitchDeg: { min: 12, max: 85, step: 1, label: "Inclinación (pitch)", unit: "°" },
  distance: { min: 12, max: 120, step: 1, label: "Distancia", unit: "" },
  lookAtYOffset: { min: 0, max: 4, step: 0.1, label: "Altura del objetivo", unit: "" },
  followLerp: { min: 0.02, max: 0.4, step: 0.01, label: "Suavizado", unit: "" },
};

const DEFAULTS = Object.freeze({
  fov: CAMERA_PRESET.fov,
  yawDeg: CAMERA_PRESET.yawDeg,
  pitchDeg: CAMERA_PRESET.pitchDeg,
  distance: CAMERA_PRESET.distance,
  lookAtYOffset: CAMERA_PRESET.lookAtYOffset,
  followLerp: CAMERA_PRESET.followLerp,
});

function clampAll(values) {
  const out = { ...values };
  for (const [k, lim] of Object.entries(CAMERA_LIMITS)) {
    if (typeof out[k] !== "number" || Number.isNaN(out[k])) out[k] = DEFAULTS[k];
    out[k] = Math.min(lim.max, Math.max(lim.min, out[k]));
  }
  return out;
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? clampAll({ ...DEFAULTS, ...JSON.parse(raw) }) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let current = read();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: the session still works, it just won't be remembered */
  }
}

function emit() {
  listeners.forEach((fn) => fn(current));
}

export function getCameraSettings() {
  return current;
}

/** Partial update. Values are clamped to CAMERA_LIMITS before anything sees them. */
export function setCameraSettings(patch, { persistNow = true } = {}) {
  current = clampAll({ ...current, ...patch });
  if (persistNow) persist();
  emit();
  return current;
}

export function resetCameraSettings() {
  current = { ...DEFAULTS };
  persist();
  emit();
  return current;
}

export function isDefaultCameraSettings() {
  return Object.keys(DEFAULTS).every((k) => Math.abs(current[k] - DEFAULTS[k]) < 1e-6);
}

export function subscribeCameraSettings(fn) {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

/**
 * The current framing as a paste-ready CAMERA_PRESET block. This is what the
 * "copiar" button puts on the clipboard: drop it into src/scene/config.js and
 * the tweak becomes the new default for everyone.
 */
export function cameraSettingsToCode() {
  const n = (v, d = 0) => Number(v.toFixed(d));
  return `export const CAMERA_PRESET = {
  type: "perspective",
  fov: ${n(current.fov)},
  yawDeg: ${n(current.yawDeg)},
  pitchDeg: ${n(current.pitchDeg)},
  distance: ${n(current.distance)},
  lookAtYOffset: ${n(current.lookAtYOffset, 2)},
  followLerp: ${n(current.followLerp, 2)},
  zoomMin: ${CAMERA_PRESET.zoomMin},
  zoomMax: ${CAMERA_PRESET.zoomMax},
};`;
}
