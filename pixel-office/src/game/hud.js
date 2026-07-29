function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
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

  const objectivesPanel = el("div", "hud-objectives", topBar);
  el("div", "hud-panel-title", objectivesPanel).textContent = "OBJETIVOS DE OCIO";
  const objectivesList = el("div", "hud-objectives-list", objectivesPanel);

  const centerCol = el("div", "hud-center", topBar);
  const suspicionWrap = el("div", "hud-suspicion", centerCol);
  el("div", "hud-panel-title", suspicionWrap).textContent = "SOSPECHA";
  const suspicionTrack = el("div", "hud-suspicion-track", suspicionWrap);
  const suspicionFill = el("div", "hud-suspicion-fill", suspicionTrack);
  const warningsRow = el("div", "hud-warnings", centerCol);
  const warningPips = [0, 1, 2].map(() => el("div", "hud-warning-pip", warningsRow));

  const timerPanel = el("div", "hud-timer", topBar);
  el("div", "hud-panel-title", timerPanel).textContent = "JORNADA";
  const timerValue = el("div", "hud-timer-value", timerPanel);

  const toast = el("div", "hud-toast", hud);
  const statusBadge = el("div", "hud-status-badge", hud);

  const prompt = el("div", "hud-prompt", hud);

  const overlay = el("div", "hud-overlay hidden", hud);
  const overlayCard = el("div", "hud-overlay-card", overlay);
  const overlayTitle = el("div", "hud-overlay-title", overlayCard);
  const overlayBody = el("div", "hud-overlay-body", overlayCard);

  function render(state) {
    const pct = Math.round((state.suspicion / state.suspicionMax) * 100);
    suspicionFill.style.width = `${pct}%`;
    suspicionFill.classList.toggle("danger", pct > 70);
    suspicionFill.classList.toggle("hot", state.redAlert);

    warningPips.forEach((pip, i) => pip.classList.toggle("lit", i < state.warnings));

    timerValue.textContent = fmtTime(state.timeLeft);
    timerValue.classList.toggle("danger", state.timeLeft < 30);

    objectivesList.innerHTML = "";
    state.objectives.forEach((o) => {
      const row = el("div", `hud-objective${o.done ? " done" : ""}`, objectivesList);
      row.textContent = `${o.done ? "✓" : "•"} ${o.label}`;
      if (!o.done && o.progress > 0) {
        const bar = el("div", "hud-objective-bar", row);
        el("div", "hud-objective-bar-fill", bar).style.width = `${Math.round((o.progress / o.time) * 100)}%`;
      }
    });

    if (state.message) {
      toast.textContent = state.message.text;
      toast.classList.add("visible");
    } else {
      toast.classList.remove("visible");
    }

    const statusBits = [];
    if (state.isHiding) statusBits.push("ESCONDIDA");
    if (state.isPretending) statusBits.push("FINGIENDO TRABAJAR");
    if (state.bossState === "CHASE") statusBits.push("¡TE PERSIGUE!");
    statusBadge.textContent = statusBits.join(" · ");
    statusBadge.classList.toggle("visible", statusBits.length > 0);
    statusBadge.classList.toggle("alert", state.bossState === "CHASE");

    if (state.nearStation) {
      const s = state.nearStation;
      const pct2 = Math.round((s.progress / s.time) * 100);
      prompt.textContent = `Mantén E: ${s.label} (${pct2}%)`;
      prompt.classList.add("visible");
    } else if (state.nearDistraction) {
      prompt.textContent = `E: ${state.nearDistraction.label}`;
      prompt.classList.add("visible");
    } else {
      prompt.classList.remove("visible");
    }

    if (state.gameOver) {
      overlay.classList.remove("hidden");
      overlayTitle.textContent = state.win ? "¡Jornada completada!" : "Despedida";
      overlayTitle.classList.toggle("win", state.win);
      overlayTitle.classList.toggle("lose", !state.win);
      overlayBody.textContent = state.win
        ? "Completaste todas las actividades de ocio antes del cierre. Recarga la página para volver a intentarlo."
        : state.warnings >= state.maxWarnings
        ? "Tres advertencias del jefe. Recarga la página para volver a intentarlo."
        : "Se terminó la jornada con objetivos pendientes. Recarga la página para volver a intentarlo.";
    } else {
      overlay.classList.add("hidden");
    }
  }

  return { render };
}
