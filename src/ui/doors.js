/**
 * LAS PUERTAS DEL ASCENSOR — la transición entre pantallas.
 *
 * (Diseño: `docs/PANTALLAS.md` §1.8bis, paso 2: «la pieza que las une».)
 *
 * ── Por qué unas puertas y no un fundido ──
 *
 * Un fundido a negro entre dos menús es lo que se pone cuando no se sabe qué
 * poner: no cuenta nada y encima se nota como una espera. Las puertas del
 * ascensor resuelven tres cosas de golpe, que es lo que dice el diseño:
 *
 *   · TAPAN el cambio de decorado, que es lo que un fundido hace mal —con un
 *     fundido se ve el fondo nuevo aparecer a media opacidad sobre el viejo;
 *   · EXPLICAN el salto: no has cambiado de pantalla, has ido a otro sitio
 *     del edificio;
 *   · y REGALAN el tiempo que hace falta para montar lo que venga, sin que
 *     parezca tiempo muerto. Que es de lo que va todo el juego.
 *
 * ── Es hermana de `transition.js`, no una copia ──
 *
 * `createTransition` es EL CORTE: negro, corto, para tapar un traslado dentro
 * de la partida. Mismo contrato —`cortar(enElNegro)`, una promesa, un cerrojo
 * para que dos no se pisen— porque el que llama no tiene por qué saber cuál
 * de las dos le tocó. Lo que cambia es lo que se ve mientras: allí un velo,
 * aquí dos hojas que se cierran y se abren.
 *
 * Vive FUERA de `.inc-menu` a propósito, colgada de la raíz, igual que el
 * corte: son hojas que tapan la pantalla entera, no una pieza del menú. (Y de
 * paso, así no entra en el barrido de `check:holo`, que busca superficies
 * DENTRO de los menús. Una puerta de ascensor es una superficie — es lo único
 * que puede ser— y ahí la regla no aplica, porque no es un contenedor pegado
 * encima del juego: es el juego.)
 */

/**
 * LO QUE TARDA UNA HOJA SALE DEL CSS, no de aquí.
 *
 * `--dur-puerta` (capa 2 del design system) es la única definición. Escrito
 * también aquí, los dos números se separan al primer retoque de la animación
 * — y separados no se ve un fallo, se ve algo peor: la pantalla cambia con
 * las puertas a medio abrir, que es exactamente lo que la transición existe
 * para tapar.
 *
 * Se lee EN CADA VIAJE y no al arrancar: un tema puede cambiarlo, y el tema
 * se cambia con la pestaña abierta.
 */
function duracionHoja() {
  const css = getComputedStyle(document.documentElement).getPropertyValue("--dur-puerta").trim();
  // El CSS habla en `s` o en `ms`; aquí todo son ms.
  const n = parseFloat(css);
  if (!Number.isFinite(n)) return 380;
  return css.endsWith("ms") ? n : n * 1000;
}

/** Lo que se queda cerrada, ya con el cambio hecho detrás. */
const QUIETO = 220;

/**
 * ¿Le molesta el movimiento a quien está mirando?
 *
 * Se pregunta EN CADA CORTE y no una vez al arrancar: es un ajuste del
 * sistema y se puede cambiar con la pestaña abierta. Cacheado, quien lo
 * active a mitad de partida seguiría viendo las hojas deslizarse.
 */
function sinMovimiento() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

export function createDoors(root) {
  const caja = document.createElement("div");
  caja.className = "inc-puertas";
  // Dos hojas y nada más. El hueco entre ellas es donde se ve lo que hay
  // detrás, así que no hace falta dibujar ni marco ni riel: lo cuenta el
  // movimiento.
  caja.innerHTML = `<i class="inc-puerta inc-puerta--izq"></i><i class="inc-puerta inc-puerta--der"></i>`;
  root.appendChild(caja);

  let ocupado = false;

  /**
   * Cierra las puertas, ejecuta `enElNegro`, y las abre.
   *
   * @param {() => void} enElNegro Lo que se cambia sin que se vea.
   * @returns {Promise<boolean>} false si ya había un viaje en marcha. Dos
   *   transiciones a la vez dejan la segunda a medias y la pantalla tapada
   *   para siempre — es el mismo cerrojo que el del corte, y por lo mismo.
   */
  async function viajar(enElNegro) {
    if (ocupado) return false;
    ocupado = true;
    const quieto = sinMovimiento();
    const hoja = duracionHoja();
    const espera = (ms) => new Promise((r) => setTimeout(r, quieto ? 0 : ms));
    try {
      caja.classList.toggle("inc-puertas--corta", quieto);
      caja.classList.add("on");
      // Se espera un pelo MÁS de lo que dura la hoja: el cambio tiene que
      // ocurrir con las puertas cerradas del todo, no en el último cuadro.
      await espera(hoja + 40);
      // DENTRO del try: si el cambio revienta, las puertas se abren igual en
      // el `finally`. Una excepción aquí dejaría el juego vivo detrás de dos
      // hojas cerradas, que es el peor fallo que puede tener esta pieza.
      enElNegro?.();
      await espera(QUIETO);
      return true;
    } finally {
      caja.classList.remove("on");
      // El cerrojo se suelta cuando han ABIERTO del todo, no al empezar a
      // abrirse: encadenar dos viajes con las hojas a medio camino se ve como
      // un parpadeo, no como una transición.
      setTimeout(
        () => {
          ocupado = false;
        },
        quieto ? 0 : hoja + 40
      );
    }
  }

  return {
    viajar,
    get ocupado() {
      return ocupado;
    },
  };
}
