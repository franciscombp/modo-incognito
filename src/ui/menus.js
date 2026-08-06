import { SETTINGS_SCHEMA, getSettings, setSettings, subscribeSettings, buzz } from "../game/settings.js";
import { THEMES, getTheme, setTheme } from "../game/theme.js";
import { sfxMove, sfxSelect, sfxBack, sfxOpen } from "../game/sfx.js";
import { createCameraPanel } from "./cameraPanel.js";
import { characterShot } from "./charshot.js";
import { icon as svgIcon } from "./icons.js";
import { buildControlsLegend } from "./controls.js";

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
  button(titleMenu, "Reiniciar progreso", {
    icon: "star",
    onClick: () => {
      // Antes esto solo saltaba al día 0 sin tocar el resto del save: los
      // flags de diálogo (con quién ya hablaste, cuántas amonestaciones
      // llevas) seguían puestos, así que "empezar de nuevo" en realidad
      // seguía a medio camino de la partida anterior — Gabo, por ejemplo,
      // saltaba directo a una de sus líneas de seguimiento en vez de
      // presentarse. Es irreversible (borra días completados, secretos y
      // mejores tiempos), así que primero se confirma.
      const ok = window.confirm(
        "Esto borra TODO tu progreso (días completados, secretos, mejores tiempos) y empieza desde cero. ¿Seguro?"
      );
      if (!ok) return;
      save.reset();
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

  // ---------------- Character select: PANTALLA DE LOGIN ----------------
  // La primera pantalla del "sistema operativo" de mentira: elegir personaje
  // es INICIAR SESIÓN. Un usuario grande con su avatar en círculo, carrusel
  // con flechas/teclado/swipe, y abajo el muelle con todos los usuarios,
  // como la pantalla de entrada de un Mac. Los bloqueados aparecen con
  // candado y su motivo — se desbloquean jugando.
  const charScreen = makeScreen("characters", "inc-login");
  const charTitle = el("h2", "inc-login-greeting", charScreen, "Elige tu usuario");
  const loginStage = el("div", "inc-login-stage", charScreen);
  const prevBtn = el("button", "inc-login-arrow", loginStage);
  prevBtn.type = "button";
  prevBtn.innerHTML = svgIcon("back", { size: 28 });
  prevBtn.setAttribute("aria-label", "Usuario anterior");
  // Tres columnas con PERSPECTIVA, como las referencias de selección de
  // agente (docs/referencias/pantallas/): los datos van en paneles girados
  // a los lados y el personaje manda en el centro, en medio plano. El giro
  // es CSS 3D de verdad — no un degradado que lo imite— así que los paneles
  // tienen profundidad real respecto al muñeco.
  const panelLeft = el("div", "inc-login-panel inc-login-panel--left", loginStage);
  const loginUser = el("div", "inc-login-user", loginStage);
  const panelRight = el("div", "inc-login-panel inc-login-panel--right", loginStage);
  const nextBtn = el("button", "inc-login-arrow", loginStage);
  nextBtn.type = "button";
  nextBtn.innerHTML = svgIcon("next", { size: 28 });
  nextBtn.setAttribute("aria-label", "Usuario siguiente");
  const loginDock = el("div", "inc-login-dock", charScreen);
  const charBackBtn = button(el("div", "inc-menu-screen-foot", charScreen), "Volver", {
    back: true,
    onClick: () => show(previousScreen ?? "title"),
  });

  const loginEntries = Object.entries(modes);
  let loginAt = Math.max(
    0,
    loginEntries.findIndex(([id]) => id === (save.characterId ?? "giu"))
  );

  function moveLogin(delta) {
    if (!loginEntries.length) return;
    loginAt = ((loginAt + delta) % loginEntries.length + loginEntries.length) % loginEntries.length;
    sfxMove();
    buzz(6);
    renderCharacters();
  }
  prevBtn.addEventListener("click", () => moveLogin(-1));
  nextBtn.addEventListener("click", () => moveLogin(1));

  // Swipe: el carrusel también se hojea con el dedo.
  let touchX = null;
  loginStage.addEventListener("touchstart", (e) => (touchX = e.touches[0]?.clientX ?? null), { passive: true });
  loginStage.addEventListener(
    "touchend",
    (e) => {
      if (touchX == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) moveLogin(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  function loginSelect(id) {
    buzz(10);
    sfxSelect();
    actions.selectCharacter(id);
    renderCharBadge();
    renderCharacters();
    show(previousScreen ?? "title");
  }

  function renderCharacters() {
    // Sin personaje elegido todavía: no hay a dónde "volver" — hay que
    // iniciar sesión para poder jugar. Una vez dentro, la pantalla vuelve a
    // ser opcional.
    const forced = !save.characterId;
    charTitle.textContent = forced ? "¿Quién entra a fingir hoy?" : "Cambiar de usuario";
    charBackBtn.classList.toggle("inc-hidden", forced);

    const [id, mode] = loginEntries[loginAt] ?? [];
    if (!mode) return;
    const locked = mode.playable === false;
    loginUser.innerHTML = "";
    const avatar = el("div", `inc-login-avatar${locked ? " locked" : ""}`, loginUser);
    // SIEMPRE el muñeco 3D, el mismo que vas a mover por el piso. `looks.get`
    // nunca devuelve vacío: quien no tenga receta propia sale con la
    // genérica. Si el cuerpo aún no llegó, refreshCharacters() redibuja al
    // terminar la precarga.
    // El retrato va a una VARIABLE, no al fondo del disco: lo pinta un
    // `::after` que desborda el círculo por arriba, para que el muñeco se
    // salga del pedestal en vez de quedar recortado dentro (ver el bloque
    // «EL PERSONAJE SE SALE DEL DISCO» del design system).
    const shot = looks ? characterShot(looks.get(id) ?? looks.get(mode.sheet), CARD_POSE[id]) : null;
    if (shot) avatar.style.setProperty("--avatar-shot", `url(${shot})`);
    if (locked) {
      const lockBadge = el("span", "inc-login-lock", avatar);
      lockBadge.innerHTML = svgIcon("lock", { size: 22 });
    }
    // ── PANEL IZQUIERDO: quién es ────────────────────────────────────
    panelLeft.innerHTML = "";
    el("div", "inc-login-panel-tag", panelLeft, "Expediente");
    el("div", "inc-login-name", panelLeft, mode.alias ? `${mode.name} "${mode.alias}"` : mode.name);
    const metaBits = [mode.role, !locked && mode.difficulty ? `modo ${mode.difficulty}` : null].filter(Boolean);
    el("div", "inc-login-role", panelLeft, metaBits.join(" · "));
    el("p", "inc-login-blurb", panelLeft, locked ? mode.lockedReason ?? "Bloqueado" : mode.blurb ?? "");

    // ── PANEL DERECHO: cómo se juega ─────────────────────────────────
    // Las barras de la referencia (RANGO / DAÑO / DUREZA), traducidas a lo
    // que de verdad distingue a un personaje aquí. Salen de `rules`, así
    // que un personaje nuevo trae sus barras sin tocar esto.
    panelRight.innerHTML = "";
    el("div", "inc-login-panel-tag", panelRight, "Perfil");
    const rules = mode.rules ?? {};
    // Margen: cuántas amonestaciones aguantas. Discreto, en rombos, igual
    // que en la placa del HUD — se cuenta de reojo, no se lee.
    const warns = rules.maxWarnings ?? 3;
    const marginRow = el("div", "inc-login-stat", panelRight);
    el("span", "inc-login-stat-name", marginRow, "Margen");
    const pipHost = el("span", "inc-login-stat-pips", marginRow);
    for (let i = 0; i < 4; i++) {
      el("i", `inc-login-pip${i < warns ? " on" : ""}`, pipHost);
    }
    // Y dos barras, con el valor NORMALIZADO a lo que se considera el
    // máximo jugable: una barra sin tope no dice nada.
    const bar = (label, value, max, invert = false) => {
      const row = el("div", "inc-login-stat", panelRight);
      el("span", "inc-login-stat-name", row, label);
      const track = el("span", "inc-login-stat-track", row);
      const fill = el("i", null, track);
      const pct = Math.max(6, Math.min(100, Math.round((value / max) * 100)));
      fill.style.width = `${pct}%`;
      if (invert) fill.classList.add("hot");
    };
    // Cuánto te aprietan los secuaces. Por encima de 1 va en caliente.
    const acoso = rules.minionSuspicionMul ?? 1;
    bar("Acoso", acoso, 2, acoso > 1.1);
    // Y la dificultad declarada, que es texto en el JSON: se traduce a
    // barra aquí para que se compare de un vistazo con la de al lado.
    const DIFF = { fácil: 1, facil: 1, normal: 2, difícil: 3, dificil: 3 };
    bar("Exigencia", DIFF[(mode.difficulty ?? "normal").toLowerCase()] ?? 2, 3);
    // Ya NO hay botón de «iniciar sesión». Sobraba: se cambia de cuenta con
    // las flechas o pasando por encima de su ficha, y se entra con clic,
    // Enter o espacio — un botón aparte era un paso de más para algo que ya
    // se decide en la propia lista.
    //
    // En su sitio queda la LEYENDA de mandos, que es lo que la referencia de
    // HUD pone abajo (docs/HUD.md §1.2): dice qué se pulsa sin ocupar un
    // control, y resuelve que los atajos no estaban escritos en ninguna
    // parte.
    const legend = el("div", "inc-login-legend", loginUser);
    if (locked) {
      legend.innerHTML = `<span class="inc-login-legend-lock">${svgIcon("lock", { size: 16 })} Cuenta bloqueada</span>`;
    } else {
      legend.innerHTML =
        `<span><b>←</b><b>→</b> cambiar</span>` +
        `<span><b>Enter</b> entrar</span>`;
    }

    // El muelle de usuarios: un circulito por cuenta, como en un Mac.
    loginDock.innerHTML = "";
    loginEntries.forEach(([uid, m], i) => {
      const dot = el("button", "inc-login-mini", loginDock);
      dot.type = "button";
      dot.classList.toggle("active", i === loginAt);
      dot.classList.toggle("locked", m.playable === false);
      dot.setAttribute("aria-label", m.name);
      const miniShot = looks ? characterShot(looks.get(uid) ?? looks.get(m.sheet), CARD_POSE[uid]) : null;
      if (miniShot) dot.style.backgroundImage = `url(${miniShot})`;
      el("span", "inc-login-mini-name", dot, m.name);
      // PASAR POR ENCIMA ya cambia de cuenta: la ficha grande es la vista
      // previa de lo que hay bajo el cursor, sin tener que hacer clic para
      // «llegar» a ella primero.
      dot.addEventListener("mouseenter", () => {
        if (i === loginAt) return;
        loginAt = i;
        sfxMove();
        renderCharacters();
      });
      // Y el CLIC entra directo, esté seleccionada o no. Antes el primer
      // clic solo navegaba y hacía falta un segundo en otro botón.
      dot.addEventListener("click", () => {
        if (m.playable === false) return;
        loginAt = i;
        loginSelect(uid);
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
  // OJO: los mandos NO se escriben aquí. Salen de ui/controls.js, que es la
  // única lista. Esta pantalla llegó a enseñar `E` para usar y `F` para
  // fingir mucho después de que la acción se unificara en ESPACIO — quien
  // leía la ayuda pulsaba E, no pasaba nada, y concluía que el juego estaba
  // roto. También hablaba de multiplicador y de puntuación, que se
  // eliminaron hace tiempo: la única moneda es el RELOJ.
  helpBody.innerHTML = `
    <p>Eres diseñadora en el Piso 10. Tu trabajo de mentira es
    <b>no trabajar</b>: café, película, comer. El jefe patrulla la
    planta con un cono de visión. (Tu trabajo de verdad es otra cosa —
    hay quien dice que fingir es, en realidad, la única forma de seguir
    diseñando algo con vida propia aquí dentro.)</p>
    <ul>
      <li><b>La moneda es el RELOJ.</b> No hay puntos: todo lo que haces bien
      te alarga la jornada, y la jornada es lo único que se acaba.</li>
      <li><b>Fingir que trabajas</b> baja la sospecha aunque te vean, pero
      <b>solo en un lugar seguro</b>: una sala de reuniones o tu propio puesto.</li>
      <li><b>Salas de reuniones</b> — con entrar basta (se supone que estás reunida),
      pero cada una tiene un cupo de segundos al día y cada tanto llega gente de
      verdad y la ocupa.</li>
      <li><b>Tu puesto</b> — nunca se gasta ni se ocupa, pero solo te cubre
      mientras finges de verdad.</li>
      <li><b>Las tareas te exponen.</b> Mantener la acción las termina despacio;
      tocar al ritmo de la tira las termina antes — y fallar hace ruido, que
      sube la sospecha.</li>
      <li><b>Esconderse</b> — pisa un círculo verde: dejas de ser visible.</li>
      <li><b>Distracciones</b> — las estrellas amarillas se llevan al jefe a otro sitio.</li>
      <li><b>Tres amonestaciones</b> no te despiden: te mandan a un curso de
      RRHH del que se sale cazando un botón que huye.</li>
      <li><b>Orbitar la cámara</b> — botón derecho o dos dedos</li>
    </ul>
    <p>Al cerrar el día te evalúan por dos ejes: los <b>Qués</b> (lo que
    entregaste, a solas) y los <b>Cómos</b> (con quién hablaste). Puedes
    cumplir todo tu trabajo y suspender por no hablar con nadie. Eso no es un
    bug.</p>
  `;
  el("h3", "inc-menu-help-sub", helpScreen, "Mandos");
  buildControlsLegend(helpScreen, { touch: matchMedia("(pointer: coarse)").matches });

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
  // LA LEYENDA DE MANDOS, aquí y permanente (HUD.md §4.5). La píldora de
  // bienvenida se apaga en cuanto te mueves, así que a los diez segundos de
  // partida no había DÓNDE consultar un atajo. Sale de ui/controls.js, la
  // misma lista que lee la ayuda y la píldora: imposible que se separen.
  buildControlsLegend(pauseScreen, { touch: matchMedia("(pointer: coarse)").matches });

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

    // En el login, izquierda/derecha hojean el carrusel de usuarios (como en
    // la pantalla de entrada de un sistema de verdad); arriba/abajo siguen
    // moviendo el foco para llegar al botón de entrar y al muelle.
    if (!onSlider && currentScreen === "characters" && (key === "arrowright" || key === "d")) {
      e.preventDefault();
      moveLogin(1);
      return;
    }
    if (!onSlider && currentScreen === "characters" && (key === "arrowleft" || key === "a")) {
      e.preventDefault();
      moveLogin(-1);
      return;
    }
    // Sin botón de entrar, la confirmación es la tecla: Enter, espacio o E
    // eligen la cuenta que se esté viendo.
    //
    // La guarda es por el pie de pantalla (el botón «Volver») y NADA MÁS.
    // Estuvo puesta como «si el foco es un <button>, no» y no entraba
    // nunca: las flechas del carrusel y las fichas del muelle también son
    // botones, y al abrir la pantalla el foco cae en la primera. Con eso,
    // Enter movía el carrusel en vez de entrar.
    if (
      currentScreen === "characters" &&
      (key === "enter" || key === " " || key === "spacebar" || key === "e") &&
      !document.activeElement?.closest?.(".inc-menu-screen-foot")
    ) {
      e.preventDefault();
      const [id, mode] = loginEntries[loginAt] ?? [];
      if (id && mode?.playable !== false) loginSelect(id);
      return;
    }
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
