// Global tuning knobs shared by the layout, the camera and the entities.
//
// WORLD_SCALE is the single lever for "how big does the floor feel". Every
// layout coordinate, every piece of furniture, the camera distance and the
// character sizes are multiplied by it, so changing it re-sizes the diorama
// without breaking any proportion.
export const WORLD_SCALE = 1.2;

/** Oblique JRPG-diorama framing: a high, tilted, narrow-FOV perspective. */
export const CAMERA_PRESET = {
  type: "perspective",
  fov: 40,
  yawDeg: 0,
  pitchDeg: 52,
  distance: 14,
  lookAtYOffset: 2.1,
  followLerp: 0.08,
  zoomMin: 0.9,
  zoomMax: 1.2,
};

/** Zone palette. Deliberately small — 8 accents plus neutrals. */
export const PALETTE = {
  segmentos: "#f2b6c3",
  tribu: "#a9c9f2",
  experiencia: "#ffcf7a",
  producto: "#bfe3c6",
  soporte: "#cbc3ec",
  sala: "#f0c46a",
  social: "#ffcba4",
  neutral: "#d9d9d9",
};
