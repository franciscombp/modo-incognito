/**
 * EL CHISME — el tercer verbo de una actividad, y el primero que se LEE.
 *
 * ── Por qué hacía falta un verbo más ──
 *
 * El pulso es TIEMPO (tocar en el momento bueno) y el gesto es MANO
 * (sostener un valor donde toca). Los dos son de destreza, y los dos se
 * juegan mirando una tira. Un piso entero de tareas que son la misma tira
 * con distintos números se agota: da igual que por dentro sean parámetros
 * distintos, en la mano se sienten igual.
 *
 * El chisme es de CABEZA, y encima es el juego que este juego pedía: la
 * oficina entera funciona con rumores, la libreta se llena de ellos, y la
 * mecánica es literalmente escuchar uno y demostrar que estabas atenta.
 *
 * ── Por qué es el formato que es ──
 *
 * Es la estructura de trivia de toda la vida —una tarjeta, una pregunta,
 * tres opciones, respuesta inmediata— porque es la que todo el mundo sabe
 * jugar sin que nadie le explique nada. Aquí eso no es pereza: es el
 * requisito. Esto se juega con el jefe caminando hacia ti, así que el
 * minijuego no se puede permitir un tutorial ni un segundo de "¿y esto qué
 * es?". Se abre, se lee, se pulsa.
 *
 * Y es DOPAMÍNICO a propósito, que es lo que lo separa del curso de RRHH:
 *  · acertar responde EN EL ACTO, con su golpe y su avance grande;
 *  · fallar no te expulsa ni te reinicia — resta un poco y hace RUIDO;
 *  · la recompensa de verdad es el CHISME EN SÍ, que quieres seguir leyendo.
 * El curso de RRHH frustra a propósito (es un peaje). Esto tiene que dar
 * ganas de quedarse — y entonces llega Gabo y tienes que dejarlo a medias.
 * Esa tensión ES el juego; sin las ganas de quedarse no hay tensión ninguna.
 *
 * ── La regla que NO cambia ──
 *
 * NO PAUSA EL MUNDO. El jefe sigue viniendo mientras lees, y la cuenta atrás
 * de la tarea sigue corriendo. Un minijuego que congela al jefe convierte la
 * estación en el sitio más seguro del piso (ver `activityGame.js`).
 */

/** Cuántas preguntas hay que acertar para completar una tanda. */
const ACIERTOS_POR_DEFECTO = 3;
// Lo que avanza la tarea un acierto, como fracción de su duración total.
const AVANCE_ACIERTO = 0.4;
// Lo que resta un fallo. Menor que lo que da un acierto A PROPÓSITO: fallar
// tiene que doler, no borrar. Con castigo simétrico, una racha mala te deja
// exactamente donde empezaste y la sensación es de estar perdiendo el tiempo
// mientras el jefe se acerca — que es cuando se abandona un minijuego.
const CASTIGO_FALLO = 0.15;
// Sospecha que hace un fallo. Es lo que ata esto al bucle: no es "menos
// progreso", es que se te oyó reírte de algo que no deberías estar leyendo.
const RUIDO_FALLO = 7;

/**
 * @param {object} opts
 * @param {Array} opts.pool     Las fichas de chisme (public/data/chismes.json).
 * @param {Function} opts.onNoise    Sube la sospecha (un fallo hace ruido).
 * @param {Function} opts.onFeedback Avisa al HUD de acierto/fallo.
 */
export function createChismeGame({ pool: poolInicial = [], onNoise, onFeedback, onWin } = {}) {
  let pool = poolInicial;
  let station = null;
  let ficha = null;
  let aciertos = 0;
  let fallos = 0;
  let necesarios = ACIERTOS_POR_DEFECTO;
  let usadas = [];
  let resultado = null; // "acierto" | "fallo", para el destello del HUD
  let resultadoT = 0;

  /**
   * Saca una ficha que no haya salido en ESTA tanda. Si se agotan, se
   * reinicia la lista de usadas en vez de quedarse sin pregunta: repetir es
   * peor que quedarse mudo solo cuando repites LA MISMA seguida.
   */
  function siguienteFicha() {
    if (!pool.length) {
      ficha = null;
      return;
    }
    let libres = pool.filter((f) => !usadas.includes(f.id));
    if (!libres.length) {
      usadas = [];
      libres = pool;
    }
    ficha = libres[Math.floor(Math.random() * libres.length)];
    usadas.push(ficha.id);
  }

  return {
    get active() {
      return station !== null;
    },
    get station() {
      return station;
    },

    /** Empieza (o continúa) la tanda de esta estación. */
    /**
     * @param st        La estación (o una sintética, si es un RETO).
     * @param fichas    Pool propio, para un reto con preguntas suyas — el
     *                  examen del Parce no debe sacar chismes de la oficina
     *                  ni al revés. Sin él, se usa el pool de siempre.
     */
    begin(st, { fichas = null } = {}) {
      if (station === st) return;
      station = st;
      if (fichas?.length) pool = fichas;
      necesarios = st?.chisme?.aciertos ?? ACIERTOS_POR_DEFECTO;
      aciertos = 0;
      fallos = 0;
      usadas = [];
      resultado = null;
      resultadoT = 0;
      siguienteFicha();
    },

    /** Se soltó la tecla o te fuiste. Sin castigo: lo hecho, hecho está. */
    end() {
      station = null;
      ficha = null;
    },

    update(dt) {
      if (!station) return;
      // El destello de acierto/fallo se apaga solo. Es lo único que corre
      // aquí: este minijuego no tiene marcador que barrer, y esa es justo la
      // diferencia — se juega leyendo, no reaccionando.
      if (resultadoT > 0) {
        resultadoT -= dt;
        if (resultadoT <= 0) resultado = null;
      }
    },

    /**
     * Responder. `i` es el índice de la opción (0-2, las teclas 1-3).
     * Devuelve "acierto" | "fallo" | null.
     */
    responder(i) {
      if (!station || !ficha) return null;
      const total = station.time || 1;
      const bien = i === ficha.correcta;
      resultado = bien ? "acierto" : "fallo";
      resultadoT = 0.7;
      if (bien) {
        aciertos += 1;
        station.progress = Math.min(total, station.progress + total * AVANCE_ACIERTO);
        onFeedback?.("acierto", { aciertos, necesarios, remate: ficha.opciones[i]?.remate });
        // COMPLETAR LA TANDA es un suceso con nombre, no solo «la barra
        // llegó al final». Lo usa el RETO —la trivia del Parce, que hay que
        // ganar para que te venda el café— y no le estorba a la actividad,
        // que sigue midiéndose por el progreso de la estación.
        if (aciertos >= necesarios) {
          onWin?.();
          return "ganado";
        }
        siguienteFicha();
        return "acierto";
      }
      fallos += 1;
      station.progress = Math.max(0, station.progress - total * CASTIGO_FALLO);
      onNoise?.(station.chisme?.ruido ?? RUIDO_FALLO);
      onFeedback?.("fallo", { aciertos, necesarios, remate: ficha.opciones[i]?.remate });
      // Fallar NO cambia de pregunta: puedes volver a intentarlo con lo que
      // acabas de aprender. Cambiarla convertiría el fallo en "me tocó una
      // difícil" en vez de "no estaba atenta".
      return "fallo";
    },

    /** Lo que el HUD necesita pintar. `null` si no hay tanda en marcha. */
    snapshot() {
      if (!station || !ficha) return null;
      return {
        titular: ficha.titular,
        texto: ficha.texto,
        pregunta: ficha.pregunta,
        opciones: ficha.opciones.map((o) => o.texto),
        aciertos,
        necesarios,
        resultado,
        label: station.label ?? null,
        icon: station.icon ?? "chat",
      };
    },
  };
}
