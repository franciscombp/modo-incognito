/**
 * EL CURSOR — un solo navegador para TODO lo que se elige.
 *
 * ── Por qué existe ──
 *
 * Cada pantalla resolvía su entrada por su cuenta: los menús con el ratón,
 * el diálogo con el ratón, la tarjeta del chisme con las teclas 1-3 y nada
 * más. El resultado era que el examen del Parce no se podía contestar ni
 * con el dedo (sus opciones eran `<span>`, y encima la pantalla del
 * minijuego es `pointer-events: none`) ni con nada que no fuera un número,
 * y que un mando físico no servía para nada fuera de caminar.
 *
 * Un juego se tiene que poder jugar ENTERO con un solo mando. Este módulo
 * es ese contrato: haya lo que haya abierto —un menú, un diálogo, la
 * tarjeta de una pregunta—, hay UN cursor, se mueve con las flechas, con la
 * cruceta o con la palanca, y se acepta con Enter, con espacio o con el
 * botón de abajo.
 *
 * ── Cómo elige a quién mandar ──
 *
 * No hay registro que mantener: se busca en el DOM, por ORDEN DE PRIORIDAD,
 * el primer grupo que esté visible y tenga algo pulsable. Lo que está
 * encima manda. Así, una pantalla nueva no tiene que enterarse de que esto
 * existe — le basta con tener botones, como ya los tiene.
 *
 * ── Las tres reglas ──
 *
 * 1. SI NO HAY GRUPO ABIERTO, ESTO NO EXISTE. Ni se traga una tecla ni
 *    mueve nada: durante la partida las flechas y el mando son de caminar.
 * 2. NO SUSTITUYE AL RATÓN NI A LOS ATAJOS. Se suma. Las teclas 1-3 de la
 *    tarjeta del chisme siguen ahí, porque con el jefe encima es más rápido
 *    pulsar el número que se lee que pasear un cursor.
 * 3. EL CURSOR NO SE PIERDE. Al abrirse un grupo se posa en el primero, y
 *    al cambiar el contenido se re-posa — un cursor apuntando a un botón
 *    que ya no está es peor que no tener cursor.
 */

// Los grupos, de más prioritario a menos. El primero que esté a la vista y
// tenga algo pulsable se queda con el mando.
const GRUPOS = [
  ".inc-mg.on", // un minijuego a pantalla completa
  ".inc-dialogue-options:not(.hidden)", // las opciones de una conversación
  ".inc-course.on", // el curso de RRHH
  ".inc-review.on, .inc-levelling.on, .inc-retirement.on",
  ".inc-menu:not(.inc-hidden)", // título, ajustes, pausa, hoja de vida
];

// Cuánto hay que empujar la palanca para que cuente como un paso, y cuánto
// se espera antes de repetir. Sin la zona muerta, una palanca que descansa
// un poco descentrada pasea el cursor sola; sin la espera, un empujón
// recorre doce opciones antes de que te dé tiempo a soltarla.
const ZONA_MUERTA = 0.55;
const REPETIR_PRIMERO = 0.42;
const REPETIR_LUEGO = 0.14;

/** Los botones de un mando estándar que valen como «aceptar» y «volver». */
const BOTON_ACEPTAR = [0, 2]; // A / X en la mayoría de mandos
const BOTON_VOLVER = [1, 3];
const CRUCETA = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };

function visible(nodo) {
  if (!nodo) return false;
  const r = nodo.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const s = getComputedStyle(nodo);
  return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
}

export function createFocusNav({ root = document } = {}) {
  let cursor = null;
  let grupo = null;
  let repetirEn = 0;
  let ultimoEje = 0;
  let botonesAntes = new Set();

  /** Lo pulsable de un grupo, en el orden en que se ve. */
  function opciones(g) {
    // `[data-nav-off]` saca a una pieza entera del cursor. Existe por el
    // baile: sus cuatro casillas son botones (para que el dedo valga), pero
    // ahí una flecha es un PASO DE BAILE, no «la opción de al lado».
    const lista = [...g.querySelectorAll("button, [data-nav]")].filter(
      (b) =>
        !b.disabled &&
        b.getAttribute("aria-hidden") !== "true" &&
        !b.closest("[data-nav-off]") &&
        visible(b)
    );
    // `[data-nav-ultimo]` va AL FINAL de la lista, no fuera de ella. Existe
    // por el botón de SALIR de un minijuego: está antes que nada en el DOM
    // (vive en la barra de arriba), así que el cursor se posaba ahí al abrir
    // la pantalla — y con la tarjeta del examen delante, Enter cerraba el
    // minijuego en vez de responder la pregunta. Sigue siendo alcanzable,
    // pero deja de ser lo primero.
    lista.sort(
      (a, b) => (a.hasAttribute("data-nav-ultimo") ? 1 : 0) - (b.hasAttribute("data-nav-ultimo") ? 1 : 0)
    );
    return lista;
  }

  /** El grupo que manda AHORA, o null si no hay ninguno abierto. */
  function grupoActivo() {
    for (const sel of GRUPOS) {
      for (const nodo of root.querySelectorAll(sel)) {
        if (!visible(nodo)) continue;
        // UNA PANTALLA QUE SE JUEGA CON DIRECCIONES NO ES UN MENÚ. El baile
        // marca su pantalla con `data-nav-juego` y el cursor la deja EN PAZ:
        // aquí una flecha es un paso, la palanca es un paso, y el botón de
        // acción no puede ser «aceptar» — su única opción navegable es
        // SALIR, así que en un teléfono el primer toque del botón CERRABA
        // el minijuego. El dedo sigue pudiendo tocar los botones de la
        // pantalla directamente (`pointer-events` los cubre); lo que se
        // apaga es el cursor.
        if (nodo.hasAttribute("data-nav-juego")) continue;
        if (opciones(nodo).length) return nodo;
      }
    }
    return null;
  }

  // El último elemento MARCADO, aparte del cursor: al cerrarse un grupo su
  // lista deja de ser alcanzable, y limpiar solo «lo que hay en la lista»
  // dejaba el aro dibujado sobre un botón de un menú ya cerrado, esperando
  // a que alguien pulsara Enter encima.
  let marcado = null;
  // ¿Ha movido ALGUIEN el cursor en este grupo? Ver `onKey`: hasta que no lo
  // muevas, Enter no es de aquí.
  let movido = false;
  function pintar(lista) {
    if (marcado && marcado !== cursor) marcado.classList.remove("nav-cursor");
    lista.forEach((b) => b.classList.toggle("nav-cursor", b === cursor));
    marcado = cursor;
  }

  /** Re-posa el cursor: al abrirse un grupo, y si su contenido cambió. */
  function sincronizar() {
    const g = grupoActivo();
    if (g !== grupo) {
      grupo = g;
      cursor = null;
      movido = false;
    }
    if (!grupo) {
      marcado?.classList.remove("nav-cursor");
      cursor?.classList.remove("nav-cursor");
      marcado = null;
      cursor = null;
      return null;
    }
    const lista = opciones(grupo);
    if (!lista.includes(cursor)) cursor = lista[0] ?? null;
    pintar(lista);
    return lista;
  }

  function mover(dx, dy) {
    const lista = sincronizar();
    if (!lista?.length) return false;
    // Se navega por GEOMETRÍA, no por orden en el DOM: una fila de tres
    // opciones y una columna de tres se escriben igual en el HTML, y con
    // orden de DOM la flecha derecha no haría nada en la fila. Se busca el
    // candidato más cercano en la dirección que se pidió.
    const r0 = cursor.getBoundingClientRect();
    const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
    let mejor = null;
    let mejorCoste = Infinity;
    for (const b of lista) {
      if (b === cursor) continue;
      const r = b.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const along = (c.x - c0.x) * dx + (c.y - c0.y) * dy;
      if (along <= 1) continue; // detrás o al lado: no es esa dirección
      const across = Math.abs((c.x - c0.x) * dy - (c.y - c0.y) * dx);
      const coste = along + across * 2.5;
      if (coste < mejorCoste) {
        mejorCoste = coste;
        mejor = b;
      }
    }
    // Sin nadie en esa dirección se da la vuelta por el orden del DOM: en un
    // menú de una columna, «abajo» en la última opción tiene que llevar a la
    // primera o el cursor se queda encallado en el borde.
    if (!mejor) {
      const i = lista.indexOf(cursor);
      const paso = dx + dy > 0 ? 1 : -1;
      mejor = lista[(i + paso + lista.length) % lista.length];
    }
    cursor = mejor;
    movido = true;
    pintar(lista);
    cursor.scrollIntoView?.({ block: "nearest" });
    return true;
  }

  function aceptar() {
    const lista = sincronizar();
    if (!lista?.length || !cursor) return false;
    cursor.click();
    return true;
  }

  function volver() {
    const lista = sincronizar();
    if (!lista?.length) return false;
    // ESCAPE es de cada pantalla, no de aquí: el minijuego lo usa para
    // soltar la tarea y el menú para cerrarse. Se reenvía y que lo recoja
    // quien sepa qué significa ahí.
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }

  // ── TECLADO ──────────────────────────────────────────────────────────
  // Las FLECHAS y no WASD: con un grupo abierto, WASD también valdría, pero
  // el mismo puñado de teclas sigue siendo el de caminar en cuanto se
  // cierra, y una tecla que hace dos cosas según lo que haya en pantalla es
  // exactamente el mando que nadie entiende.
  const FLECHAS = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  };
  // EN CAPTURA, y cortando el evento cuando lo usa. Dos razones, las dos
  // aprendidas a golpes:
  //  · `player.js` ya hace `preventDefault()` en las flechas para que la
  //    página no haga scroll, y se registra antes — mirando
  //    `defaultPrevented` esto no llegaba a moverse nunca.
  //  · Las flechas TAMBIÉN caminan. Con una tarjeta abierta, elegir una
  //    respuesta te sacaría andando del minijuego mientras la eliges.
  // En captura llegamos primero y decidimos: si hay algo que elegir, la
  // flecha es del cursor y no del pie.
  function onKey(e) {
    if (!grupoActivo()) return;
    const enTexto = /^(input|textarea|select)$/i.test(e.target?.tagName ?? "");
    if (enTexto) return;
    const dir = FLECHAS[e.key];
    if (dir) {
      if (!mover(dir[0], dir[1])) return;
    } else if (e.key === "Enter") {
      // ENTER ES DEL CURSOR SI ALGUIEN LO MOVIÓ… O SI NO HAY OTRA COSA QUE
      // PUEDA SER.
      //
      // Lo primero está para los MENÚS: varias pantallas le dan a Enter un
      // significado propio —en la de personaje es «entrar al juego», y lo
      // dice en pantalla— y quedárselo por el simple hecho de que haya un
      // grupo abierto rompía esa tecla sin avisar.
      //
      // Pero dentro de una tarjeta de minijuego el cursor es la ÚNICA forma
      // de elegir, y ahí exigir un movimiento previo es una trampa: si la
      // opción que quieres es la primera —donde el cursor se posa solo— no
      // hay nada que mover, y Enter no hacía nada. Y como la ficha del
      // chisme sale al azar, fallaba una de cada tres veces y parecía cosa
      // de la máquina. No lo era: dependía de qué carta tocara.
      const soloCursor = !grupoActivo()?.matches?.(".inc-menu");
      if ((!movido && !soloCursor) || !aceptar()) return;
    } else {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  // ── MANDO ────────────────────────────────────────────────────────────
  // Se sondea, porque la API de mandos no avisa: no hay evento de «se movió
  // la palanca», solo un estado que hay que leer. Se lee solo cuando hay un
  // grupo abierto, así que en partida esto no cuesta nada.

  // EL BAILE SE QUEDA EL MANDO FÍSICO. Su pantalla no es un grupo del
  // cursor (`data-nav-juego`), así que sin esta rama el dpad y la palanca
  // de un mando de verdad no hacían NADA durante el baile — la promesa es
  // que el juego entero se juega con teclado O con mando, y el baile es
  // exactamente un juego de cruceta. Mismo tacto que la palanca táctil:
  // flanco, y se rearma pasando por el centro.
  let baileArmado = true;
  function sondearBaile() {
    const b2 = window.__game?.engine?.game?.baile;
    if (!b2?.active || !navigator.getGamepads) return false;
    const pads = [...navigator.getGamepads()].filter(Boolean);
    if (!pads.length) return true; // sin mando conectado, pero el baile manda
    let dx = 0;
    let dy = 0;
    for (const pad of pads) {
      dx += pad.axes?.[0] ?? 0;
      dy += pad.axes?.[1] ?? 0;
      pad.buttons?.forEach?.((btn, i) => {
        if (!btn.pressed) return;
        const cruz = CRUCETA[i];
        if (cruz) {
          dx += cruz[0];
          dy += cruz[1];
        }
      });
    }
    const fuerza = Math.hypot(dx, dy);
    if (fuerza < 0.35) {
      baileArmado = true;
      return true;
    }
    if (!baileArmado || fuerza < 0.6) return true;
    baileArmado = false;
    const dir =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "derecha"
          : "izquierda"
        : dy > 0
          ? "abajo"
          : "arriba";
    b2.pulsar(dir);
    return true;
  }

  function sondearMando(dt) {
    if (!navigator.getGamepads) return;
    if (sondearBaile()) {
      botonesAntes = new Set();
      return;
    }
    if (!grupoActivo()) {
      botonesAntes = new Set();
      return;
    }
    const pads = [...navigator.getGamepads()].filter(Boolean);
    if (!pads.length) return;
    let dx = 0;
    let dy = 0;
    const pulsados = new Set();
    for (const pad of pads) {
      dx += pad.axes[0] ?? 0;
      dy += pad.axes[1] ?? 0;
      pad.buttons.forEach((b, i) => {
        if (!b.pressed) return;
        pulsados.add(i);
        const cruz = CRUCETA[i];
        if (cruz) {
          dx += cruz[0];
          dy += cruz[1];
        }
      });
    }
    // FLANCO, no estado: un botón mantenido tiene que aceptar UNA vez.
    for (const i of pulsados) {
      if (botonesAntes.has(i)) continue;
      if (BOTON_ACEPTAR.includes(i)) aceptar();
      else if (BOTON_VOLVER.includes(i)) volver();
    }
    botonesAntes = pulsados;

    empujar(dx, dy, dt);
  }

  /**
   * UNA PALANCA, LA QUE SEA. Traduce un eje continuo en pasos del cursor:
   * zona muerta, un paso al empujar y repetición mientras se sostenga.
   *
   * Está aparte del sondeo del mando porque hay DOS palancas —la del mando
   * físico y la de pantalla del móvil— y el tacto tiene que ser el mismo.
   * Escrita dos veces se separa al primer ajuste, y entonces el cursor se
   * mueve distinto según con qué lo muevas, que es peor que no moverse.
   */
  function empujar(dx, dy, dt = 1 / 60) {
    if (!grupoActivo()) return false;
    const eje = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
    const fuerza = Math.max(Math.abs(dx), Math.abs(dy));
    if (fuerza < ZONA_MUERTA) {
      repetirEn = 0;
      ultimoEje = 0;
      return false;
    }
    const firma = eje[0] * 3 + eje[1];
    repetirEn -= dt;
    if (firma !== ultimoEje) {
      ultimoEje = firma;
      repetirEn = REPETIR_PRIMERO;
      return mover(eje[0], eje[1]);
    }
    if (repetirEn <= 0) {
      repetirEn = REPETIR_LUEGO;
      return mover(eje[0], eje[1]);
    }
    return false;
  }

  window.addEventListener("keydown", onKey, true);

  return {
    /** Se llama por cuadro desde main.js. `dt` en segundos. */
    update(dt = 1 / 60) {
      sincronizar();
      sondearMando(dt);
    },
    /** Para la palanca de pantalla y cualquier otro mando que quiera sumarse. */
    mover,
    aceptar,
    /**
     * La palanca de pantalla del móvil entra POR AQUÍ, no por `mover`: así
     * hereda la zona muerta y la repetición del mando físico en vez de
     * inventarse las suyas. Devuelve si se comió el empujón.
     */
    empujar,
    /** ¿Hay algo que elegir ahora mismo? Lo usa el táctil para no caminar. */
    get activo() {
      return !!grupoActivo();
    },
    destroy() {
      window.removeEventListener("keydown", onKey, true);
    },
  };
}
