import * as THREE from "three";

// Per-day atmosphere. Each day names a theme and the engine re-tints the
// lights and background, so "miércoles nublado" and "viernes al atardecer"
// read differently without rebuilding a single mesh.

export const themes = {
  morning: {
    background: 0x05060a,
    ambient: { color: 0xffffff, intensity: 1.0 },
    hemi: { sky: 0xdfe8ff, ground: 0x50493a, intensity: 0.85 },
    key: { color: 0xfff2d6, intensity: 1.35 },
    exposure: 1.15,
  },
  overcast: {
    background: 0x080a12,
    ambient: { color: 0xe9edf5, intensity: 1.05 },
    hemi: { sky: 0xd4dcea, ground: 0x4a4b50, intensity: 0.9 },
    key: { color: 0xe7ecf5, intensity: 0.95 },
    exposure: 1.05,
  },
  dusk: {
    background: 0x0b0713,
    ambient: { color: 0xffe6cf, intensity: 0.85 },
    hemi: { sky: 0xffd9b0, ground: 0x3a3346, intensity: 0.75 },
    key: { color: 0xffbb7a, intensity: 1.25 },
    exposure: 1.2,
  },
};

export function applyTheme(name, { renderer, scene, ambient, hemi, key }) {
  const theme = themes[name] ?? themes.morning;
  scene.background = new THREE.Color(theme.background);
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
