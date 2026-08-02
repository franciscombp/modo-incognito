import * as THREE from "three";
import { skyTexture } from "../scene/cozy.js";

// Per-day atmosphere. Each day names a theme and the engine re-tints the
// lights and background, so "miércoles nublado" and "viernes al atardecer"
// read differently without rebuilding a single mesh.
//
// Los fondos eran casi negros y ninguna cantidad de luz cálida arreglaba eso:
// el piso flotaba en el vacío y la escena se leía nocturna. Ahora cada tema
// trae su propio degradado de cielo (arriba/abajo) y una niebla del mismo
// color, que es lo que hace que el borde del piso se funda con el fondo en
// vez de cortarse a cuchillo contra la nada.

export const themes = {
  earlyMorning: {
    // 7am - luz cálida suave
    sky: ["#f5d4b0", "#fde9d0"],
    fog: "#fde9d0",
    ambient: { color: 0xffd9a8, intensity: 0.9 },
    hemi: { sky: 0xffe6c0, ground: 0xc8a680, intensity: 0.8 },
    key: { color: 0xffc894, intensity: 0.95 },
    exposure: 1.0,
  },
  morning: {
    // 9am-1pm - luz cálida plena
    sky: ["#e4dbef", "#f7eee2"],
    fog: "#f4eadd",
    ambient: { color: 0xfff6ea, intensity: 1.15 },
    hemi: { sky: 0xf0e6ff, ground: 0xd8c4a8, intensity: 0.95 },
    key: { color: 0xfff0d4, intensity: 1.1 },
    exposure: 1.05,
  },
  midday: {
    // 1pm - luz blanca neutral
    sky: ["#e0e8f0", "#f5eeea"],
    fog: "#f0e8e0",
    ambient: { color: 0xffffff, intensity: 1.2 },
    hemi: { sky: 0xe8f0f8, ground: 0xd0c8bc, intensity: 1.0 },
    key: { color: 0xf5f0e8, intensity: 1.1 },
    exposure: 1.05,
  },
  afternoon: {
    // 3pm - luz cálida comenzando a bajar
    sky: ["#e8d4c0", "#fde8d4"],
    fog: "#f5e0d0",
    ambient: { color: 0xfff0d4, intensity: 1.1 },
    hemi: { sky: 0xffd9a8, ground: 0xd8a878, intensity: 0.95 },
    key: { color: 0xffc894, intensity: 1.15 },
    exposure: 1.08,
  },
  latAfternoon: {
    // 5pm - comenzando el atardecer
    sky: ["#d9b8a0", "#ffcb9a"],
    fog: "#ffc9a0",
    ambient: { color: 0xffc89f, intensity: 1.05 },
    hemi: { sky: 0xffb888, ground: 0xd89868, intensity: 0.9 },
    key: { color: 0xff9966, intensity: 1.2 },
    exposure: 1.1,
  },
  dusk: {
    // 6pm - atardecer
    sky: ["#d9c2e0", "#ffdcc0"],
    fog: "#f0d8c4",
    ambient: { color: 0xffe6cf, intensity: 1.0 },
    hemi: { sky: 0xffd9b0, ground: 0xc9a184, intensity: 0.85 },
    key: { color: 0xffc894, intensity: 1.15 },
    exposure: 1.1,
  },
  duskDark: {
    // 7pm - atardecer oscuro
    sky: ["#8b5a6a", "#c47a68"],
    fog: "#b8705a",
    ambient: { color: 0xcc8855, intensity: 0.7 },
    hemi: { sky: 0xb87858, ground: 0x5a4a40, intensity: 0.6 },
    key: { color: 0xff9966, intensity: 1.0 },
    exposure: 0.95,
  },
  twilight: {
    // 8pm-9pm - crepúsculo, casi noche, luces artificiales
    sky: ["#3a2a4a", "#5a3a5a"],
    fog: "#4a3a4a",
    ambient: { color: 0x5a4a6a, intensity: 0.5 },
    hemi: { sky: 0x4a3a5a, ground: 0x2a2a30, intensity: 0.4 },
    key: { color: 0x8877cc, intensity: 0.8 },
    exposure: 0.85,
  },
  overcast: {
    // fallback
    sky: ["#dfe0ea", "#eee9e2"],
    fog: "#e9e6e0",
    ambient: { color: 0xf2f2f6, intensity: 1.2 },
    hemi: { sky: 0xe4e6f0, ground: 0xcdc6bc, intensity: 1.0 },
    key: { color: 0xf0eeea, intensity: 0.8 },
    exposure: 1.0,
  },
};

export function applyTheme(name, { renderer, scene, ambient, hemi, key }) {
  const theme = themes[name] ?? themes.morning;
  scene.background?.dispose?.();
  scene.background = skyTexture(theme.sky[0], theme.sky[1]);
  // La niebla arranca lejos: no es para tapar, es para que el piso no acabe
  // en un canto duro contra el cielo.
  scene.fog = new THREE.Fog(new THREE.Color(theme.fog), 60, 190);
  ambient.color.set(theme.ambient.color);
  ambient.intensity = theme.ambient.intensity;
  hemi.color.set(theme.hemi.sky);
  hemi.groundColor.set(theme.hemi.ground);
  hemi.intensity = theme.hemi.intensity;
  key.color.set(theme.key.color);
  key.intensity = theme.key.intensity;
  renderer.toneMappingExposure = theme.exposure;
  return theme;
}

/**
 * Calcula la hora actual del día basada en el tiempo restante.
 * El día comienza a las 7am (240s) y termina a las 7pm (0s).
 * La transición a oscuridad debe ser rápida en las últimas horas.
 */
export function getThemeByTime(timeLeft, maxTime = 240) {
  // 240s = 7am, 0s = 7pm (12 horas comprimidas en 240 segundos)
  if (timeLeft > 160) return "earlyMorning"; // 7am-8:40am (240-160s)
  if (timeLeft > 100) return "morning"; // 8:40am-11:40am (160-100s)
  if (timeLeft > 50) return "midday"; // 11:40am-4:10pm (100-50s)
  if (timeLeft > 30) return "afternoon"; // 4:10pm-5:10pm (50-30s)
  if (timeLeft > 15) return "latAfternoon"; // 5:10pm-6:00pm (30-15s)
  if (timeLeft > 5) return "dusk"; // 6:00pm-6:45pm (15-5s)
  if (timeLeft > 1) return "duskDark"; // 6:45pm-6:58pm (5-1s)
  return "twilight"; // 6:58pm-7pm (1-0s)
}
