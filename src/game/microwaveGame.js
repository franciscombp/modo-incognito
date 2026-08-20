/**
 * EL MICROONDAS — centrar el plato sin quemarte.
 *
 * ── Qué es ──
 *
 * El plato gira en el carrusel y se va del centro solo. Tú lo empujas de
 * vuelta. Mientras está centrado, la comida se calienta —la tarea avanza—;
 * fuera del centro se calienta por un lado y EMPIEZA A QUEMARSE, y quemarse
 * huele, o sea que hace RUIDO.
 *
 * ── Por qué este y no otra tira ──
 *
 * Es el cuarto verbo de puntero y el primero de ARRASTRE: los vasos y los
 * cables son tocar-y-tocar, esto es agarrar y mover. En un teléfono es el
 * gesto más natural que existe, y en un ordenador es el que todo el mundo
 * espera de algo que se ve arrastrable.
 *
 * ── Tres mandos, como los otros dos ──
 *
 * Una sola acción: `empujar(dx, dy)`. La usan el arrastre del ratón, el del
 * dedo (los mismos eventos de puntero) y el mando de andar, que mientras
 * dura esto no camina — el mismo trato que ya tiene el gesto, así que no hay
 * tecla nueva que aprender ni nada que inventar en táctil.
 *
 * ── La regla que NO cambia ──
 *
 * PAUSA EL MUNDO mientras dura la pantalla. Fue al revés durante mucho
 * tiempo, porque congelar al jefe hacía de la estación un escudo; la causa
 * no era la pausa sino poder ENTRAR con él encima, y eso ya no se puede
 * (`_puedeAbrirMinijuego`). La cuenta atrás de la tarea NO se para: esa es
 * la presión. Lo vigila `npm run check:pausa`.
 */

// Cuánto se aleja el plato por segundo si no lo tocas. Es lo que hace que
// esto sea sostener y no colocar: puesto en el centro, se queda quieto y el
// minijuego dejaría de existir a los dos segundos.
const DERIVA = 0.42;
// Lo lejos del centro que se considera «centrado» (radio, 0-1).
const ZONA = 0.26;
// Lo que tarda en quemarse del todo estando fuera, en segundos.
const QUEMADO = 2.6;
// El ruido que hace quemarse. Va por SUCESO, no por segundo: el olor sale
// cuando se quema, no mientras se va calentando mal.
const RUIDO_QUEMADO = 8;
// Lo que tira de la tarea estar centrado, como fracción de su duración por
// segundo.
const AVANCE = 0.5;

/**
 * @param {object} opts
 * @param {Function} opts.onNoise    Sube la sospecha (se quemó).
 * @param {Function} opts.onFeedback "centrado" | "quemado"
 */
export function createMicrowaveGame({ onNoise, onFeedback, random = Math.random } = {}) {
  let station = null;
  let x = 0;
  let y = 0;
  // Hacia dónde se va solo. Cambia de rumbo cada tanto: con una deriva fija
  // se aprende el empujón en dos intentos y ya no hay nada que hacer.
  let rumbo = 0;
  let cambio = 0;
  let quema = 0;
  let dentro = false;
  let destello = null;
  let destelloT = 0;

  const radio = () => Math.hypot(x, y);

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
      const cfg = st?.microondas ?? {};
      // Empieza YA descentrado: puesto en el centro, el primer segundo del
      // minijuego no pide nada y se lee como que no ha empezado.
      const a = random() * Math.PI * 2;
      x = Math.cos(a) * 0.55;
      y = Math.sin(a) * 0.55;
      rumbo = random() * Math.PI * 2;
      cambio = 0;
      quema = 0;
      dentro = false;
      destello = null;
      destelloT = 0;
      station._microondasCfg = { zona: cfg.zona ?? ZONA, deriva: cfg.deriva ?? DERIVA };
    },

    end() {
      station = null;
    },

    update(dt) {
      if (!station) return;
      const cfg = station._microondasCfg ?? { zona: ZONA, deriva: DERIVA };

      // El plato se va solo, y el rumbo cambia cada tanto.
      cambio -= dt;
      if (cambio <= 0) {
        cambio = 0.7 + random() * 0.9;
        rumbo += (random() - 0.5) * 2.2;
      }
      x += Math.cos(rumbo) * cfg.deriva * dt;
      y += Math.sin(rumbo) * cfg.deriva * dt;
      // El plato no se sale del microondas: se queda pegado al borde. Que se
      // pierda de vista sería castigar con algo que ya no se puede arreglar.
      const r = radio();
      if (r > 1) {
        x /= r;
        y /= r;
      }

      dentro = radio() <= cfg.zona;
      if (dentro) {
        // CENTRADO: la comida se calienta bien y el quemado se enfría.
        quema = Math.max(0, quema - dt * 1.4);
        const total = station.time || 1;
        station.progress = Math.min(total, station.progress + total * AVANCE * dt);
      } else {
        quema += dt;
        if (quema >= QUEMADO) {
          quema = 0;
          destello = "quemado";
          destelloT = 0.5;
          onNoise?.(station.microondas?.ruido ?? RUIDO_QUEMADO);
          onFeedback?.("quemado");
        }
      }

      if (destelloT > 0) {
        destelloT -= dt;
        if (destelloT <= 0) destello = null;
      }
    },

    /**
     * LA ÚNICA ACCIÓN. `dx`/`dy` en el mismo espacio que la posición del
     * plato (-1..1). La llaman el arrastre del ratón, el del dedo y el mando
     * de andar: tres entradas, una puerta.
     */
    empujar(dx, dy) {
      if (!station) return;
      x += dx;
      y += dy;
      const r = radio();
      if (r > 1) {
        x /= r;
        y /= r;
      }
    },

    /** Colocar el plato donde apunta el puntero (arrastre absoluto). */
    poner(nx, ny) {
      if (!station) return;
      x = nx;
      y = ny;
      const r = radio();
      if (r > 1) {
        x /= r;
        y /= r;
      }
    },

    snapshot() {
      if (!station) return null;
      const cfg = station._microondasCfg ?? { zona: ZONA, deriva: DERIVA };
      return {
        x,
        y,
        zona: cfg.zona,
        dentro,
        // 0–1: lo quemado que va. Es lo que hay que poder leer de un vistazo
        // para saber si da tiempo a corregir o hay que soltarlo todo.
        quema: Math.min(1, quema / QUEMADO),
        destello,
        label: station.label ?? null,
        icon: station.icon ?? "snack",
        verbo: station.microondas?.verbo ?? "Centra el plato antes de que se queme",
        progreso: station.time ? Math.min(1, (station.progress ?? 0) / station.time) : 0,
      };
    },
  };
}
