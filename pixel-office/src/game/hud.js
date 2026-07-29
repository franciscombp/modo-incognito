import { ACTIVITY_COLORS, AREA_KINDS } from "../scene/floorplan.js";

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function hex(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

const KIND_LABEL = {
  [AREA_KINDS.OPEN_OFFICE]: "Trabajo",
  [AREA_KINDS.MEETING]: "Sala",
  [AREA_KINDS.SOCIAL]: "Social",
  [AREA_KINDS.AUDITORIUM]: "Auditorio",
  [AREA_KINDS.CORE]: "Servicios",
  [AREA_KINDS.ELEVATOR]: "Acceso",
};

const WING_LABEL = { sur: "Ala Sur", norte: "Ala Norte", centro: "Centro" };

export function createHud(root) {
  const hud = el("div", "hud-root", root);

  // ---- Location strip: ala · zona · capacidad · tipo ----
  const locationBar = el("div", "hud-location", hud);
  const locWing = el("span", "hud-loc-wing", locationBar);
  const locName = el("span", "hud-loc-name", locationBar);
  const locMeta = el("span", "hud-loc-meta", locationBar);

  const topBar = el("div", "hud-topbar", hud);

  const objectivesPanel = el("div", "hud-panel hud-objectives", topBar);
  const objTitleRow = el("div", "hud-panel-title", objectivesPanel);
  objTitleRow.innerHTML = `<span class="hud-title-icon">🎯</span> OBJETIVOS DE OCIO`;
  const objectivesList = el("div", "hud-objectives-list", objectivesPanel);

  const centerCol = el("div", "hud-center", topBar);
  const dayChip = el("div", "hud-day-chip", centerCol);
  const scoreRow = el("div", "hud-score", centerCol);
  const scoreValue = el("span", "hud-score-value", scoreRow);
  const comboChip = el("span", "hud-combo", scoreRow);
  const comboBar = el("span", "hud-combo-bar", comboChip);
  const comboText = el("span", "hud-combo-text", comboChip);
  const perkChip = el("div", "hud-perk", centerCol);
  const suspicionWrap = el("div", "hud-panel hud-suspicion", centerCol);
  const susTitleRow = el("div", "hud-panel-title", suspicionWrap);
  susTitleRow.innerHTML = `<span class="hud-title-icon">👁️</span> SOSPECHA`;
  const suspicionTrack = el("div", "hud-suspicion-track", suspicionWrap);
  const suspicionFill = el("div", "hud-suspicion-fill", suspicionTrack);
  const suspicionGlint = el("div", "hud-suspicion-glint", suspicionFill);
  const warningsRow = el("div", "hud-warnings", suspicionWrap);
  let warningPips = [];

  const timerPanel = el("div", "hud-panel hud-timer", topBar);
  const timerTitleRow = el("div", "hud-panel-title", timerPanel);
  timerTitleRow.innerHTML = `<span class="hud-title-icon">⏱️</span> JORNADA`;
  const timerValue = el("div", "hud-timer-value", timerPanel);
  const timerTrack = el("div", "hud-timer-track", timerPanel);
  const timerFill = el("div", "hud-timer-fill", timerTrack);

  const toast = el("div", "hud-toast", hud);
  const statusBadge = el("div", "hud-status-badge", hud);

  const prompt = el("div", "hud-prompt", hud);
  const promptIcon = el("span", "hud-prompt-icon", prompt);
  const promptText = el("span", "hud-prompt-text", prompt);
  const promptRing = el("div", "hud-prompt-ring", prompt);
  const promptRingFill = el("div", "hud-prompt-ring-fill", promptRing);

  const legend = el("div", "hud-legend", hud);
  legend.innerHTML = `
    <div class="hud-legend-item"><span class="hud-legend-swatch hud-legend-you"></span>Tú</div>
    <div class="hud-legend-item"><span class="hud-legend-swatch hud-legend-boss"></span>Jefe</div>
    <div class="hud-legend-item"><span class="hud-legend-swatch hud-legend-hide"></span>Escondite</div>
    <div class="hud-legend-item"><span class="hud-legend-swatch hud-legend-distract"></span>Distracción</div>
  `;

  // ---- End-of-day card ----
  const overlay = el("div", "hud-overlay hidden", hud);
  const overlayCard = el("div", "hud-overlay-card", overlay);
  const overlayIcon = el("div", "hud-overlay-icon", overlayCard);
  const overlayTitle = el("div", "hud-overlay-title", overlayCard);
  const overlayScore = el("div", "hud-overlay-score", overlayCard);
  const overlayBody = el("div", "hud-overlay-body", overlayCard);
  const overlayActions = el("div", "hud-overlay-actions", overlayCard);

  let maxWarningsRendered = -1;

  function setDay(day) {
    dayChip.textContent = `DÍA ${day.number} · ${day.title.toUpperCase()}`;
  }

  /** Toggles the whole in-game HUD, e.g. while a menu is up. */
  function setVisible(visible) {
    hud.classList.toggle("hidden", !visible);
  }

  /** Shown between days; `actions` are [{ label, primary, onClick }]. */
  function showResult({ icon, title, body, win, actions, rank, score, target }) {
    overlayIcon.textContent = icon;
    overlayTitle.textContent = title;
    overlayTitle.classList.toggle("win", !!win);
    overlayTitle.classList.toggle("lose", !win);

    overlayScore.innerHTML = "";
    if (score != null) {
      const box = el("div", "hud-result-score", overlayScore);
      el("span", "hud-result-points", box, `${score.toLocaleString("es")} pts`);
      if (target) {
        const track = el("div", "hud-result-track", box);
        const fill = el("div", "hud-result-fill", track);
        fill.style.width = `${Math.min(100, Math.round((score / target) * 100))}%`;
        el("span", "hud-result-target", box, `objetivo ${target.toLocaleString("es")}`);
      }
    }
    if (rank) {
      const badge = el("div", `hud-rank rank-${rank.label}`, overlayScore);
      el("span", "hud-rank-letter", badge, rank.label);
      el("span", "hud-rank-blurb", badge, rank.blurb);
    }

    overlayBody.textContent = body;
    overlayActions.innerHTML = "";
    actions.forEach((action) => {
      const btn = el("button", `hud-overlay-btn${action.primary ? " primary" : ""}`, overlayActions);
      btn.type = "button";
      btn.textContent = action.label;
      btn.addEventListener("click", action.onClick);
    });
    overlay.classList.remove("hidden");
    // The touch joystick covers most of the lower screen; without this the
    // result card is unreachable on a phone because every tap lands on the
    // stick zone instead of the buttons.
    document.body.classList.add("overlay-open");
  }

  function hideResult() {
    overlay.classList.add("hidden");
    document.body.classList.remove("overlay-open");
  }

  function render(state) {
    if (state.maxWarnings !== maxWarningsRendered) {
      maxWarningsRendered = state.maxWarnings;
      warningsRow.innerHTML = "";
      warningPips = Array.from({ length: state.maxWarnings }, () => {
        const pip = el("div", "hud-warning-pip", warningsRow);
        pip.textContent = "!";
        return pip;
      });
    }

    scoreValue.textContent = state.score.toLocaleString("es");
    const comboOn = state.combo > 1;
    comboChip.classList.toggle("on", comboOn);
    comboText.textContent = `x${state.combo.toFixed(1)}`;
    comboBar.style.width = comboOn
      ? `${Math.round((state.comboLeft / state.comboWindow) * 100)}%`
      : "0%";

    perkChip.classList.toggle("visible", !!state.perk);
    if (state.perk) {
      perkChip.textContent = `☕ CAFEÍNA ${Math.ceil(state.perkLeft)}s`;
      perkChip.style.setProperty("--p", state.perkLeft / state.perkDuration);
    }

    const pct = Math.round((state.suspicion / state.suspicionMax) * 100);
    suspicionFill.style.width = `${pct}%`;
    suspicionFill.classList.toggle("danger", pct > 70 && pct <= 92);
    suspicionFill.classList.toggle("hot", state.redAlert || pct > 92);
    suspicionGlint.classList.toggle("pulse", state.redAlert);

    warningPips.forEach((pip, i) => pip.classList.toggle("lit", i < state.warnings));

    timerValue.textContent = fmtTime(state.timeLeft);
    const timePct = Math.round((state.timeLeft / state.levelDuration) * 100);
    timerFill.style.width = `${timePct}%`;
    const timeLow = state.timeLeft < 30;
    timerValue.classList.toggle("danger", timeLow);
    timerFill.classList.toggle("danger", timeLow);

    objectivesList.innerHTML = "";
    state.objectives.forEach((o) => {
      const row = el("div", `hud-objective${o.done ? " done" : ""}`, objectivesList);
      const dot = el("span", "hud-objective-dot", row);
      dot.style.background = hex(ACTIVITY_COLORS[o.type] ?? 0xffffff);
      const iconSpan = el("span", "hud-objective-icon", row);
      iconSpan.textContent = o.done ? "✓" : o.icon ?? "•";
      const labelSpan = el("span", "hud-objective-label", row);
      labelSpan.textContent = o.label;
      if (!o.done && o.progress > 0) {
        const bar = el("div", "hud-objective-bar", row);
        const fill = el("div", "hud-objective-bar-fill", bar);
        fill.style.width = `${Math.round((o.progress / o.time) * 100)}%`;
        fill.style.background = hex(ACTIVITY_COLORS[o.type] ?? 0xe0722c);
      }
    });

    // Location strip — the "estás aquí" readout asked for in the brief.
    const area = state.area;
    if (area) {
      locWing.textContent = WING_LABEL[area.wing] ?? "Piso 7";
      locName.textContent = area.name;
      const bits = [KIND_LABEL[area.kind] ?? "Zona"];
      if (area.capacity > 0) bits.push(`${area.capacity} sillas`);
      locMeta.textContent = bits.join(" · ");
      locationBar.style.setProperty("--zone-color", area.color ?? "#d9d9d9");
      locationBar.classList.add("visible");
    } else {
      locationBar.classList.remove("visible");
    }

    if (state.message) {
      toast.textContent = state.message.text;
      toast.classList.add("visible");
    } else {
      toast.classList.remove("visible");
    }

    const statusBits = [];
    if (state.isHiding) statusBits.push("🫥 ESCONDIDA");
    if (state.isPretending) statusBits.push("⌨️ FINGIENDO TRABAJAR");
    if (state.bossState === "CHASE") statusBits.push("🚨 ¡TE PERSIGUE!");
    else if (state.bossState === "SEARCH") statusBits.push("🔎 TE ESTÁ BUSCANDO");
    else if (state.bossState === "INVESTIGATE") statusBits.push("❓ DISTRAÍDO");
    statusBadge.textContent = statusBits.join("   ·   ");
    statusBadge.classList.toggle("visible", statusBits.length > 0);
    statusBadge.classList.toggle("alert", state.bossState === "CHASE");

    if (state.nearNpc) {
      promptIcon.textContent = "💬";
      promptText.textContent = `Toca E: hablar con ${state.nearNpc.displayName}`;
      promptRingFill.style.setProperty("--p", 0);
      prompt.classList.add("visible", "prompt-tap");
    } else if (state.nearStation) {
      const s = state.nearStation;
      promptIcon.textContent = s.icon ?? "•";
      promptText.textContent = `Mantén E: ${s.label}`;
      promptRingFill.style.setProperty("--p", s.progress / s.time);
      prompt.classList.add("visible");
      prompt.classList.remove("prompt-tap");
    } else if (state.nearDistraction) {
      promptIcon.textContent = "⭐";
      promptText.textContent = `Toca E: ${state.nearDistraction.label}`;
      promptRingFill.style.setProperty("--p", 0);
      prompt.classList.add("visible", "prompt-tap");
    } else {
      prompt.classList.remove("visible");
    }
  }

  return { render, setDay, setVisible, showResult, hideResult, root: hud };
}
