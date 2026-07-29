import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";

// "Where am I supposed to go?" solved on screen.
//
// A card names the current task and how far it is; a marker tracks it — pinned
// over the target when it is on screen, pushed to the edge of the screen as an
// arrow when it is not. The whole thing turns red when the boss is closing in
// on that same spot, so you can read "what to do", "where" and "am I about to
// get caught" in one glance.

const EDGE = 46; // px kept clear of the screen border

export function createCompass(root, camera) {
  const layer = document.createElement("div");
  layer.className = "compass-layer";
  layer.innerHTML = `
    <div class="compass-card">
      <span class="compass-icon"></span>
      <span class="compass-body">
        <span class="compass-label"></span>
        <span class="compass-meta"></span>
      </span>
      <span class="compass-risk"><i></i></span>
    </div>
    <div class="compass-marker"><span class="compass-arrow">▲</span><span class="compass-dist"></span></div>
  `;
  root.appendChild(layer);

  const card = layer.querySelector(".compass-card");
  const iconEl = layer.querySelector(".compass-icon");
  const labelEl = layer.querySelector(".compass-label");
  const metaEl = layer.querySelector(".compass-meta");
  const riskFill = layer.querySelector(".compass-risk i");
  const marker = layer.querySelector(".compass-marker");
  const arrow = layer.querySelector(".compass-arrow");
  const distEl = layer.querySelector(".compass-dist");

  const v = new THREE.Vector3();

  function update(state) {
    const target = state?.focusStation;
    if (!target || state.gameOver) {
      layer.classList.remove("visible");
      return;
    }
    layer.classList.add("visible");

    const px = state.playerPos.x;
    const pz = state.playerPos.z;
    const distance = Math.hypot(target.x - px, target.z - pz) / S;

    iconEl.textContent = target.icon ?? "•";
    labelEl.textContent = target.label;
    metaEl.textContent =
      state.nearStation && state.nearStation.id === target.id
        ? "MANTÉN USAR"
        : `${Math.round(distance)} m`;

    // How exposed this task is right now: the boss's distance to the target,
    // not to you — that is what decides whether going there is a good idea.
    const bossToTarget = Math.hypot(state.bossPos.x - target.x, state.bossPos.z - target.z) / S;
    const risk = THREE.MathUtils.clamp(1 - bossToTarget / 16, 0, 1);
    riskFill.style.width = `${Math.round(risk * 100)}%`;
    card.classList.toggle("hot", risk > 0.62 || state.redAlert);
    card.classList.toggle("warm", risk > 0.32 && risk <= 0.62);

    const w = layer.clientWidth;
    const h = layer.clientHeight;
    v.set(target.x, 1.2 * S, target.z).project(camera);

    const onScreen = v.z < 1 && Math.abs(v.x) < 0.94 && Math.abs(v.y) < 0.9;
    let sx = ((v.x + 1) / 2) * w;
    let sy = ((1 - v.y) / 2) * h;
    let angle = 0;

    if (!onScreen) {
      // Behind the camera the projection flips; mirror it so the arrow still
      // points the right way instead of sending you in the opposite direction.
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
      sy = h / 2 - ny * scale;
      angle = Math.atan2(nx, ny) * (180 / Math.PI);
    }

    marker.classList.toggle("edge", !onScreen);
    marker.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px)`;
    arrow.style.transform = `rotate(${angle}deg)`;
    distEl.textContent = onScreen ? "" : `${Math.round(distance)} m`;
  }

  return { update, root: layer };
}
