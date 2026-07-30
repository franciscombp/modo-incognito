import { ACTIVITY_COLORS, AREA_KINDS } from "../scene/floorplan.js";
import { sfxMove, sfxSelect } from "./sfx.js";

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

// Qué tan minimizado está cada panel del HUD, recordado entre sesiones —
// en móvil el espacio es escaso y en desktop a veces solo estorba.
const COLLAPSE_KEY = "modo-incognito:hud-collapse:v1";
function readCollapse() {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function writeCollapse(state) {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: no molesta, solo no se recuerda */
  }
}

export function createHud(root) {
  const hud = el("div", "hud-root", root);
  const stored = readCollapse();
  // En móvil, si nunca se ha tocado el ajuste, arranca colapsado: la
  // pantalla es chica y tres paneles abiertos a la vez se comen media
  // partida. En desktop arranca expandido, minimizar es una opción, no el
  // default.
  const isCoarsePointer = matchMedia("(pointer: coarse)").matches;
  const collapseState =
    Object.keys(stored).length > 0
      ? stored
      : isCoarsePointer
      ? { objectives: true, pressure: true, resources: true }
      : {};

  /** Botón "▾/▸" en la fila de título de un panel: colapsa `targetEl`. */
  function addCollapseToggle(titleRow, targetEl, key) {
    const btn = el("button", "hud-collapse-btn", titleRow);
    btn.type = "button";
    const apply = () => {
      const collapsed = !!collapseState[key];
      targetEl.classList.toggle("collapsed", collapsed);
      btn.textContent = collapsed ? "▸" : "▾";
      btn.setAttribute("aria-label", collapsed ? "Expandir panel" : "Minimizar panel");
    };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      collapseState[key] = !collapseState[key];
      writeCollapse(collapseState);
      apply();
    });
    apply();
    return btn;
  }

  // Three columns that never share space, so nothing can overlap: tasks on
  // the left, pressure in the middle, resources on the right. The "where am
  // I / what do I press" readouts live on the world itself (worldPrompt) and
  // in the bottom card (compass), not up here.
  const topBar = el("div", "hud-topbar", hud);

  const objectivesPanel = el("div", "hud-panel hud-objectives", topBar);
  const objTitleRow = el("div", "hud-panel-title", objectivesPanel);
  objTitleRow.innerHTML = `<span class="hud-title-icon">🎯</span> OBJETIVOS <span class="hud-objectives-count"></span>`;
  const objectivesCount = objTitleRow.querySelector(".hud-objectives-count");
  const objectivesList = el("div", "hud-objectives-list", objectivesPanel);
  addCollapseToggle(objTitleRow, objectivesPanel, "objectives");

  const centerCol = el("div", "hud-center", topBar);
  const dayRow = el("div", "hud-day-row", centerCol);
  const dayChip = el("div", "hud-day-chip", dayRow);
  const heatStars = el("div", "heat-stars", dayRow);
  const suspicionWrap = el("div", "hud-panel hud-suspicion", centerCol);
  const susTitleRow = el("div", "hud-panel-title", suspicionWrap);
  susTitleRow.innerHTML = `<span class="hud-title-icon">👁️</span> SOSPECHA`;
  const suspicionTrack = el("div", "hud-suspicion-track", suspicionWrap);
  const suspicionFill = el("div", "hud-suspicion-fill", suspicionTrack);
  const suspicionGlint = el("div", "hud-suspicion-glint", suspicionFill);
  const warningsRow = el("div", "hud-warnings", suspicionWrap);
  let warningPips = [];
  addCollapseToggle(susTitleRow, centerCol, "pressure");
  const statusBadge = el("div", "hud-status-badge", centerCol);
  const toast = el("div", "hud-toast", centerCol);

  const rightCol = el("div", "hud-right", topBar);
  const timerPanel = el("div", "hud-panel hud-timer", rightCol);
  const timerTitleRow = el("div", "hud-panel-title", timerPanel);
  timerTitleRow.innerHTML = `<span class="hud-title-icon">⏱️</span> JORNADA`;
  const clockValue = el("div", "hud-clock-value", timerPanel);
  const timerValue = el("div", "hud-timer-value", timerPanel);
  const timerTrack = el("div", "hud-timer-track", timerPanel);
  const timerFill = el("div", "hud-timer-fill", timerTrack);
  addCollapseToggle(timerTitleRow, rightCol, "resources");

  const scorePanel = el("div", "hud-panel hud-scorepanel", rightCol);
  const scoreTitleRow = el("div", "hud-panel-title", scorePanel);
  scoreTitleRow.innerHTML = `<span class="hud-title-icon">◆</span> PUNTOS`;
  const scoreRow = el("div", "hud-score", scorePanel);
  const scoreValue = el("span", "hud-score-value", scoreRow);
  const comboChip = el("span", "hud-combo", scoreRow);
  const comboBar = el("span", "hud-combo-bar", comboChip);
  const comboText = el("span", "hud-combo-text", comboChip);
  const perkChip = el("div", "hud-perk", scorePanel);

  // ---- Escena de acción: ilustración grande de lo que estás haciendo ----
  // Al estilo RPG clásico: un panel visible mientras dura la actividad (o
  // mientras finges), con una imagen por acción. Las imágenes reales llegan
  // después (public/actions/<id>.png); hasta entonces, o si a alguna le
  // falta el archivo, cae en el emoji de la actividad sin romper nada.
  const actionScene = el("div", "action-scene hidden", hud);
  const actionFrame = el("div", "action-frame", actionScene);
  const actionImg = el("img", "action-img hidden", actionFrame);
  const actionEmoji = el("div", "action-emoji", actionFrame);
  const actionDone = el("div", "action-done hidden", actionFrame);
  const actionTrack = el("div", "action-progress-track", actionScene);
  const actionFill = el("div", "action-progress-fill", actionTrack);
  const actionLabel = el("div", "action-label", actionScene);
  let actionId = null;

  // Una sola escena de acción: mientras se sostiene E la barra de progreso y
  // la ilustración viven en el mismo panel que antes duplicaba el globo
  // flotante "MANTÉN E" (worldPrompt se oculta mientras esto está visible,
  // ver render() más abajo). Al completarse muestra un check un instante.
  function setAction(action) {
    if (!action) {
      actionScene.classList.add("hidden");
      actionId = null;
      return;
    }
    actionScene.classList.remove("hidden");
    actionFrame.classList.toggle("done", !!action.done);
    actionDone.classList.toggle("hidden", !action.done);
    if (action.id !== actionId) {
      actionId = action.id;
      actionEmoji.textContent = action.icon ?? "❓";
      actionEmoji.classList.remove("hidden");
      actionImg.classList.add("hidden");
      actionImg.onerror = () => {
        actionImg.classList.add("hidden");
        actionEmoji.classList.remove("hidden");
      };
      actionImg.onload = () => {
        actionImg.classList.remove("hidden");
        actionEmoji.classList.add("hidden");
      };
      const base = import.meta.env.BASE_URL ?? "/";
      actionImg.src = `${base}actions/${action.id}.png`;
    }
    actionLabel.textContent = action.done ? `${action.label} ✔` : action.label ?? "";
    actionTrack.classList.toggle("hidden", action.progress == null);
    if (action.progress != null) {
      actionFill.style.width = `${Math.round(Math.min(1, Math.max(0, action.progress)) * 100)}%`;
    }
  }

  // ---- Tarjeta de presentación de secuaces ----
  // Un cartel breve al empezar el día, uno por secuaz de turno, mientras la
  // cámara hace zoom hacia él (ver introduceMinions() en engine.js) — así
  // cada uno se presenta como una amenaza propia en vez de aparecer sin
  // más en mitad de la partida.
  const introCard = el("div", "intro-card hidden", hud);
  const introIcon = el("div", "intro-card-icon", introCard);
  const introName = el("div", "intro-card-name", introCard);
  const introBlurb = el("div", "intro-card-blurb", introCard);

  function showIntroCard({ icon, name, blurb }) {
    introIcon.textContent = icon ?? "👁️";
    introName.textContent = name ?? "";
    introBlurb.textContent = blurb ?? "";
    introCard.classList.remove("hidden");
    // Reinicia la animación de entrada aunque el cartel ya estuviera visible
    // (un secuaz seguido de otro no debe leerse como el mismo cartel).
    introCard.classList.remove("pop");
    void introCard.offsetWidth;
    introCard.classList.add("pop");
  }

  function hideIntroCard() {
    introCard.classList.add("hidden");
  }

  // ---- Mensaje de Teams de Gabo ----
  // Una burbuja de chat que aparece sola, sin importar dónde esté el jefe
  // en el mapa — es un mensaje, no algo que dependa de estar cerca — y se
  // retira sola. Le da personalidad a Gabo fuera de los encuentros cara a
  // cara (ver GABO_TEAMS_INTERVAL en game.js).
  const teamsToast = el("div", "teams-toast hidden", hud);
  const teamsHeader = el("div", "teams-toast-header", teamsToast);
  el("span", "teams-toast-icon", teamsHeader, "💬");
  el("span", "teams-toast-app", teamsHeader, "Teams");
  const teamsFrom = el("div", "teams-toast-from", teamsToast);
  const teamsText = el("div", "teams-toast-text", teamsToast);
  let teamsTimer = null;

  function showTeamsMessage(text, from = "Gabo (Barbie Malibú)") {
    teamsFrom.textContent = from;
    teamsText.textContent = text;
    teamsToast.classList.remove("hidden");
    teamsToast.classList.remove("pop");
    void teamsToast.offsetWidth;
    teamsToast.classList.add("pop");
    clearTimeout(teamsTimer);
    teamsTimer = setTimeout(() => teamsToast.classList.add("hidden"), 6000);
  }

  // ---- End-of-day card ----
  // Vive fuera de hud-root a propósito: hud-root fija su propio contexto de
  // apilamiento (z-index bajo, para quedar detrás del vestíbulo/diálogo), y
  // el resultado de fin de día debe poder mostrarse incluso cuando ese
  // vestíbulo está de fondo (ver crossingFailed() en engine.js).
  const overlay = el("div", "hud-overlay hidden", root);
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
      btn.addEventListener("click", () => {
        sfxSelect();
        action.onClick();
      });
    });
    overlay.classList.remove("hidden");
    // The touch joystick covers most of the lower screen; without this the
    // result card is unreachable on a phone because every tap lands on the
    // stick zone instead of the buttons.
    document.body.classList.add("overlay-open");
    const primaryBtn = overlayActions.querySelector(".primary") ?? overlayActions.firstElementChild;
    primaryBtn?.focus();
  }

  function hideResult() {
    overlay.classList.add("hidden");
    document.body.classList.remove("overlay-open");
  }

  // ---- Teclado en la tarjeta de fin de día: mismas teclas que en los menús
  // (flechas/WASD mueven el foco, E también confirma junto a espacio/enter).
  window.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("hidden")) return;
    const key = e.key.toLowerCase();
    const items = [...overlayActions.querySelectorAll("button")];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (["arrowdown", "arrowright", "s", "d"].includes(key)) {
      e.preventDefault();
      items[(((at < 0 ? 0 : at) + 1) % items.length + items.length) % items.length].focus();
      sfxMove();
    } else if (["arrowup", "arrowleft", "w", "a"].includes(key)) {
      e.preventDefault();
      items[(((at < 0 ? 0 : at) - 1) % items.length + items.length) % items.length].focus();
      sfxMove();
    } else if (key === "e" && document.activeElement && items.includes(document.activeElement)) {
      e.preventDefault();
      document.activeElement.click();
    }
  });

  function render(state) {
    setAction(state.currentAction);

    if (state.maxWarnings !== maxWarningsRendered) {
      maxWarningsRendered = state.maxWarnings;
      warningsRow.innerHTML = "";
      warningPips = Array.from({ length: state.maxWarnings }, () => {
        const pip = el("div", "hud-warning-pip", warningsRow);
        pip.textContent = "!";
        return pip;
      });
    }

    const doneCount = state.objectives.filter((o) => o.done).length;
    objectivesCount.textContent = `${doneCount}/${state.objectives.length}`;

    if (state.maxHeat != null) {
      heatStars.innerHTML = Array.from({ length: state.maxHeat }, (_, i) =>
        i < state.heat ? '<span class="lit">★</span>' : '<span class="off">★</span>'
      ).join("");
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

    clockValue.textContent = state.currentTime;
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

  }

  return {
    render,
    setDay,
    setVisible,
    showResult,
    hideResult,
    showIntroCard,
    hideIntroCard,
    showTeamsMessage,
    root: hud,
  };
}
