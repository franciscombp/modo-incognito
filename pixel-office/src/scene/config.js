// Global tuning knobs shared by the layout, the camera and the entities.
//
// WORLD_SCALE is the single lever for "how big does the floor feel". Every
// layout coordinate, every piece of furniture, the camera distance and the
// character sizes are multiplied by it, so changing it re-sizes the diorama
// without breaking any proportion.
export const WORLD_SCALE = 1.2;

/**
 * Encuadre de diorama oblicuo, con la cámara más baja de lo que estaba.
 *
 * Con 52° se veía sobre todo la coronilla de la gente. Daba igual mientras los
 * personajes eran sprites planos (siempre encarados a la cámara), pero los
 * muñecos 3D tienen nuca, y a esa altura la cara — que es donde está toda la
 * expresión — no se veía. A 44° se sigue leyendo el plano del piso y además se
 * les ve la cara, como en los juegos cozy de referencia.
 */
export const CAMERA_PRESET = {
  type: "perspective",
  fov: 40,
  yawDeg: 0,
  pitchDeg: 44,
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
