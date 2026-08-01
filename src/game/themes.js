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
  morning: {
    sky: ["#e4dbef", "#f7eee2"], // lavanda a crema, media mañana
    fog: "#f4eadd",
    ambient: { color: 0xfff6ea, intensity: 1.15 },
    hemi: { sky: 0xf0e6ff, ground: 0xd8c4a8, intensity: 0.95 },
    key: { color: 0xfff0d4, intensity: 1.1 },
    exposure: 1.05,
  },
  overcast: {
    sky: ["#dfe0ea", "#eee9e2"],
    fog: "#e9e6e0",
    ambient: { color: 0xf2f2f6, intensity: 1.2 },
    hemi: { sky: 0xe4e6f0, ground: 0xcdc6bc, intensity: 1.0 },
    key: { color: 0xf0eeea, intensity: 0.8 },
    exposure: 1.0,
  },
  dusk: {
    sky: ["#d9c2e0", "#ffdcc0"],
    fog: "#f0d8c4",
    ambient: { color: 0xffe6cf, intensity: 1.0 },
    hemi: { sky: 0xffd9b0, ground: 0xc9a184, intensity: 0.85 },
    key: { color: 0xffc894, intensity: 1.15 },
    exposure: 1.1,
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
