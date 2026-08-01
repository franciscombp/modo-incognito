/**
 * Cargador de iconos Phosphor para builders
 * Reemplaza elementos con data-icon="..." con iconos SVG reales de Phosphor
 */

// Mapeo de nombres lógicos a iconos Phosphor
const ICON_MAP = {
  door: "Door",
  boss: "SmileyXEyes",
  routes: "Path",
  grid: "Square",
  palette: "Palette",
  download: "DownloadSimple",
  reset: "ArrowCounterClockwise",
  copy: "CopySimple",
  check: "Check",
  export: "Download",
  play: "Play",
  stop: "Stop",
  trash: "TrashSimple",
  plus: "Plus",
  gear: "Gear",
  eye: "Eye",
  hide: "EyeSlash",
};

/**
 * Obtiene SVG de Phosphor desde CDN (jsdelivr)
 */
async function fetchPhosphorSVG(iconName, weight = "regular", size = 24) {
  const url = `https://cdn.jsdelivr.net/npm/phosphor-icons@1/src/${iconName}${
    weight !== "regular" ? `-${weight}` : ""
  }.svg`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    let svg = await response.text();
    // Ajusta tamaño y agrega clase
    svg = svg
      .replace(/width="24"/, `width="${size}"`)
      .replace(/height="24"/, `height="${size}"`)
      .replace(/<svg/, `<svg class="phosphor-icon"`);

    return svg;
  } catch (err) {
    console.warn(`[phosphor] Error cargando ${iconName}:`, err);
    return null;
  }
}

/**
 * Carga todos los iconos en la página
 */
export async function loadBuilderIcons() {
  const elements = document.querySelectorAll("[data-icon]");

  for (const el of elements) {
    const iconName = el.getAttribute("data-icon");
    const phosphorName = ICON_MAP[iconName];

    if (!phosphorName) {
      console.warn(`[phosphor] Icono desconocido: "${iconName}"`);
      continue;
    }

    const svg = await fetchPhosphorSVG(phosphorName, "regular", 24);
    if (svg) {
      // Busca el slot donde poner el icono
      const slot = el.querySelector(".icon-slot") || el.querySelector(".icon-inline");
      if (slot) {
        slot.innerHTML = svg;
      } else if (el.classList.contains("icon-inline")) {
        // Icono inline en h1
        el.innerHTML = svg + el.innerHTML;
      }
    }
  }
}

// Auto-init cuando el DOM está listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadBuilderIcons);
} else {
  loadBuilderIcons();
}
