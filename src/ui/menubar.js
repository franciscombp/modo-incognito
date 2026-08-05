import { icon as svgIcon } from "./icons.js";
import { isMutedState, getVolume, setVolume, setMuted, unmute, subscribeAudio } from "../game/audioControl.js";

/**
 * LA BARRA DE MENÚ — el HUD de verdad del juego.
 *
 * Está SIEMPRE en pantalla (menús, ascensor, partida), como la barra de macOS,
 * y es donde vive toda la información de estado: tareas, sospecha, reloj de la
 * jornada. La idea es que la partida se vea sin nada encima: en vez de tres
 * paneles flotando sobre el piso a todas horas, aquí arriba hay un resumen de
 * una línea y el detalle se abre PIDIÉNDOLO (clic o atajo).
 *
 * Las alertas ("Gabo viene para acá", "te queda poco") entran como
 * notificaciones que caen de la barra, se leen solas y se van — sin robar el
 * foco ni tapar el juego.
 *
 * No decide nada: se le da el mismo snapshot por frame que al resto del HUD
 * (ver game/hud.js) y lo pinta.
 */

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

/** Cuánto dura una notificación en pantalla, por tono. */
const NOTICE_MS = { info: 4200, warn: 5200, danger: 6200 };

export function createMenuBar(root, { title = "Modo Incógnito", onOpenPause = null } = {}) {
  const bar = el("div", "inc-bar", root);

  // --- Izquierda: marca. Es también el botón de pausa, como el menú Apple.
  const brand = el("button", "inc-bar-brand", bar);
  brand.type = "button";
  brand.innerHTML = `${svgIcon("incognito", { size: 18 })}<span class="inc-bar-brand-name">${title}</span>`;
  brand.addEventListener("click", () => onOpenPause?.());

  // --- Derecha: los "menulets", cada uno con su panel desplegable.
  const rightSide = el("div", "inc-bar-right", bar);

  /**
   * Un item de la barra: resumen siempre visible + panel que se abre al
   * pulsarlo. Devuelve los nodos para que `render` los rellene.
   */
  function menulet({ id, iconName, hint }) {
    const wrap = el("div", "inc-bar-item", rightSide);
    wrap.dataset.item = id;
    const btn = el("button", "inc-bar-btn", wrap);
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    const ico = el("span", "inc-bar-btn-icon", btn);
    ico.innerHTML = svgIcon(iconName, { size: 15 });
    const label = el("span", "inc-bar-btn-label", btn);
    const panel = el("div", "inc-bar-panel inc-hidden", wrap);
    const panelHead = el("div", "inc-bar-panel-head", panel);
    el("span", "inc-bar-panel-title", panelHead);
    if (hint) el("span", "inc-bar-panel-hint", panelHead, hint);
    const panelBody = el("div", "inc-bar-panel-body", panel);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle(id);
    });
    return { wrap, btn, label, panel, panelBody, title: panelHead.firstChild };
  }

  const items = {
    tasks: menulet({ id: "tasks", iconName: "diamond", hint: "Q" }),
    heat: menulet({ id: "heat", iconName: "eye" }),
    clock: menulet({ id: "clock", iconName: "clock" }),
    // El volumen es un menulet más, como en macOS — antes era un widget
    // flotando suelto en la esquina, que además chocaba con estos paneles.
    audio: menulet({ id: "audio", iconName: "volume2", hint: "V" }),
  };
  // EL RELOJ VA AL CENTRO: es la única moneda del juego, así que preside la
  // barra — centrado de verdad (posición absoluta, no flexbox: no depende de
  // cuánto pese cada lado). Sigue siendo el mismo menulet con su panel.
  const center = el("div", "inc-bar-center", bar);
  center.appendChild(items.clock.wrap);
  items.tasks.title.textContent = "Tareas de hoy";
  items.heat.title.textContent = "Presión";
  items.clock.title.textContent = "Jornada";
  items.audio.title.textContent = "Sonido";

  // --- Sonido: vive fuera de la partida, así que se monta una sola vez y no
  // se repinta por frame como el resto.
  {
    const body = items.audio.panelBody;
    const row = el("div", "inc-bar-audio-row", body);
    const muteBtn = el("button", "inc-bar-audio-mute", row);
    muteBtn.type = "button";
    const slider = el("input", "inc-bar-audio-slider", row);
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    const note = el("div", "inc-bar-note", body, "V silencia desde cualquier pantalla.");
    note.style.marginTop = "6px";

    const paint = () => {
      const muted = isMutedState();
      const vol = Math.round(getVolume() * 100);
      const name = muted || vol === 0 ? "volumeX" : vol < 50 ? "volume1" : "volume2";
      muteBtn.innerHTML = svgIcon(name, { size: 17 });
      muteBtn.title = muted ? "Activar sonido" : "Silenciar";
      slider.value = String(vol);
      items.audio.label.textContent = muted ? "—" : `${vol}%`;
      items.audio.btn.querySelector(".inc-bar-btn-icon").innerHTML = svgIcon(name, { size: 15 });
      items.audio.wrap.classList.toggle("muted", muted);
    };

    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isMutedState()) unmute(getVolume());
      else setMuted(true);
    });
    slider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) / 100;
      // Mover el volumen ES querer oír.
      if (isMutedState()) unmute(v);
      else setVolume(v);
    });
    // El panel no debe cerrarse mientras se arrastra el slider.
    items.audio.panel.addEventListener("click", (e) => e.stopPropagation());
    subscribeAudio(paint);
    paint();
  }

  let openId = null;
  function toggle(id) {
    openId = openId === id ? null : id;
    for (const [key, it] of Object.entries(items)) {
      const on = key === openId;
      it.panel.classList.toggle("inc-hidden", !on);
      it.wrap.classList.toggle("open", on);
      it.btn.setAttribute("aria-expanded", String(on));
    }
    // Las notificaciones caen en la misma esquina que los paneles. En vez de
    // taparlas (son avisos: perderse uno es perder información), se apartan
    // hacia abajo lo que mida el panel abierto. Se mide en vez de reservar
    // una banda fija porque cada panel tiene su alto y crece con el contenido.
    const open = openId ? items[openId].panel : null;
    const drop = open ? open.getBoundingClientRect().height + 8 : 0;
    notices.style.transform = drop ? `translateY(${drop}px)` : "";
  }
  function closePanels() {
    if (openId) toggle(openId);
  }
  // Fuera de un panel abierto, cualquier clic lo cierra — como cualquier menú
  // desplegable. El propio botón para el clic antes de llegar aquí.
  window.addEventListener("click", closePanels);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId) {
      e.stopPropagation();
      closePanels();
    }
    if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey) toggle("tasks");
  });

  // --- Centro de notificaciones: caen bajo la barra y se van solas.
  const notices = el("div", "inc-bar-notices", root);
  const seen = new Set();

  /**
   * @param {object} n
   * @param {string} n.id     para no repetir la misma alerta en bucle
   * @param {string} n.text
   * @param {string} [n.icon]
   * @param {"info"|"warn"|"danger"} [n.tone]
   * @param {boolean} [n.once] si ya salió con este id, no vuelve a salir
   */
  function notify({ id, text, icon = "alert", tone = "info", title: noticeTitle = "", once = false }) {
    if (once) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    const card = el("div", `inc-notice inc-notice--${tone}`, notices);
    card.innerHTML =
      `<span class="inc-notice-icon">${svgIcon(icon, { size: 16 })}</span>` +
      `<span class="inc-notice-body">` +
      (noticeTitle ? `<span class="inc-notice-title">${noticeTitle}</span>` : "") +
      `<span class="inc-notice-text">${text}</span>` +
      `</span>`;
    // Salida por CSS y borrado al terminar: sin esto, una jornada larga deja
    // cien tarjetas invisibles colgando del DOM.
    setTimeout(() => {
      card.classList.add("out");
      setTimeout(() => card.remove(), 400);
    }, NOTICE_MS[tone] ?? NOTICE_MS.info);
  }

  /** Empieza un día nuevo: las alertas de "una sola vez" vuelven a contar. */
  function resetNotices() {
    seen.clear();
    notices.replaceChildren();
  }

  // --- Estado que la barra vigila para avisar sola ---
  let lastHeat = 0;
  let lastWarnings = 0;
  let lastHeatPct = 0;
  let lastDayTime = null;
  let lastDone = 0;
  let lastBossState = null;

  function renderTasks(state) {
    const list = state.objectives ?? [];
    const done = list.filter((o) => o.done).length;
    items.tasks.label.textContent = `${done}/${list.length}`;
    items.tasks.wrap.classList.toggle("attention", done < list.length);

    const body = items.tasks.panelBody;
    body.replaceChildren();
    if (!list.length) {
      el("div", "inc-bar-empty", body, "Nada pendiente.");
      return;
    }
    for (const o of list) {
      const row = el("div", `inc-bar-task${o.done ? " done" : ""}`, body);
      const mark = el("span", "inc-bar-task-mark", row);
      mark.innerHTML = svgIcon(o.done ? "check" : o.icon ?? "diamond", { size: 14 });
      el("span", "inc-bar-task-label", row, o.label ?? o.id);
      if (!o.done && o.progress > 0 && o.time) {
        const track = el("span", "inc-bar-task-bar", row);
        el("i", null, track).style.width = `${Math.round((o.progress / o.time) * 100)}%`;
      }
    }
    // Terminar una tarea es la recompensa del juego: que se note.
    if (done > lastDone) {
      const justDone = list.find((o) => o.done);
      notify({
        id: `task:${done}`,
        icon: "check",
        tone: "info",
        title: "Tarea lista",
        text: justDone?.label ? `${justDone.label} — te ganaste el rato.` : "Una menos.",
      });
    }
    lastDone = done;
  }

  /**
   * Pone una clase de animación y la quita al acabar.
   *
   * Hay que QUITARLA: estas marcas se vuelven a poner en cuadros
   * siguientes, y una clase que ya está no rearranca su animación — el
   * segundo aviso no se vería. El `void offsetWidth` fuerza el reflow que
   * hace que el navegador la dé por nueva.
   */
  function pulse(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    clearTimeout(node._miTimer);
    node._miTimer = setTimeout(() => node.classList.remove(cls), ms);
  }

  function renderHeat(state) {
    const max = state.suspicionMax || 100;
    const pct = Math.round((state.suspicion / max) * 100);
    items.heat.label.textContent = `${pct}%`;
    items.heat.wrap.classList.toggle("warn", pct >= 55 && pct < 90);
    items.heat.wrap.classList.toggle("danger", pct >= 90);
    // Con la presión crítica el medidor LATE. Es el aviso periférico que
    // deja jugar sin tener que mirar el número: se ve de reojo.
    items.heat.wrap.classList.toggle("mi-critical", pct >= 90);
    // Y cuando pega un salto de golpe (te acaban de ver), sacude una vez.
    if (pct - lastHeatPct >= 12) pulse(items.heat.wrap, "mi-shake", 420);
    lastHeatPct = pct;

    const body = items.heat.panelBody;
    body.replaceChildren();
    const meter = el("div", "inc-bar-meter", body);
    el("i", null, meter).style.width = `${pct}%`;
    el("div", "inc-bar-kv", body).innerHTML =
      `<span>Sospecha</span><b>${pct}%</b>`;
    el("div", "inc-bar-kv", body).innerHTML =
      `<span>Amonestaciones</span><b>${state.warnings}/${state.maxWarnings}</b>`;
    el("div", "inc-bar-kv", body).innerHTML =
      `<span>Nivel de búsqueda</span><b>${state.heat}/${state.maxHeat}</b>`;
    el("div", "inc-bar-note", body, state.inSafeSpot
      ? "Estás a cubierto: aquí la sospecha baja."
      : "Fuera de un lugar seguro. Fingir solo cuela en salas y en tu puesto.");

    // Avisos automáticos: es lo que sustituye a mirar un medidor todo el rato.
    if (state.heat > lastHeat) {
      notify({
        id: `heat:${state.heat}`,
        icon: "search",
        tone: state.heat >= 3 ? "danger" : "warn",
        title: `Nivel de búsqueda ${state.heat}`,
        text: state.heat >= 3 ? "Va derecho a tu zona. Muévete." : "Te están buscando.",
      });
    }
    lastHeat = state.heat;

    if (state.warnings > lastWarnings) {
      notify({
        id: `warn:${state.warnings}`,
        icon: "alert",
        tone: "danger",
        title: `Amonestación ${state.warnings}/${state.maxWarnings}`,
        text:
          state.warnings >= state.maxWarnings - 1
            ? "Una más y te ascienden a cliente."
            : "Gabo lo apuntó. Baja el perfil un rato.",
      });
    }
    lastWarnings = state.warnings;

    if (state.bossState !== lastBossState) {
      if (state.bossState === "CHASE") {
        notify({ id: "boss:chase", icon: "siren", tone: "danger", title: "Gabo te vio", text: "Viene para acá. Un lugar seguro lo corta." });
      } else if (state.bossState === "SEARCH" && lastBossState === "CHASE") {
        notify({ id: "boss:search", icon: "search", tone: "warn", title: "Te perdió de vista", text: "Está barriendo la zona. No salgas todavía." });
      }
      lastBossState = state.bossState;
    }
  }

  function renderClock(state) {
    const left = Math.max(0, Math.round(state.timeLeft));
    const mins = Math.floor(left / 60);
    const secs = String(left % 60).padStart(2, "0");
    // WIDGET DE RELOJ: la HORA del piso es la cifra grande (es el mundo en
    // el que finges vivir); lo que de verdad te queda de jornada va debajo,
    // en pequeño — la trastienda del juego. El estilo (vidrio líquido +
    // dígitos pixel) es puro CSS del DS: aquí solo se parte la hora en
    // cifra y sufijo (a.m./p.m.) para poder dimensionarlos por separado.
    const [dayTime = "—", ...suffix] = String(state.currentTime ?? "—").split(" ");
    items.clock.label.innerHTML =
      `<span class="inc-clockwidget-time">${dayTime}` +
      `<i class="inc-clockwidget-suffix">${suffix.join(" ")}</i></span>` +
      `<span class="inc-bar-countdown">${mins}:${secs} de jornada</span>`;
    items.clock.wrap.classList.toggle("warn", left <= 45 && left > 20);
    items.clock.wrap.classList.toggle("danger", left <= 20);
    // Un tic mínimo al cambiar la hora del piso: el ojo lo capta de reojo y
    // sabe que el reloj corre, sin tener que leerlo.
    if (dayTime !== lastDayTime) {
      pulse(items.clock.label.querySelector(".inc-clockwidget-time"), "mi-tick", 240);
      lastDayTime = dayTime;
    }
    // Los últimos veinte segundos laten, como la presión crítica.
    items.clock.wrap.classList.toggle("mi-critical", left <= 20);

    const body = items.clock.panelBody;
    body.replaceChildren();
    el("div", "inc-bar-big", body, `${mins}:${secs}`);
    el("div", "inc-bar-note", body, "Lo que te queda de jornada.");
    const track = el("div", "inc-bar-meter", body);
    el("i", null, track).style.width = `${Math.round((state.timeLeft / (state.levelDuration || 1)) * 100)}%`;
    el("div", "inc-bar-kv", body).innerHTML =
      `<span>Ganado escaqueándote</span><b>+${Math.round(state.timeGained)}s</b>`;
    if (state.area?.name) {
      el("div", "inc-bar-kv", body).innerHTML = `<span>Dónde estás</span><b>${state.area.name}</b>`;
    }

    if (left <= 30 && left > 0) {
      notify({ id: "clock:30", once: true, icon: "clock", tone: "warn", title: "Media hora de nada", text: "Se acaba la jornada. Cierra lo que puedas." });
    }
  }

  return {
    root: bar,
    notify,
    resetNotices,
    closePanels,
    /** Modo partida: la barra enseña estado. Fuera, solo la marca. */
    setLive(live) {
      bar.classList.toggle("live", !!live);
      if (!live) closePanels();
    },
    render(state) {
      if (!state) return;
      renderTasks(state);
      renderHeat(state);
      renderClock(state);
    },
  };
}
