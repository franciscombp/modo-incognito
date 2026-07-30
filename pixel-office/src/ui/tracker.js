import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";

// Un rastreador = una tarjeta abajo + un marcador que sigue a su objetivo.
//
// El juego usa dos instancias con la misma gramática, para no obligar a
// aprender dos lenguajes distintos: una guía a la tarea activa y otra al
// jefe. Cada una dice qué es, a cuántos metros, y una barra de cuán urgente
// es. El marcador se clava sobre el objetivo si está en pantalla y se
// convierte en flecha en el borde si no.

const EDGE = 46; // px que se dejan libres en el borde de la pantalla
// La barra superior del HUD (objetivos/sospecha/reloj/puntos) mide distinto
// según el ancho de pantalla (el texto de objetivos se envuelve distinto,
// el reloj apila la hora sobre la cuenta atrás, etc.), así que la franja
// prohibida para la flecha de borde se mide del DOM en cada frame en vez de
// asumir una altura fija que solo es correcta en un tamaño de pantalla.
const TOP_SAFE_FALLBACK = 260;
const TOP_SAFE_MARGIN = 18;
// Lo mismo por la derecha en táctil: ahí vive la rejilla de utilidades
// (zoom / plano / pausa) y la flecha de borde se le metía debajo, quedando
// ilegible justo cuando más importa (el jefe fuera de cámara).
const SIDE_SAFE_MARGIN = 12;

export function createTracker(root, camera, { id, side = "right", accent = "cyan" }) {
  const layer = document.createElement("div");
  layer.className = `track-layer track-${side} track-${accent}`;
  layer.dataset.tracker = id;
  layer.innerHTML = `
    <div class="track-card">
      <span class="track-top"></span>
      <span class="track-icon"></span>
      <span class="track-body">
        <span class="track-label"></span>
        <span class="track-meta"></span>
      </span>
      <span class="track-bar"><i></i></span>
    </div>
    <div class="track-marker">
      <span class="track-arrow">▲</span>
      <span class="track-dist"></span>
    </div>
  `;
  root.appendChild(layer);

  const card = layer.querySelector(".track-card");
  const topEl = layer.querySelector(".track-top");
  const iconEl = layer.querySelector(".track-icon");
  const labelEl = layer.querySelector(".track-label");
  const metaEl = layer.querySelector(".track-meta");
  const barFill = layer.querySelector(".track-bar i");
  const marker = layer.querySelector(".track-marker");
  const arrow = layer.querySelector(".track-arrow");
  const distEl = layer.querySelector(".track-dist");

  const v = new THREE.Vector3();
  // Buscado perezosamente: hud.js crea `.hud-topbar` en el mismo tick que
  // este tracker, pero el orden exacto no está garantizado.
  let topbarEl = null;
  let utilsEl = null;

  /**
   * @param {object|null} target  { x, z, icon, top, label, meta, urgency, level }
   */
  function update(target) {
    if (!target) {
      layer.classList.remove("visible");
      return;
    }
    layer.classList.add("visible");

    topEl.textContent = target.top ?? "";
    iconEl.textContent = target.icon ?? "•";
    labelEl.textContent = target.label ?? "";
    metaEl.textContent = target.meta ?? "";

    const urgency = THREE.MathUtils.clamp(target.urgency ?? 0, 0, 1);
    barFill.style.width = `${Math.round(urgency * 100)}%`;
    card.classList.toggle("hot", urgency > 0.62);
    card.classList.toggle("warm", urgency > 0.32 && urgency <= 0.62);

    const w = layer.clientWidth;
    const h = layer.clientHeight;
    v.set(target.x, (target.y ?? 1.2) * S, target.z).project(camera);

    const onScreen = v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9;
    let sx = ((v.x + 1) / 2) * w;
    let sy = ((1 - v.y) / 2) * h;
    let angle = 0;

    if (!onScreen) {
      // Detrás de la cámara la proyección se invierte; hay que espejarla o la
      // flecha manda justo al lado contrario.
      let dx = v.x;
      let dy = v.y;
      if (v.z >= 1) {
        dx = -dx;
        dy = -dy;
      }
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const halfW = w / 2 - EDGE;
      const halfH = h / 2 - EDGE;
      const scale = Math.min(halfW / Math.abs(nx || 1e-3), halfH / Math.abs(ny || 1e-3));
      sx = w / 2 + nx * scale;
      if (!topbarEl) topbarEl = document.querySelector(".hud-topbar");
      const barHeight = topbarEl?.getBoundingClientRect().height || TOP_SAFE_FALLBACK;
      // En pantallas bajas (tablet/móvil apaisado) la franja no puede comerse
      // media pantalla igual, así que cede proporcionalmente ahí.
      const topSafe = Math.min(barHeight + TOP_SAFE_MARGIN, h * 0.55);
      sy = Math.max(h / 2 - ny * scale, topSafe);

      // La columna táctil de la derecha manda sobre la flecha: si el borde
      // cae debajo, se corre a su izquierda.
      if (!utilsEl) utilsEl = document.querySelector(".touch-utils");
      const utils = utilsEl?.getBoundingClientRect();
      if (utils && utils.width > 0 && sy > utils.top - EDGE && sy < utils.bottom + EDGE) {
        // `sx` es el CENTRO del marcador (va con translate -50%), así que hay
        // que descontar su media anchura o la mitad derecha se sigue metiendo
        // debajo de los botones.
        const halfMarker = marker.getBoundingClientRect().width / 2 || 18;
        sx = Math.min(sx, utils.left - SIDE_SAFE_MARGIN - halfMarker);
      }
      angle = Math.atan2(nx, ny) * (180 / Math.PI);
    }

    marker.classList.toggle("edge", !onScreen);
    marker.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
    arrow.style.transform = `rotate(${angle}deg)`;
    distEl.textContent = onScreen ? "" : target.short ?? "";
  }

  return { update, root: layer };
}
