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

// Dirección de arte NOSTÁLGICA Y MADURA (ver docs/referencias/): el piso es
// un diorama flotando sobre un vacío de color apagado — sepia al amanecer,
// verde oliva a media mañana, ámbar de lámpara por la tarde y azul acero de
// luna por la noche. La luz clave manda (charcos cálidos, sombras hondas) y
// la saturación vive en los acentos, no en el fondo.
export const themes = {
  earlyMorning: {
    // 7am - amanecer sepia: la oficina despierta en tonos de madera vieja
    sky: ["#6a594a", "#8c7660"],
    fog: "#6e5e50",
    ambient: { color: 0xe8d8c0, intensity: 0.66 },
    hemi: { sky: 0xc9b8a0, ground: 0x6e5a48, intensity: 0.64 },
    key: { color: 0xffd9a0, intensity: 1.53 },
    exposure: 1.0,
  },
  morning: {
    // 9am-12pm - vacío verde oliva y lámparas cálidas, la cabaña de la referencia
    sky: ["#5e675a", "#7d8572"],
    fog: "#68705e",
    ambient: { color: 0xe9e4d2, intensity: 0.74 },
    hemi: { sky: 0xb8bfa8, ground: 0x8a7458, intensity: 0.74 },
    key: { color: 0xffdca4, intensity: 1.77 },
    exposure: 1.06,
  },
  midday: {
    // 1pm - luz de calle suave sobre acero apagado
    sky: ["#75828e", "#a9aea0"],
    fog: "#8a9089",
    ambient: { color: 0xf2eee0, intensity: 0.8 },
    hemi: { sky: 0xc4ccc8, ground: 0x93866e, intensity: 0.78 },
    key: { color: 0xffe9c0, intensity: 1.77 },
    exposure: 1.08,
  },
  afternoon: {
    // 3pm - interior sepia: todo vira a ámbar de lámpara
    sky: ["#6a584a", "#957c62"],
    fog: "#7a685a",
    ambient: { color: 0xe8d0b0, intensity: 0.7 },
    hemi: { sky: 0xc0a888, ground: 0x77604c, intensity: 0.72 },
    key: { color: 0xffc987, intensity: 1.83 },
    exposure: 1.06,
  },
  latAfternoon: {
    // 5pm - la brasa: sepia hundiéndose
    sky: ["#55453a", "#7d6450"],
    fog: "#61514a",
    ambient: { color: 0xd8b898, intensity: 0.62 },
    hemi: { sky: 0xa08a70, ground: 0x54443a, intensity: 0.62 },
    key: { color: 0xffb877, intensity: 1.65 },
    exposure: 1.0,
  },
  dusk: {
    // 6pm - la bisagra: el ámbar cede al acero
    sky: ["#4a5364", "#6e6a72"],
    fog: "#525c6b",
    ambient: { color: 0xb8bcc8, intensity: 0.58 },
    hemi: { sky: 0x8a95a8, ground: 0x45414a, intensity: 0.56 },
    key: { color: 0xd8bda0, intensity: 1.36 },
    exposure: 0.98,
  },
  duskDark: {
    // 7pm - anochece en azul acero
    sky: ["#3a4454", "#556070"],
    fog: "#414b5b",
    ambient: { color: 0x9aa8c0, intensity: 0.5 },
    hemi: { sky: 0x7a8aa8, ground: 0x2f3542, intensity: 0.46 },
    key: { color: 0xbcd0e8, intensity: 1.36 },
    exposure: 0.95,
  },
  twilight: {
    // 8pm-9pm - noche de luna por las ventanas, como la referencia azul
    sky: ["#28303e", "#3c4654"],
    fog: "#303945",
    ambient: { color: 0x6b7a94, intensity: 0.4 },
    hemi: { sky: 0x54637c, ground: 0x1f242e, intensity: 0.36 },
    key: { color: 0xa8c4e8, intensity: 1.18 },
    exposure: 0.88,
  },
  overcast: {
    // fallback: gris verdoso neutro, maduro
    sky: ["#6e7570", "#969a90"],
    fog: "#7d837c",
    ambient: { color: 0xe4e2d8, intensity: 0.76 },
    hemi: { sky: 0xbcc2ba, ground: 0x7c7466, intensity: 0.72 },
    key: { color: 0xf0e8d8, intensity: 1.3 },
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

// El orden real del día, para saber entre qué dos temas está cada instante.
// Los cortes son los mismos de getThemeByTime; aquí además se interpola.
const DAY_STOPS = [
  { at: 240, name: "earlyMorning" },
  { at: 160, name: "morning" },
  { at: 100, name: "midday" },
  { at: 50, name: "afternoon" },
  { at: 30, name: "latAfternoon" },
  { at: 15, name: "dusk" },
  { at: 5, name: "duskDark" },
  { at: 1, name: "twilight" },
];

/**
 * La luz del día como fundido CONTINUO, no como saltos: igual que el fondo
 * de escritorio dinámico de un Mac, cada frame está en algún punto ENTRE dos
 * temas y las luces se interpolan entre ambos. El cielo (una textura de
 * canvas) no se puede regenerar 60 veces por segundo, así que solo se
 * redibuja cuando el fundido avanza un paso perceptible — las luces y la
 * niebla, que son baratas, sí van a frame.
 */
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();
function lerpColorInto(target, colorA, colorB, t) {
  _c1.set(colorA);
  _c2.set(colorB);
  target.copy(_c1).lerp(_c2, t);
}

export function createThemeBlender({ renderer, scene, ambient, hemi, key }) {
  let skyKey = null;
  return {
    /** timeLeft/maxTime en las mismas unidades que getThemeByTime. */
    update(timeLeft, maxTime = 240) {
      // Escalar el reloj real del día a la línea de 240s de los cortes.
      const t240 = (timeLeft / (maxTime || 240)) * 240;
      let from = DAY_STOPS[0];
      let to = DAY_STOPS[0];
      for (let i = 0; i < DAY_STOPS.length; i++) {
        if (t240 <= DAY_STOPS[i].at) {
          from = DAY_STOPS[i];
          to = DAY_STOPS[Math.min(i + 1, DAY_STOPS.length - 1)];
        }
      }
      const span = from.at - to.at || 1;
      const mix = THREE.MathUtils.clamp((from.at - t240) / span, 0, 1);
      const a = themes[from.name];
      const b = themes[to.name];

      lerpColorInto(ambient.color, a.ambient.color, b.ambient.color, mix);
      ambient.intensity = THREE.MathUtils.lerp(a.ambient.intensity, b.ambient.intensity, mix);
      lerpColorInto(hemi.color, a.hemi.sky, b.hemi.sky, mix);
      lerpColorInto(hemi.groundColor, a.hemi.ground, b.hemi.ground, mix);
      hemi.intensity = THREE.MathUtils.lerp(a.hemi.intensity, b.hemi.intensity, mix);
      lerpColorInto(key.color, a.key.color, b.key.color, mix);
      key.intensity = THREE.MathUtils.lerp(a.key.intensity, b.key.intensity, mix);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(a.exposure, b.exposure, mix);

      if (scene.fog) {
        lerpColorInto(scene.fog.color, a.fog, b.fog, mix);
      } else {
        scene.fog = new THREE.Fog(new THREE.Color(a.fog), 60, 190);
      }

      // El cielo, por pasos: 12 niveles de fundido entre cada par de temas
      // bastan para que el cambio no se note como salto.
      const step = Math.round(mix * 12);
      const wantKey = `${from.name}>${to.name}:${step}`;
      if (wantKey !== skyKey) {
        skyKey = wantKey;
        lerpColorInto(_c1, a.sky[0], b.sky[0], step / 12);
        lerpColorInto(_c2, a.sky[1], b.sky[1], step / 12);
        scene.background?.dispose?.();
        scene.background = skyTexture(`#${_c1.getHexString()}`, `#${_c2.getHexString()}`);
      }
    },
  };
}
