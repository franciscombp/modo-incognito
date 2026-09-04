/**
 * EL CORTE — la transición de escena.
 *
 * ── Por qué ──
 *
 * Hay momentos en los que el juego tiene que LLEVARTE a un sitio: el jefe te
 * sienta en tu puesto después de un regaño, una escena te coloca. La regla de
 * la casa es que nadie se teletransporta —un cuerpo que parpadea de sitio
 * deja de ser un cuerpo— así que esos trayectos se ANDAN, con `player.walkTo`.
 *
 * Eso funciona cuando el sitio está a dos mesas. Deja de funcionar cuando
 * está al otro lado del piso: `walkTo` va en línea recta, no por el navmesh,
 * y basta una maceta en medio para que te quedes empujándola para siempre —
 * con el control bloqueado, que es lo peor de todo, porque desde fuera se ve
 * exactamente igual que un juego colgado.
 *
 * El corte es la salida honesta, y es la de cualquier juego: se baja el telón,
 * se cambia lo que haya que cambiar, y se sube. Detrás del telón no hay
 * teletransporte que ver — no es un atajo para saltarse la regla, es que la
 * regla habla de lo que el ojo ve, y con el telón bajado el ojo no ve nada.
 *
 * Lo que NO hace: música, texto ni tarjeta. Un corte es negro y dura poco. Si
 * hace falta contar algo, eso es un diálogo, y va después.
 */

/** Cuánto tarda en bajar, cuánto se queda abajo, cuánto tarda en subir. */
const BAJA = 260;
const QUIETO = 180;
const SUBE = 320;

export function createTransition(root) {
  const velo = document.createElement("div");
  velo.className = "inc-corte";
  root.appendChild(velo);

  /**
   * CUÁNTOS CORTES PUEDEN ESPERAR SU TURNO. Con cola no hace falta más de uno
   * o dos: es la red contra un llamador que pida cortes en bucle, no un
   * mecanismo de reparto.
   */
  const COLA_MAX = 2;

  let cola = Promise.resolve();
  let esperando = 0;

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Un corte, de principio a fin. Solo lo llama la cola. */
  async function unCorte(enElNegro) {
    try {
      velo.classList.add("on");
      await espera(BAJA);
      // El cambio va DENTRO del try: si tira, el telón sube igualmente en el
      // finally. Una excepción aquí dejaba la pantalla negra y el juego vivo
      // debajo, que es el peor fallo posible de esta pieza.
      enElNegro?.();
      await espera(QUIETO);
    } finally {
      velo.classList.remove("on");
      // El turno no se suelta al EMPEZAR a subir sino cuando el telón ha
      // subido del todo: encadenar dos cortes con el velo a medio camino se
      // ve como un parpadeo, no como una transición.
      await espera(SUBE);
    }
  }

  /**
   * Baja el telón, ejecuta `enElNegro`, y lo sube.
   *
   * ── LOS CORTES HACEN COLA; NO SE TIRAN ──
   *
   * Antes, un corte pedido con otro en marcha se RECHAZABA devolviendo false,
   * y el motivo era bueno: dos telones a la vez dejan el segundo a medias y
   * la pantalla en negro para siempre. El problema es lo que se perdía por el
   * camino — `enElNegro` es quien COLOCA a la jugadora, y quien lo pide ya le
   * ha quitado el mando en la línea anterior (`seatAtDesk`). Rechazar el
   * corte significaba, literalmente, una partida sin control el resto de la
   * jornada, sin un solo error por ninguna parte.
   *
   * Encolar resuelve las dos cosas: los telones siguen sin solaparse y ningún
   * cambio se cae. El segundo traslado pasa después del primero, con su telón
   * como debe ser — en vez de no pasar, o de pasar a la vista.
   *
   * @param {() => void} enElNegro Lo que se cambia sin que se vea.
   * @returns {Promise<boolean>} si el corte llegó a hacerse. Hoy solo devuelve
   *   false si la cola está desbordada, que es la red contra un llamador en
   *   bucle: quien lo pida tiene que aplicar su cambio igualmente (ver
   *   `Game._conTelon`), porque un cambio que se cae es peor que uno que se ve.
   */
  async function cortar(enElNegro) {
    if (esperando >= COLA_MAX) return false;
    esperando++;
    const mio = cola.then(() => unCorte(enElNegro));
    // La cola nunca se rompe: si un corte tira, el siguiente sigue saliendo.
    cola = mio.catch(() => {});
    try {
      await mio;
      return true;
    } finally {
      esperando--;
    }
  }

  return {
    cortar,
    /** Si hay algún corte en marcha o esperando turno. */
    get ocupado() {
      return esperando > 0;
    },
  };
}
