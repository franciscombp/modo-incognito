import * as floorplan from "../scene/floorplan.js";

// El PLANO del piso (tecla M): un panel de terminal retro-futurista — fondo
// marino, trazo fósforo, tipografía mono — que dibuja el plano real desde
// floorplan.js en un canvas. No es un segundo mundo que mantener: son los
// mismos rectángulos de `areas`, el muro de `barriers` y los puntos vivos
// del snapshot (jugadora, jefe, tareas pendientes, lugares seguros).
//
// TODOS los colores salen de los tokens del design system (se leen de
// getComputedStyle al abrir): re-tematizar la interfaz re-tematiza el mapa
// sin tocar este archivo.

export function createMinimap(root) {
  const panel = document.createElement("div");
  panel.className = "inc-minimap inc-hidden";
  panel.innerHTML =
    '<div class="inc-minimap-head"><span class="inc-minimap-title">PLANO · PISO 10</span>' +
    '<span class="inc-minimap-hint">M para cerrar</span></div>';
  const canvas = document.createElement("canvas");
  canvas.className = "inc-minimap-canvas";
  panel.appendChild(canvas);
  root.appendChild(panel);
  const ctx = canvas.getContext("2d");

  let open = false;
  let colors = null;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim() || fallback;
    colors = {
      stroke: v("--map-stroke", "#7fd8cf"),
      dim: v("--map-dim", "rgba(127, 216, 207, 0.35)"),
      fill: v("--map-fill", "rgba(127, 216, 207, 0.07)"),
      player: v("--map-player", "#eaf6f4"),
      boss: v("--map-boss", "#e6483f"),
      task: v("--map-task", "#e0a03c"),
      safe: v("--map-safe", "#69b087"),
      text: v("--map-text", "rgba(127, 216, 207, 0.85)"),
    };
  }

  /** Encuadre: del mundo al canvas, conservando proporción y con margen. */
  function makeProjection(w, h) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const a of floorplan.areas) {
      minX = Math.min(minX, a.x - a.w / 2);
      maxX = Math.max(maxX, a.x + a.w / 2);
      minZ = Math.min(minZ, a.z - a.d / 2);
      maxZ = Math.max(maxZ, a.z + a.d / 2);
    }
    const pad = 18;
    const sx = (w - pad * 2) / (maxX - minX || 1);
    const sz = (h - pad * 2) / (maxZ - minZ || 1);
    const s = Math.min(sx, sz);
    const ox = (w - (maxX - minX) * s) / 2;
    const oz = (h - (maxZ - minZ) * s) / 2;
    return { toX: (x) => ox + (x - minX) * s, toY: (z) => oz + (z - minZ) * s, s };
  }

  function draw(state) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = panel.clientWidth - 2;
    const h = Math.max(200, Math.round(w * 0.72));
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = makeProjection(w, h);
    const c = colors;

    // Salas: cajas de trazo fino con su relleno fantasma y su rótulo mono.
    ctx.font = "600 9px ui-monospace, SFMono-Regular, Menlo, monospace";
    for (const a of floorplan.areas) {
      const x = p.toX(a.x - a.w / 2);
      const y = p.toY(a.z - a.d / 2);
      const aw = a.w * p.s;
      const ad = a.d * p.s;
      ctx.fillStyle = c.fill;
      ctx.fillRect(x, y, aw, ad);
      ctx.strokeStyle = c.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, aw - 1, ad - 1);
      if (a.label && aw > 46 && ad > 18) {
        ctx.fillStyle = c.text;
        ctx.fillText(String(a.label).toUpperCase().slice(0, 14), x + 5, y + 12, aw - 10);
      }
    }

    // El muro entre alas, con su hueco de puerta.
    ctx.strokeStyle = c.stroke;
    ctx.lineWidth = 2;
    for (const b of floorplan.barriers) {
      if (b.x1 == null) continue;
      ctx.beginPath();
      ctx.moveTo(p.toX(b.x1), p.toY(b.z1 ?? b.z));
      ctx.lineTo(p.toX(b.x2), p.toY(b.z2 ?? b.z));
      ctx.stroke();
    }

    const dot = (x, z, r, color, ring = false) => {
      ctx.beginPath();
      ctx.arc(p.toX(x), p.toY(z), r, 0, Math.PI * 2);
      if (ring) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    };

    // Lugares seguros (anillos) y tareas PENDIENTES (rombos ámbar).
    for (const s of floorplan.safeSpots) dot(s.x, s.z, 4, c.safe, true);
    if (state?.objectives) {
      for (const o of state.objectives) {
        if (o.done || o.x == null) continue;
        const x = p.toX(o.x);
        const y = p.toY(o.z);
        ctx.fillStyle = c.task;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 5);
        ctx.lineTo(x - 4, y);
        ctx.closePath();
        ctx.fill();
      }
    }

    // La jugadora (blanco, con halo suave) y el jefe (rojo).
    if (state?.playerPos) {
      dot(state.playerPos.x, state.playerPos.z, 7, "rgba(255,255,255,0.18)");
      dot(state.playerPos.x, state.playerPos.z, 3.5, c.player);
    }
    if (state?.bossPos) dot(state.bossPos.x, state.bossPos.z, 3.5, c.boss);
  }

  return {
    get isOpen() {
      return open;
    },
    toggle() {
      open = !open;
      if (open) readColors();
      panel.classList.toggle("inc-hidden", !open);
    },
    close() {
      open = false;
      panel.classList.add("inc-hidden");
    },
    /** Llamar por frame con el snapshot vivo; barato si está cerrado. */
    update(state) {
      if (!open) return;
      if (!state) {
        this.close();
        return;
      }
      draw(state);
    },
  };
}
