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

  /**
   * DÓNDE CABE EL ANUNCIO, MEDIDO.
   *
   * El rótulo grande es de la BANDA CENTRAL, y su vecina de arriba es la
   * lista de misiones, que NO tiene un alto fijo: crece con las misiones que
   * lleves y se repliega con la presión. Estuvo clavado a un porcentaje —el
   * 52 % del lienzo— calibrado contra UNA lista concreta, y en cuanto la
   * lista tuvo una fila más volvió a solaparse: 106×73 px encima de las
   * misiones, y justo cuando te acaban de fichar, que es cuando hace falta
   * leer qué llevabas y hacia dónde huir.
   *
   * Un porcentaje no puede saber cuánto ocupa la lista de hoy. Se mide, que
   * es lo que ya hace la flecha del rastreador con los bloques del borde
   * (ui/tracker.js) y por la misma razón.
   */
  function colocarCentro() {
    const lista = document.querySelector(".inc-quests");
    const escena = centro.parentElement ?? document.body;
    const base = escena.getBoundingClientRect();
    const alto = base.height || 1;
    // El suelo de la lista, en fracción del lienzo, más un respiro. Sin
    // lista (o vacía) se queda donde siempre.
    const r = lista?.getBoundingClientRect();
    // SU PROPIO ALTO CUENTA, y esto costó un intento: `top` posiciona el
    // CENTRO del rótulo (lleva `translate(-50%, -50%)`), no su borde de
    // arriba. Colocando el centro justo bajo la lista, un rótulo de tres
    // líneas sigue subiendo media altura y se solapa igual — de hecho más,
    // porque cuanto más alto es, más sube.
    // `offsetHeight` y NO `getBoundingClientRect`, y esta es la segunda
    // trampa: el rótulo está en reposo a `scale(0.7)`, así que el rectángulo
    // medido viene ya ENCOGIDO —268 px de los 383 que ocupa— y colocarlo con
    // esa cifra lo deja 100 px más arriba de donde acaba. `offsetHeight` da
    // el alto de MAQUETA, que es el que no depende de la animación.
    // El 1.06 es el rebote de `inc-announce-pop`: en su pico se pasa un 6 %,
    // y es en ese cuadro cuando más invade.
    const propio = centro.offsetHeight * 1.06;
    const suelo = r && r.height > 4 ? r.bottom - base.top : alto * 0.34;
    const y = (suelo + 24 + propio / 2) / alto;
    // Ni tan abajo que se salga por el pie, ni tan arriba que vuelva al
    // sitio del que viene.
    centro.style.top = `${(Math.min(0.78, Math.max(0.42, y)) * 100).toFixed(1)}%`;
  }

  function pintarCentro(msg) {
    actual = msg;
    centro.textContent = msg.text;
    centro.dataset.tone = msg.tone ?? "danger";
    // Se coloca ANTES de enseñarlo: medir con el rótulo ya en pantalla
    // enseñaría un salto de posición en el primer cuadro.
    colocarCentro();
    // Reiniciar la animación: sin esto, dos anuncios seguidos con el mismo
    // tono no se distinguen — el segundo entra sin golpe y parece que el
    // primero sigue puesto.
    centro.classList.remove("show");
    void centro.offsetWidth;
    centro.classList.add("show");
    // LA PÍLDORA DE MANDOS CEDE. El anuncio es un rótulo grande de banda
    // central y su pie llega hasta donde vive la píldora: medido, la tapaba
    // 24 px. Ceder es lo mismo que ya hace mientras haces algo prohibido
    // (`body.inc-acting`) y por la misma razón — cuando acaban de gritarte
    // que te vieron, la lista de teclas no es lo que hay que leer.
    document.body.classList.add("inc-anunciando");
    clearTimeout(centroTimer);
    centroTimer = setTimeout(() => {
      centro.classList.remove("show");
      document.body.classList.remove("inc-anunciando");
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
