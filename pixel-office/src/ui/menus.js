import { SETTINGS_SCHEMA, getSettings, setSettings, subscribeSettings, buzz } from "../game/settings.js";
import { createCameraPanel } from "./cameraPanel.js";

// Every full-screen menu the game has: title, day select, settings (game +
// camera), how-to-play and pause. They all live in one overlay that swaps
// screens, so only one thing can ever be on top of the game.

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function button(parent, label, { primary = false, icon = "", onClick } = {}) {
  const btn = el("button", `px-btn${primary ? " px-btn-primary" : ""}`, parent);
  btn.type = "button";
  if (icon) el("span", "px-btn-icon", btn, icon);
  el("span", null, btn, label);
  btn.addEventListener("click", () => {
    buzz(10);
    onClick?.();
  });
  return btn;
}

const RANKS = [
  { min: 1, label: "S", blurb: "Fantasma corporativo" },
  { min: 0.8, label: "A", blurb: "Prácticamente invisible" },
  { min: 0.6, label: "B", blurb: "Sospechosamente eficiente" },
  { min: 0.35, label: "C", blurb: "Te vieron un par de veces" },
  { min: 0, label: "D", blurb: "Necesitas practicar" },
];

export function rankFor(score, target) {
  const ratio = target > 0 ? score / target : 0;
  return RANKS.find((r) => ratio >= r.min) ?? RANKS[RANKS.length - 1];
}

/**
 * @param {object} opts
 * @param {Array}  opts.levels   the campaign, in order
 * @param {object} opts.save     progress store (see game/save.js)
 * @param {object} opts.actions  { play(index), resume(), restart(), toTitle() }
 */
export function createMenus(root, { levels, save, actions, modes = {}, title = "Modo Incógnito", subtitle = "" }) {
  const layer = el("div", "px-menu hidden", root);
  const scrim = el("div", "px-menu-scrim", layer);
  const stage = el("div", "px-menu-stage", layer);

  let currentScreen = null;
  let previousScreen = null;
  let cameraPanel = null;

  const screens = {};

  function makeScreen(name, className = "") {
    const node = el("section", `px-screen ${className}`, stage);
    node.dataset.screen = name;
    screens[name] = node;
    return node;
  }

  // ---------------- Title ----------------
  const titleScreen = makeScreen("title", "px-screen-title");
  const logo = el("div", "px-logo", titleScreen);
  el("span", "px-logo-main", logo, title);
  el("span", "px-logo-sub", logo, subtitle);
  const titleMenu = el("div", "px-menu-list", titleScreen);
  const continueBtn = button(titleMenu, "Continuar", {
    primary: true,
    icon: "▶",
    onClick: () => actions.play(save.dayIndex),
  });
  button(titleMenu, "Nueva semana", {
    icon: "✦",
    onClick: () => {
      save.setDayIndex(0);
      actions.play(0);
    },
  });
  button(titleMenu, "Elegir día", { icon: "▦", onClick: () => show("days") });
  button(titleMenu, "Personaje", {
    icon: "🕵️",
    onClick: () => {
      renderCharacters();
      show("characters");
    },
  });
  button(titleMenu, "Ajustes", { icon: "⚙", onClick: () => show("settings") });
  button(titleMenu, "Cómo se juega", { icon: "?", onClick: () => show("help") });
  const charBadge = el("div", "px-title-char", titleScreen);
  const titleFoot = el("div", "px-title-foot", titleScreen);

  // ---------------- Day select ----------------
  const daysScreen = makeScreen("days");
  el("h2", "px-screen-title-text", daysScreen, "Elige un día");
  const dayGrid = el("div", "px-day-grid", daysScreen);
  button(el("div", "px-screen-foot", daysScreen), "Volver", { onClick: () => show("title") });

  function renderDays() {
    dayGrid.innerHTML = "";
    levels.forEach((lvl, i) => {
      const unlocked = i === 0 || save.hasCompleted(levels[i - 1].id) || save.dayIndex >= i;
      const done = save.hasCompleted(lvl.id);
      const card = el("button", `px-day${done ? " done" : ""}${unlocked ? "" : " locked"}`, dayGrid);
      card.type = "button";
      card.disabled = !unlocked;
      el("span", "px-day-num", card, String(lvl.number).padStart(2, "0"));
      el("span", "px-day-name", card, lvl.title);
      el("span", "px-day-sub", card, unlocked ? lvl.subtitle ?? "" : "Bloqueado");
      const best = save.state.bestScores?.[lvl.id];
      if (best != null) {
        const r = rankFor(best, lvl.rules?.targetScore ?? 1);
        el("span", "px-day-best", card, `${best} pts · ${r.label}`);
      }
      card.addEventListener("click", () => {
        if (!unlocked) return;
        buzz(10);
        actions.play(i);
      });
    });
  }

  // ---------------- Character select ----------------
  const charScreen = makeScreen("characters");
  el("h2", "px-screen-title-text", charScreen, "Elige tu personaje");
  const charGrid = el("div", "px-day-grid px-char-grid", charScreen);
  button(el("div", "px-screen-foot", charScreen), "Volver", {
    onClick: () => show(previousScreen ?? "title"),
  });

  function renderCharacters() {
    charGrid.innerHTML = "";
    Object.entries(modes).forEach(([id, mode]) => {
      const locked = mode.playable === false;
      const active = save.characterId === id || (!save.characterId && id === "fran");
      const card = el(
        "button",
        `px-day px-char${locked ? " locked" : ""}${active ? " done" : ""}`,
        charGrid
      );
      card.type = "button";
      card.disabled = locked;
      el("span", "px-day-num", card, mode.portrait ?? "🙂");
      el(
        "span",
        "px-day-name",
        card,
        mode.alias ? `${mode.name} · "${mode.alias}"` : mode.name
      );
      el("span", "px-day-sub", card, locked ? mode.lockedReason ?? "Bloqueado" : mode.blurb ?? "");
      if (!locked && mode.difficulty) {
        el("span", "px-day-best", card, `Modo ${mode.difficulty}`);
      }
      card.addEventListener("click", () => {
        if (locked) return;
        buzz(10);
        actions.selectCharacter(id);
        renderCharBadge();
        renderCharacters();
        show(previousScreen ?? "title");
      });
    });
  }

  function renderCharBadge() {
    const mode = modes[save.characterId] ?? modes.fran;
    charBadge.textContent = mode
      ? `Jugando como ${mode.name}${mode.alias ? ` "${mode.alias}"` : ""}`
      : "";
  }

  // ---------------- Settings ----------------
  const settingsScreen = makeScreen("settings");
  el("h2", "px-screen-title-text", settingsScreen, "Ajustes");
  const tabs = el("div", "px-tabs", settingsScreen);
  const panes = el("div", "px-panes", settingsScreen);

  const gamePane = el("div", "px-pane", panes);
  const cameraPane = el("div", "px-pane hidden", panes);

  const tabButtons = [
    { id: "game", label: "Juego", pane: gamePane },
    { id: "camera", label: "Cámara", pane: cameraPane },
  ].map((tab) => {
    const btn = el("button", "px-tab", tabs, tab.label);
    btn.type = "button";
    btn.addEventListener("click", () => selectTab(tab.id));
    return { ...tab, btn };
  });

  function selectTab(id) {
    tabButtons.forEach((t) => {
      t.btn.classList.toggle("active", t.id === id);
      t.pane.classList.toggle("hidden", t.id !== id);
    });
  }

  // Game options, generated from the schema so adding one is a one-liner.
  const controls = new Map();
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const row = el("label", "px-opt", gamePane);
    const head = el("div", "px-opt-head", row);
    el("span", "px-opt-label", head, def.label);
    const readout = el("span", "px-opt-value", head);

    let input;
    if (def.type === "range") {
      input = el("input", "cam-slider", row);
      input.type = "range";
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.addEventListener("input", () => setSettings({ [key]: Number(input.value) }));
    } else if (def.type === "choice") {
      input = el("div", "px-choice", row);
      def.options.forEach((option) => {
        const chip = el("button", "px-chip", input, option.toUpperCase());
        chip.type = "button";
        chip.dataset.value = option;
        chip.addEventListener("click", () => setSettings({ [key]: option }));
      });
    } else {
      input = el("button", "px-switch", row);
      input.type = "button";
      input.addEventListener("click", () => setSettings({ [key]: !getSettings()[key] }));
    }
    if (def.hint) el("span", "px-opt-hint", row, def.hint);
    controls.set(key, { input, readout, def });
  }

  subscribeSettings((s) => {
    for (const [key, { input, readout, def }] of controls) {
      if (def.type === "range") {
        if (document.activeElement !== input) input.value = s[key];
        readout.textContent = String(s[key]);
      } else if (def.type === "choice") {
        input
          .querySelectorAll(".px-chip")
          .forEach((chip) => chip.classList.toggle("on", chip.dataset.value === s[key]));
        readout.textContent = "";
      } else {
        input.classList.toggle("on", s[key]);
        input.textContent = s[key] ? "SÍ" : "NO";
        readout.textContent = "";
      }
    }
  });

  const settingsFoot = el("div", "px-screen-foot", settingsScreen);
  button(settingsFoot, "Volver", { onClick: () => show(previousScreen ?? "title") });

  // ---------------- Help ----------------
  const helpScreen = makeScreen("help");
  el("h2", "px-screen-title-text", helpScreen, "Cómo se juega");
  const helpBody = el("div", "px-help", helpScreen);
  helpBody.innerHTML = `
    <p>Eres empleada del piso 7. Tu trabajo es <b>no trabajar</b>: café, chisme,
    siesta, televisión. El jefe patrulla la planta con un cono de visión.</p>
    <ul>
      <li><b>Mover</b> — WASD o flechas · joystick en móvil</li>
      <li><b>Usar / distraer</b> — <kbd>E</kbd> · botón USAR</li>
      <li><b>Fingir que trabajas</b> — <kbd>F</kbd> · botón FINGIR. Baja la sospecha aunque te vean.</li>
      <li><b>Esconderse</b> — pisa un círculo verde: dejas de ser visible.</li>
      <li><b>Distracciones</b> — las estrellas amarillas se llevan al jefe a otro sitio.</li>
      <li><b>Inspeccionar el plano</b> — <kbd>M</kbd> · botón 🗺️</li>
      <li><b>Pausa</b> — <kbd>Esc</kbd></li>
      <li><b>Orbitar la cámara</b> — botón derecho o dos dedos</li>
    </ul>
    <p>Encadena actividades sin que te vean para subir el <b>multiplicador</b>.
    Hacerlas con el jefe cerca puntúa más. Al final del día recibes un rango.</p>
  `;
  button(el("div", "px-screen-foot", helpScreen), "Volver", {
    onClick: () => show(previousScreen ?? "title"),
  });

  // ---------------- Pause ----------------
  const pauseScreen = makeScreen("pause", "px-screen-pause");
  el("h2", "px-screen-title-text", pauseScreen, "Pausa");
  const pauseInfo = el("p", "px-pause-info", pauseScreen);
  const pauseMenu = el("div", "px-menu-list", pauseScreen);
  button(pauseMenu, "Continuar", { primary: true, icon: "▶", onClick: () => actions.resume() });
  button(pauseMenu, "Reiniciar día", { icon: "↺", onClick: () => actions.restart() });
  button(pauseMenu, "Ajustes", { icon: "⚙", onClick: () => show("settings") });
  button(pauseMenu, "Menú principal", { icon: "⌂", onClick: () => actions.toTitle() });

  // ---------------- Plumbing ----------------
  function show(name) {
    if (name === "settings" && !cameraPanel) {
      cameraPanel = createCameraPanel();
      cameraPane.appendChild(cameraPanel.root);
      selectTab("game");
    }
    if (currentScreen && currentScreen !== name) previousScreen = currentScreen;
    currentScreen = name;
    Object.entries(screens).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
    layer.classList.remove("hidden");
    document.body.classList.add("menu-open");
    layer.dataset.screen = name;
  }

  function close() {
    layer.classList.add("hidden");
    document.body.classList.remove("menu-open");
    currentScreen = null;
  }

  scrim.addEventListener("click", () => {
    // Only the pause screen is dismissible by tapping outside.
    if (currentScreen === "pause") actions.resume();
  });

  return {
    show,
    close,
    openTitle(progress) {
      renderDays();
      renderCharBadge();
      continueBtn.classList.toggle("hidden", !progress.hasProgress);
      titleFoot.textContent = progress.summary;
      show("title");
    },
    openPause(info) {
      pauseInfo.textContent = info ?? "";
      show("pause");
    },
    openDays() {
      renderDays();
      show("days");
    },
    get isOpen() {
      return !layer.classList.contains("hidden");
    },
    get screen() {
      return currentScreen;
    },
  };
}
