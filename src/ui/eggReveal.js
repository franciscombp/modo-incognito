import { icon as svgIcon } from "./icons.js";

// Tarjeta corta y vistosa para el hallazgo de un secreto — antes esto era
// una línea más dentro de la caja de diálogo normal ("Secreto encontrado /
// +250 puntos", que además mentía: aquí no hay puntos, solo reloj, y el
// bono real ya lo enseña el popup flotante de _grantTime). El descubrimiento
// merece su propio momento, no una línea perdida entre diálogos.
export function createEggReveal(root) {
  const layer = document.createElement("div");
  layer.className = "inc-egg-reveal inc-hidden";
  layer.innerHTML = `
    <div class="inc-egg-reveal-icon">${svgIcon("star", { size: 26 })}</div>
    <div class="inc-egg-reveal-body">
      <div class="inc-egg-reveal-title">¡Secreto encontrado!</div>
      <div class="inc-egg-reveal-count"></div>
    </div>
  `;
  root.appendChild(layer);
  const countEl = layer.querySelector(".inc-egg-reveal-count");

  let hideTimer = null;
  function show(found, total) {
    countEl.textContent = total ? `${found} de ${total} encontrados` : `${found} encontrados`;
    layer.classList.remove("inc-hidden");
    // Reinicia el rebote de entrada aunque ya estuviera visible (dos
    // secretos seguidos no deberían compartir la misma animación a medias).
    layer.classList.remove("inc-egg-reveal-pop");
    void layer.offsetWidth; // fuerza el reflow para poder repetir la animación
    layer.classList.add("inc-egg-reveal-pop");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => layer.classList.add("inc-hidden"), 2600);
  }

  return { show };
}
