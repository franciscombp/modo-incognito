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
// El encuadre de juego. Tres números mandan sobre si se ve al personaje:
//
// `lookAtYOffset` es a qué ALTURA mira la cámara. Estaba en 2.1 (×WORLD_SCALE
// = 2.52 de mundo), o sea POR ENCIMA de la cabeza — un personaje mide 1.45
// (1.74 de mundo). Apuntar por encima de alguien lo empuja a la parte baja
// del cuadro y le deja medio encuadre de techo vacío encima. Bajarlo a la
// altura del pecho lo devuelve al centro, que es donde se mira.
//
// `pitchDeg` es la inclinación. Estuvo en 52 y solo se veía la coronilla;
// bajó a 44 por eso mismo, y este cambio sigue ese camino un paso más: a 40
// se le ve la cara sin que el plano deje de leerse como plano. NO subir de
// 44 — es la frontera documentada a partir de la cual se pierde la
// expresión, que es donde está todo el carácter del reparto.
//
// `distance` es cuánto se aleja al seguir. Un punto más cerca hace al
// personaje notablemente más grande sin comerse el contexto de la sala.
//
// OJO al probar cambios aquí: `cameraSettings.js` GUARDA los ajustes en
// localStorage, así que quien haya tocado el panel de cámara alguna vez no
// verá estos valores nuevos hasta darle a restablecer.
export const CAMERA_PRESET = {
  type: "perspective",
  fov: 40,
  yawDeg: 0,
  pitchDeg: 40,
  distance: 12.5,
  lookAtYOffset: 1.3,
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
