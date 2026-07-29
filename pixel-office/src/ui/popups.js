import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";

// Floating score numbers anchored to a world position. They are DOM nodes
// projected through the camera each frame rather than sprites, so they stay
// crisp above the pixelated render and can use the same font as the HUD.

const LIFE = 1.5;

export function createPopups(root, camera) {
  const layer = document.createElement("div");
  layer.className = "px-popups";
  root.appendChild(layer);

  const live = [];
  const v = new THREE.Vector3();

  function spawn({ text, sub = "", x, z, kind = "score" }) {
    const node = document.createElement("div");
    node.className = `px-pop px-pop-${kind}`;
    node.innerHTML = `<span class="px-pop-main">${text}</span>${
      sub ? `<span class="px-pop-sub">${sub}</span>` : ""
    }`;
    layer.appendChild(node);
    live.push({ node, x, y: 1.6 * S, z, life: LIFE });
  }

  function update(dt) {
    if (!live.length) return;
    const w = layer.clientWidth;
    const h = layer.clientHeight;

    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.node.remove();
        live.splice(i, 1);
        continue;
      }
      const t = 1 - p.life / LIFE;
      v.set(p.x, p.y + t * 1.4 * S, p.z).project(camera);
      // Behind the camera: hide instead of drawing a mirrored ghost.
      const visible = v.z < 1;
      p.node.style.display = visible ? "block" : "none";
      if (!visible) continue;
      p.node.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${
        ((1 - v.y) / 2) * h
      }px)`;
      p.node.style.opacity = String(Math.min(1, p.life / 0.4));
    }
  }

  function clear() {
    live.forEach((p) => p.node.remove());
    live.length = 0;
  }

  return { spawn, update, clear };
}
