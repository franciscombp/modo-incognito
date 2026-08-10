/**
 * EL GESTO — la acción en PRIMER PLANO (docs/MOTOR.md §1.2).
 *
 * ── Qué es, y por qué no es el pulso ──
 *
 * El PULSO (`activityGame.js`) es TIEMPO: un marcador barre una tira y tocas
 * en el momento bueno. El GESTO es MANO: hay un valor que se te escapa solo
 * —el volumen de la peli sube, el café se enfría, tu propia voz se anima— y
 * tienes que sostenerlo donde toca empujando el mando.
 *
 * Son dos verbos distintos y una actividad elige UNO: la que declara `gesto`
 * en el JSON de la escena juega al gesto, y la que declara `pulso` (o nada)
 * sigue con el pulso de siempre. Ninguna lleva los dos: pedir ritmo y pulso
 * firme a la vez con el jefe rondando no es difícil, es ruido.
 *
 * ── La regla que NO cambia ──
 *
 * Un minijuego de tarea NO PUEDE PAUSAR EL MUNDO, y el suelo sigue siendo el
 * mismo: mantener espacio termina la tarea igual, solo que lento. El gesto es
 * un ATAJO —hacerlo bien multiplica el avance— y un RIESGO —dejar el valor en
 * el extremo hace RUIDO, y el ruido sube la sospecha—. Nunca es un peaje: si
 * fuera obligatorio, alguien se quedaría encallado en la primera tarea.
 *
 * Por eso esto tampoco tapa el piso: el panel vive en la banda de abajo y el
 * jefe sigue caminando detrás. Lo vigila `npm run check:gesto`.
 *
 * ── Por qué un solo mecanismo y no tres minijuegos ──
 *
 * Igual que el pulso: un valor, una zona buena, una deriva y un control. Con
 * esos cuatro números salen verbos que no se parecen —bajarle el volumen a la
 * tele (la zona abajo, la deriva hacia arriba), servir el café sin que se
 * enfríe (la zona arriba, la deriva hacia abajo), hablar bajito (la zona se
 * mueve sola)— y hay UN sistema que mantener, no tres.
 */

/** Ajustes por defecto de una actividad que declare `gesto: {}` a secas. */
const POR_DEFECTO = {
  eje: "y", // qué eje del mando lo mueve: "y" (arriba/abajo) o "x"
  verbo: "Sostén", // lo que se lee en el panel, en imperativo
  valor: 0.85, // por dónde empieza (0 = abajo, 1 = arriba)
  zonaAt: 0.2, // centro de la zona buena
  zona: 0.22, // ancho de la zona buena
  zonaDeriva: 0, // lo que la zona se mueve sola por segundo (0 = quieta)
  deriva: 0.18, // a dónde se va el valor solo, por segundo (+ = hacia arriba)
  control: 0.8, // cuánto lo mueves tú por segundo, con el mando a fondo
  bono: 2.6, // cuánto acelera la tarea estar dentro de la zona
  ruido: 5, // sospecha por segundo mientras el valor esté en el extremo
  extremo: 0.9, // a partir de qué valor se te oye desde fuera
  extremoBajo: false, // true = el extremo que delata es el de ABAJO, no el de arriba
};

export function createActivityGesture({ onNoise = null, onFeedback = null } = {}) {
  let station = null;
  let cfg = POR_DEFECTO;
  let valor = 0.5;
  let zonaAt = 0.5;
  let zonaDir = 1;
  let dentro = false;
  let dentroTotal = 0; // segundos acumulados en la zona, para la nota final
  let ruidoTotal = 0; // segundos acumulados en el extremo
  let t = 0;
  let avisado = false; // para que el "bien" suene al entrar, no cada cuadro

  /** ¿Este valor se oye desde fuera? */
  function enExtremo(v) {
    return cfg.extremoBajo ? v <= 1 - cfg.extremo : v >= cfg.extremo;
  }

  return {
    get active() {
      return station !== null;
    },
    get station() {
      return station;
    },

    /** Empieza (o continúa) el gesto de esta estación. */
    begin(st) {
      if (station === st) return;
      station = st;
      cfg = { ...POR_DEFECTO, ...(st?.gesto ?? {}) };
      valor = cfg.valor;
      zonaAt = cfg.zonaAt;
      zonaDir = 1;
      dentro = false;
      dentroTotal = 0;
      ruidoTotal = 0;
      t = 0;
      avisado = false;
    },

    /** Se soltó la tecla o te fuiste: el gesto se apaga sin castigo extra. */
    end() {
      station = null;
    },

    /**
     * Un cuadro de gesto.
     *
     * @param {number} dt
     * @param {{right:number, up:number}} intent Lo que pide el mando, ya en
     *   [-1,1]. Es el MISMO mando de andar (ver `Player.readIntent`): mientras
     *   dura la acción no caminas, así que el eje queda libre y no hace falta
     *   inventar una tecla que nadie va a encontrar.
     * @returns {number} Multiplicador de avance para este cuadro.
     */
    update(dt, intent = { right: 0, up: 0 }) {
      if (!station) return 1;
      t += dt;

      const empuje = cfg.eje === "x" ? intent.right : intent.up;
      valor += (empuje * cfg.control + cfg.deriva) * dt;
      valor = Math.min(1, Math.max(0, valor));

      if (cfg.zonaDeriva) {
        const margen = cfg.zona / 2 + 0.04;
        zonaAt += cfg.zonaDeriva * zonaDir * dt;
        if (zonaAt >= 1 - margen) {
          zonaAt = 1 - margen;
          zonaDir = -1;
        } else if (zonaAt <= margen) {
          zonaAt = margen;
          zonaDir = 1;
        }
      }

      const ahoraDentro = Math.abs(valor - zonaAt) <= cfg.zona / 2;
      if (ahoraDentro && !avisado) {
        avisado = true;
        onFeedback?.("dentro");
      } else if (!ahoraDentro && avisado) {
        avisado = false;
      }
      dentro = ahoraDentro;
      if (dentro) dentroTotal += dt;

      // EL RUIDO, que es lo que ata esto al bucle: dejar el volumen arriba no
      // es "menos progreso", es que te están oyendo desde el pasillo. Se cobra
      // por segundo y no por evento, porque el castigo tiene que crecer con lo
      // que tardes en corregirlo.
      if (enExtremo(valor)) {
        ruidoTotal += dt;
        onNoise?.(cfg.ruido * dt);
      }

      return dentro ? cfg.bono : 1;
    },

    /** Lo que el HUD necesita pintar. `null` si no hay gesto en marcha. */
    snapshot() {
      if (!station) return null;
      return {
        valor,
        zonaAt,
        zona: cfg.zona,
        eje: cfg.eje,
        verbo: cfg.verbo,
        dentro,
        delatada: enExtremo(valor),
        label: station.label ?? null,
        icon: station.icon ?? "question",
      };
    },

    /**
     * Bonificación de reloj por lo limpio que salió el gesto, en segundos.
     * Paga el tiempo que estuviste EN LA ZONA y se lo come el que estuviste
     * delatándote. Misma escala que `bonusReloj()` del pulso, para que elegir
     * una actividad u otra no sea elegir un pagador mejor.
     */
    bonusReloj() {
      if (!station) return 0;
      return Math.max(0, Math.round((dentroTotal - ruidoTotal * 2) * 3));
    },
  };
}
