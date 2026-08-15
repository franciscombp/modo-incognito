/**
 * VERTER — el primer minijuego DE PUNTERO, y el patrón de los que vienen.
 *
 * ── Por qué hacía falta romper con los tres anteriores ──
 *
 * El pulso, la caña y el chisme son, los tres, «mantén una tecla» o «pulsa
 * un número». Se pueden pintar muy distintos, pero el VERBO es el mismo y
 * eso se nota en la mano. Y sobre todo: no usan el ratón en un ordenador ni
 * el dedo en un teléfono, que es donde vive la gente que juega esto.
 *
 * Esto es otra cosa: un puzle de VERTER, el de toda la vida (agua de un vaso
 * a otro hasta que cada uno tenga un solo color). Es un formato que todo el
 * mundo ya sabe jugar sin explicación, se resuelve en segundos, y cada
 * trasvase da un golpe de «bien» — que es exactamente lo que este juego
 * necesita: algo que dé ganas de quedarse, para que dejarlo a medias cuando
 * llega Gabo DUELA.
 *
 * ── Las tres entradas, un solo modelo ──
 *
 * No hay tres implementaciones: hay un estado de vasos y DOS acciones,
 * `elegir(i)` y nada más. Tocar un vaso lo levanta; tocar el siguiente
 * vierte. Con eso:
 *   · RATÓN: clic en el vaso.
 *   · TÁCTIL: toque en el vaso (el mismo `click` del DOM).
 *   · TECLADO: 1-4, que es «elegir el vaso n».
 * Añadir un mando nuevo no toca este archivo: solo tiene que llamar a
 * `elegir`.
 *
 * ── Las reglas, y por qué son estas ──
 *
 * Se vierte de A a B si B tiene sitio y su capa de arriba es del mismo color
 * (o B está vacío). Se pasan TODAS las capas seguidas de ese color, no una:
 * de una en una convierte un puzle de cabeza en trabajo de dedo.
 *
 * NO HAY ESTADO PERDIDO. Nunca se genera un reparto sin solución, y no hay
 * movimiento que te deje encallada: siempre puedes devolver lo que vertiste.
 * Un puzle sin salida con el jefe acercándose no es difícil, es injusto.
 *
 * ── La regla que NO cambia ──
 *
 * NO PAUSA EL MUNDO. Gabo sigue viniendo mientras resuelves, y por eso la
 * pantalla de la tarea lleva el acecho dentro (ver `ui/gamehud.js`).
 */

// Cuánto avanza la tarea cada trasvase ÚTIL, como fracción de su duración.
// Se paga por progreso real (un vaso que queda de un solo color), no por
// número de toques: si no, machacar vasos de un lado a otro sería la
// estrategia óptima y el puzle sobraría.
const AVANCE_POR_VASO = 0.34;
// Un trasvase ilegal (color que no pega, vaso lleno) no resta progreso: hace
// RUIDO. Fallar en un puzle ya se castiga solo con el tiempo que pierdes, y
// el tiempo aquí es el jefe acercándose.
const RUIDO_ILEGAL = 4;

/** Baraja in-place. Determinista si le pasas un random propio. */
function barajar(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Reparte los colores en vasos GENERANDO DESDE LA SOLUCIÓN: se parte de los
 * vasos ya resueltos y se hacen trasvases legales hacia atrás. Repartir al
 * azar y comprobar si tiene solución es más código y a veces sale un puzle
 * trivial o imposible; desde la solución, SIEMPRE tiene salida y la
 * dificultad es cuántos pasos se deshacen.
 */
function repartir({ colores, capacidad, vacios, mezclas }, rnd) {
  const vasos = colores.map((c) => Array.from({ length: capacidad }, () => c));
  for (let i = 0; i < vacios; i++) vasos.push([]);

  for (let m = 0; m < mezclas; m++) {
    // Un trasvase legal AL REVÉS: se coge una capa de arriba de un vaso y se
    // deja en otro donde quepa. No hace falta que el destino sea del mismo
    // color — es justo eso lo que ensucia el reparto.
    const orden = barajar(
      vasos.map((_, i) => i).filter((i) => vasos[i].length > 0),
      rnd
    );
    let hecho = false;
    for (const from of orden) {
      const destinos = barajar(
        vasos.map((_, i) => i).filter((i) => i !== from && vasos[i].length < capacidad),
        rnd
      );
      if (!destinos.length) continue;
      vasos[destinos[0]].push(vasos[from].pop());
      hecho = true;
      break;
    }
    if (!hecho) break;
  }
  return vasos;
}

/**
 * @param {object} opts
 * @param {Function} opts.onNoise    Sube la sospecha (un trasvase ilegal).
 * @param {Function} opts.onFeedback Avisa al HUD: "vertido" | "ilegal" | "vaso".
 */
export function createPourGame({ onNoise, onFeedback, random = Math.random } = {}) {
  let station = null;
  let vasos = [];
  let capacidad = 4;
  let elegido = null;
  let resueltos = 0;
  let destello = null; // { tipo, vaso } — para el HUD
  let destelloT = 0;

  const lleno = (v) => v.length === capacidad && v.every((c) => c === v[0]);
  const contarResueltos = () => vasos.filter(lleno).length;

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
      const cfg = st?.verter ?? {};
      capacidad = cfg.capacidad ?? 4;
      vasos = repartir(
        {
          colores: cfg.colores ?? ["cafe", "leche", "azucar"],
          capacidad,
          vacios: cfg.vacios ?? 2,
          mezclas: cfg.mezclas ?? 8,
        },
        random
      );
      elegido = null;
      resueltos = contarResueltos();
      destello = null;
      destelloT = 0;
    },

    end() {
      station = null;
      elegido = null;
    },

    /**
     * SOLTAR el vaso levantado sin verter. Existe porque `elegir(null)` no
     * puede hacerlo: un índice fuera de rango tiene que ser un no-op (llega
     * de un mando mal configurado o de una tecla que no toca), y usarlo
     * además para cancelar mezcla dos significados en la misma puerta.
     */
    soltar() {
      elegido = null;
    },

    update(dt) {
      if (!station) return;
      if (destelloT > 0) {
        destelloT -= dt;
        if (destelloT <= 0) destello = null;
      }
    },

    /**
     * LA ÚNICA ACCIÓN. Un toque levanta el vaso; el siguiente vierte. Es lo
     * que hace que ratón, dedo y teclado sean el MISMO juego: los tres
     * acaban llamando aquí con un índice.
     */
    elegir(i) {
      if (!station || i == null || i < 0 || i >= vasos.length) return null;

      if (elegido === null) {
        // Levantar un vaso vacío no es un error, es no hacer nada: castigarlo
        // con ruido sería castigar por explorar el tablero con el dedo.
        if (!vasos[i].length) return null;
        elegido = i;
        destello = { tipo: "vaso", vaso: i };
        destelloT = 0.3;
        onFeedback?.("vaso", { vaso: i });
        return "vaso";
      }

      if (elegido === i) {
        elegido = null; // volver a tocarlo lo suelta
        return null;
      }

      const from = vasos[elegido];
      const to = vasos[i];
      const color = from[from.length - 1];
      const cabe = to.length < capacidad;
      const pega = !to.length || to[to.length - 1] === color;
      elegido = null;

      if (!cabe || !pega) {
        destello = { tipo: "ilegal", vaso: i };
        destelloT = 0.4;
        onNoise?.(station.verter?.ruido ?? RUIDO_ILEGAL);
        onFeedback?.("ilegal", { vaso: i });
        return "ilegal";
      }

      // TODAS las capas seguidas de ese color, no una: de una en una esto
      // deja de ser un puzle y pasa a ser trabajo de dedo.
      while (from.length && from[from.length - 1] === color && to.length < capacidad) {
        to.push(from.pop());
      }

      // El progreso se paga por VASOS RESUELTOS, no por trasvases: si no,
      // machacar dos vasos de un lado a otro sería la estrategia óptima.
      const ahora = contarResueltos();
      if (ahora > resueltos) {
        const total = station.time || 1;
        station.progress = Math.min(total, station.progress + total * AVANCE_POR_VASO * (ahora - resueltos));
      }
      resueltos = ahora;
      destello = { tipo: "vertido", vaso: i };
      destelloT = 0.35;
      onFeedback?.("vertido", { vaso: i, resueltos });
      return "vertido";
    },

    /** Lo que el HUD necesita pintar. `null` si no hay tanda en marcha. */
    snapshot() {
      if (!station) return null;
      return {
        vasos: vasos.map((v) => [...v]),
        capacidad,
        elegido,
        resueltos,
        // Cuántos vasos hay que dejar de un solo color para terminar: los que
        // tienen color, no los vacíos.
        objetivo: (station.verter?.colores ?? ["cafe", "leche", "azucar"]).length,
        destello,
        label: station.label ?? null,
        icon: station.icon ?? "coffee",
        verbo: station.verter?.verbo ?? "Sirve el café sin mezclarlo",
      };
    },
  };
}
