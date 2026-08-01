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
  node.className = "wprompt";
  node.innerHTML = `
    <div class="wprompt-card">
      <span class="wprompt-key"></span>
      <span class="wprompt-body">
        <span class="wprompt-label"></span>
        <span class="wprompt-hint"></span>
      </span>
      <span class="wprompt-fill"></span>
    </div>
    <span class="wprompt-stem"></span>
  `;
  root.appendChild(node);

  const card = node.querySelector(".wprompt-card");
  const keyEl = node.querySelector(".wprompt-key");
  const labelEl = node.querySelector(".wprompt-label");
  const hintEl = node.querySelector(".wprompt-hint");
  const fillEl = node.querySelector(".wprompt-fill");

  const v = new THREE.Vector3();
  const keyName = isTouch ? "USAR" : "E";

  function hide() {
    node.classList.remove("visible");
  }

  function update(state) {
    if (!state || state.gameOver) return hide();

    // While the big action scene is on screen (doing a task, or its
    // just-completed flash) it already shows the label and progress, so the
    // floating "MANTÉN E" card would just duplicate it on top of the object.
    if (state.currentAction) return hide();

    // Priority: what you are actually holding beats what is merely nearby.
    let target = null;
    if (state.nearStation) {
      target = {
        x: state.nearStation.x,
        z: state.nearStation.z,
        icon: state.nearStation.icon ?? "•",
        label: state.nearStation.label,
        hint: isTouch ? "MANTÉN USAR" : "MANTÉN E",
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
    node.classList.add("visible");
  }

  return { update, hide };
}
