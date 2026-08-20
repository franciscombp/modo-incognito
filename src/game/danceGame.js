/**
 * EL BAILE — estirarse «cinco minutos», que es una coreografía.
 *
 * ── Por qué existe ──
 *
 * Estirarse jugaba al PULSO: la tira genérica con un marcador que barre y
 * un espacio que se toca al pasar por la zona. Es la misma tira de la mitad
 * de las tareas del piso, y encima es la que peor cuenta lo que estás
 * haciendo — nadie se estira apretando un botón en el momento justo. Se
 * leía como un medidor, no como un gesto.
 *
 * Estirarse es LO MISMO QUE UN JUST DANCE: una secuencia de movimientos que
 * hay que hacer EN ORDEN y A TIEMPO. Y eso, en un teclado, ya tiene su
 * lenguaje universal desde hace treinta años: las cuatro flechas. No hay
 * nada que explicar — sale una flecha, la pulsas.
 *
 * ── Cómo se juega ──
 *
 * Una RUTINA es una lista de pasos (arriba, izquierda, abajo…). El compás
 * avanza solo, un paso cada `compas` segundos, lo aciertes o no: eso es lo
 * que lo convierte en un baile y no en un examen. Aciertas → el paso cuenta
 * y la barra sube; fallas o lo dejas pasar → hace RUIDO (estás haciendo
 * aspavientos en mitad de la oficina) y ese paso se pierde, pero la rutina
 * SIGUE. Nunca te expulsa: es la misma regla que el chisme y los vasos.
 *
 * ── Los mandos ──
 *
 * Flechas en el teclado, y las mismas cuatro casillas se pueden tocar con
 * el dedo — son botones de verdad, no dibujos. La cruceta de un mando cae
 * en las flechas sin escribir una línea más.
 *
 * ── La regla, que CAMBIÓ ──
 *
 * PAUSA EL MUNDO mientras dura la pantalla. Durante mucho tiempo fue al
 * revés —el jefe seguía viniendo— porque congelarlo hacía de la estación un
 * escudo: se mantenía espacio y se quedaba de estatua a un palmo. La causa
 * no era la pausa, era poder ENTRAR con él encima; eso ahora no se puede
 * (`_puedeAbrirMinijuego` en game.js), y sin esa puerta no hay escudo. Lo
 * que NO se para es la cuenta atrás de la tarea: esa es la presión.
 * Lo vigila `npm run check:pausa`.
 */

export const DIRECCIONES = ["arriba", "abajo", "izquierda", "derecha"];

/** Cuántos pasos tiene una rutina si la actividad no dice otra cosa. */
const PASOS_POR_DEFECTO = 8;
/** Segundos por paso. Suficiente para leer la flecha y llegar. */
const COMPAS = 0.9;
/** Lo que hace de ruido dejar pasar un paso o pulsar la flecha que no era. */
const RUIDO_FALLO = 6;

function rutina(n, rnd) {
  const pasos = [];
  for (let i = 0; i < n; i++) {
    let d = DIRECCIONES[Math.floor(rnd() * DIRECCIONES.length)];
    // Nunca tres iguales seguidas: machacar la misma tecla no es una
    // coreografía, y encima se acierta sin mirar.
    if (i >= 2 && pasos[i - 1] === d && pasos[i - 2] === d) {
      d = DIRECCIONES[(DIRECCIONES.indexOf(d) + 1) % DIRECCIONES.length];
    }
    pasos.push(d);
  }
  return pasos;
}

/**
 * @param {object} opts
 * @param {Function} opts.onNoise    Sube la sospecha (un paso fallado).
 * @param {Function} opts.onFeedback "acierto" | "fallo" | "rutina".
 */
export function createDanceGame({ onNoise, onFeedback, random = Math.random } = {}) {
  let station = null;
  let pasos = [];
  let indice = 0;
  let aciertos = 0;
  let meta = PASOS_POR_DEFECTO;
  let compas = COMPAS;
  let resto = COMPAS;
  let resultado = null; // destello del HUD
  let resultadoT = 0;
  let hechoEstePaso = false;

  function nuevaRutina() {
    pasos = rutina(meta, random);
    indice = 0;
    resto = compas;
    hechoEstePaso = false;
  }

  function anotarProgreso() {
    if (!station) return;
    // POR FRACCIÓN DE LA META, no sumando un pellizco por paso. Sumando, una
    // rutina con dos fallos dejaba la barra sin llenarse nunca y la tarea sin
    // poder terminarse: es el atasco que dejó el café imposible.
    const total = station.time || 1;
    station.progress = Math.max(station.progress, Math.min(total, (total * aciertos) / meta));
  }

  function fallar() {
    resultado = "fallo";
    resultadoT = 0.45;
    onNoise?.(station?.baile?.ruido ?? RUIDO_FALLO);
    onFeedback?.("fallo");
  }

  return {
    get active() {
      return station !== null;
    },
    get station() {
      return station;
    },

    begin(st) {
      if (station === st) return;
      station = st;
      const cfg = st?.baile ?? {};
      meta = cfg.pasos ?? PASOS_POR_DEFECTO;
      compas = cfg.compas ?? COMPAS;
      aciertos = 0;
      resultado = null;
      resultadoT = 0;
      nuevaRutina();
    },

    end() {
      station = null;
      pasos = [];
    },

    update(dt) {
      if (!station) return;
      if (resultadoT > 0) {
        resultadoT -= dt;
        if (resultadoT <= 0) resultado = null;
      }
      // EL COMPÁS NO ESPERA. Es lo que separa esto de una lista de teclas
      // que se pulsan cuando te apetece: el paso se va, y con él la
      // oportunidad. Sin esto no hay ritmo, hay un formulario.
      resto -= dt;
      if (resto > 0) return;
      if (!hechoEstePaso) fallar();
      indice++;
      resto = compas;
      hechoEstePaso = false;
      if (indice >= pasos.length) {
        // Rutina terminada. Si aún falta barra, viene otra: estirarse
        // «cinco minutos» son varias tandas, y volver a empezar es más
        // amable que castigar por no clavarla a la primera.
        onFeedback?.("rutina", { aciertos, meta });
        nuevaRutina();
      }
    },

    /** LA ÚNICA ACCIÓN. `dir` es una de DIRECCIONES. */
    pulsar(dir) {
      if (!station || hechoEstePaso) return null;
      const toca = pasos[indice];
      if (dir !== toca) {
        hechoEstePaso = true; // pulsar mal gasta el paso: si no, se prueban las cuatro
        fallar();
        return "fallo";
      }
      hechoEstePaso = true;
      aciertos++;
      anotarProgreso();
      resultado = "acierto";
      resultadoT = 0.35;
      onFeedback?.("acierto", { aciertos, meta });
      return "acierto";
    },

    snapshot() {
      if (!station) return null;
      return {
        // Los pasos que quedan por delante, para que se vean venir: sin eso
        // es un juego de reflejos, y un juego de reflejos con el jefe
        // encima no se puede jugar mirando también el piso.
        pasos: pasos.map((d, i) => ({
          dir: d,
          estado: i < indice ? "hecho" : i === indice ? "ahora" : "viene",
        })),
        indice,
        aciertos,
        meta,
        // Cuánto queda del compás, 1 → 0. Es la barra que corre bajo el
        // paso actual y lo que hace que se sienta un ritmo.
        resto: Math.max(0, resto / compas),
        resultado,
        label: station.label ?? null,
        icon: station.icon ?? "stretch",
        verbo: station.baile?.verbo ?? "Sigue la rutina con las flechas",
      };
    },
  };
}
