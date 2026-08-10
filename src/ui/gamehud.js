import { iconEl } from "./icons.js";
import { createPortrait3D } from "./portrait3d.js";

/**
 * EL HUD DE PARTIDA — sustituye a la barra de menú tipo macOS.
 *
 * La barra era un sistema de estado "de aplicación": menulets con etiquetas y
 * porcentajes que había que ABRIR para ver el detalle. El equipo pidió un HUD
 * de JUEGO (ver docs/HUD.md y docs/referencias/hud/), y la gramática de la
 * referencia es otra: clusters en las esquinas, centro libre, información
 * discreta que se lee de reojo.
 *
 *   ┌─────────────────────────────────────────────────┐
 *   │ PLACA (yo)        RELOJ         MISIONES        │
 *   │                                                 │
 *   │                 (el piso)                       │
 *   │                                                 │
 *   │ acción (wprompt)                 NOMBRE DE ZONA │
 *   └─────────────────────────────────────────────────┘
 *
 * · La PLACA funde en una pieza la cara VIVA del personaje (el mismo
 *   Character3D del piso, encuadre de cara), las amonestaciones como ROMBOS
 *   discretos y la presión como barra. Los rombos se cuentan de reojo — «me
 *   quedan dos» — sin leer un número; la presión es continua porque sube y
 *   baja sin parar y unos pips parpadeando serían ruido.
 * · La cara REACCIONA a la presión (serena → de reojo → pánico). Es el mismo
 *   sistema de expresiones del diálogo; aquí solo se decide el mood.
 * · Las MISIONES van en filas SIN caja separadas por una línea, con el
 *   número de atajo, el icono de su medalla (el mismo del piso) y la
 *   distancia a la derecha. Con la presión alta la lista SE REPLIEGA: solo
 *   títulos en alerta, solo la seguida en persecución — cuanto más aprieta
 *   el juego, menos hay que leer. Es una decisión de tensión, no de espacio.
 * · El RELOJ (la moneda del juego) se queda en el centro, como estaba.
 * · El NOMBRE DE ZONA es texto pelado que aparece al cambiar de zona y se va
 *   solo: da contexto sin ocupar nada.
 *
 * Interfaz idéntica a la barra retirada (render/notify/resetNotices/
 * closePanels/setLive), para que hud.js y engine.js no cambien de contrato.
 */

function el(tag, className, parent, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (parent) parent.appendChild(n);
  if (text != null) n.textContent = text;
  return n;
}

/** Pone una clase de animación y la quita al acabar, para poder repetirla. */
function pulse(node, cls, ms) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
  clearTimeout(node._miTimer);
  node._miTimer = setTimeout(() => node.classList.remove(cls), ms);
}

export function createGameHud(root, { onOpenPause = null, playerLook = null } = {}) {
  const layer = el("div", "inc-gamehud", root);

  // ── LA PLACA ──────────────────────────────────────────────────────────
  // Ya NO lleva un medidor de "SOSPECHA": ese número era de quien sospecha
  // de ti, no tuyo, y vivir en TU placa lo hacía leerse como una barra de
  // vida — un solo número, viendo cómo baja, sin saber POR QUÉ. Se cambió
  // por el globo de alerta SOBRE LA CABEZA de cada jefe/secuaz (ver
  // entities/alertIcon.js): la sospecha se lee ahí, literal, como en Sneaky
  // Sasquatch — donde sospecha, no en un panel aparte. La placa se queda con
  // lo que sí es tuyo: quién eres, cuántas amonestaciones te quedan y
  // cuánta energía tienes.
  const plate = el("div", "inc-plate", layer);
  const faceHost = el("div", "inc-plate-face", plate);
  const plateBody = el("div", "inc-plate-body", plate);
  const pipsRow = el("div", "inc-plate-pips", plateBody);

  // La ENERGÍA, en la misma placa: es la otra mitad de "cómo estoy yo". Es
  // la que se vacía sola, así que se lee al revés que un medidor de peligro
  // — llena es buena.
  const energyLabel = el("div", "inc-plate-meter-label", plateBody);
  const energyLabelText = el("span", null, energyLabel);
  const energyLabelPct = el("b", null, energyLabel);
  energyLabelText.textContent = "ENERGÍA";
  const energyMeter = el("div", "inc-plate-meter inc-plate-meter--energy", plateBody);
  const energyFill = el("i", null, energyMeter);

  // La cara viva. Dibuja SIEMPRE durante la partida (no solo en diálogo):
  // es un render extra pequeño (128px) y es lo que hace que la placa sea un
  // personaje y no un icono. Si no hay WebGL para el segundo contexto, la
  // placa sigue funcionando sin cara.
  const face = createPortrait3D(faceHost, { framing: "face" });
  let faceOn = false;
  let faceMood = null;
  function setFaceMood(mood) {
    if (!playerLook || mood === faceMood) return;
    faceMood = mood;
    faceOn = face.show(playerLook, mood);
  }

  let pips = [];
  let pipsMax = -1;
  let lastWarnings = -1;
  let lastHunted = false;

  // ── LAS MISIONES ──────────────────────────────────────────────────────
  const quests = el("div", "inc-quests", layer);
  const questRows = new Map(); // id -> nodos, para no reconstruir por frame
  let preferredId = null;

  // ── EL RELOJ, centrado (mismo widget de siempre) ──────────────────────
  const center = el("div", "inc-bar-center", layer);
  const clockBtn = el("div", "inc-bar-btn", center);
  const clockLabel = el("span", "inc-bar-btn-label", clockBtn);
  let lastDayTime = null;

  // ── SISTEMA: pausa, mínima y en su esquina ────────────────────────────
  const sys = el("div", "inc-sysbtns", layer);
  const pauseBtn = el("button", "inc-sysbtn", sys);
  pauseBtn.type = "button";
  pauseBtn.setAttribute("aria-label", "Pausa");
  pauseBtn.appendChild(iconEl("pause"));
  pauseBtn.addEventListener("click", () => onOpenPause?.());

  // ── NOMBRE DE ZONA ────────────────────────────────────────────────────
  const zone = el("div", "inc-zone-name", layer);
  let zoneShown = null;
  let zoneTimer = 0;

  // ── EL PULSO DE LA ACTIVIDAD ──────────────────────────────────────────
  // Una TIRA FINA y baja, no un panel: esto se juega con el jefe encima y el
  // escenario tiene que seguir viéndose (game/activityGame.js explica por qué
  // el mundo no se pausa). Va centrada abajo, justo donde ya está mirando
  // quien acaba de pulsar el botón de acción.
  const pulseBar = el("div", "inc-pulse", layer);
  const pulseZone = el("i", "inc-pulse-zone", pulseBar);
  const pulseMark = el("i", "inc-pulse-mark", pulseBar);
  const pulsePips = el("div", "inc-pulse-pips", pulseBar);
  // La regla del minijuego, escrita UNA vez encima de la tira las primeras
  // veces que se enciende. Sin esto, la tira era un adorno misterioso: nadie
  // sabía que tocar al ritmo acelera ni que fallar hace ruido. Después
  // desaparece — con el jefe detrás nadie lee (el mismo principio del
  // repliegue de la lista).
  el(
    "div",
    "inc-pulse-hint",
    pulseBar,
    "ESPACIO al ritmo · dentro de la zona clara avanza · fuera hace RUIDO"
  );
  let pulseHits = -1;
  let pulseWasOn = false;
  let pulseShows = 0;

  function renderPulse(state) {
    const p = state.pulse;
    pulseBar.classList.toggle("on", !!p);
    if (!!p && !pulseWasOn) {
      pulseShows += 1;
      pulseBar.classList.toggle("hint", pulseShows <= 3);
    }
    pulseWasOn = !!p;
    if (!p) {
      pulseHits = -1;
      return;
    }
    pulseZone.style.left = `${(p.zonaAt - p.zona / 2) * 100}%`;
    pulseZone.style.width = `${p.zona * 100}%`;
    pulseMark.style.left = `${p.pos * 100}%`;
    // Los puntos solo se redibujan cuando cambia la cuenta: reconstruir seis
    // nodos por frame es gratis en un portátil y se nota en un teléfono.
    if (p.aciertos !== pulseHits) {
      pulseHits = p.aciertos;
      pulsePips.replaceChildren();
      for (let i = 0; i < p.necesarios; i++) {
        el("i", `inc-pulse-pip${i < p.aciertos ? " on" : ""}`, pulsePips);
      }
    }
  }

  // ── LA ACCIÓN EN PRIMER PLANO ─────────────────────────────────────────
  // Lo que pidió el diseño: que hacer algo prohibido se VEA, y que haya que
  // hacer algo de verdad —bajarle el volumen a la peli para que no te oigan—
  // con una cuenta atrás encima.
  //
  // «Primer plano» NO es «pantalla completa», y la diferencia es toda la
  // mecánica: el mundo NO se pausa (game/gestures.js explica por qué), así
  // que esto vive en la MISMA banda baja que el pulso —por debajo de los pies
  // de la jugadora— y nunca roba un clic. Un panel centrado que tapara el
  // piso convertiría las estaciones en el sitio más seguro de la planta, que
  // es justo lo contrario de para qué están.
  //
  // El pulso y el gesto son excluyentes, así que comparten sitio sin pelearse.
  const action = el("div", "inc-action", layer);
  const actionClock = el("div", "inc-action-clock", action);
  const actionClockFill = el("i", "inc-action-clock-fill", actionClock);
  const actionBody = el("div", "inc-action-body", action);
  const actionIcon = el("span", "inc-action-icon", actionBody);
  const actionText = el("div", "inc-action-text", actionBody);
  const actionVerb = el("b", "inc-action-verb", actionText);
  const actionLabel = el("span", "inc-action-label", actionText);
  const actionTrack = el("div", "inc-action-track", actionBody);
  const actionZone = el("i", "inc-action-zone", actionTrack);
  const actionKnob = el("i", "inc-action-knob", actionTrack);
  const actionCount = el("span", "inc-action-count", actionBody);
  let actionIconName = null;

  function renderAction(state) {
    const g = state.gesture;
    const d = state.deadline;
    const on = !!(g || d);
    action.classList.toggle("on", on);
    // La píldora de bienvenida comparte banda con esto y le cede el sitio
    // (ver `body.inc-acting #hint`). Va en el <body> y no en el layer porque
    // la píldora cuelga de ahí, no del HUD.
    document.body.classList.toggle("inc-acting", on);
    if (!on) {
      actionIconName = null;
      return;
    }

    // El icono se reconstruye solo cuando cambia: `iconEl` crea un SVG nuevo
    // cada vez y hacerlo por cuadro se nota en un teléfono.
    const icon = g?.icon ?? "clock";
    if (icon !== actionIconName) {
      actionIconName = icon;
      actionIcon.replaceChildren(iconEl(icon));
    }
    actionVerb.textContent = g?.verbo ?? "Termina antes de que te vean";
    actionLabel.textContent = g?.label ?? d?.label ?? "";

    actionTrack.classList.toggle("on", !!g);
    if (g) {
      actionTrack.dataset.eje = g.eje;
      // El eje "y" se pinta de abajo arriba (0 abajo), que es como se lee un
      // volumen; el "x", de izquierda a derecha.
      const zoneStart = `${Math.max(0, (g.zonaAt - g.zona / 2) * 100)}%`;
      const zoneSize = `${g.zona * 100}%`;
      if (g.eje === "x") {
        actionZone.style.cssText = `left:${zoneStart};width:${zoneSize};top:0;bottom:0`;
        actionKnob.style.cssText = `left:${g.valor * 100}%;top:-3px;bottom:-3px;width:5px;margin-left:-2.5px`;
      } else {
        actionZone.style.cssText = `bottom:${zoneStart};height:${zoneSize};left:0;right:0`;
        actionKnob.style.cssText = `bottom:${g.valor * 100}%;left:-3px;right:-3px;height:5px;margin-bottom:-2.5px`;
      }
      actionTrack.classList.toggle("in", g.dentro);
      // DELATADA: el valor está en el extremo y te están oyendo. Es el único
      // estado del panel que grita, porque es el único que cuesta sospecha
      // cada segundo que lo dejes así.
      action.classList.toggle("loud", g.delatada);
    } else {
      action.classList.remove("loud");
    }

    if (d) {
      actionClock.classList.add("on");
      actionClockFill.style.width = `${Math.max(0, (d.left / d.total) * 100)}%`;
      actionCount.textContent = `${Math.ceil(d.left)}s`;
      action.classList.toggle("urge", d.left <= 3);
    } else {
      actionClock.classList.remove("on");
      actionCount.textContent = "";
      action.classList.remove("urge");
    }
  }

  // ── AVISOS (caen bajo el reloj y se van solos) ────────────────────────
  const notices = el("div", "inc-bar-notices", layer);
  function notify({ icon = "alert", text = "", tone = "info", ttl = 4200 } = {}) {
    const card = el("div", `inc-notice inc-notice--${tone}`, notices);
    const ic = el("span", "inc-notice-icon", card);
    ic.appendChild(iconEl(icon));
    el("span", "inc-notice-text", card, text);
    setTimeout(() => {
      card.classList.add("out");
      setTimeout(() => card.remove(), 400);
    }, ttl);
  }
  function resetNotices() {
    notices.replaceChildren();
  }

  // Teclas 1..3: seguir esa misión. El atajo vive aquí y no en main.js para
  // que la tecla y el rótulo que la anuncia no puedan desincronizarse.
  window.addEventListener("keydown", (e) => {
    if (!layer.classList.contains("live")) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 3) return;
    const ids = [...questRows.keys()];
    const id = ids[n - 1];
    if (!id) return;
    preferredId = preferredId === id ? null : id;
    window.__game?.engine?.game && (window.__game.engine.game.preferredObjectiveId = preferredId);
  });

  function renderPlate(state) {
    // Rombos: los que te QUEDAN, encendidos; los perdidos se apagan de uno
    // en uno. Contar de reojo, no leer.
    if (state.maxWarnings !== pipsMax) {
      pipsMax = state.maxWarnings;
      pipsRow.replaceChildren();
      pips = Array.from({ length: pipsMax }, () => el("span", "inc-plate-pip", pipsRow));
    }
    const left = Math.max(0, state.maxWarnings - state.warnings);
    pips.forEach((p, i) => p.classList.toggle("spent", i >= left));
    if (state.warnings !== lastWarnings) {
      if (lastWarnings >= 0 && state.warnings > lastWarnings) pulse(plate, "mi-shake", 420);
      lastWarnings = state.warnings;
    }

    // Ya no hay un % que enseñar aquí — quién sospecha lo dice SU PROPIO
    // globo, en el mundo. La placa solo reacciona a si la cosa está fea
    // AHORA (te buscan o te tienen), que sigue siendo información tuya.
    const chasing = state.bossState === "CHASE";
    const searching = state.bossState === "SEARCH";
    plate.classList.toggle("warn", searching);
    plate.classList.toggle("danger", chasing);
    plate.classList.toggle("mi-critical", chasing && !state.gameOver);
    // El sacudido marca la TRANSICIÓN a que alguien se puso a buscarte o
    // vino a por ti — no un pico de número que ya no se enseña.
    const hunted = chasing || searching;
    if (hunted && !lastHunted) pulse(plate, "mi-shake", 420);
    lastHunted = hunted;

    // La energía: llena es buena, así que avisa cuando BAJA. Y dormida lo
    // dice con todas las letras, porque es el único estado en el que los
    // mandos no responden y hay que saber que no es un cuelgue.
    const ePct = Math.round((state.energy / (state.energyMax || 100)) * 100);
    energyFill.style.width = `${ePct}%`;
    energyMeter.classList.toggle("warn", ePct <= 35 && ePct > 15);
    energyMeter.classList.toggle("danger", ePct <= 15);
    energyLabelPct.textContent = `${ePct}%`;
    energyLabelText.textContent = state.asleep ? "DORMIDA" : ePct <= 20 ? "SIN FUERZAS" : "ENERGÍA";
    energyMeter.classList.toggle("mi-critical", ePct <= 15 && !state.gameOver);

    // La cara sigue al PELIGRO, no a un número: reacciona a lo mismo que ya
    // enseña el globo de quien te ve (`redAlert`), no a una sospecha propia.
    if (state.asleep) setFaceMood("sad");
    else if (state.gameOver) setFaceMood(state.win ? "happy" : "sad");
    else if (chasing || searching) setFaceMood("scared");
    else if (state.redAlert || state.minionAlert) setFaceMood("surprised");
    else setFaceMood("happy");
  }

  function renderQuests(state) {
    const list = (state.objectives ?? []).filter((o) => !o.done).slice(0, 3);
    // Repliegue por TENSIÓN: alerta = solo títulos; persecución = solo la
    // seguida. Con el jefe detrás no se puede leer, así que hay menos que
    // leer. (Decisión de HUD.md §4bis.3.)
    const chase = state.bossState === "CHASE" || state.bossState === "SEARCH";
    const alert = state.heat >= 1 || chase;
    quests.classList.toggle("folded", alert && !chase);
    quests.classList.toggle("chase", chase);

    const seen = new Set();
    list.forEach((o, i) => {
      seen.add(o.id);
      let row = questRows.get(o.id);
      if (!row) {
        const node = el("div", "inc-quest", quests);
        const key = el("span", "inc-quest-key", node, String(i + 1));
        const main = el("div", "inc-quest-main", node);
        const title = el("div", "inc-quest-title", main, o.label);
        const bar = el("div", "inc-quest-bar", main);
        const fill = el("i", null, bar);
        const side = el("div", "inc-quest-side", node);
        const dist = el("span", "inc-quest-dist", side);
        const badge = el("span", "inc-quest-badge", side);
        badge.appendChild(iconEl(o.icon || "star"));
        row = { node, key, title, bar, fill, dist };
        questRows.set(o.id, row);
      }
      row.key.textContent = String(i + 1);
      row.title.textContent = o.label;
      // "cómo" (con gente) contra "qué" (a solas): el color de la fila lo
      // dice sin etiqueta, igual que la referencia distingue main de sub.
      row.node.classList.toggle("q-como", o.kind === "como");
      // La misión del guardián no tiene sitio fijo: su objetivo es el JEFE,
      // que se mueve. Sin esta rama salía "NaN m".
      const d = Number.isFinite(o.x)
        ? Math.hypot(o.x - state.playerPos.x, o.z - state.playerPos.z) / state.worldScale
        : state.bossDistance / state.worldScale;
      row.dist.textContent = `${Math.round(d)} m`;
      const running = state.currentAction?.stationId === o.id || (o.progress > 0 && o.progress < 1);
      row.bar.classList.toggle("on", !!running || o.progress > 0);
      row.fill.style.width = `${Math.round((o.progress ?? 0) * 100)}%`;
      const followed = preferredId ? preferredId === o.id : i === 0;
      row.node.classList.toggle("followed", followed);
      row.node.classList.toggle("only", chase && !followed);
    });
    for (const [id, row] of questRows) {
      if (!seen.has(id)) {
        // Cumplida: golpe de acento y fuera. La fila muere después de la
        // animación para que el hueco no salte de golpe.
        if (!row.node.classList.contains("done-out")) {
          row.node.classList.add("done-out", "mi-done");
          setTimeout(() => {
            row.node.remove();
          }, 650);
          questRows.delete(id);
          if (preferredId === id) preferredId = null;
        }
      }
    }
  }

  function renderClock(state) {
    const leftS = Math.max(0, Math.round(state.timeLeft));
    const mins = Math.floor(leftS / 60);
    const secs = String(leftS % 60).padStart(2, "0");
    const [dayTime = "—", ...suffix] = String(state.currentTime ?? "—").split(" ");
    clockLabel.innerHTML =
      `<span class="inc-clockwidget-time">${dayTime}` +
      `<i class="inc-clockwidget-suffix">${suffix.join(" ")}</i></span>` +
      `<span class="inc-bar-countdown">${mins}:${secs} de jornada</span>`;
    clockBtn.classList.toggle("warn", leftS <= 45 && leftS > 20);
    clockBtn.classList.toggle("danger", leftS <= 20);
    clockBtn.classList.toggle("mi-critical", leftS <= 20 && !state.gameOver);
    if (dayTime !== lastDayTime) {
      pulse(clockLabel.querySelector(".inc-clockwidget-time"), "mi-tick", 240);
      lastDayTime = dayTime;
    }
  }

  function renderZone(state) {
    const name = state.area?.name ?? null;
    if (name && name !== zoneShown) {
      zoneShown = name;
      zone.textContent = name;
      zone.classList.add("show");
      clearTimeout(zoneTimer);
      zoneTimer = setTimeout(() => zone.classList.remove("show"), 2400);
    }
    if (!name) zoneShown = null;
  }

  return {
    root: layer,
    notify,
    resetNotices,
    closePanels() {},
    /** Modo partida: se enseña el estado. Fuera de partida, nada. */
    setLive(live) {
      layer.classList.toggle("live", !!live);
      if (live) {
        if (playerLook) setFaceMood(faceMood ?? "neutral");
        if (faceOn) face.start();
      } else {
        face.stop();
        zone.classList.remove("show");
        zoneShown = null;
      }
    },
    /** El personaje elegido puede cambiar entre partidas. */
    setPlayerLook(look) {
      playerLook = look;
      faceMood = null;
      if (layer.classList.contains("live") && look) {
        setFaceMood("neutral");
        if (faceOn) face.start();
      }
    },
    render(state) {
      if (!state) return;
      renderPlate(state);
      renderQuests(state);
      renderClock(state);
      renderZone(state);
      renderPulse(state);
      renderAction(state);
    },
  };
}
