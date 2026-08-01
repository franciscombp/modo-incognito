import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";
import { icon as svgIcon, hasIcon } from "./icons.js";

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

// Y por abajo viven las dos tarjetas de seguimiento. La flecha de borde se les
// metía encima — en apaisado y en móvil se solapaban de lleno — porque `sy`
// solo estaba topada por arriba. Se mide igual que la barra superior: del DOM,
// cada frame, porque las tarjetas cambian de alto con el texto.
const BOTTOM_SAFE_MARGIN = 10;
// Lo que ocupa la banda de abajo y no se puede tapar: las dos tarjetas y la
// franja de controles (que solo está los primeros minutos, de ahí medirla en
// vez de reservarle sitio fijo).
const BOTTOM_BLOCKERS = ".track-layer.visible .track-card, #hint";

/**
 * Dónde han quedado las flechas de este frame.
 *
 * Los dos rastreadores (tarea y jefe) se dibujan sin saber el uno del otro, y
 * cuando los dos objetivos caen fuera de cámara por el mismo lado las dos
 * flechas aterrizan en el mismo píxel y se leen como una sola. Aquí se apuntan
 * las ya colocadas para que la siguiente se aparte.
 */
const placedMarkers = [];
let placedFrame = -1;

function overlaps(a, b) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

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
    iconEl.innerHTML = svgIcon(hasIcon(target.icon) ? target.icon : "diamond", { size: 16 });
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
      // Las tarjetas de abajo mandan sobre la flecha, igual que la barra de
      // arriba: si la flecha cae sobre una, sube justo por encima de su borde.
      const size = marker.getBoundingClientRect();
      const halfMarker = size.width / 2 || 18;
      const markerH = size.height || 44;
      for (const other of document.querySelectorAll(BOTTOM_BLOCKERS)) {
        const r = other.getBoundingClientRect();
        // `#hint` se apaga con opacidad, no con display: sin esto la flecha
        // seguiría esquivando una franja que ya no está en pantalla.
        if (!r.height || Number(getComputedStyle(other).opacity) < 0.05) continue;
        const hitsX = sx + halfMarker > r.left && sx - halfMarker < r.right;
        if (hitsX && sy + markerH / 2 > r.top) sy = r.top - BOTTOM_SAFE_MARGIN - markerH / 2;
      }

      // Y la otra flecha manda sobre esta, por orden de llegada: la segunda se
      // sube lo justo para no taparse con la primera.
      //
      // El frame se identifica con el reloj de la línea de tiempo del
      // documento, que es EL MISMO valor durante todo un frame (es el que
      // recibe requestAnimationFrame). Un bucket de `performance.now()` no
      // vale: los dos rastreadores se actualizan seguidos, y si sus dos
      // llamadas caían a un lado y otro del corte, el segundo vaciaba la
      // lista, no veía al primero, y las dos flechas se dibujaban encima.
      const frame = document.timeline?.currentTime ?? performance.now();
      if (frame !== placedFrame) {
        placedFrame = frame;
        placedMarkers.length = 0;
      }
      // `sy` es el CENTRO del marcador; las cajas se llevan en coordenadas de
      // borde. Mezclarlo dejaba cada caja media flecha más abajo de donde
      // estaba de verdad, así que la segunda se subía de menos.
      const boxAt = (centerY) => ({
        left: sx - halfMarker,
        top: centerY - markerH / 2,
        width: halfMarker * 2,
        height: markerH,
      });
      for (const taken of placedMarkers) {
        if (!overlaps(boxAt(sy), taken)) continue;
        sy = taken.top - BOTTOM_SAFE_MARGIN - markerH / 2;
      }
      sy = Math.max(sy, topSafe);
      placedMarkers.push(boxAt(sy));

      angle = Math.atan2(nx, ny) * (180 / Math.PI);
    }

    // El marcador es una FLECHA para lo que no se ve. Si el objetivo está en
    // pantalla ya se ve solo (su halo, su sprite) y la chapa acaba flotando
    // encima del HUD — cosa que pasa constantemente desde que Gabo va pegado
    // a la jugadora. Fuera de pantalla, aparece.
    marker.classList.toggle("hidden", onScreen);
    marker.classList.toggle("edge", !onScreen);
    marker.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
    arrow.style.transform = `rotate(${angle}deg)`;
    distEl.textContent = onScreen ? "" : target.short ?? "";
  }

  return { update, root: layer };
}
