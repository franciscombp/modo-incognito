/**
 * PHOSPHOR ICONS para builders
 * Carga iconos SVG de Phosphor dinámicamente para la interfaz de creación.
 * Los builders usan estos en lugar de emojis para consistencia visual.
 */

// Mapeo de nombres lógicos a iconos Phosphor (weight: "regular" para trazo consistente)
const PHOSPHOR_ICONS = {
  door: "Door",
  boss: "Smiley",
  routes: "Path",
  grid: "Grid",
  palette: "Palette",
  download: "Download",
  reset: "ArrowCounterClockwise",
  copy: "CopySimple",
  check: "Check",
  export: "Download",
  play: "Play",
  stop: "Stop",
  trash: "Trash",
  plus: "Plus",
  gear: "Gear",
  eye: "Eye",
  hide: "EyeSlash",
};

/**
 * Obtiene el SVG de un icono Phosphor por nombre.
 * @param {string} name - Nombre del icono (ej: "door", "play")
 * @param {Object} opts - Opciones: size (default 24), weight (default "regular")
 * @returns {string} SVG inline como string
 */
export async function getPhosphorIcon(name, { size = 24, weight = "regular" } = {}) {
  const iconName = PHOSPHOR_ICONS[name];
  if (!iconName) {
    console.warn(`[phosphor-icons] Icono desconocido: "${name}"`);
    return "";
  }

  try {
    // Importa dinámicamente desde phosphor-icons
    const module = await import(`phosphor-icons/src/${iconName}.tsx`);
    const Component = module.default;

    // Crear un span temporal para renderizar (sin JSX)
    // Usamos data URIs con el SVG directamente
    const svg = await fetchPhosphorSVG(iconName, weight, size);
    return svg;
  } catch (err) {
    console.error(`[phosphor-icons] Error cargando ${name}:`, err);
    return "";
  }
}

/**
 * Descarga el SVG de Phosphor desde CDN.
 * Es más simple que importar modules - Phosphor tiene CDN con SVGs.
 */
async function fetchPhosphorSVG(iconName, weight = "regular", size = 24) {
  try {
    const url = `https://cdn.jsdelivr.net/npm/phosphor-icons@1/src/${iconName}${
      weight !== "regular" ? `-${weight}` : ""
    }.svg`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let svg = await response.text();
    // Ajusta tamaño y color
    svg = svg
      .replace(/width="24"/, `width="${size}"`)
      .replace(/height="24"/, `height="${size}"`)
      .replace(/stroke="currentColor"/, `stroke="currentColor"`)
      .replace(/<svg/, `<svg class="phosphor-icon"`);

    return svg;
  } catch (err) {
    console.error(`[phosphor-icons] Error descargando ${iconName}:`, err);
    return "";
  }
}

/**
 * Versión síncrona usando data URIs (para cuando no quieres async/await)
 * Retorna promesa pero puedes await si quieres.
 */
export function phosphorIcon(name, opts = {}) {
  // Para builders, mejor usar async y esperar a que cargue
  return getPhosphorIcon(name, opts);
}
