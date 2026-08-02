import * as THREE from "three";
import { WORLD_SCALE as S } from "../scene/config.js";
import { icon as svgIcon, hasIcon } from "./icons.js";

// The interaction prompt lives *on the object*, not in a corner of the HUD.
//
// A badge floats above whatever you are standing next to — a task, a
// distraction, a colleague — with the key to press, what it does, and a fill
// bar for held actions. You never have to map "some text at the bottom" onto
// "which of these things in front of me".

export function createWorldPrompt(root, camera, { isTouch = false } = {}) {
  const node = document.createElement("div");
  node.className = "inc-world-prompt";
  node.innerHTML = `
    <div class="inc-world-prompt-card">
      <span class="inc-world-prompt-key"></span>
      <span class="inc-world-prompt-body">
        <span class="inc-world-prompt-label"></span>
        <span class="inc-world-prompt-hint"></span>
      </span>
      <span class="inc-world-prompt-fill"></span>
    </div>
    <span class="inc-world-prompt-stem"></span>
  `;
  root.appendChild(node);

  const card = node.querySelector(".inc-world-prompt-card");
  const keyEl = node.querySelector(".inc-world-prompt-key");
  const labelEl = node.querySelector(".inc-world-prompt-label");
  const hintEl = node.querySelector(".inc-world-prompt-hint");
  const fillEl = node.querySelector(".inc-world-prompt-fill");

  const v = new THREE.Vector3();
  const keyName = isTouch ? "USAR" : "ESPACIO";

  function hide() {
    node.classList.remove("inc-world-prompt-visible");
  }

  function update(state) {
    if (!state || state.gameOver) return hide();

    // While the big action scene is on screen (doing a task, or its
    // just-completed flash) it already shows the label and progress, so the
    // floating "MANTÉN ESPACIO" card would just duplicate it on top of the object.
    if (state.currentAction) return hide();

    // Priority: what you are actually holding beats what is merely nearby.
    let target = null;
    if (state.nearStation) {
      target = {
        x: state.nearStation.x,
        z: state.nearStation.z,
        icon: state.nearStation.icon ?? "•",
        label: state.nearStation.label,
        hint: isTouch ? "MANTÉN USAR" : "MANTÉN ESPACIO",
        progress: state.nearStation.progress / state.nearStation.time,
        kind: "task",
      };
    } else if (state.nearNpc) {
      target = {
        x: state.nearNpc.position.x,
        z: state.nearNpc.position.z,
        icon: "chat",
        label: `Hablar con ${state.nearNpc.displayName}`,
        hint: `PULSA ${keyName}`,
        progress: 0,
        kind: "talk",
      };
    } else if (state.nearDistraction) {
      target = {
        x: state.nearDistraction.x,
        z: state.nearDistraction.z,
        icon: "star",
        label: state.nearDistraction.label,
        hint: `PULSA ${keyName}`,
        progress: 0,
        kind: "distract",
      };
    }

    if (!target) return hide();

    v.set(target.x, 1.9 * S, target.z).project(camera);
    if (v.z >= 1) return hide();

    const w = node.parentElement.clientWidth;
    const h = node.parentElement.clientHeight;
    node.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${
      ((1 - v.y) / 2) * h
    }px)`;

    keyEl.innerHTML = svgIcon(hasIcon(target.icon) ? target.icon : "diamond", { size: 18 });
    labelEl.textContent = target.label;
    hintEl.textContent = target.hint;
    fillEl.style.width = `${Math.round(THREE.MathUtils.clamp(target.progress, 0, 1) * 100)}%`;
    card.dataset.kind = target.kind;
    node.classList.add("inc-world-prompt-visible");
  }

  return { update, hide };
}
