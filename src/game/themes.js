import * as THREE from "three";
import { skyTexture } from "../scene/cozy.js";
import { setSunAngles } from "../scene/lighting.js";

// Per-day atmosphere. Each day names a theme and the engine re-tints the
// lights and background, so "miércoles nublado" and "viernes al atardecer"
// read differently without rebuilding a single mesh.
//
// Los fondos eran casi negros y ninguna cantidad de luz cálida arreglaba eso:
// el piso flotaba en el vacío y la escena se leía nocturna. Ahora cada tema
// trae su propio degradado de cielo (arriba/abajo) y una niebla del mismo
// color, que es lo que hace que el borde del piso se funda con el fondo en
// vez de cortarse a cuchillo contra la nada.

// El piso es un diorama flotando sobre un vacio de color apagado, y ese
// vacio es de la MISMA familia marina que la interfaz: antes iba en sepias y
// verdes oliva, y con los menus ya en azul de tubo CRT la imagen se leia
// partida en dos. El arco del dia se conserva entero — abierto y claro al
// mediodia, hundido y frio de noche — solo cambia de familia de color.
//
// Esto es el eje TIEMPO, distinto del eje TEMA (design-system.css). El tema
// dice de que color es el edificio; esto, que hora es. Por eso no sale de
// los tokens: un tema nuevo re-tinta las superficies, no el reloj.
// ── EL SOL SE MUEVE, Y ESA ES LA MITAD DEL TRABAJO ────────────────────
//
// Cada tema trae ahora `sun: { azimuth, elevation }` en radianes, y la luz
// con sombra se coloca con esos angulos (ver scene/lighting.js). Antes
// estaba clavada en una esquina de las 7am a las 7pm: lo unico que cambiaba
// era el TINTE, y un tinte sin sombra que lo acompane no se lee como que ha
// pasado el dia, se lee como que le han puesto un filtro encima. Con el sol
// girando, la sombra de cada mesa barre el suelo y la hora se ve sin mirar
// el reloj.
//
// `azimuth` gira alrededor del piso (crece de este a oeste) y `elevation`
// es la altura sobre el horizonte (0 = rasante, ~1.57 = cenit).
//
// ── Y EL RELLENO BAJA, QUE ES LA OTRA MITAD ───────────────────────────
//
// El ambiente iba a 0.66-0.80 y el hemisferico a 0.64-0.78: sumados,
// pisaban a la key. Con el relleno casi tan fuerte como la luz principal no
// hay sombra que se vea, y por eso todo se leia de un solo color. Ahora el
// relleno esta en torno a un tercio, que deja la sombra visible sin que las
// zonas oscuras se traguen a los personajes.
//
// El hemisferico ademas separa por ORIENTACION: cielo frio arriba, rebote
// calido abajo. Es lo que hace que el suelo y la cara de arriba de una mesa
// no sean el mismo color que la pared, sin tocar un solo token del edificio.
export const themes = {
  earlyMorning: {
    // 7am - amanece en marino frio, con una brasa fria en el horizonte.
    // Sol rasante por el este: sombras largisimas cruzando el piso entero.
    sky: ["#20303f", "#33485c"],
    fog: "#243444",
    ambient: { color: 0xc2d8e8, intensity: 0.26 },
    hemi: { sky: 0x9fbcd6, ground: 0x7a5f42, intensity: 0.34 },
    key: { color: 0xffcf92, intensity: 2.1 },
    sun: { azimuth: 0.38, elevation: 0.16 },
    exposure: 1.02,
  },
  morning: {
    // 9am-12pm - la manana abre: el sol sube y la sombra se acorta
    sky: ["#2a4054", "#3d5a70"],
    fog: "#2f4557",
    ambient: { color: 0xc8dcea, intensity: 0.3 },
    hemi: { sky: 0xa6c3da, ground: 0x8a7458, intensity: 0.4 },
    key: { color: 0xffdca4, intensity: 2.25 },
    sun: { azimuth: 0.95, elevation: 0.62 },
    exposure: 1.06,
  },
  midday: {
    // 1pm - lo mas alto del dia: sombra corta y dura, justo debajo
    sky: ["#3c5c74", "#5b8095"],
    fog: "#456579",
    ambient: { color: 0xd2e4f0, intensity: 0.34 },
    hemi: { sky: 0xb0cbe0, ground: 0x93866e, intensity: 0.44 },
    key: { color: 0xffe9c0, intensity: 2.35 },
    sun: { azimuth: 1.62, elevation: 1.18 },
    exposure: 1.08,
  },
  afternoon: {
    // 3pm - el sol cruza al oeste y la sombra empieza a tumbarse al otro lado
    sky: ["#33506a", "#4d7189"],
    fog: "#3a586f",
    ambient: { color: 0xbdd4e6, intensity: 0.3 },
    hemi: { sky: 0x9cbad4, ground: 0x77604c, intensity: 0.4 },
    key: { color: 0xffc987, intensity: 2.3 },
    sun: { azimuth: 2.25, elevation: 0.78 },
    exposure: 1.06,
  },
  latAfternoon: {
    // 5pm - la brasa: sol bajo por el oeste, sombras largas otra vez
    sky: ["#293f55", "#3f5c74"],
    fog: "#2e4459",
    ambient: { color: 0xafc9de, intensity: 0.27 },
    hemi: { sky: 0x8aa8c6, ground: 0x6b4f38, intensity: 0.36 },
    key: { color: 0xffb877, intensity: 2.15 },
    sun: { azimuth: 2.7, elevation: 0.34 },
    exposure: 1.0,
  },
  dusk: {
    // 6pm - la bisagra: el ambar cede al acero y el sol toca el horizonte
    sky: ["#22354a", "#354e64"],
    fog: "#273a4f",
    ambient: { color: 0xb8bcc8, intensity: 0.3 },
    hemi: { sky: 0x7f9dbe, ground: 0x45414a, intensity: 0.34 },
    key: { color: 0xd8bda0, intensity: 1.6 },
    sun: { azimuth: 2.95, elevation: 0.15 },
    exposure: 0.99,
  },
  duskDark: {
    // 7pm - se ha puesto. Ya no hay sol: manda la luz fria del cielo, y la
    // "key" es en realidad el resplandor de la ciudad rebotando por la
    // fachada. Por eso vuelve a subir de altura: no proyecta desde el
    // horizonte, cae del cielo entero.
    sky: ["#1b2c3e", "#2b4256"],
    fog: "#1f3143",
    ambient: { color: 0x9aa8c0, intensity: 0.3 },
    hemi: { sky: 0x6f8fb4, ground: 0x2f3542, intensity: 0.4 },
    key: { color: 0xbcd0e8, intensity: 1.25 },
    sun: { azimuth: 3.25, elevation: 0.62 },
    exposure: 0.95,
  },
  twilight: {
    // 8pm-9pm - noche de luna por las ventanas, como la referencia azul.
    // La luna entra alta y por el otro lado: es lo que dibuja los charcos
    // de luz en el suelo de ref-noche-azul.png.
    sky: ["#121e2b", "#1e3040"],
    fog: "#152331",
    ambient: { color: 0x6b7a94, intensity: 0.24 },
    hemi: { sky: 0x556f92, ground: 0x1f242e, intensity: 0.3 },
    key: { color: 0xa8c4e8, intensity: 1.35 },
    sun: { azimuth: 3.9, elevation: 0.85 },
    exposure: 0.9,
  },
  overcast: {
    // fallback: gris verdoso neutro. Nublado = sin sol marcado, asi que
    // aqui SI manda el relleno y la key va floja y muy alta. Es el unico
    // tema donde la sombra debe ser casi plana, y es a proposito.
    sky: ["#6e7570", "#969a90"],
    fog: "#7d837c",
    ambient: { color: 0xe4e2d8, intensity: 0.62 },
    hemi: { sky: 0xbcc2ba, ground: 0x7c7466, intensity: 0.66 },
    key: { color: 0xf0e8d8, intensity: 0.85 },
    sun: { azimuth: 1.5, elevation: 1.3 },
    exposure: 1.0,
  },
};

export function applyTheme(name, { renderer, scene, ambient, hemi, key, worldScale = 1 }) {
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
  if (theme.sun) setSunAngles(key, theme.sun, worldScale);
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

export function createThemeBlender({ renderer, scene, ambient, hemi, key, worldScale = 1 }) {
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
      // El sol viaja con el fundido, no a saltos: es lo que hace que la
      // sombra barra el suelo en vez de dar un brinco al cambiar de tramo.
      // Los angulos se interpolan crudos a proposito — el arco esta escrito
      // de menor a mayor azimut, asi que nunca hay que dar la vuelta corta.
      if (a.sun && b.sun) {
        setSunAngles(
          key,
          {
            azimuth: THREE.MathUtils.lerp(a.sun.azimuth, b.sun.azimuth, mix),
            elevation: THREE.MathUtils.lerp(a.sun.elevation, b.sun.elevation, mix),
          },
          worldScale
        );
      }
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
