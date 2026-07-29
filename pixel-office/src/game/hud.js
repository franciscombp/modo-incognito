import { ACTIVITY_COLORS } from "../scene/floorplan.js";

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

export function createHud(root) {
  const hud = el("div", "hud-root", root);

  // Top bar: objectives (left) · suspicion (center) · timer (right)
  const topBar = el("div", "hud-topbar", hud);

  const objectivesPanel = el("div", "hud-panel hud-objectives", topBar);
  const objTitleRow = el("div", "hud-panel-title", objectivesPanel);
  objTitleRow.innerHTML = `<span class="hud-title-icon">🎯</span> OBJETIVOS DE OCIO`;
  const objectivesList = el("div", "hud-objectives-list", objectivesPanel);

  const centerCol = el("div", "hud-center", topBar);
  const suspicionWrap = el("div", "hud-panel hud-suspicion", centerCol);
  const susTitleRow = el("div", "hud-panel-title", suspicionWrap);
  susTitleRow.innerHTML = `<span class="hud-title-icon">👁️</span> SOSPECHA`;
  const suspicionTrack = el("div", "hud-suspicion-track", suspicionWrap);
  const suspicionFill = el("div", "hud-suspicion-fill", suspicionTrack);
  const suspicionGlint = el("div", "hud-suspicion-glint", suspicionFill);
  const warningsRow = el("div", "hud-warnings", suspicionWrap);
  const warningPips = [0, 1, 2].map(() => {
    const pip = el("div", "hud-warning-pip", warningsRow);
    pip.textContent = "!";
    return pip;
  });

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

  const overlay = el("div", "hud-overlay hidden", hud);
  const overlayCard = el("div", "hud-overlay-card", overlay);
  const overlayIcon = el("div", "hud-overlay-icon", overlayCard);
  const overlayTitle = el("div", "hud-overlay-title", overlayCard);
  const overlayBody = el("div", "hud-overlay-body", overlayCard);
  const overlayBtn = el("button", "hud-overlay-btn", overlayCard);
  overlayBtn.textContent = "Reintentar";
  overlayBtn.addEventListener("click", () => window.location.reload());

  function render(state) {
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

    if (state.nearStation) {
      const s = state.nearStation;
      const pct2 = s.progress / s.time;
      promptIcon.textContent = s.icon ?? "•";
      promptText.textContent = `Mantén E: ${s.label}`;
      promptRingFill.style.setProperty("--p", pct2);
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

    if (state.gameOver) {
      overlay.classList.remove("hidden");
      overlayIcon.textContent = state.win ? "🎉" : "🚪";
      overlayTitle.textContent = state.win ? "¡Jornada completada!" : "Despedida";
      overlayTitle.classList.toggle("win", state.win);
      overlayTitle.classList.toggle("lose", !state.win);
      overlayBody.textContent = state.win
        ? "Completaste todas las actividades de ocio antes del cierre."
        : state.warnings >= state.maxWarnings
        ? "Tres advertencias del jefe."
        : "Se terminó la jornada con objetivos pendientes.";
    } else {
      overlay.classList.add("hidden");
    }
  }

  return { render };
}
