/**
 * LOS CABLES — el reto de puntero para CONSEGUIR algo, no para hacerlo.
 *
 * ── Por qué existe ──
 *
 * Conseguir el HDMI era pulsar una tecla al lado de una sala. Robar la pieza
 * clave de tu escaqueo del día no puede costar lo mismo que abrir una
 * puerta: si el objeto no cuesta nada, el bucle «conseguir → activar →
 * aguantar» tiene su primer tramo vacío, y el objeto no se siente como un
 * LOGRO — que es justo lo que tiene que sentirse, porque es lo que después
 * te delata mientras lo llevas encima.
 *
 * ── Por qué ESTE formato ──
 *
 * Es la tarea de cables de Among Us, y se elige por lo mismo que el puzle de
 * verter: todo el mundo ya sabe jugarla. Ves cuatro colores a la izquierda,
 * cuatro a la derecha desordenados, y unes cada uno con el suyo. No hay
 * nada que explicar, se resuelve en segundos, y cada conexión da su chasquido
 * de «bien». Encaja igual en ratón (clic-clic), en dedo (toque-toque) y en
 * teclado (una tecla por extremo).
 *
 * Y encaja con la ficción sin forzarla: estás robando un cable de una sala
 * de reuniones, así que el reto ES desenchufar y volver a enchufar.
 *
 * ── El mismo modelo que los vasos, a propósito ──
 *
 * Una sola acción, `elegir(lado, i)`. Tocar un extremo lo levanta, tocar el
 * del otro lado intenta la conexión. Dos módulos distintos con dos maneras
 * distintas de leer la entrada serían dos cosas que mantener; así, quien
 * quiera añadir un mando nuevo hace lo mismo en los dos.
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

// Fallar una conexión hace RUIDO: estás trasteando con los cables de una
// sala que no es tuya y se te oye. No hay castigo de progreso — deshacer lo
// hecho por equivocarte de color convierte un puzle claro en una lotería.
const RUIDO_FALLO = 5;

function barajar(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {object} opts
 * @param {Function} opts.onNoise    Sube la sospecha (una conexión mal).
 * @param {Function} opts.onFeedback "unido" | "fallo" | "punta".
 * @param {Function} opts.onWin      Se llama UNA vez, al unirlos todos.
 */
export function createCableGame({ onNoise, onFeedback, onWin, random = Math.random } = {}) {
  let activo = false;
  let izq = [];
  let der = [];
  let unidos = new Set();
  let punta = null; // { lado: "izq"|"der", i }
  let destello = null;
  let destelloT = 0;
  let titulo = "";
  let ganado = false;

  return {
    get active() {
      return activo;
    },

    /**
     * @param {object} cfg colores (lista), titulo
     */
    begin(cfg = {}) {
      if (activo) return;
      activo = true;
      ganado = false;
      const colores = cfg.colores ?? ["rojo", "azul", "amarillo", "verde"];
      titulo = cfg.titulo ?? "Desconecta y vuelve a conectar";
      // La izquierda va en orden y la derecha barajada: es lo que hace que
      // haya algo que resolver. Barajar las DOS no añade dificultad, solo
      // obliga a leer dos veces.
      izq = [...colores];
      der = barajar([...colores], random);
      unidos = new Set();
      punta = null;
      destello = null;
      destelloT = 0;
    },

    end() {
      activo = false;
      punta = null;
    },

    update(dt) {
      if (!activo) return;
      if (destelloT > 0) {
        destelloT -= dt;
        if (destelloT <= 0) destello = null;
      }
    },

    /** Soltar la punta levantada sin conectar nada. */
    soltar() {
      punta = null;
    },

    /**
     * LA ÚNICA ACCIÓN. `lado` es "izq" o "der", `i` el índice en ese lado.
     * Tocar una punta la levanta; tocar una del OTRO lado intenta unirlas.
     */
    elegir(lado, i) {
      if (!activo) return null;
      const lista = lado === "izq" ? izq : der;
      if (i == null || i < 0 || i >= lista.length) return null;
      const color = lista[i];
      // Un cable ya conectado no se vuelve a tocar: reconectar lo que ya
      // está bien no es una decisión, es ruido de interfaz.
      if (unidos.has(color)) return null;

      if (!punta) {
        punta = { lado, i };
        destello = { lado, i, tipo: "punta" };
        destelloT = 0.3;
        onFeedback?.("punta", { lado, i });
        return "punta";
      }
      if (punta.lado === lado) {
        // Otra punta del MISMO lado: se cambia de idea, no es un fallo.
        punta = { lado, i };
        return "punta";
      }

      const colorPunta = (punta.lado === "izq" ? izq : der)[punta.i];
      const acierto = colorPunta === color;
      const donde = { lado, i };
      punta = null;

      if (!acierto) {
        destello = { ...donde, tipo: "fallo" };
        destelloT = 0.4;
        onNoise?.(RUIDO_FALLO);
        onFeedback?.("fallo", donde);
        return "fallo";
      }

      unidos.add(color);
      destello = { ...donde, tipo: "unido" };
      destelloT = 0.35;
      onFeedback?.("unido", { ...donde, unidos: unidos.size, total: izq.length });
      if (unidos.size === izq.length && !ganado) {
        ganado = true;
        onWin?.();
        return "ganado";
      }
      return "unido";
    },

    snapshot() {
      if (!activo) return null;
      return {
        titulo,
        izq: izq.map((c, i) => ({ color: c, unido: unidos.has(c), i })),
        der: der.map((c, i) => ({ color: c, unido: unidos.has(c), i })),
        punta,
        unidos: unidos.size,
        total: izq.length,
        destello,
      };
    },
  };
}
