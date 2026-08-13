/**
 * EL DIRECTOR DE MENSAJES — quién habla, dónde, y quién se calla.
 *
 * ── El problema que resuelve ──
 *
 * Había CUATRO canales escribiendo en pantalla por su cuenta, y ninguno sabía
 * de los otros:
 *
 *   · `game.announce()`  → el anuncio grande del centro («¡GABO TE VIO!»)
 *   · `game.toast()`     → una línea abajo en el centro, encima de la tarjeta
 *                          de acción, la tira del pulso y la píldora de mandos
 *   · `hud.notify()`     → tarjetas arriba a la DERECHA… donde vive la lista
 *                          de misiones
 *   · el aviso de Teams  → arriba a la derecha también
 *
 * Resultado: tres cosas peleándose por la misma esquina y una cuarta tapando
 * justo el panel de la acción en curso. Y peor que el solape: sin prioridad,
 * un «+12 energía» podía pisar un «viene a por ti».
 *
 * ── La regla ──
 *
 * LO IMPORTANTE Y URGENTE VA AL CENTRO, COMO TEXTO. LO DEMÁS, A UN LADO.
 *
 * Dos carriles y nada más:
 *
 *   CENTRO (`urgencia: 2`) — uno a la vez, grande, en mitad de la pantalla.
 *     Es para lo que hay que leer sin buscarlo: te vio, viene, se acabó el
 *     tiempo. Un mensaje del centro NO lo interrumpe uno menos urgente: el
 *     menor se va al lado en vez de perderse.
 *
 *   LADO (`urgencia: 0` ambiente, `1` aviso) — pila a la izquierda, bajo la
 *     placa. Se apilan, se van solas y nunca tapan nada del bucle: la
 *     izquierda es la única banda libre (placa arriba, misiones a la derecha,
 *     reloj en el centro, acción abajo).
 *
 * Nada de esto roba clics: todo el layer va con `pointer-events: none`.
 */

/** Cuántas tarjetas se ven a la vez en el carril lateral. */
const LADO_MAX = 3;

/** Lo que dura una tarjeta lateral si nadie dice otra cosa, en ms. */
const LADO_TTL = 4200;

/** Lo que dura un anuncio del centro, en ms. */
const CENTRO_TTL = 2200;

export const URGENCIA = { AMBIENTE: 0, AVISO: 1, URGENTE: 2 };

/**
 * @param {HTMLElement} layer  dónde colgar los dos carriles.
 * @param {(nombre: string) => Node|null} iconEl  fábrica de iconos SVG del
 *   juego (ui/icons.js). Se inyecta para no atar este módulo a ella.
 */
export function createMessageDirector(layer, iconEl = () => null) {
  const centro = document.createElement("div");
  centro.className = "inc-msg-centro";
  layer.appendChild(centro);

  const lado = document.createElement("div");
  lado.className = "inc-msg-lado";
  layer.appendChild(lado);

  /** El anuncio del centro que se está viendo, o null. */
  let actual = null;
  let centroTimer = 0;

  function pintarCentro(msg) {
    actual = msg;
    centro.textContent = msg.text;
    centro.dataset.tone = msg.tone ?? "danger";
    // Reiniciar la animación: sin esto, dos anuncios seguidos con el mismo
    // tono no se distinguen — el segundo entra sin golpe y parece que el
    // primero sigue puesto.
    centro.classList.remove("show");
    void centro.offsetWidth;
    centro.classList.add("show");
    clearTimeout(centroTimer);
    centroTimer = setTimeout(() => {
      centro.classList.remove("show");
      actual = null;
    }, msg.ttl ?? CENTRO_TTL);
  }

  function pintarLado({ text, tone = "info", icon = null }) {
    const card = document.createElement("div");
    card.className = `inc-msg inc-msg--${tone}`;
    const ic = iconEl(icon ?? (tone === "danger" ? "alert" : "info"));
    if (ic) {
      const wrap = document.createElement("span");
      wrap.className = "inc-msg-icon";
      wrap.appendChild(ic);
      card.appendChild(wrap);
    }
    const txt = document.createElement("span");
    txt.className = "inc-msg-text";
    txt.textContent = text;
    card.appendChild(txt);
    lado.appendChild(card);

    // Tope duro: con el jefe encima llegan cuatro cosas a la vez y una
    // columna infinita taparía media pantalla. La más vieja se va.
    while (lado.children.length > LADO_MAX) lado.firstChild.remove();

    setTimeout(() => {
      card.classList.add("out");
      setTimeout(() => card.remove(), 400);
    }, LADO_TTL);
    return card;
  }

  return {
    /**
     * Publicar un mensaje. La urgencia decide el carril, no quien llama:
     * así una línea nueva no puede colarse en el centro por descuido.
     */
    post({ text, tone = "info", urgencia = URGENCIA.AMBIENTE, icon = null, ttl } = {}) {
      if (!text) return;
      if (urgencia >= URGENCIA.URGENTE) {
        pintarCentro({ text, tone, ttl });
        return;
      }
      // Un aviso que llega mientras el centro está ocupado NO espera turno ni
      // pisa: se va al lado. Es lo que hace que el centro se pueda leer.
      pintarLado({ text, tone, icon });
    },

    /** ¿Hay algo ocupando el centro ahora mismo? */
    get centroOcupado() {
      return actual !== null;
    },

    /** Vaciar los dos carriles (cambio de día, fin de partida). */
    reset() {
      clearTimeout(centroTimer);
      actual = null;
      centro.classList.remove("show");
      lado.replaceChildren();
    },

    nodes: { centro, lado },
  };
}
