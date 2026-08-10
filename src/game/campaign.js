/**
 * EL DIRECTOR DE CAMPAÑA (docs/CAMPANA.md).
 *
 * La pieza que no existía: quien sabe en qué temporada y día vas, qué
 * misiones están ACTIVAS, cuál se acaba de desbloquear y qué nota llevas.
 * El motor (game.js) sigue sin saber nada de temporadas — recibe una lista
 * de objetivos como siempre; este módulo decide cuál es esa lista y qué
 * pasa cuando una misión cae.
 *
 * Las reglas que implementa, y su porqué:
 *
 * · CADENA CON HOLGURA. `requiere` encadena misiones, pero se muestran
 *   TODAS las elegibles a la vez (no una): la cadena dice QUÉ hacer, nunca
 *   CUÁNDO ni POR DÓNDE — con una sola misión activa el piso se vuelve un
 *   pasillo y el sigilo muere (CAMPANA §3.1).
 *
 * · QUÉS Y CÓMOS. Los 'que' se hacen a solas; los 'como' exigen a otro
 *   personaje. La calificación los mira POR SEPARADO: puedes cumplir todo
 *   tu trabajo y fallar por no hablar con nadie, que es exactamente lo que
 *   te dice una evaluación de verdad (§3.2, §5.2).
 *
 * · GUARDADO POR PROGRESO DE TAREAS. Una 'unica' completada se persiste EN
 *   EL ACTO — puedes cerrar el juego a mitad de jornada y no la pierdes.
 *   Las 'diaria' son la rutina: no persisten, vuelven cada día (§9).
 *
 * · LA NOTA. AAA = todo (qués Y cómos) en el día 1 → saltas la temporada,
 *   ascendida. A secas = todo, pero en 4-5 días: el ascenso por
 *   antigüedad. B/C señalan el eje que descuidaste (§5.2).
 */

const RANGOS = ["Aprendiz", "Junior", "Especialista", "Senior", "Octogenaria", "Jubilación"];

export function createCampaign({ save, data }) {
  const misiones = data?.misiones ?? [];
  const porId = new Map(misiones.map((m) => [m.id, m]));

  // Estado persistente (save) + estado del día en curso (memoria).
  function persisted() {
    return save.campaign ?? { temporada: 1, dia: 1, unicas: [] };
  }
  let hoy = new Set(); // ids completados HOY (únicas y diarias por igual)

  function hechasTotales() {
    return new Set([...persisted().unicas, ...hoy]);
  }

  function elegible(m, hechas) {
    if (hechas.has(m.id) && m.recurrencia === "unica") return false;
    if (hoy.has(m.id)) return false; // una diaria hecha hoy no reaparece hoy
    return (m.requiere ?? []).every((r) => hechas.has(r));
  }

  return {
    get active() {
      return misiones.length > 0;
    },
    get dia() {
      return persisted().dia;
    },
    get temporada() {
      return persisted().temporada;
    },
    get rango() {
      return data?.rango ?? RANGOS[Math.min(persisted().temporada - 1, RANGOS.length - 1)];
    },

    /** Arranque de jornada: qué misiones entran hoy. */
    startDay() {
      hoy = new Set();
      const hechas = hechasTotales();
      return misiones.filter((m) => elegible(m, hechas));
    },

    /**
     * Una misión cayó. Persiste si es única (guardado por tareas: en el
     * ACTO, no al final del día) y devuelve las que se DESBLOQUEAN con
     * ella, para añadirlas al piso en caliente.
     */
    complete(id) {
      const m = porId.get(id);
      if (!m || hoy.has(id)) return [];
      const antes = hechasTotales();
      hoy.add(id);
      if (m.recurrencia === "unica" && !persisted().unicas.includes(id)) {
        const c = persisted();
        save.campaign = { ...c, unicas: [...c.unicas, id] };
      }
      const ahora = hechasTotales();
      return misiones.filter((x) => !elegible(x, antes) && elegible(x, ahora));
    },

    /**
     * Terminado el plan de nivelación: vuelta al día 1 de la MISMA temporada.
     * Las misiones únicas ya hechas siguen hechas — el guardado es por tareas
     * (§9), así que el plan cuesta tiempo y orgullo, nunca progreso. Sin esto
     * el calendario se quedaba clavado en el día 5 y la nivelación se repetía
     * cada jornada para siempre.
     */
    afterLevelling() {
      const c = persisted();
      save.campaign = { ...c, dia: 1 };
    },

    /** ¿Queda algo por hacer en la TEMPORADA? (las únicas pendientes) */
    unicasPendientes() {
      const hechas = hechasTotales();
      return misiones.filter((m) => m.recurrencia === "unica" && !hechas.has(m.id));
    },

    /**
     * Cierre de jornada: la nota de RRHH y el avance de calendario.
     * Devuelve { nota, detalle, ascenso } — el motor solo la pinta.
     */
    endDay({ win }) {
      const c = persisted();
      const hechas = hechasTotales();

      // QUÉ ESTUVO EN TU PLATO HOY.
      //
      // Esto lo decidía `elegible(m, new Set(c.unicas))`, o sea mirando solo
      // las ÚNICAS ya guardadas — y ahí había un agujero que se comía el
      // chiste central del juego: una misión desbloqueada por un requisito
      // DIARIO no aparecía nunca. En la temporada 1, `chisme-fran` (cómo)
      // depende de `fingir-101` (diaria); como las diarias no se persisten,
      // la evaluación no lo contaba jamás y la nota B —«cumples los qués
      // pero no hablas con nadie»— era inalcanzable por esa vía.
      //
      // La definición correcta es: estuvo en tu plato si sus requisitos
      // quedaron satisfechos hoy (mirando TODO lo hecho, no solo lo
      // guardado) y no es una única que ya despachaste otro día.
      const delDia = misiones.filter((m) => {
        const yaConsumida =
          m.recurrencia === "unica" && c.unicas.includes(m.id) && !hoy.has(m.id);
        if (yaConsumida) return false;
        return (m.requiere ?? []).every((r) => hechas.has(r));
      });
      const ques = delDia.filter((m) => m.tipo === "que");
      const comos = delDia.filter((m) => m.tipo === "como");
      const quesOk = ques.every((m) => hechas.has(m.id));
      const comosOk = comos.every((m) => hechas.has(m.id));
      const temporadaCompleta = this.unicasPendientes().length === 0 && quesOk && comosOk;

      let nota, detalle, ascenso = false;
      if (temporadaCompleta && c.dia === 1) {
        nota = "AAA";
        detalle = "Alto desempeño. Pasas directo a la siguiente temporada.";
        ascenso = true;
      } else if (temporadaCompleta && c.dia <= 3) {
        nota = "AA";
        detalle = "Buen ritmo. Asciendes con méritos (casi).";
        ascenso = true;
      } else if (temporadaCompleta) {
        nota = "A";
        detalle = "Asciendes por antigüedad: no había nadie más que durara tanto.";
        ascenso = true;
      } else if (c.dia >= 5) {
        // LA NIVELACIÓN VA ANTES QUE B Y C, y el orden importa: estaba
        // detrás, así que en el día 5 una B («cumples pero no hablas»)
        // ganaba y la red de seguridad solo saltaba si fallabas los DOS
        // ejes a la vez. O sea que casi nadie la habría visto nunca, y
        // quien llegara al día 5 con medio expediente se quedaba dando
        // vueltas en el día 5 para siempre. Llegar al quinto sin cerrar la
        // temporada es la condición, venga por donde venga.
        nota = "Nivelación";
        detalle = "Cinco días sin cerrar la temporada: plan de nivelación.";
      } else if (quesOk && !comosOk) {
        nota = "B";
        detalle = "Cumples los qués, pero hay que trabajar los cómos: habla con la gente.";
      } else if (!quesOk && comosOk) {
        nota = "C";
        detalle = "Muy buena actitud. Cero resultados. RRHH está «preocupado».";
      } else {
        nota = win ? "En curso" : "—";
        detalle = "La temporada sigue: mañana, más.";
      }

      // ── EL CALENDARIO CORRE PASE LO QUE PASE ────────────────────────
      // Antes el día solo avanzaba `if (win || nota === "AAA")`: fallar
      // congelaba la fecha y repetir el nivel te devolvía al MISMO día una y
      // otra vez, así que la carrera no avanzaba mientras no ganaras. Es lo
      // contrario de lo que cuenta el juego — un día malo en la oficina
      // sigue siendo un día que pasó, y el lunes siguiente llega igual.
      //
      // Ahora la fecha avanza siempre y lo único que se gana ganando es el
      // ASCENSO (saltar de temporada). Perder cuesta lo que tiene que
      // costar: un día menos de los cinco antes de que salte el plan de
      // nivelación, que es la red y no un castigo (§8).
      if (ascenso) {
        save.campaign = { temporada: c.temporada + 1, dia: 1, unicas: [] };
      } else {
        save.campaign = { ...c, dia: Math.min(5, c.dia + 1) };
      }
      return {
        nota,
        detalle,
        ascenso,
        rango: this.rango,
        rangoSiguiente: data?.rangoSiguiente ?? null,
        dia: c.dia,
        temporada: c.temporada,
        // LOS DOS EJES, POR SEPARADO. Es el chiste central de la evaluación
        // (§3.2) y hasta ahora se resumía en una letra: la pantalla de
        // desempeño necesita poder enseñar que cumpliste todo tu trabajo y
        // aun así te suspenden por no hablar con nadie.
        ques: { hechos: ques.filter((m) => hechas.has(m.id)).length, total: ques.length },
        comos: { hechos: comos.filter((m) => hechas.has(m.id)).length, total: comos.length },
      };
    },
  };
}
