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
    const st = state.nearStation;
    const faltaObjeto = st?.objeto && !(state.inventario ?? []).includes(st.objeto.id);
    if (st && faltaObjeto) {
      // LA ESTACIÓN PIDE ALGO QUE NO LLEVAS. Antes el cartel decía «MANTÉN
      // ESPACIO» igual, lo mantenías y no pasaba nada: el aviso de qué falta
      // llegaba como un toast que ya se había ido. Aquí se dice en el sitio
      // y se dice DÓNDE se consigue (la `pista` del objeto).
      target = {
        x: st.x,
        z: st.z,
        icon: st.icon ?? "•",
        label: `Falta: ${st.objeto.nombre ?? st.objeto.id}`,
        hint: (st.objeto.pista ?? "consíguelo primero").toUpperCase(),
        progress: 0,
        kind: "falta",
      };
    } else if (st) {
      target = {
        x: st.x,
        z: st.z,
        icon: st.icon ?? "•",
        label: st.label,
        hint: isTouch ? "MANTÉN USAR" : "MANTÉN ESPACIO",
        progress: st.progress / st.time,
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

    // EN TU PUESTO, sin nada más a mano: lo que se puede hacer ahí es FINGIR,
    // y era la única acción del juego sin cartel. Es el tutorial de la
    // mecánica central dicho en el sitio, no en una píldora que se apaga.
    if (!target && state.safeSpotHere?.kind === "desk" && !state.isPretending) {
      target = {
        x: state.safeSpotHere.x,
        z: state.safeSpotHere.z,
        icon: "keyboard",
        label: "Fingir que trabajas",
        hint: isTouch ? "MANTÉN USAR" : "MANTÉN ESPACIO",
        progress: 0,
        kind: "pretend",
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
