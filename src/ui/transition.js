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

  let ocupado = false;

  /**
   * Baja el telón, ejecuta `enElNegro`, y lo sube.
   *
   * @param {() => void} enElNegro Lo que se cambia sin que se vea.
   * @returns {Promise<boolean>} si el corte llegó a hacerse. Devuelve false
   *   si ya había uno en marcha: dos telones a la vez dejan el segundo a
   *   medias y la pantalla en negro para siempre.
   */
  async function cortar(enElNegro) {
    if (ocupado) return false;
    ocupado = true;
    const espera = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      velo.classList.add("on");
      await espera(BAJA);
      // El cambio va DENTRO del try: si tira, el telón sube igualmente en el
      // finally. Una excepción aquí dejaba la pantalla negra y el juego vivo
      // debajo, que es el peor fallo posible de esta pieza.
      enElNegro?.();
      await espera(QUIETO);
      return true;
    } finally {
      velo.classList.remove("on");
      // Se suelta el cerrojo cuando el telón ha SUBIDO del todo, no al
      // empezar a subir: encadenar dos cortes con el velo a medio camino se
      // ve como un parpadeo, no como una transición.
      setTimeout(() => {
        ocupado = false;
      }, SUBE);
    }
  }

  return {
    cortar,
    get ocupado() {
      return ocupado;
    },
  };
}
