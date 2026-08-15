import { iconEl } from "./icons.js";
import { createMessageDirector, URGENCIA } from "./messages.js";
import { createPortrait3D } from "./portrait3d.js";
// La proyección de suelo → pantalla, la MISMA que usan los mandos y la
// flecha del rastreador: así el «hacia allá» de la lista y el «hacia allá»
// de caminar no pueden decir cosas distintas.
import { groundToScreen } from "../scene/iso.js";

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

  // LO QUE LLEVAS ENCIMA. Va en la placa porque es parte de "cómo estoy yo",
  // igual que las amonestaciones y la energía: lo que llevas cambia lo rápido
  // que te fichan al pasar. Sin enseñarlo, el camuflaje sería una estadística
  // oculta — se notaría que a veces te fichan antes y nunca se sabría por qué.
  // Vacía no ocupa: la fila entera se esconde cuando no llevas nada.
  const carryRow = el("div", "inc-plate-carry", plateBody);

  // La cara viva. Dibuja SIEMPRE durante la partida (no solo en diálogo):
  // es un render extra pequeño (128px) y es lo que hace que la placa sea un
  // personaje y no un icono. Si no hay WebGL para el segundo contexto, la
  // placa sigue funcionando sin cara.
  const face = createPortrait3D(faceHost, { framing: "face" });
  let faceOn = false;
  // Firma de lo que llevabas la última vez, para no rehacer la fila por frame.
  let lastCarry = null;
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

  // ── EL ANUNCIO GRANDE (estilo "¡RANGER PELIGROSO!") ───────────────────
  // Texto enorme centrado con contorno, para los golpes que hay que leer
  // sin buscarlos: te vieron, amonestación, te falta el objeto, tarea
  // lista. Lo alimenta game.announce() vía el snapshot (bigMessage); aquí
  // solo se pinta — una sola verdad, como todo lo demás.
  // Los DOS CARRILES salen de `ui/messages.js`, que es quien decide qué se ve
  // y dónde. Antes esto pintaba el anuncio por su cuenta y las tarjetas por
  // otra, y ninguno sabía del otro (ni de la lista de misiones, que ocupa la
  // misma esquina). La regla, en un sitio: lo urgente al CENTRO, lo demás AL
  // LADO.
  const mensajes = createMessageDirector(layer, iconEl);
  let announceKey = null;
  let toastKey = null;

  function renderAnnounce(state) {
    // ANUNCIO GRANDE: urgencia máxima, va al centro. Detección de flanco por
    // `key` — el snapshot lo trae como ESTADO con temporizador, así que sin
    // la llave se re-dispararía en cada cuadro.
    const m = state.bigMessage;
    if (m && m.key !== announceKey) {
      announceKey = m.key;
      mensajes.post({
        text: m.text,
        tone: m.tone ?? "danger",
        urgencia: URGENCIA.URGENTE,
      });
    } else if (!m) {
      announceKey = null;
    }

    // TOAST: por defecto es ambiente y se va al lado. Solo sube al centro si
    // quien lo lanzó lo marcó como urgente (`game.toast(txt, URGENCIA...)`).
    const t = state.message;
    if (t && t.key !== toastKey) {
      toastKey = t.key;
      mensajes.post({
        text: t.text,
        tone: t.tone ?? "info",
        urgencia: t.urgencia ?? URGENCIA.AMBIENTE,
      });
    } else if (!t) {
      toastKey = null;
    }
  }

  // ── EL PULSO DE LA ACTIVIDAD ──────────────────────────────────────────
  // Una TIRA FINA y baja, no un panel: esto se juega con el jefe encima y el
  // escenario tiene que seguir viéndose (game/activityGame.js explica por qué
  // el mundo no se pausa). Va centrada abajo, justo donde ya está mirando
  // quien acaba de pulsar el botón de acción.
  // ── LA PANTALLA DE LA TAREA ───────────────────────────────────────
  // Los tres verbos (pulso, caña, chisme) se juegan A PANTALLA COMPLETA.
  // Vivían en tiras pegadas al borde de abajo, y ahí un minijuego no se
  // siente como un minijuego: se siente como un medidor más del HUD.
  //
  // PERO tapar el piso trae un problema que hay que resolver, no ignorar:
  // el mundo NO se pausa (eso fue el bug que rompía la captura), así que
  // Gabo sigue viniendo mientras juegas — y ahora no lo puedes VER llegar.
  // Por eso el peligro entra DENTRO de la pantalla: quién viene, cómo de
  // cerca está, y con qué se sale. Sin eso, pantalla completa sería
  // capturarte a ciegas, que es peor que congelar el mundo.
  const mg = el("div", "inc-mg", layer);
  const mgTop = el("div", "inc-mg-top", mg);
  const mgTitulo = el("b", "inc-mg-titulo", mgTop);
  const mgSalir = el("span", "inc-mg-salir", mgTop);
  mgSalir.textContent = "SUELTA PARA DEJARLO";
  const mgBody = el("div", "inc-mg-body", mg);
  // EL ACECHO: la mitad del juego que ya no se ve. Es una barra que se llena
  // según se acerca, no un número: con el jefe encima nadie lee un número.
  const mgAcecho = el("div", "inc-mg-acecho", mg);
  const mgAcechoTexto = el("span", "inc-mg-acecho-texto", mgAcecho);
  const mgAcechoBarra = el("div", "inc-mg-acecho-barra", mgAcecho);
  const mgAcechoFill = el("i", null, mgAcechoBarra);

  // ── LOS VASOS (minijuego de VERTER) ───────────────────────────────
  // El primero que se juega con el PUNTERO: clic en un ordenador, dedo en un
  // teléfono, y 1-4 en el teclado para quien prefiera teclas. Las tres
  // entradas acaban en la misma llamada (`pourGame.elegir(i)`), así que no
  // hay tres juegos que mantener — hay uno con tres mandos.
  //
  // Los vasos son nodos del DOM con su `click`, no un canvas: así el toque
  // funciona igual en móvil sin escribir nada de táctil, y cada vaso puede
  // tener foco y estados de CSS como cualquier otro pulsable del juego.
  const vasosWrap = el("div", "inc-vasos", mgBody);
  const vasosVerbo = el("div", "inc-vasos-verbo", vasosWrap);
  const vasosFila = el("div", "inc-vasos-fila", vasosWrap);
  let vasosFirma = null;
  let vasosNodos = [];

  // LA TARJETA DEL CHISME, ya dentro de la pantalla de la tarea. Es la única
  // pieza del juego que pide LEER un párrafo, y por eso mismo el jefe sigue
  // caminando mientras lees: quedarse es una decisión, no un trámite.
  const chismeCard = el("div", "inc-chisme", mgBody);
  const chismeHead = el("div", "inc-chisme-head", chismeCard);
  const chismeTitular = el("span", "inc-chisme-titular", chismeHead);
  const chismePips = el("span", "inc-chisme-pips", chismeHead);
  const chismeTexto = el("p", "inc-chisme-texto", chismeCard);
  const chismePregunta = el("p", "inc-chisme-pregunta", chismeCard);
  const chismeOpts = el("div", "inc-chisme-opts", chismeCard);
  let chismeFirma = null;

  const pulseBar = el("div", "inc-pulse", mgBody);
  const pulseZone = el("i", "inc-pulse-zone", pulseBar);
  const pulseMark = el("i", "inc-pulse-mark", pulseBar);
  const pulsePips = el("div", "inc-pulse-pips", pulseBar);
  // La cuenta "3/6" al lado de los puntos: los puntos se sienten, la cifra
  // se LEE — y la queja de fondo era que no se entendía cuánto faltaba.
  const pulseCount = el("span", "inc-pulse-count", pulseBar);
  // EL VEREDICTO. A pantalla completa, un acierto y un fallo que solo cambian
  // un puntito en una esquina son un minijuego mudo: esto es lo que hace que
  // tocar se sienta, y el «PERFECTO» es la razón por la que se vuelve a tocar.
  const pulseVeredicto = el("b", "inc-pulse-veredicto", pulseBar);
  // La regla del minijuego, escrita UNA vez encima de la tira las primeras
  // veces que se enciende. Sin esto, la tira era un adorno misterioso: nadie
  // sabía que tocar al ritmo acelera ni que fallar hace ruido. Después
  // desaparece — con el jefe detrás nadie lee (el mismo principio del
  // repliegue de la lista).
  el(
    "div",
    "inc-pulse-hint",
    pulseBar,
    "MANTÉN espacio: avanza · SUELTA y TOCA en la ZONA CLARA: avanza rápido · fuera: RUIDO"
  );
  let pulseHits = -1;
  let pulseWasOn = false;
  let pulseShows = 0;

  function renderPantalla(state) {
    // La pantalla se abre si hay CUALQUIER verbo en marcha. Uno solo a la
    // vez, siempre: lo garantiza el motor (chisme > caña > pulso).
    const jugando = !!(state.chisme || state.gesture || state.pulse || state.verter);
    // EL PUNTERO SOLO SE ENCIENDE PARA LOS MINIJUEGOS QUE LO USAN. La
    // pantalla es `pointer-events: none` por defecto — un panel a pantalla
    // completa que se coma los clics rompería la cámara y los menús. Con
    // vasos en marcha hay que poder tocarlos, así que se abre solo entonces.
    mg.classList.toggle("puntero", !!state.verter);
    mg.classList.toggle("on", jugando);
    // El <body> lo marca para que la píldora de mandos y el resto de la
    // banda de abajo se aparten, igual que ya hacían con la acción.
    document.body.classList.toggle("inc-minijuego", jugando);
    if (!jugando) return;

    mgTitulo.textContent =
      state.verter?.label ?? state.chisme?.label ?? state.gesture?.label ?? state.pulse?.label ?? "TAREA";

    // ── EL ACECHO ──
    // Con el piso tapado, esto ES el piso: quién viene y cómo de cerca.
    // Barra y no número — con el jefe encima nadie lee un número.
    const a = state.acecho;
    if (!a) {
      mgAcecho.classList.remove("on");
      return;
    }
    mgAcecho.classList.add("on");
    // 14 unidades de plano es "al otro lado del piso"; 2, encima de ti.
    const cerca = Math.max(0, Math.min(1, 1 - (a.dist - 2) / 12));
    mgAcechoFill.style.width = `${Math.round(cerca * 100)}%`;
    const nivel = a.cazando ? "caza" : cerca > 0.6 ? "cerca" : cerca > 0.25 ? "ronda" : "lejos";
    mgAcecho.dataset.nivel = nivel;
    mgAcechoTexto.textContent =
      nivel === "caza"
        ? `¡${a.nombre.toUpperCase()} VIENE A POR TI!`
        : nivel === "cerca"
          ? `${a.nombre.toUpperCase()} está aquí al lado`
          : nivel === "ronda"
            ? `${a.nombre.toUpperCase()} anda cerca`
            : `${a.nombre.toUpperCase()} está lejos`;
  }

  function renderVasos(state) {
    const v = state.verter;
    vasosWrap.classList.toggle("on", !!v);
    if (!v) {
      vasosFirma = null;
      return;
    }
    vasosVerbo.textContent = v.verbo;
    // La estructura se rehace solo si cambia el CONTENIDO de los vasos. Las
    // capas son nodos y rehacerlas por cuadro es tirar DOM a la basura
    // sesenta veces por segundo para pintar lo mismo.
    const firma = v.vasos.map((g) => g.join(",")).join("|");
    if (firma !== vasosFirma) {
      vasosFirma = firma;
      vasosFila.textContent = "";
      vasosNodos = v.vasos.map((capas, i) => {
        const vaso = el("button", "inc-vaso", vasosFila);
        vaso.type = "button";
        // El número es el atajo de teclado Y la etiqueta accesible: quien
        // juega con teclas ve exactamente qué pulsar.
        vaso.dataset.n = String(i + 1);
        vaso.setAttribute("aria-label", `Vaso ${i + 1}`);
        const dentro = el("span", "inc-vaso-dentro", vaso);
        // De abajo arriba: es como se llena un vaso de verdad.
        for (const color of capas) {
          const capa = el("i", "inc-vaso-capa", dentro);
          capa.dataset.color = color;
        }
        vaso.addEventListener("click", () => {
          window.__game?.engine?.game?.verter?.elegir(i);
        });
        return vaso;
      });
    }
    // Lo que SÍ va por cuadro: quién está levantado y el destello del último
    // trasvase. Son dos clases, no nodos.
    vasosNodos.forEach((nodo, i) => {
      nodo.classList.toggle("elegido", v.elegido === i);
      nodo.classList.toggle("ok", v.destello?.tipo === "vertido" && v.destello.vaso === i);
      nodo.classList.toggle("mal", v.destello?.tipo === "ilegal" && v.destello.vaso === i);
    });
  }

  function renderChisme(state) {
    const c = state.chisme;
    chismeCard.classList.toggle("on", !!c);
    if (!c) {
      chismeFirma = null;
      return;
    }
    // Se redibuja solo al CAMBIAR de ficha: son tres botones y dos párrafos,
    // y rehacerlos sesenta veces por segundo para pintar lo mismo es tirar
    // DOM a la basura. La firma incluye los aciertos para que el contador
    // se refresque al responder.
    const firma = `${c.titular}|${c.pregunta}|${c.aciertos}`;
    if (firma !== chismeFirma) {
      chismeFirma = firma;
      chismeTitular.textContent = c.titular;
      chismePips.textContent = `${c.aciertos}/${c.necesarios}`;
      chismeTexto.textContent = c.texto;
      chismePregunta.textContent = c.pregunta;
      chismeOpts.textContent = "";
      c.opciones.forEach((texto, i) => {
        const b = el("span", "inc-chisme-opt", chismeOpts);
        el("b", null, b).textContent = String(i + 1);
        el("span", null, b).textContent = texto;
      });
    }
    // El destello de acierto/fallo sí va por cuadro: es lo que hace que
    // responder se SIENTA. Sin él, acertar y fallar se ven igual.
    chismeCard.classList.toggle("ok", c.resultado === "acierto");
    chismeCard.classList.toggle("bad", c.resultado === "fallo");
  }

  function renderPulse(state) {
    const p = state.pulse;
    pulseBar.classList.toggle("on", !!p);
    if (!!p && !pulseWasOn) {
      pulseShows += 1;
      // La regla se enseña las primeras CINCO veces: tres se quedaban
      // cortas — quien probó el juego seguía sin saber qué hacía la tira.
      pulseBar.classList.toggle("hint", pulseShows <= 5);
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
    // El veredicto se pinta por cuadro: es un destello y tiene que morir
    // solo. Su texto sale del módulo, que es quien sabe si fue justo en el
    // centro de la zona o de refilón.
    pulseVeredicto.dataset.v = p.veredicto ?? "";
    pulseVeredicto.textContent =
      p.veredicto === "perfecto" ? "¡PERFECTO!" : p.veredicto === "bien" ? "BIEN" : p.veredicto === "fallo" ? "FALLASTE" : "";

    if (p.aciertos !== pulseHits) {
      pulseHits = p.aciertos;
      pulseCount.textContent = `${p.aciertos}/${p.necesarios}`;
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
  // AHORA VIVE DENTRO DE LA PANTALLA DE LA TAREA (`.inc-mg`), a pantalla
  // completa. Durante mucho tiempo estuvo aquí escrito lo contrario —«primer
  // plano NO es pantalla completa»— porque tapar el piso quitaba la mitad
  // del juego. Eso sigue siendo cierto, y por eso la pantalla trae EL ACECHO
  // dentro: el mundo no se pausa, así que hay que poder leer quién viene sin
  // ver el piso. Lo que no se puede es congelar al jefe, que es lo que de
  // verdad convertía las estaciones en el sitio más seguro de la planta.
  //
  // El pulso y el gesto son excluyentes, así que comparten sitio sin pelearse.
  const action = el("div", "inc-action", mgBody);
  const actionClock = el("div", "inc-action-clock", action);
  const actionClockFill = el("i", "inc-action-clock-fill", actionClock);
  const actionBody = el("div", "inc-action-body", action);
  const actionIcon = el("span", "inc-action-icon", actionBody);
  const actionText = el("div", "inc-action-text", actionBody);
  const actionVerb = el("b", "inc-action-verb", actionText);
  const actionLabel = el("span", "inc-action-label", actionText);
  // ── LA CAÑA ───────────────────────────────────────────────────────
  // El gesto SIEMPRE fue una barra de pesca por dentro: hay algo que se te
  // escapa (la zona) y una barra que tú mueves (el valor), y mientras se
  // solapan la captura avanza. Lo que faltaba era que se VIERA así.
  //
  // Era una tira fina con una banda de color y una rayita de 5px. Se
  // entendía «hay que poner la raya ahí» y nada más: sin barra que se llene,
  // sostener no daba ninguna respuesta inmediata y se sostenía a ciegas.
  // Ahora el que se escapa lleva ICONO, la barra que mueves tiene cuerpo, y
  // al lado va el CARRETE, que sube mientras aciertas — la lectura de un
  // minijuego de pesca de toda la vida, que es la gracia de usar uno.
  const actionTrack = el("div", "inc-action-track", actionBody);
  const actionZone = el("i", "inc-action-zone", actionTrack);
  const actionZoneIcon = el("span", "inc-action-zone-icon", actionZone);
  const actionKnob = el("i", "inc-action-knob", actionTrack);
  const actionReel = el("div", "inc-action-reel", actionBody);
  const actionReelFill = el("i", null, actionReel);
  let actionZoneIconName = null;
  const actionCount = el("span", "inc-action-count", actionBody);
  let actionIconName = null;

  function renderAction(state) {
    const g = state.gesture;
    const d = state.deadline;
    // El AGUANTE también se enseña aquí: la fase de sostener una actividad
    // encendida era INVISIBLE (solo la barrita de la misión, arriba, a un
    // palmo de donde miras) y parecía que soltar o seguir daba igual. Ahora
    // la misma tarjeta de acción dice AGUANTA, cuánto llevas y cuánto falta.
    const a = !g && !d ? state.aguantando : null;
    const on = !!(g || d || a);
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
    const icon = g?.icon ?? a?.icon ?? "clock";
    if (icon !== actionIconName) {
      actionIconName = icon;
      actionIcon.replaceChildren(iconEl(icon));
    }
    actionVerb.textContent = g?.verbo ?? (a ? "AGUANTA: cada segundo paga más reloj" : "Termina antes de que te vean");
    actionLabel.textContent = g?.label ?? d?.label ?? a?.label ?? "";

    if (a) {
      // El aguante reutiliza la barra de cuenta atrás, pero LLENÁNDOSE: es
      // un premio que crece, no un plazo que se agota.
      actionClock.classList.add("on");
      actionClockFill.style.width = `${Math.min(100, (a.aguante / a.max) * 100)}%`;
      actionCount.textContent = `${Math.round(a.aguante)}s`;
      action.classList.remove("urge", "loud");
      actionTrack.classList.remove("on");
      actionReel.classList.remove("on", "in");
      return;
    }

    actionTrack.classList.toggle("on", !!g);
    if (g) {
      actionTrack.dataset.eje = g.eje;
      // El eje "y" se pinta de abajo arriba (0 abajo), que es como se lee un
      // volumen; el "x", de izquierda a derecha.
      const zoneStart = `${Math.max(0, (g.zonaAt - g.zona / 2) * 100)}%`;
      const zoneSize = `${g.zona * 100}%`;
      if (g.eje === "x") {
        actionZone.style.cssText = `left:${zoneStart};width:${zoneSize};top:0;bottom:0`;
        actionKnob.style.cssText = `left:${g.valor * 100}%;top:-4px;bottom:-4px;width:14px;margin-left:-7px`;
      } else {
        actionZone.style.cssText = `bottom:${zoneStart};height:${zoneSize};left:0;right:0`;
        actionKnob.style.cssText = `bottom:${g.valor * 100}%;left:-4px;right:-4px;height:14px;margin-bottom:-7px`;
      }
      // EL QUE SE ESCAPA lleva la cara de la tarea: el volumen de la peli, la
      // taza que se enfría. Es lo que convierte «pon la raya en la banda» en
      // «no se te escape ESTO».
      if (g.icon !== actionZoneIconName) {
        actionZoneIconName = g.icon;
        actionZoneIcon.replaceChildren(iconEl(g.icon));
      }
      actionTrack.classList.toggle("in", g.dentro);
      // EL CARRETE: lo pescado hasta ahora. Sin esto, sostener bien y
      // sostener mal se ven igual hasta que la tarea termina sola.
      actionReel.classList.add("on");
      actionReelFill.style.height = `${Math.round((g.progreso ?? 0) * 100)}%`;
      actionReel.classList.toggle("in", g.dentro);
      // DELATADA: el valor está en el extremo y te están oyendo. Es el único
      // estado del panel que grita, porque es el único que cuesta sospecha
      // cada segundo que lo dejes así.
      action.classList.toggle("loud", g.delatada);
    } else {
      action.classList.remove("loud");
      actionReel.classList.remove("on", "in");
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
  // `notify()` mantiene su firma —engine.js la llama— pero ya no pinta en la
  // esquina de las misiones: entra por el MISMO carril lateral que todo lo
  // ambiente. Un solo sitio decide dónde va cada cosa.
  function notify({ icon = "alert", text = "", tone = "info" } = {}) {
    mensajes.post({ text, tone, icon, urgencia: URGENCIA.AVISO });
  }
  function resetNotices() {
    mensajes.reset();
  }

  // Teclas 1..3: seguir esa misión. El atajo vive aquí y no en main.js para
  // que la tecla y el rótulo que la anuncia no puedan desincronizarse.
  window.addEventListener("keydown", (e) => {
    if (!layer.classList.contains("live")) return;
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > 5) return;
    // MIENTRAS HAY UN CHISME ABIERTO, 1–3 SON LAS RESPUESTAS. Es la misma
    // tecla y eso es a propósito: no hay un mando nuevo que aprender con el
    // jefe caminando hacia ti, y el número que se lee en la tarjeta es el
    // que ya sabes pulsar de la lista de misiones. Fuera del chisme vuelven
    // a seguir una misión, como siempre.
    const g = window.__game?.engine?.game;
    // CON VASOS EN MARCHA, 1-4 ELIGEN VASO. Es el mismo criterio que el
    // chisme: no se aprende un mando nuevo con el jefe caminando hacia ti, y
    // el número que se lee en el vaso es el que ya sabes pulsar. El ratón y
    // el dedo hacen exactamente lo mismo por otra puerta.
    if (g?.verter?.active) {
      g.verter.elegir(n - 1);
      return;
    }
    if (g?.chisme?.active) {
      g.chisme.responder(n - 1);
      return;
    }
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

    // LO QUE LLEVAS: icono + qué te hace. Se redibuja solo cuando CAMBIA la
    // lista — es una fila de nodos con un `<svg>` dentro y rehacerla cada
    // cuadro es tirar DOM a la basura sesenta veces por segundo para pintar
    // exactamente lo mismo.
    const llevado = state.llevado ?? [];
    const firma = llevado.map((it) => it.id).join("|");
    if (firma !== lastCarry) {
      lastCarry = firma;
      carryRow.textContent = "";
      for (const it of llevado) {
        const chip = el("span", "inc-plate-carry-item", carryRow);
        // Frío o caliente: el color lo pone la clase, nunca un valor crudo.
        chip.classList.add(it.sospecha < 1 ? "cool" : it.sospecha > 1 ? "hot" : "flat");
        chip.appendChild(iconEl(it.icon));
        el("span", null, chip).textContent = it.nombre;
      }
      carryRow.classList.toggle("on", llevado.length > 0);
    }

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
        // LA GUÍA: el siguiente paso de ESTA misión, con todas las letras.
        // Solo la fila seguida la enseña (ver abajo) — es la mano que
        // lleva, no tres párrafos compitiendo.
        const guide = el("div", "inc-quest-guide", main);
        const bar = el("div", "inc-quest-bar", main);
        const fill = el("i", null, bar);
        const side = el("div", "inc-quest-side", node);
        // LA AGUJA: hacia dónde queda, no solo cuán lejos. Un «17 m» sin
        // rumbo obliga a dar vueltas para descubrir por dónde; con la
        // flecha, la lista dice ADÓNDE IR de un vistazo — que es lo que se
        // le pide a una lista de tareas en un piso de dos alas.
        const aguja = el("span", "inc-quest-aguja", side);
        aguja.appendChild(iconEl("aguja"));
        const dist = el("span", "inc-quest-dist", side);
        const badge = el("span", "inc-quest-badge", side);
        badge.appendChild(iconEl(o.icon || "star"));
        row = { node, key, title, guide, bar, fill, dist, aguja };
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

      // EL RUMBO, en coordenadas de PANTALLA. La misma proyección que usan
      // los mandos (`groundToScreen`), así que la flecha apunta a donde de
      // verdad hay que empujar el stick — con una conversión propia, «allá»
      // y «camina allá» acabarían discrepando en cuanto alguien girase la
      // cámara. La aguja de Phosphor mira hacia ARRIBA en su forma
      // original, así que el ángulo se aplica tal cual.
      const tx = Number.isFinite(o.x) ? o.x : state.bossPos.x;
      const tz = Number.isFinite(o.x) ? o.z : state.bossPos.z;
      const s = groundToScreen(tx - state.playerPos.x, tz - state.playerPos.z);
      // +45°: la aguja de Phosphor (`navigation-arrow-fill`) apunta al
      // NOROESTE en su forma original, no al norte — su vértice agudo cae
      // arriba a la izquierda del lienzo. Sin compensarlo, todas las
      // flechas señalaban 45° a la izquierda de donde debían, que es el
      // tipo de error que se ve «casi bien» y manda a la gente a la
      // pared de al lado.
      const rumbo = Math.atan2(s.right, s.up) * (180 / Math.PI) + 45;
      row.aguja.style.transform = `rotate(${rumbo.toFixed(1)}deg)`;
      // Encima: cuando ya estás dentro del radio de interacción no hay
      // rumbo que dar, y una flecha girando como loca a un metro del sitio
      // es ruido. Se apaga y manda la medalla.
      row.aguja.classList.toggle("cerca", d < 1.5);

      // ── LA BARRA DE PROGRESO, QUE ESTABA MINTIENDO ────────────────────
      // `o.progress` va de 0 a `o.time` en SEGUNDOS (game.js), pero esto
      // hacía `progress * 100` como si fuera una fracción 0–1: en una
      // tarea de 6 s la barra marcaba 100 % al primer segundo y se
      // quedaba llena el resto. Por eso no se entendía qué era — no
      // informaba de nada, solo aparecía llena. Ahora es la fracción de
      // verdad, y solo se enseña con la tarea EN MARCHA (si no, una barra
      // a cero en cada fila es ruido permanente).
      const total = o.time || 1;
      const frac = Math.max(0, Math.min(1, (o.progress ?? 0) / total));
      const running = state.currentAction?.stationId === o.id || frac > 0;
      row.bar.classList.toggle("on", !!running && frac > 0 && frac < 1);
      row.fill.style.width = `${Math.round(frac * 100)}%`;
      const followed = preferredId ? preferredId === o.id : i === 0;
      row.node.classList.toggle("followed", followed);
      row.node.classList.toggle("only", chase && !followed);
      // La guía viene del snapshot (game._guiaSeguida) atada por id: solo
      // se pinta en la fila que corresponde, y solo si está seguida.
      const guia = followed && state.guia?.id === o.id ? state.guia.text : "";
      if (row.guide.textContent !== guia) row.guide.textContent = guia;
      row.guide.classList.toggle("on", !!guia);
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
    renderChisme(state);
    renderVasos(state);
    renderPantalla(state);
      renderAction(state);
      renderAnnounce(state);
    },
  };
}
