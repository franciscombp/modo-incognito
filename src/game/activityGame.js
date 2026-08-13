/**
 * EL PULSO DE LA ACTIVIDAD — el minijuego de tarea (docs/CAMPANA.md §8).
 *
 * ── La decisión que manda sobre todas las demás ──
 *
 * Un minijuego de tarea NO PUEDE PAUSAR EL MUNDO. Es tentador (pantalla
 * completa, el microondas, la cola) y sería lo fácil, pero rompería justo lo
 * que el juego es: hacer una tarea tiene que EXPONERTE — estás parada, a la
 * vista, haciendo algo que no es trabajar. Si mientras juegas el jefe se
 * congela, las actividades pasan a ser el sitio MÁS SEGURO del piso, que es
 * lo contrario de su función. El bucle entero (MOTOR.md §1) vive de que el
 * tiempo que pasas avanzando no lo pasas cubriéndote.
 *
 * Así que esto corre EN EL PISO, sin pausa, sin tapar el escenario: una tira
 * fina y un pulso. El jefe sigue caminando mientras la juegas.
 *
 * ── Cómo se juega ──
 *
 * Mantener espacio en la estación avanza la tarea A PASO DE TORTUGA
 * (`RITMO_MANTENIENDO`). Antes bastaba con mantener y la tarea salía sola,
 * así que el pulso era decoración: se podía jugar el día entero sin tocar un
 * solo minijuego y nadie se enteraba de que existían. Ahora mantener es lo
 * que te MANTIENE en la tarea; lo que la termina son los toques.
 *
 * El suelo no desaparece, cambia de sitio: no puedes quedarte fuera del
 * minijuego, pero fallar toques nunca te bloquea — restan, no te expulsan.
 *
 * Encima va el PULSO: un marcador barre una tira y hay una zona buena.
 * Pulsar espacio (un toque, no el mantenido) dentro de la zona da un buen
 * pellizco de progreso; fuera, lo resta y hace RUIDO, que sube la sospecha.
 * O sea: jugar bien te saca antes de un sitio donde estás expuesta, y jugar
 * mal te delata. El premio es el reloj, que es la única moneda.
 *
 * ── Por qué un solo mecanismo y no tres minijuegos ──
 *
 * Cada actividad afina sus números desde el JSON de la escena (`pulso`), no
 * con código propio: el café es amable, el microondas va rápido y con la
 * zona estrecha (hay que pararlo antes del pitido), la película es lenta y
 * ancha. Tres sensaciones distintas, un solo sistema que mantener.
 */

/** Ajustes por defecto de una actividad que no declare `pulso` en su JSON. */
// LO QUE AVANZA MANTENIENDO, contra lo que avanza jugando. Con esto en 1 —
// que es como estuvo— el pulso no servía para nada: la tarea se terminaba
// sola con el dedo puesto y los minijuegos no existían en la práctica.
const RITMO_MANTENIENDO = 0.3;

const POR_DEFECTO = {
  periodo: 1.6, // segundos que tarda el marcador en cruzar la tira
  zona: 0.26, // ancho de la zona buena (0–1)
  aciertos: 3, // cuántos aciertos limpios completan la tarea
  bonus: 0.34, // fracción de la tarea que da un acierto
  fallo: 0.12, // fracción que quita un fallo
  ruido: 6, // sospecha que suma un fallo (hiciste ruido)
};

export function createActivityPulse({ onNoise = null, onFeedback = null } = {}) {
  let station = null;
  let cfg = POR_DEFECTO;
  let t = 0;
  let dir = 1;
  let pos = 0; // 0–1, dónde va el marcador
  let zoneAt = 0.5; // centro de la zona buena
  let aciertos = 0;
  let fallos = 0;

  /** La zona se recoloca en cada acierto: si no, se memoriza y deja de ser juego. */
  function recolocarZona() {
    const margen = cfg.zona / 2 + 0.06;
    zoneAt = margen + Math.random() * (1 - margen * 2);
  }

  return {
    get active() {
      return station !== null;
    },
    get station() {
      return station;
    },

    /** Empieza (o continúa) el pulso de esta estación. */
    begin(st) {
      if (station === st) return;
      station = st;
      cfg = { ...POR_DEFECTO, ...(st?.pulso ?? {}) };
      t = 0;
      dir = 1;
      pos = 0;
      aciertos = 0;
      fallos = 0;
      recolocarZona();
    },

    /** Se soltó la tecla o te fuiste: el pulso se apaga sin castigo. */
    end() {
      station = null;
    },

    /**
     * A qué RITMO avanza la tarea mientras solo mantienes la tecla. Muy por
     * debajo de 1 a propósito: es lo que obliga a jugar el pulso en vez de
     * dejar el dedo puesto. Ver `RITMO_MANTENIENDO`.
     */
    get ritmoMantenido() {
      return RITMO_MANTENIENDO;
    },

    update(dt) {
      if (!station) return;
      // Rebote de extremo a extremo. Un ciclo completo son dos periodos.
      pos += (dt / Math.max(0.2, cfg.periodo)) * dir;
      if (pos >= 1) {
        pos = 1;
        dir = -1;
      } else if (pos <= 0) {
        pos = 0;
        dir = 1;
      }
      t += dt;
    },

    /**
     * Un toque. Devuelve "acierto" | "fallo" | null, y aplica el efecto sobre
     * el progreso de la estación. Quien llama decide qué hacer con el aviso.
     */
    hit() {
      if (!station) return null;
      // Gracia al empezar: la MISMA pulsación que arranca la tarea llega aquí
      // como toque, con el marcador todavía en el extremo — o sea un fallo
      // seguro. Castigar por ponerte a trabajar no tiene ninguna gracia.
      if (t < 0.25) return null;
      const dentro = Math.abs(pos - zoneAt) <= cfg.zona / 2;
      const total = station.time || 1;
      if (dentro) {
        aciertos += 1;
        station.progress = Math.min(total, station.progress + total * cfg.bonus);
        recolocarZona();
        // Cada acierto acelera un poco: la tarea se pone nerviosa hacia el
        // final en vez de ser tres veces lo mismo.
        cfg = { ...cfg, periodo: Math.max(0.5, cfg.periodo * 0.88) };
        onFeedback?.("acierto", { aciertos, necesarios: cfg.aciertos });
        return "acierto";
      }
      fallos += 1;
      station.progress = Math.max(0, station.progress - total * cfg.fallo);
      // El fallo hace RUIDO, y el ruido es lo que ata esto al bucle: no es
      // "menos puntos", es que alguien te oyó.
      onNoise?.(cfg.ruido);
      onFeedback?.("fallo", { aciertos, necesarios: cfg.aciertos });
      return "fallo";
    },

    /** Lo que el HUD necesita pintar. `null` si no hay pulso en marcha. */
    snapshot() {
      if (!station) return null;
      return {
        pos,
        zona: cfg.zona,
        zonaAt: zoneAt,
        aciertos,
        fallos,
        necesarios: cfg.aciertos,
        label: station.label ?? null,
      };
    },

    /**
     * Bonificación de reloj por lo limpia que fue la tarea, en segundos.
     * Cero fallos paga; empezar a fallar se lo come. No es un castigo extra
     * —el ruido ya castigó— sino la zanahoria de jugarlo bien.
     */
    bonusReloj() {
      if (!station || aciertos === 0) return 0;
      const limpio = Math.max(0, aciertos - fallos);
      return Math.round(limpio * 4);
    },
  };
}
