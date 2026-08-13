import { ACTIVITY_COLORS, AREA_KINDS } from "../scene/floorplan.js";
import { sfxMove, sfxSelect } from "./sfx.js";
import { icon as svgIcon, hasIcon } from "../ui/icons.js";
import { characterShot } from "../ui/charshot.js";

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

// A partir de esta fracción de sospecha la pantalla avisa en rojo. Coincide
// con el umbral de captura de boss-config.json: por encima, el jefe ya viene
// con todo y el siguiente encuentro es la amonestación.
const DANGER_AT = 0.9;
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
  const hud = el("div", "inc-layer inc-layer--hud", root);
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
    const btn = el("button", "inc-panel__collapse-btn", titleRow);
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
  const topBar = el("div", "inc-hud-topbar", hud);

  const objectivesPanel = el("div", "inc-panel inc-hud-objectives", topBar);
  const objTitleRow = el("div", "inc-panel__header", objectivesPanel);
  objTitleRow.innerHTML = `${svgIcon("diamond", { size: 14 })} OBJETIVOS <span class="inc-hud-objectives-count"></span>`;
  const objectivesCount = objTitleRow.querySelector(".inc-hud-objectives-count");
  const objectivesList = el("div", "inc-hud-objectives-list", objectivesPanel);
  addCollapseToggle(objTitleRow, objectivesPanel, "objectives");

  const centerCol = el("div", "inc-hud-center", topBar);
  const dayRow = el("div", "inc-hud-day-row", centerCol);
  const dayChip = el("div", "inc-hud-day-chip", dayRow);
  const heatStars = el("div", "inc-heat-stars", dayRow);
  let heatStarEls = [];
  const suspicionWrap = el("div", "inc-panel inc-hud-suspicion", centerCol);
  const susTitleRow = el("div", "inc-panel__header", suspicionWrap);
  susTitleRow.innerHTML = `${svgIcon("eye", { size: 14 })} SOSPECHA`;
  const suspicionTrack = el("div", "inc-hud-suspicion-track", suspicionWrap);
  const suspicionFill = el("div", "inc-hud-suspicion-fill", suspicionTrack);
  const suspicionGlint = el("div", "inc-hud-suspicion-glint", suspicionFill);
  const warningsRow = el("div", "inc-hud-warnings", suspicionWrap);
  let warningPips = [];
  addCollapseToggle(susTitleRow, centerCol, "pressure");
  const statusBadge = el("div", "inc-hud-status-badge", centerCol);
  const toast = el("div", "inc-hud-toast", centerCol);

  const rightCol = el("div", "inc-hud-right", topBar);
  const timerPanel = el("div", "inc-panel inc-hud-timer", rightCol);
  const timerTitleRow = el("div", "inc-panel__header", timerPanel);
  timerTitleRow.innerHTML = `${svgIcon("clock", { size: 14 })} JORNADA`;
  const clockValue = el("div", "inc-hud-clock-value", timerPanel);
  const timerValue = el("div", "inc-hud-timer-value", timerPanel);
  const timerTrack = el("div", "inc-hud-timer-track", timerPanel);
  const timerFill = el("div", "inc-hud-timer-fill", timerTrack);
  addCollapseToggle(timerTitleRow, rightCol, "resources");

  const scorePanel = el("div", "inc-panel inc-hud-scorepanel", rightCol);
  const scoreTitleRow = el("div", "inc-panel__header", scorePanel);
  scoreTitleRow.innerHTML = `${svgIcon("clock", { size: 14 })} TIEMPO EXTRA`;
  const scoreRow = el("div", "inc-hud-score", scorePanel);
  const scoreValue = el("span", "inc-hud-score-value", scoreRow);
  const comboChip = el("span", "inc-hud-combo", scoreRow);
  const comboBar = el("span", "inc-hud-combo-bar", comboChip);
  const comboText = el("span", "inc-hud-combo-text", comboChip);
  const perkChip = el("div", "inc-hud-perk", scorePanel);

  // ---- Escena de acción: ilustración grande de lo que estás haciendo ----
  // Al estilo RPG clásico: un panel visible mientras dura la actividad (o
  // mientras finges), con una imagen por acción. Las imágenes reales llegan
  // después (public/actions/<id>.png); hasta entonces, o si a alguna le
  // falta el archivo, cae en el emoji de la actividad sin romper nada.
  // Aviso de peligro: por encima del 90% de sospecha la pantalla se tiñe de
  // rojo por los bordes y late. No es decoración — es el único aviso de que
  // el siguiente encontronazo es la amonestación, y de que toca salir
  // pitando a una sala o a tu puesto.
  const danger = el("div", "inc-hud-danger", hud);

  // La cámara hace zoom sobre la propia jugadora (ver setActionZoom en
  // camera.js) y su sprite en el mundo ya anima la pose de la acción — este
  // panel del HUD ya no duplica esa ilustración, solo marca el objetivo y su
  // progreso para no tapar a la jugadora justo cuando la cámara se acerca a
  // ella.
  const actionScene = el("div", "inc-action-scene inc-hidden", hud);
  const actionLabel = el("div", "inc-action-label", actionScene);
  const actionTrack = el("div", "inc-action-progress-track", actionScene);
  const actionFill = el("div", "inc-action-progress-fill", actionTrack);
  // El PORCENTAJE, en cifra. Una barra que avanza despacio parece parada;
  // un número que sube deja claro que sí está pasando algo. Es la queja
  // exacta que arregla esto: "no se ve que se está avanzando".
  const actionPct = el("div", "inc-action-pct", actionScene);

  let lastActionPct = -1;
  function setAction(action) {
    if (!action) {
      actionScene.classList.add("inc-hidden");
      actionScene.classList.remove("advancing", "done");
      lastActionPct = -1;
      return;
    }
    actionScene.classList.remove("inc-hidden");
    actionLabel.innerHTML = action.done ? `${action.label} ${svgIcon("check", { size: 15 })}` : action.label ?? "";
    actionTrack.classList.toggle("inc-hidden", action.progress == null);
    actionScene.classList.toggle("done", !!action.done);
    if (action.progress != null) {
      const pct = Math.round(Math.min(1, Math.max(0, action.progress)) * 100);
      actionFill.style.width = `${pct}%`;
      actionPct.textContent = `${pct}%`;
      actionPct.classList.remove("inc-hidden");
      // Micro-interacción: cada vez que el progreso AVANZA de verdad, el
      // panel da un latido. Sin esto, con una tarea larga la barra se
      // mueve tan despacio que parece congelada y da la sensación de que
      // el juego no registró la acción.
      if (pct > lastActionPct && lastActionPct >= 0) {
        actionScene.classList.remove("advancing");
        // Reiniciar la animación: sin forzar el reflujo, quitar y poner la
        // clase en el mismo frame no la vuelve a disparar.
        void actionScene.offsetWidth;
        actionScene.classList.add("advancing");
      }
      lastActionPct = pct;
    } else {
      actionPct.classList.add("inc-hidden");
      lastActionPct = -1;
    }
  }

  // ---- Tarjeta de presentación de secuaces ----
  // Un cartel breve al empezar el día, uno por secuaz de turno, mientras la
  // cámara hace zoom hacia él (ver introduceMinions() en engine.js) — así
  // cada uno se presenta como una amenaza propia en vez de aparecer sin
  // más en mitad de la partida.
  const introCard = el("div", "inc-intro-card inc-hidden", hud);
  const introIcon = el("div", "inc-intro-card-icon", introCard);
  const introName = el("div", "inc-intro-card-name", introCard);
  const introBlurb = el("div", "inc-intro-card-blurb", introCard);

  function showIntroCard({ icon, name, blurb }) {
    introIcon.innerHTML = svgIcon(icon && hasIcon(icon) ? icon : "eye", { size: 34 });
    introName.textContent = name ?? "";
    introBlurb.textContent = blurb ?? "";
    introCard.classList.remove("inc-hidden");
    // Reinicia la animación de entrada aunque el cartel ya estuviera visible
    // (un secuaz seguido de otro no debe leerse como el mismo cartel).
    introCard.classList.remove("pop");
    void introCard.offsetWidth;
    introCard.classList.add("pop");
  }

  function hideIntroCard() {
    introCard.classList.add("inc-hidden");
  }

  // ---- Mensaje de Teams de Gabo ----
  // Una burbuja de chat que aparece sola, sin importar dónde esté el jefe
  // en el mapa — es un mensaje, no algo que dependa de estar cerca — y se
  // retira sola. Le da personalidad a Gabo fuera de los encuentros cara a
  // cara (ver GABO_TEAMS_INTERVAL en game.js).
  const teamsToast = el("div", "inc-teams-toast inc-hidden", hud);
  const teamsHeader = el("div", "inc-teams-toast-header", teamsToast);
  el("span", "inc-teams-toast-icon", teamsHeader).innerHTML = svgIcon("chat", { size: 15 });
  el("span", "inc-teams-toast-app", teamsHeader, "Teams");
  const teamsFrom = el("div", "inc-teams-toast-from", teamsToast);
  const teamsText = el("div", "inc-teams-toast-text", teamsToast);
  let teamsTimer = null;

  function showTeamsMessage(text, from = "Gabo (Barbie Malibú)") {
    teamsFrom.textContent = from;
    teamsText.textContent = text;
    teamsToast.classList.remove("inc-hidden");
    teamsToast.classList.remove("inc-pop");
    void teamsToast.offsetWidth;
    teamsToast.classList.add("inc-pop");
    clearTimeout(teamsTimer);
    teamsTimer = setTimeout(() => teamsToast.classList.add("inc-hidden"), 6000);
  }

  // ---- End-of-day card ----
  // Vive en inc-layer--overlay a propósito: overlay fija su propio contexto de
  // apilamiento (z-index alto, para flotar sobre todo), y
  // el resultado de fin de día debe poder mostrarse incluso cuando otro
  // contenido está de fondo (ver crossingFailed() en engine.js).
  const overlay = el("div", "inc-modal inc-hidden", root);
  const overlayCard = el("div", "inc-modal__content", overlay);
  const overlayIcon = el("div", "inc-overlay-icon", overlayCard);
  const overlayTitle = el("div", "inc-overlay-title", overlayCard);
  const overlayScore = el("div", "inc-overlay-score", overlayCard);
  const overlayBody = el("div", "inc-overlay-body", overlayCard);
  const overlayActions = el("div", "inc-overlay-actions", overlayCard);

  let maxWarningsRendered = -1;

  function setDay(day) {
    dayChip.textContent = `DÍA ${day.number} · ${day.title.toUpperCase()}`;
  }

  /** Toggles the whole in-game HUD, e.g. while a menu is up. */
  function setVisible(visible) {
    hud.classList.toggle("inc-hidden", !visible);
    // La barra NO se esconde con el HUD (está siempre), pero solo enseña
    // estado cuando hay jornada que resumir.
    menuBar?.setLive(visible);
  }

  /**
   * Shown between days; `actions` are [{ label, primary, onClick }].
   * `look`/`pose` (opcionales) ponen al PERSONAJE en la tarjeta — la
   * jugadora celebrando o Gabo despidiéndote — que es lo que la convierte
   * en pantalla de juego y no en un aviso del sistema.
   */
  function showResult({ icon, title, body, win, actions, timeLeft, timeGained, look, pose }) {
    const shot = look ? characterShot(look, pose ?? null) : null;
    if (shot) {
      overlayIcon.innerHTML = `<img src="${shot}" alt="" class="inc-overlay-shot" />`;
    } else {
      overlayIcon.innerHTML = svgIcon(hasIcon(icon) ? icon : "diamond", { size: 56 });
    }
    overlayTitle.textContent = title;
    overlayTitle.classList.toggle("win", !!win);
    overlayTitle.classList.toggle("lose", !win);
    overlayCard.classList.toggle("win", !!win);
    overlayCard.classList.toggle("lose", !win);
    // Re-dispara la animación de entrada aunque la tarjeta ya existiera.
    overlayCard.classList.remove("inc-overlay-pop");
    void overlayCard.offsetWidth;
    overlayCard.classList.add("inc-overlay-pop");

    // El resultado del día son dos cifras de reloj: lo que te regalaste
    // escaqueándote, y lo que te sobraba cuando acabó. Ni puntos ni rango.
    overlayScore.innerHTML = "";
    if (timeGained != null || timeLeft != null) {
      // OJO: el `el()` de este archivo NO acepta texto como cuarto argumento
      // (a diferencia del de menus.js) — pasárselo lo tiraba en silencio y
      // los chips del reloj llevaban toda la vida saliendo VACÍOS.
      const box = el("div", "inc-overlay-score-box", overlayScore);
      if (timeGained != null) {
        el("span", "inc-overlay-points", box).textContent = `+${Math.round(timeGained)}s ganados`;
      }
      if (timeLeft != null) {
        el("span", "inc-overlay-target", box).textContent = `${Math.max(0, Math.round(timeLeft))}s de sobra`;
      }
    }

    overlayBody.textContent = body;
    overlayActions.innerHTML = "";
    actions.forEach((action) => {
      const btn = el("button", `inc-btn ${action.primary ? "inc-btn--primary" : "inc-btn--secondary"}`, overlayActions);
      btn.type = "button";
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        sfxSelect();
        action.onClick();
      });
    });
    overlay.classList.remove("inc-hidden");
    // The touch joystick covers most of the lower screen; without this the
    // result card is unreachable on a phone because every tap lands on the
    // stick zone instead of the buttons.
    document.body.classList.add("inc-overlay-open");
    const primaryBtn = overlayActions.querySelector(".primary") ?? overlayActions.firstElementChild;
    primaryBtn?.focus();
  }

  function hideResult() {
    overlay.classList.add("inc-hidden");
    document.body.classList.remove("inc-overlay-open");
  }

  // ---- Teclado en la tarjeta de fin de día: mismas teclas que en los menús
  // (flechas/WASD mueven el foco, E también confirma junto a espacio/enter).
  window.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("inc-hidden")) return;
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

  // El array de objetivos es el MISMO objeto durante toda la jornada (solo
  // cambian `.done`/`.progress` de cada uno); tirar el innerHTML y recrear
  // sus filas de cero en cada frame era DOM thrashing puro — con 2-4
  // objetivos, 60 veces por segundo, sumado al resto del HUD, era carga de
  // sobra para notarse como lentitud. Ahora las filas se crean una vez (o
  // cuando cambia el array en sí, ej. día nuevo) y luego solo se actualizan
  // los campos que de verdad cambian.
  let objectivesSource = null;
  let objectiveRows = [];
  function renderObjectives(objectives) {
    if (objectives !== objectivesSource || objectiveRows.length !== objectives.length) {
      objectivesSource = objectives;
      objectivesList.innerHTML = "";
      objectiveRows = objectives.map(() => {
        const row = el("div", "hud-objective", objectivesList);
        const dot = el("span", "hud-objective-dot", row);
        const iconSpan = el("span", "hud-objective-icon", row);
        const labelSpan = el("span", "hud-objective-label", row);
        return { row, dot, iconSpan, labelSpan, bar: null, fill: null };
      });
    }
    objectives.forEach((o, i) => {
      const r = objectiveRows[i];
      r.row.classList.toggle("done", !!o.done);
      r.dot.style.background = hex(ACTIVITY_COLORS[o.type] ?? 0xffffff);
      r.iconSpan.innerHTML = o.done ? svgIcon("star", { size: 15 }) : svgIcon(hasIcon(o.icon) ? o.icon : "diamond", { size: 15 });
      r.labelSpan.textContent = o.label;
      if (!o.done && o.progress > 0) {
        if (!r.bar) {
          r.bar = el("div", "hud-objective-bar", r.row);
          r.fill = el("div", "hud-objective-bar-fill", r.bar);
        }
        r.fill.style.width = `${Math.round((o.progress / o.time) * 100)}%`;
        r.fill.style.background = hex(ACTIVITY_COLORS[o.type] ?? 0xe0722c);
      } else if (r.bar) {
        r.bar.remove();
        r.bar = null;
        r.fill = null;
      }
    });
  }

  // El HUD de partida (ui/gamehud.js) se monta fuera de aquí pero lee el MISMO
  // snapshot por frame: es la misma verdad enseñada de dos formas, no dos
  // fuentes que se puedan desincronizar. El nombre `attachMenuBar` es de
  // cuando lo que colgaba era la barra estilo macOS; el contrato no cambió al
  // sustituirla, así que renombrarlo solo movería ruido.
  let menuBar = null;
  function attachMenuBar(bar) {
    menuBar = bar;
  }

  function render(state) {
    setAction(state.currentAction);
    menuBar?.render(state);

    const heat = state.suspicionMax ? state.suspicion / state.suspicionMax : 0;
    danger.classList.toggle("on", heat >= DANGER_AT && !state.gameOver);

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
      // innerHTML entero cada frame para pintar hasta 5 estrellas — igual
      // que los objetivos, basta con reconstruir cuando cambia el TOTAL de
      // estrellas y solo alternar la clase el resto de frames.
      if (heatStars.childElementCount !== state.maxHeat) {
        heatStars.innerHTML = "";
        heatStarEls = Array.from({ length: state.maxHeat }, () => {
          const s = el("span", "off", heatStars);
          s.innerHTML = svgIcon("star", { size: 12 });
          return s;
        });
      }
      heatStarEls.forEach((s, i) => {
        const lit = i < state.heat;
        s.classList.toggle("lit", lit);
        s.classList.toggle("off", !lit);
      });
    }

    scoreValue.textContent = `+${Math.round(state.timeGained)}s`;
    const comboOn = state.combo > 1;
    comboChip.classList.toggle("on", comboOn);
    comboText.textContent = `x${state.combo.toFixed(1)}`;
    comboBar.style.width = comboOn
      ? `${Math.round((state.comboLeft / state.comboWindow) * 100)}%`
      : "0%";

    perkChip.classList.toggle("visible", !!state.perk);
    if (state.perk) {
      perkChip.innerHTML = `${svgIcon("coffee", { size: 14 })} CAFEÍNA ${Math.ceil(state.perkLeft)}s`;
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

    renderObjectives(state.objectives);

    // EL TOAST YA NO SE PINTA AQUÍ. Vivía abajo en el centro
    // (`position: fixed; bottom`), justo encima de la tarjeta de acción, la
    // tira del pulso y la píldora de mandos — tres cosas del bucle tapadas
    // por una línea de texto. Ahora `state.message` lo reparte el director
    // de mensajes (`ui/messages.js`) por urgencia: al centro si apremia, al
    // carril lateral si no. El nodo se queda oculto porque de él cuelga el
    // resto de la columna histórica.
    toast.classList.remove("visible");

    const statusBits = [];
    if (state.isHiding) statusBits.push(`${svgIcon("hide", { size: 14 })} ESCONDIDA`);
    if (state.isPretending) statusBits.push(`${svgIcon("keyboard", { size: 14 })} FINGIENDO TRABAJAR`);
    if (state.bossState === "CHASE") statusBits.push(`${svgIcon("siren", { size: 14 })} ¡TE PERSIGUE!`);
    else if (state.bossState === "SEARCH") statusBits.push(`${svgIcon("search", { size: 14 })} TE ESTÁ BUSCANDO`);
    else if (state.bossState === "INVESTIGATE") statusBits.push(`${svgIcon("question", { size: 14 })} DISTRAÍDO`);
    statusBadge.innerHTML = statusBits.join("   ·   ");
    statusBadge.classList.toggle("visible", statusBits.length > 0);
    statusBadge.classList.toggle("alert", state.bossState === "CHASE");

  }

  return {
    render,
    attachMenuBar,
    get menuBar() {
      return menuBar;
    },
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
