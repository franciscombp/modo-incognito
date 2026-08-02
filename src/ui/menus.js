import { SETTINGS_SCHEMA, getSettings, setSettings, subscribeSettings, buzz } from "../game/settings.js";
import { THEMES, getTheme, setTheme } from "../game/theme.js";
import { sfxMove, sfxSelect, sfxBack, sfxOpen } from "../game/sfx.js";
import { createCameraPanel } from "./cameraPanel.js";
import { characterShot } from "./charshot.js";
import { icon as svgIcon } from "./icons.js";

// Every full-screen menu the game has: title, day select, settings (game +
// camera), how-to-play and pause. They all live in one overlay that swaps
// screens, so only one thing can ever be on top of the game.


// Cada uno posa a su manera en la tarjeta, para que la pantalla no sean cinco
// muñecos idénticos en posición de firmes. Es solo presentación: la pose no
// tiene nada que ver con cómo se juega ese modo.
const CARD_POSE = { fran: "shrug", giu: null, manu: "phone", kiara: "coffee", gabo: "work" };

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function button(parent, label, { primary = false, icon = "", onClick, back = false } = {}) {
  const btn = el("button", `inc-btn ${primary ? "inc-btn--primary" : "inc-btn--secondary"}`, parent);
  btn.type = "button";
  // Icono DIBUJADO, no un carácter: un emoji lo pinta la fuente del sistema y
  // cambia de forma y color en cada plataforma. Ver ui/icons.js.
  if (icon) {
    const slot = el("span", "inc-menu-btn-icon", btn);
    slot.innerHTML = svgIcon(icon);
  }
  el("span", null, btn, label);
  btn.addEventListener("click", () => {
    buzz(10);
    if (back) sfxBack();
    else sfxSelect();
    onClick?.();
  });
  return btn;
}

/**
 * Ya no hay puntuación ni rangos: la única moneda es el reloj. Lo que se
 * enseña de un día terminado es cuánta jornada te sobró — cuanto más, mejor
 * te escondiste.
 */
export function formatSpare(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `+${s}s de sobra`;
  const m = Math.floor(s / 60);
  return `+${m}:${String(s % 60).padStart(2, "0")} de sobra`;
}

/**
 * @param {object} opts
 * @param {Array}  opts.levels   the campaign, in order
 * @param {object} opts.save     progress store (see game/save.js)
 * @param {object} opts.actions  { play(index), resume(), restart(), toTitle() }
 */
export function createMenus(root, { levels, save, actions, modes = {}, looks = null, title = "Modo Incógnito", subtitle = "" }) {
  const layer = el("div", "inc-layer inc-layer--overlay inc-menu inc-hidden", root);
  const scrim = el("div", "inc-menu-scrim", layer);

  // La barra de aplicación de la "plataforma": marca a la izquierda, estado
  // del sistema a la derecha. Es la cáscara que hace que el menú se lea como
  // la herramienta corporativa en la que el equipo finge trabajar — que es
  // exactamente el lore. Decorativa a propósito (pointer-events: none en su
  // CSS): jamás roba un clic ni entra en el orden de foco.
  const platBar = el("div", "inc-menu-plat-bar", layer);
  const platBrand = el("div", "inc-menu-plat-brand", platBar);
  platBrand.innerHTML = `${svgIcon("incognito", { size: 26 })}<span>${title}</span><span class="inc-menu-plat-suite">Panel de gestión</span>`;
  const platRight = el("div", "inc-menu-plat-right", platBar);
  platRight.innerHTML =
    `<span class="inc-menu-plat-chip"><i class="inc-menu-dot"></i>Sistemas operativos</span>` +
    (subtitle ? `<span class="inc-menu-plat-chip">${subtitle}</span>` : "");

  const stage = el("div", "inc-menu-menu-stage", layer);

  let currentScreen = null;
  let previousScreen = null;
  let cameraPanel = null;

  const screens = {};

  function makeScreen(name, className = "") {
    const node = el("section", `inc-menu-screen ${className}`, stage);
    node.dataset.screen = name;
    screens[name] = node;
    return node;
  }

  // ---------------- Title ----------------
  const titleScreen = makeScreen("title", "inc-menu-screen-title");
  const logo = el("div", "inc-menu-logo", titleScreen);
  el("span", "inc-menu-logo-main", logo, title);
  el("span", "inc-menu-logo-sub", logo, subtitle);
  const titleMenu = el("div", "inc-menu-menu-list", titleScreen);
  const continueBtn = button(titleMenu, "Continuar", {
    primary: true,
    icon: "play",
    onClick: () => actions.play(save.dayIndex),
  });
  button(titleMenu, "Nueva semana", {
    icon: "star",
    onClick: () => {
      save.setDayIndex(0);
      actions.play(0);
    },
  });
  button(titleMenu, "Elegir día", { icon: "grid", onClick: () => show("days") });
  button(titleMenu, "Personaje", {
    icon: "incognito",
    onClick: () => {
      renderCharacters();
      show("characters");
    },
  });
  button(titleMenu, "Ajustes", { icon: "gear", onClick: () => show("settings") });
  button(titleMenu, "Cómo se juega", { icon: "help", onClick: () => show("help") });
  const charBadge = el("div", "inc-menu-title-char", titleScreen);
  const titleFoot = el("div", "inc-menu-title-foot", titleScreen);

  // Función para actualizar footer con timestamp
  function updateTitleFoot(summary) {
    const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
    const buildTime = new Date(parseInt(buildId) || Date.now()).toLocaleString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const timestamp = `v${buildId} · ${buildTime}`;
    titleFoot.innerHTML = summary ? `${summary} <span style="opacity:0.6"> · ${timestamp}</span>` : `<span>${timestamp}</span>`;
  }

  // ---------------- Day select ----------------
  const daysScreen = makeScreen("days");
  el("h2", "inc-menu-screen-title-text", daysScreen, "Elige un día");
  const dayGrid = el("div", "inc-menu-day-grid", daysScreen);
  button(el("div", "inc-menu-screen-foot", daysScreen), "Volver", { back: true, onClick: () => show("title") });

  function renderDays() {
    dayGrid.innerHTML = "";
    levels.forEach((lvl, i) => {
      const unlocked = i === 0 || save.hasCompleted(levels[i - 1].id) || save.dayIndex >= i;
      const done = save.hasCompleted(lvl.id);
      const card = el("button", `inc-menu-day${done ? " inc-menu-day--done" : ""}${unlocked ? "" : " inc-menu-day--locked"}`, dayGrid);
      card.type = "button";
      card.disabled = !unlocked;
      el("span", "inc-menu-day-num", card, String(lvl.number).padStart(2, "0"));
      el("span", "inc-menu-day-name", card, lvl.title);
      el("span", "inc-menu-day-sub", card, unlocked ? lvl.subtitle ?? "" : "Bloqueado");
      const best = save.state.bestSpare?.[lvl.id];
      if (best != null) el("span", "inc-menu-day-best", card, formatSpare(best));
      card.addEventListener("click", () => {
        if (!unlocked) return;
        buzz(10);
        sfxSelect();
        actions.play(i);
      });
    });
  }

  // ---------------- Character select ----------------
  const charScreen = makeScreen("characters");
  const charTitle = el("h2", "inc-menu-screen-title-text", charScreen, "Elige tu personaje");
  const charGrid = el("div", "inc-menu-day-grid inc-menu-char-grid", charScreen);
  const charBackBtn = button(el("div", "inc-menu-screen-foot", charScreen), "Volver", {
    back: true,
    onClick: () => show(previousScreen ?? "title"),
  });

  function renderCharacters() {
    charGrid.innerHTML = "";
    // Sin personaje elegido todavía: no hay a dónde "volver" — hay que elegir
    // para poder jugar. Una vez elegido, la pantalla vuelve a ser opcional.
    const forced = !save.characterId;
    charTitle.textContent = forced ? "Elige tu personaje para empezar" : "Elige tu personaje";
    charBackBtn.classList.toggle("inc-hidden", forced);
    Object.entries(modes).forEach(([id, mode]) => {
      const locked = mode.playable === false;
      // Giuli va marcada por defecto: es quien narra el día 1 en femenino y
      // la única con pliego de acciones propio (café, peli, comer).
      const active = save.characterId === id || (!save.characterId && id === "giu");
      const card = el(
        "button",
        `inc-menu-day inc-menu-char${locked ? " inc-menu-day--locked" : ""}${active ? " inc-menu-day--done" : ""}`,
        charGrid
      );
      card.type = "button";
      card.disabled = locked;
      // SIEMPRE el muñeco 3D, el mismo que vas a mover por el piso. Antes
      // caía al pliego de píxeles y, si tampoco había, a un emoji: elegías un
      // dibujo pixelado para entrar a un juego 3D. `looks.get` nunca devuelve
      // vacío, así que quien no tenga receta propia sale con la genérica.
      const shot = looks ? characterShot(looks.get(id) ?? looks.get(mode.sheet), CARD_POSE[id]) : null;
      if (shot) {
        const thumb = el("span", "inc-menu-char-shot", card);
        thumb.style.backgroundImage = `url(${shot})`;
      }
      el(
        "span",
        "inc-menu-day-name",
        card,
        mode.alias ? `${mode.name} · "${mode.alias}"` : mode.name
      );
      el("span", "inc-menu-day-sub", card, locked ? mode.lockedReason ?? "Bloqueado" : mode.blurb ?? "");
      if (!locked && mode.difficulty) {
        el("span", "inc-menu-day-best", card, `Modo ${mode.difficulty}`);
      }
      card.addEventListener("click", () => {
        if (locked) return;
        buzz(10);
        sfxSelect();
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
  el("h2", "inc-menu-screen-title-text", settingsScreen, "Ajustes");
  const tabs = el("div", "inc-menu-tabs", settingsScreen);
  const panes = el("div", "inc-menu-panes", settingsScreen);

  const gamePane = el("div", "inc-menu-pane", panes);
  const cameraPane = el("div", "inc-menu-pane inc-hidden", panes);

  const tabButtons = [
    { id: "game", label: "Juego", pane: gamePane },
    { id: "camera", label: "Cámara", pane: cameraPane },
  ].map((tab) => {
    const btn = el("button", "inc-menu-tab", tabs, tab.label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      sfxMove();
      selectTab(tab.id);
    });
    return { ...tab, btn };
  });

  function selectTab(id) {
    tabButtons.forEach((t) => {
      t.btn.classList.toggle("active", t.id === id);
      t.pane.classList.toggle("inc-hidden", t.id !== id);
    });
  }

  // Tema visual: aparte del esquema (no es un ajuste de juego, es qué
  // aspecto tiene TODO — juego y builders), mismo patrón px-opt/px-choice.
  const themeRow = el("label", "inc-menu-opt", gamePane);
  const themeHead = el("div", "inc-menu-opt-head", themeRow);
  el("span", "inc-menu-opt-label", themeHead, "Tema visual");
  const themeChoice = el("div", "inc-menu-choice", themeRow);
  const THEME_LABELS = { cozy: "COZY", pixel: "PIXEL" };
  const themeChips = THEMES.map((t) => {
    const chip = el("button", "inc-menu-chip", themeChoice, THEME_LABELS[t] ?? t.toUpperCase());
    chip.type = "button";
    chip.dataset.value = t;
    chip.addEventListener("click", () => {
      sfxSelect();
      setTheme(t);
    });
    return chip;
  });
  el("span", "inc-menu-opt-hint", themeRow, "PIXEL está preparado pero aún sin estrenar — de momento se ve igual que COZY.");
  function refreshThemeChips() {
    const active = getTheme();
    themeChips.forEach((c) => c.classList.toggle("on", c.dataset.value === active));
  }
  refreshThemeChips();

  // Game options, generated from the schema so adding one is a one-liner.
  const controls = new Map();
  for (const [key, def] of Object.entries(SETTINGS_SCHEMA)) {
    const row = el("label", "inc-menu-opt", gamePane);
    const head = el("div", "inc-menu-opt-head", row);
    el("span", "inc-menu-opt-label", head, def.label);
    const readout = el("span", "inc-menu-opt-value", head);

    let input;
    if (def.type === "range") {
      input = el("input", "cam-slider", row);
      input.type = "range";
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.addEventListener("input", () => setSettings({ [key]: Number(input.value) }));
    } else if (def.type === "choice") {
      input = el("div", "inc-menu-choice", row);
      def.options.forEach((option) => {
        const chip = el("button", "inc-menu-chip", input, option.toUpperCase());
        chip.type = "button";
        chip.dataset.value = option;
        chip.addEventListener("click", () => {
          sfxSelect();
          setSettings({ [key]: option });
        });
      });
    } else {
      input = el("button", "inc-menu-switch", row);
      input.type = "button";
      input.addEventListener("click", () => {
        sfxSelect();
        setSettings({ [key]: !getSettings()[key] });
      });
    }
    if (def.hint) el("span", "inc-menu-opt-hint", row, def.hint);
    controls.set(key, { input, readout, def });
  }

  subscribeSettings((s) => {
    for (const [key, { input, readout, def }] of controls) {
      if (def.type === "range") {
        if (document.activeElement !== input) input.value = s[key];
        readout.textContent = String(s[key]);
      } else if (def.type === "choice") {
        input
          .querySelectorAll(".inc-menu-chip")
          .forEach((chip) => chip.classList.toggle("on", chip.dataset.value === s[key]));
        readout.textContent = "";
      } else {
        input.classList.toggle("on", s[key]);
        input.textContent = s[key] ? "SÍ" : "NO";
        readout.textContent = "";
      }
    }
  });

  const settingsFoot = el("div", "inc-menu-screen-foot", settingsScreen);
  button(settingsFoot, "Volver", { back: true, onClick: () => show(previousScreen ?? "title") });

  // ---------------- Help ----------------
  const helpScreen = makeScreen("help");
  el("h2", "inc-menu-screen-title-text", helpScreen, "Cómo se juega");
  const helpBody = el("div", "inc-menu-help", helpScreen);
  helpBody.innerHTML = `
    <p>Eres diseñadora en el Piso 10. Tu trabajo de mentira es
    <b>no trabajar</b>: café, película, comer. El jefe patrulla la
    planta con un cono de visión. (Tu trabajo de verdad es otra cosa —
    hay quien dice que fingir es, en realidad, la única forma de seguir
    diseñando algo con vida propia aquí dentro.)</p>
    <ul>
      <li><b>Mover</b> — WASD o flechas · joystick en móvil</li>
      <li><b>Usar / distraer</b> — <kbd>E</kbd> · botón USAR</li>
      <li><b>Fingir que trabajas</b> — <kbd>F</kbd> · botón FINGIR. Baja la sospecha aunque te vean,
      pero <b>solo funciona en un lugar seguro</b>: una sala de reuniones o tu propio puesto.</li>
      <li><b>Salas de reuniones</b> — con entrar basta (se supone que estás reunida), pero cada una
      tiene un cupo de segundos al día y cada tanto llega gente de verdad y la ocupa.</li>
      <li><b>Tu puesto</b> — nunca se gasta ni se ocupa, pero solo te cubre mientras finges.</li>
      <li><b>Esconderse</b> — pisa un círculo verde: dejas de ser visible.</li>
      <li><b>Distracciones</b> — las estrellas amarillas se llevan al jefe a otro sitio.</li>
      <li><b>Inspeccionar el plano</b> — <kbd>M</kbd> · botón MAPA</li>
      <li><b>Pausa</b> — <kbd>Esc</kbd></li>
      <li><b>Orbitar la cámara</b> — botón derecho o dos dedos</li>
    </ul>
    <p>Encadena actividades sin que te vean para subir el <b>multiplicador</b>.
    Hacerlas con el jefe cerca puntúa más. Al final del día recibes un rango.</p>
  `;
  button(el("div", "inc-menu-screen-foot", helpScreen), "Volver", {
    back: true,
    onClick: () => show(previousScreen ?? "title"),
  });

  // ---------------- Pause ----------------
  const pauseScreen = makeScreen("pause", "inc-menu-screen-pause");
  el("h2", "inc-menu-screen-title-text", pauseScreen, "Pausa");
  const pauseInfo = el("p", "inc-menu-pause-info", pauseScreen);
  const pauseMenu = el("div", "inc-menu-menu-list", pauseScreen);
  button(pauseMenu, "Continuar", { primary: true, icon: "play", onClick: () => actions.resume() });
  button(pauseMenu, "Reiniciar día", { icon: "back", onClick: () => actions.restart() });
  button(pauseMenu, "Ajustes", { icon: "gear", onClick: () => show("settings") });
  button(pauseMenu, "Menú principal", { icon: "grid", onClick: () => actions.toTitle() });

  // ---------------- Plumbing ----------------
  function show(name) {
    if (name === "settings" && !cameraPanel) {
      cameraPanel = createCameraPanel();
      cameraPane.appendChild(cameraPanel.root);
      selectTab("game");
    }
    const wasHidden = layer.classList.contains("inc-hidden");
    const changingScreen = currentScreen !== name;
    if (currentScreen && changingScreen) previousScreen = currentScreen;
    currentScreen = name;
    Object.entries(screens).forEach(([key, node]) => node.classList.toggle("inc-hidden", key !== name));
    layer.classList.remove("inc-hidden");
    document.body.classList.add("menu-open");
    layer.dataset.screen = name;
    focusFirst();
    if (wasHidden || changingScreen) sfxOpen();
  }

  function close() {
    layer.classList.add("inc-hidden");
    document.body.classList.remove("menu-open");
    currentScreen = null;
  }

  scrim.addEventListener("click", () => {
    // Only the pause screen is dismissible by tapping outside.
    if (currentScreen === "pause") actions.resume();
  });

  // ---------------- Teclado ----------------
  // Todo el menú se maneja sin ratón: flechas (o WASD) mueven el foco entre
  // los controles de la pantalla visible, y espacio/enter/E selecciona —
  // Enter y espacio ya activan un <button> por su cuenta, así que solo hace
  // falta añadir E encima.
  const FOCUSABLE = "button:not(:disabled), .inc-menu-chip, input[type='range']";

  function focusables() {
    const screen = screens[currentScreen];
    if (!screen) return [];
    return [...screen.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  }

  function focusFirst() {
    const [first] = focusables();
    first?.focus();
  }

  function moveFocus(delta) {
    const items = focusables();
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const next = items[(((at < 0 ? 0 : at) + delta) % items.length + items.length) % items.length];
    next.focus();
    sfxMove();
  }

  window.addEventListener("keydown", (e) => {
    if (layer.classList.contains("inc-hidden")) return;
    const key = e.key.toLowerCase();
    const onSlider = document.activeElement?.tagName === "INPUT";

    if (!onSlider && (key === "arrowdown" || key === "s" || key === "arrowright" || key === "d")) {
      e.preventDefault();
      moveFocus(1);
      return;
    }
    if (!onSlider && (key === "arrowup" || key === "w" || key === "arrowleft" || key === "a")) {
      e.preventDefault();
      moveFocus(-1);
      return;
    }
    if (key === "e" && document.activeElement && document.activeElement !== document.body) {
      e.preventDefault();
      document.activeElement.click();
    }
  });

  return {
    show,
    close,
    /**
     * Vuelve a dibujar las tarjetas del reparto. Lo llama el arranque cuando
     * terminan de llegar los cuerpos esculpidos: hasta entonces esas tarjetas
     * enseñan el pliego, y así se pasan al muñeco 3D en cuanto se puede.
     */
    refreshCharacters() {
      if (currentScreen === "characters") renderCharacters();
    },
    openTitle(progress) {
      renderDays();
      renderCharBadge();
      continueBtn.classList.toggle("inc-hidden", !progress.hasProgress);
      updateTitleFoot(progress.summary);
      // Primera vez (o localStorage limpio): elegir personaje no es opcional.
      if (!save.characterId) {
        renderCharacters();
        show("characters");
        return;
      }
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
      return !layer.classList.contains("inc-hidden");
    },
    get screen() {
      return currentScreen;
    },
  };
}
