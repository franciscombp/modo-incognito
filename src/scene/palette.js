/**
 * EL PUENTE ENTRE EL TEMA Y EL EDIFICIO.
 *
 * El decorado 3D se pintaba con su propia lista de hex dentro de `cozy.js`,
 * así que cambiar la estética de la interfaz dejaba el edificio como estaba y
 * el juego se veía partido en dos: menús marinos sobre una oficina de cremas.
 *
 * Ahora la paleta del set sale de los MISMOS tokens que la interfaz — los
 * `--w-*` de la capa 1 de `design-system.css` — leídos del documento al
 * arrancar. Un tema nuevo re-tinta el edificio sin tocar una línea de
 * `builder.js` ni de `furniture.js`.
 *
 * Por qué leerlos del CSS y no tener la paleta en JS: porque entonces habría
 * DOS sitios donde vive un color y volverían a separarse, que es exactamente
 * el fallo del que viene todo esto. El CSS manda; esto solo lo consulta.
 *
 * Los `--w-*` van en HEX a propósito, no en HSL: Three.js los consume tal
 * cual con `new THREE.Color(...)`, y convertir en cada material sería trabajo
 * por nada.
 */

/** Token -> nombre que ya usaban builder.js y furniture.js. */
const SURFACE_TOKENS = {
  tileLight: "--w-floor",
  tileLobby: "--w-floor-lobby",
  woodFloor: "--w-floor-alt",
  carpetPurple: "--w-rug",
  wallPanel: "--w-wall",
  panelLight: "--w-wall-light",
  deskTop: "--w-desk",
  deskEdge: "--w-desk-edge",
  deskLeg: "--w-desk-leg",
  fabricDark: "--w-fabric",
  screen: "--w-screen",
  screenGlow: "--w-screen-glow",
  woodPot: "--w-plant-pot",
  leaves: "--w-leaves",
  glass: "--w-glass",
  frame: "--w-frame",
  metal: "--w-metal",
};

const ACCENT_TOKENS = ["--w-accent-1", "--w-accent-2", "--w-accent-3", "--w-accent-4", "--w-accent-5"];

/**
 * Valores de emergencia, en el tema por defecto.
 *
 * No son decorativos: `tools/` monta escenas en Node sin documento, y un
 * material con `undefined` de color sale NEGRO sin avisar de nada — un fallo
 * que solo se ve en una captura y que cuesta un rato rastrear.
 */
const FALLBACK = {
  tileLight: "#3d5468",
  tileLobby: "#4d677d",
  woodFloor: "#465e73",
  carpetPurple: "#385568",
  wallPanel: "#4a637a",
  panelLight: "#5a768c",
  deskTop: "#4e6779",
  deskEdge: "#33454f",
  deskLeg: "#2a3844",
  fabricDark: "#4a7a76",
  screen: "#1a2530",
  screenGlow: "#7fd8cf",
  woodPot: "#3d4d58",
  leaves: "#4f9b83",
  glass: "#6fa3aa",
  frame: "#4a6172",
  metal: "#5c7386",
};

const FALLBACK_ACCENTS = ["#2f8f9a", "#b8546a", "#47a184", "#c79a4a", "#5f6fa8"];

function readToken(styles, token) {
  if (!styles) return null;
  const raw = styles.getPropertyValue(token).trim();
  return raw || null;
}

/**
 * Lee la paleta del set del documento.
 *
 * Escribe DENTRO de los objetos que le pasan en vez de devolver unos nuevos:
 * `cozy.js` los exporta y medio motor los tiene ya importados, así que
 * reemplazar la referencia no llegaría a ninguno de ellos.
 */
export function loadWorldPalette(surfaces, accents) {
  const styles =
    typeof document !== "undefined" && document.documentElement
      ? getComputedStyle(document.documentElement)
      : null;

  for (const [name, token] of Object.entries(SURFACE_TOKENS)) {
    surfaces[name] = readToken(styles, token) ?? FALLBACK[name];
  }

  accents.length = 0;
  ACCENT_TOKENS.forEach((token, i) => {
    accents.push(readToken(styles, token) ?? FALLBACK_ACCENTS[i]);
  });

  return surfaces;
}
