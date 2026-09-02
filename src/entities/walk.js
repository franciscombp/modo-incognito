/**
 * EL PASEO — una sola forma de ir andando a un sitio, y la promesa de que
 * NADIE SE QUEDA TRABADO.
 *
 * ── El fallo que vino a arreglar ──────────────────────────────────────────
 *
 * Había TRES formas de caminar hacia un punto y ninguna de las tres sabía
 * salir de un atasco:
 *
 *   · `player.walkTo` (la caminata guiada: te sientan, te escoltan) iba en
 *     LÍNEA RECTA. Basta una maceta en medio para que te quedes empujándola
 *     el resto de la jornada, y con el control bloqueado — que desde fuera se
 *     ve exactamente igual que un juego colgado. Es el bug que se ve en la
 *     captura de la escolta: los dos cuerpos apretados contra una planta.
 *   · `npc._walkAlong` seguía la ruta del navmesh pero NO resolvía colisiones
 *     ni medía si avanzaba. Como la separación de cuerpos (game.js →
 *     `_updateCrowdSeparation`) empuja a los figurantes fuera de su ruta, uno
 *     empujado contra un mueble se quedaba moliendo contra él para siempre,
 *     porque su waypoint seguía estando al otro lado.
 *   · `boss._steer` sí ruteaba y sí medía, pero su salida del atasco era un
 *     CODAZO EN DIRECCIÓN ALEATORIA: a veces salía, a veces se metía más.
 *
 * ── Lo que hace este módulo ───────────────────────────────────────────────
 *
 * Un caminante con memoria: guarda su ruta, la recorta por delante (tirón de
 * cuerda) y, sobre todo, MIDE SI DE VERDAD AVANZA. Cuando no avanza, escala:
 *
 *   1. REPLANIFICA (0.45 s sin avanzar). Cubre el caso más común con
 *      diferencia: te empujaron fuera de la ruta y tu siguiente waypoint ya
 *      no se ve desde donde estás. Pedir ruta otra vez desde donde estás
 *      ahora lo arregla solo.
 *   2. PASO LATERAL (1.1 s). El navmesh solo conoce el edificio: no sabe de
 *      cuerpos, ni de sillas que rodaron, ni de macetas colocadas después.
 *      Contra eso no hay ruta que valga — hay que BORDEAR. Se prueban los dos
 *      costados y se elige el que de verdad produce avance, y se sostiene esa
 *      elección medio segundo (un lado sostenido rodea un obstáculo; alternar
 *      de lado cada cuadro es vibrar contra él, que es lo que hacía el codazo
 *      aleatorio).
 *   3. SE RINDE (3 s). Y esto es lo importante: se rinde AVISANDO
 *      (`abandonado`), en vez de seguir moliendo en silencio. Quien llamó
 *      decide qué hacer con eso — el figurante se busca otro destino, la
 *      escolta baja el telón. Un caminante que no puede llegar y no lo dice
 *      es exactamente el bug que estamos quitando.
 *
 * Nada de esto teletransporta a nadie: el paso siempre sale de la misma
 * dirección de caminar y pasa por las mismas colisiones. La regla de la casa
 * (`docs/MOTOR.md`: nadie parpadea de sitio) se mantiene entera.
 */
import { WORLD_SCALE as S } from "../scene/config.js";

/**
 * Qué fracción del paso esperado hay que recorrer para que cuente como
 * avanzar. Bajo a propósito: rozar una esquina y salir frenada es caminar,
 * aunque se pierda la mitad del paso. Lo que este número tiene que cazar es
 * el cuerpo que NO se mueve, no el que va despacio.
 */
const AVANCE_MINIMO = 0.15;

/**
 * Los peldaños, en segundos SIN PROGRESAR — y «progresar» es acortar el
 * camino que queda, no moverse.
 *
 * La primera versión los medía por desplazamiento y no servía para el caso
 * que vino a arreglar: `resolveCircle` empuja fuera del obstáculo por el eje
 * más corto, así que un cuerpo apretado contra una maceta SE DESLIZA por su
 * borde unos centímetros por cuadro. Eso es moverse — el detector lo daba por
 * bueno y el paso lateral no llegaba a activarse nunca. Medido: la jugadora
 * se quedaba clavada contra la planta los cuatro segundos enteros y solo
 * entonces se rendía, que es exactamente el bug de la captura.
 *
 * (Y la maceta engaña por tamaño: su colisionador mide 0.6·S y la casilla del
 * navmesh 0.5·S, así que puede caber ENTRE los puntos que el navmesh sondea y
 * la ruta le pasa por encima tan tranquila. Contra eso no hay A* que valga:
 * hay que bordear.)
 */
const REPLANIFICAR_A = 0.5;
const BORDEAR_A = 0.9;

/** Atajo: parado del todo es atasco seguro, sin esperar al reloj de arriba. */
const CLAVADO_A = 0.5;

/**
 * El tercero se mide con OTRO reloj: segundos sin ACERCARSE al destino.
 *
 * Y esta distinción costó una prueba. Rendirse por «no me he movido» deja
 * fuera el peor caso de todos: el que SÍ se mueve y no llega a ningún sitio.
 * `resolveCircle` desliza a lo largo de las paredes, así que un cuerpo
 * empujando contra un muro camina —de verdad, centímetros por cuadro— pero
 * bordeando el piso en círculos. Medido con un destino imposible: quince
 * segundos dando vueltas sin que el detector viera nada raro, porque desde
 * dentro parecía alguien caminando tan campante.
 *
 * Es generoso a propósito: rodear un obstáculo grande ALEJA temporalmente, y
 * eso es exactamente lo que se quiere que haga.
 */
const RENDIRSE_A = 4;

/** Cuánto hay que recortar la distancia para que cuente como acercarse. */
const ACERCARSE_MIN = 0.25;

/** Cuánto se sostiene un costado antes de probar el otro. */
const BORDEO_MIN = 0.5;

/** Coseno por debajo del cual un cambio de rumbo es un VOLANTAZO (>100°). */
const VOLANTAZO = -0.17;
/** Cuántos cuadros tiene que INSISTIR un volantazo para que se le haga caso.
 *  Uno solo es ruido —el blanco que se mueve, el costado que alterna—; los de
 *  verdad (hay que volver por donde viniste) duran. Cuesta ~5 centésimas de
 *  retraso en un giro legítimo y ahorra la pirueta en los falsos. */
const VETO_CUADROS = 3;

/** Cada cuánto se puede volver a pedir ruta (el A* no es gratis). */
const REPLAN_COOLDOWN = 0.4;

/**
 * Cuánto puede haberse ido el blanco de donde estaba al trazar la ruta antes
 * de que ese plan deje de valer.
 *
 * Un par de mesas: por debajo, el tirón de cuerda ya corrige solo —apunta al
 * waypoint más lejano visible, y unos centímetros de deriva no cambian cuál
 * es—. Por encima, se está caminando hacia donde el otro ESTABA. Es el mismo
 * criterio y el mismo número que usa `boss._steer` para su `goalMoved`, que
 * es donde se aprendió.
 */
const BLANCO_SE_FUE = 1.2;

/** Cuántos waypoints mira el tirón de cuerda. Más allá no se nota. */
const CUERDA = 6;

/**
 * @param {object} opts.navmesh  el del piso (scene/navmesh.js). Sin él, el
 *   paseo degrada a línea recta — que es lo que había antes, así que un
 *   montaje sin navmesh sigue funcionando igual de mal pero no peor.
 * @param {object} opts.world    el mundo de colisiones, para el paso y para
 *   preguntar «¿paso?» (`pathBlocked`, que infla por el ancho del cuerpo).
 * @param {number} opts.radius   el ancho del cuerpo que camina.
 */
export function createWalker({ navmesh = null, world = null, radius = 0.3 * S } = {}) {
  let destino = null;
  let ruta = null;
  // PARA QUÉ PUNTO SE TRAZÓ LA RUTA. Sin esta memoria, un blanco que se
  // desplaza poco a poco —la escolta reescribe el suyo cada cuadro con la
  // posición de Gabo— actualizaba el destino en el sitio y la ruta se quedaba
  // apuntando a donde el otro ESTABA. Se caminaba un plan viejo.
  let rutaPara = null;
  let sinAvanzar = 0;
  let sinAcercarse = 0;
  let mejorDistancia = Infinity;
  let replanEn = 0;
  let bordeo = null; // { signo: -1|1, restante: number }
  // El rumbo del cuadro anterior, para vetar los volantazos de UN cuadro.
  let dirPrev = null;
  let vetado = 0;
  const anterior = { x: 0, z: 0 };

  function limpiar() {
    ruta = null;
    rutaPara = null;
    sinAvanzar = 0;
    sinAcercarse = 0;
    mejorDistancia = Infinity;
    bordeo = null;
    dirPrev = null;
    vetado = 0;
  }

  /**
   * LO QUE FALTA DE CAMINO, medido SOBRE LA RUTA y no en línea recta.
   *
   * Y esta distinción es la que hacía falta: rodear ALEJA. Para cruzar al otro
   * ala hay que ir primero hasta la puerta del muro, que puede estar en
   * dirección contraria a tu destino — así que con la distancia en línea recta
   * el detector veía varios segundos sin acercarse ni un palmo y daba por
   * atascada a una jugadora que iba caminando perfectamente hacia la puerta.
   * Medido en el piso 7: se rendía a los cuatro segundos habiendo avanzado
   * 1,2 de las 13 unidades, y el paseo era correcto.
   *
   * Sumando los tramos que quedan, un rodeo SÍ es progreso: cada paso hacia la
   * puerta recorta el total aunque la línea recta al destino no se mueva.
   */
  function restante(pos) {
    if (!ruta?.length) {
      return destino ? Math.hypot(destino.x - pos.x, destino.z - pos.z) : 0;
    }
    let total = Math.hypot(ruta[0].x - pos.x, ruta[0].z - pos.z);
    for (let i = 0; i < ruta.length - 1; i++) {
      total += Math.hypot(ruta[i + 1].x - ruta[i].x, ruta[i + 1].z - ruta[i].z);
    }
    return total;
  }

  /**
   * @param {object} desde  desde dónde se traza.
   * @param {boolean} [opts.blancoNuevo]  si se replanifica porque EL BLANCO SE
   *   MOVIÓ (no porque estemos trabados). La diferencia importa para el reloj
   *   de rendirse: no acercarse a algo que se está yendo no es culpa de quien
   *   camina, así que ahí el reloj se pone a cero y se sigue. Trabado contra un
   *   mueble, en cambio, el reloj SIGUE corriendo — si no, replanificar cada
   *   0,4 s sería una forma de no rendirse nunca.
   */
  function planificar(desde, { blancoNuevo = false } = {}) {
    if (!destino) return;
    replanEn = REPLAN_COOLDOWN;
    rutaPara = { x: destino.x, z: destino.z };
    if (!navmesh) {
      ruta = [{ x: destino.x, z: destino.z }];
      if (blancoNuevo) {
        mejorDistancia = restante(desde);
        sinAcercarse = 0;
      }
      return;
    }
    // El destino se ARRIMA a suelo pisable antes de pedir ruta. Un punto
    // dentro de una mesa o de un muro no tiene camino, y el A* recorre la
    // rejilla ENTERA antes de rendirse — medido en su día en segundos por
    // llamada (ver el comentario de `leaveFloor` en npc.js). `snap` lo
    // convierte en el punto pisable más cercano, que es lo que se quería.
    const meta = navmesh.snap(destino.x, destino.z) ?? destino;
    ruta = navmesh.path(desde, meta) ?? null;
    if (!ruta?.length) ruta = null;
    if (blancoNuevo) {
      // EL BLANCO SE MOVIÓ: la tarea es otra, así que la vara de medir el
      // progreso se pone a cero. Perseguir a alguien que se aleja no puede
      // contar como estar atascado — con la marca vieja, seguir a Gabo dos
      // pasos por detrás se leía como «no me acerco» y el caminante soltaba
      // la persecución a los cuatro segundos.
      mejorDistancia = restante(desde);
      sinAcercarse = 0;
      return;
    }
    // UNA RUTA NUEVA PUEDE SER MÁS LARGA que la vieja, legítimamente (te
    // empujaron al lado equivocado de una fila de mesas). Si se dejara la
    // marca antigua, esa ruta correcta no bajaría nunca del mejor valor
    // logrado y el caminante se rendiría caminando bien. Se sube el listón al
    // nuevo camino — pero NO se pone a cero el reloj: replanificar cada 0,4 s
    // mientras se está trabado no puede ser una forma de no rendirse nunca.
    mejorDistancia = Math.max(mejorDistancia, restante(desde));
  }

  return {
    /**
     * Adoptar el mundo de colisiones si no se tenía al construir. La jugadora
     * se crea antes de que el piso exista y recibe el mundo en cada `update`,
     * así que sin esto su caminante nunca podría preguntar «¿paso?» y se
     * quedaría sin tirón de cuerda ni paso lateral — o sea, sin lo único que
     * lo distingue de la línea recta de antes.
     */
    usarMundo(w) {
      if (w && !world) world = w;
    },

    /** ¿Hay un sitio al que ir ahora mismo? */
    get activo() {
      return destino !== null;
    },

    get destino() {
      return destino;
    },

    /** A dónde va el paso AHORA (el waypoint vivo), para quien quiera mirar. */
    get waypoint() {
      return ruta?.[0] ?? destino;
    },

    /**
     * Ir a un sitio. Repetir el mismo destino NO reinicia la ruta: la escolta
     * lo reescribe cada cuadro, y replanificar sesenta veces por segundo era
     * gastar el A* entero en volver a trazar lo mismo.
     */
    ir(x, z) {
      if (destino && Math.hypot(destino.x - x, destino.z - z) < 0.4 * S) {
        // Movimiento pequeño: se actualiza en el sitio y NO se tira la ruta —
        // ni los relojes de atasco, que reiniciados cada cuadro no cazarían
        // nada. Que la ruta siga sirviendo se comprueba aparte, en `paso`
        // (`rutaPara`): la deriva se acumula, y sesenta pasitos de nada son
        // una mesa entera.
        destino.x = x;
        destino.z = z;
        return;
      }
      destino = { x, z };
      limpiar();
    },

    /** Dejar de ir a ningún sitio. */
    parar() {
      destino = null;
      limpiar();
    },

    /**
     * Un cuadro de paseo.
     *
     * NO mueve a nadie: devuelve la DIRECCIÓN en la que hay que caminar, para
     * que el paso lo dé quien sea con su propia velocidad, su propio giro y su
     * propia animación. Es lo que permite que la jugadora lo use por dentro de
     * su lectura de mando (mismo camino que el joystick) y un figurante por
     * dentro del suyo, sin que existan dos formas de andar.
     *
     * @returns {{dir: {x,z}|null, llego: boolean, abandonado: boolean}}
     */
    paso(dt, pos, { tol = 0.45 * S, velocidad = 3 * S } = {}) {
      if (!destino) return { dir: null, llego: false, abandonado: false };

      const dFin = Math.hypot(destino.x - pos.x, destino.z - pos.z);
      if (dFin <= tol) {
        destino = null;
        limpiar();
        return { dir: null, llego: true, abandonado: false };
      }

      // ── ¿AVANZÓ DE VERDAD? ───────────────────────────────────────────
      // Se mide el desplazamiento REAL del cuadro anterior, ya pasado por
      // colisiones y por los empujones de otros cuerpos, y se compara con lo
      // que ese cuadro DEBERÍA haber recorrido a su propia velocidad. Es la
      // única pregunta honesta, y tiene que ser relativa: el paso de un
      // figurante de paseo (1.1·S) es una cuarta parte del de la jugadora
      // (4.4·S), así que un umbral fijo declararía atascado a uno o dejaría
      // moler al otro.
      const avanzo = Math.hypot(pos.x - anterior.x, pos.z - anterior.z);
      anterior.x = pos.x;
      anterior.z = pos.z;
      const esperado = velocidad * dt;
      sinAvanzar = avanzo > esperado * AVANCE_MINIMO ? 0 : sinAvanzar + dt;

      // (La comprobación de si se acerca va MÁS ABAJO, después de recortar la
      // ruta: hay que medirla sobre el camino que queda de verdad.)

      replanEn -= dt;
      if (!ruta && replanEn <= 0) planificar(pos);
      // ── ¿SIGUE VALIENDO ESTE PLAN? ───────────────────────────────────
      // El blanco puede MOVERSE: la escolta reescribe su destino cada cuadro
      // con la posición de Gabo, y `ir()` deja pasar los movimientos pequeños
      // sin tocar la ruta (si no, replanificaría sesenta veces por segundo).
      // Pero la deriva SE ACUMULA, y sesenta pasitos de nada son una mesa
      // entera: sin esto se camina un plan trazado para donde el otro ESTABA,
      // y solo lo corregía —de rebote y tarde— el reloj de atasco.
      const seFue =
        ruta &&
        rutaPara &&
        Math.hypot(rutaPara.x - destino.x, rutaPara.z - destino.z) > BLANCO_SE_FUE * S;
      if (seFue && replanEn <= 0) planificar(pos, { blancoNuevo: true });
      // Replanificar mira el reloj de PROGRESO (o el de clavado, que es más
      // rápido): moverse sin acortar camino es justo el síntoma que hay que
      // atender, no una razón para no hacer nada.
      const atascado = sinAcercarse > REPLANIFICAR_A || sinAvanzar > CLAVADO_A;
      if (atascado && replanEn <= 0) planificar(pos);

      // ── EL TIRÓN DE CUERDA ───────────────────────────────────────────
      // Un camino de A* sobre rejilla va en escalera, y caminarlo nodo a
      // nodo es lo que hace rebotar de esquina en esquina rozando todos los
      // muebles. Se busca el waypoint MÁS LEJANO al que ya se puede ir en
      // línea recta y se apunta ahí. Misma técnica (y mismo tope de 6) que
      // `boss._steer`, que es donde se aprendió.
      if (ruta?.length) {
        while (
          ruta.length > 1 &&
          Math.hypot(ruta[0].x - pos.x, ruta[0].z - pos.z) < 0.6 * S
        ) {
          ruta.shift();
        }
        if (world && ruta.length > 1) {
          const hasta = Math.min(ruta.length - 1, CUERDA);
          for (let i = hasta; i > 0; i--) {
            if (!world.pathBlocked(pos, ruta[i], radius)) {
              ruta.splice(0, i);
              break;
            }
          }
        }
      }

      // ── ¿Y SE ESTÁ ACERCANDO? ────────────────────────────────────────
      // La otra pregunta, y la que caza al que camina sin llegar a ningún
      // sitio: contra un muro, `resolveCircle` desliza el cuerpo a lo largo de
      // la pared —o sea que se mueve, y el detector de arriba lo da por
      // bueno— mientras rodea el piso en círculos.
      //
      // Se mide sobre LO QUE QUEDA DE RUTA (ver `restante`), después de haber
      // recortado los waypoints alcanzados: así un rodeo cuenta como progreso
      // y una vuelta en círculos, no.
      const falta = restante(pos);
      if (falta < mejorDistancia - ACERCARSE_MIN * S) {
        mejorDistancia = falta;
        sinAcercarse = 0;
      } else {
        if (falta < mejorDistancia) mejorDistancia = falta;
        sinAcercarse += dt;
      }

      const wp = ruta?.[0] ?? destino;
      let dx = wp.x - pos.x;
      let dz = wp.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d;
      dz /= d;

      // HACIA DÓNDE VA DE VERDAD, antes de que el bordeo le mezcle costado.
      // Es lo que se MIRA: esquivar es andar de lado sin dejar de mirar a
      // donde vas, no dar una pirueta por cada mueble.
      const mirar = { x: dx, z: dz };

      // ── PASO LATERAL: BORDEAR LO QUE NO ESTÁ EN EL MAPA ──────────────
      // El navmesh es del EDIFICIO. Los cuerpos, las sillas que rodaron y
      // cualquier cosa colocada después no están en él, así que contra ellos
      // no hay ruta que valga: hay que rodear. Se elige un costado y SE
      // SOSTIENE — alternar cada cuadro es vibrar contra el obstáculo, que
      // es justo lo que hacía el codazo aleatorio de antes.
      if (sinAcercarse > BORDEAR_A || sinAvanzar > CLAVADO_A) {
        if (!bordeo || bordeo.restante <= 0) {
          // El costado se elige MIRANDO: se prueban los dos y gana el que
          // tenga sitio de verdad. Si los dos están igual (tapados o libres),
          // se alterna respecto al anterior.
          //
          // La sonda se calcula con LA MISMA expresión que el paso, y no a
          // mano: escritas por separado se invirtió el signo, y el resultado
          // era un caminante que elegía cuidadosamente el lado BLOQUEADO —
          // el peor caso posible, porque se gasta el margen antes de
          // rendirse empujando la pared que acababa de detectar.
          const lateral = (signo) => ({
            x: pos.x - dz * signo * S,
            z: pos.z + dx * signo * S,
          });
          const izqLibre = !world || !world.pathBlocked(pos, lateral(1), radius);
          const derLibre = !world || !world.pathBlocked(pos, lateral(-1), radius);
          const signo =
            izqLibre !== derLibre ? (izqLibre ? 1 : -1) : bordeo ? -bordeo.signo : 1;
          bordeo = { signo, restante: BORDEO_MIN };
        }
        bordeo.restante -= dt;
        // Mitad rumbo, mitad costado: rodear sin dejar de ir hacia allá. Con
        // el costado puro se camina en círculos alrededor del obstáculo.
        const lx = -dz * bordeo.signo;
        const lz = dx * bordeo.signo;
        dx = dx * 0.45 + lx * 0.9;
        dz = dz * 0.45 + lz * 0.9;
        const n = Math.hypot(dx, dz) || 1;
        dx /= n;
        dz /= n;
      } else {
        bordeo = null;
      }

      // ── Y SI NADA DE ESTO SIRVIÓ, SE DICE ────────────────────────────
      // Rendirse avisando es la diferencia entre «no llegué» y un cuerpo
      // moliendo contra un mueble hasta que termine la jornada. Quien llamó
      // sabrá qué hacer: buscarse otro sitio, volver a casa, bajar el telón.
      if (sinAcercarse > RENDIRSE_A) {
        destino = null;
        limpiar();
        return { dir: null, llego: false, abandonado: true };
      }

      // ── UN VOLANTAZO DE UN SOLO CUADRO ES RUIDO, NO UNA INTENCIÓN ────
      //
      // Medido en la escolta del día 1: 6 inversiones de más de 90° en 55
      // muestras, y 3,6 VUELTAS de giro acumulado en catorce segundos — la
      // jugadora dando vueltas sobre sí misma mientras la llevan al puesto.
      // El cuerpo gira hacia donde el caminante apunta, así que cada rebote
      // se ve.
      //
      // De dónde salen: seguir a un CUERPO que se mueve pegado a ti (la
      // escolta reescribe el destino con la posición de Gabo cada cuadro, y a
      // medio metro el rumbo hacia él es casi todo ruido), y el paso lateral
      // de bordear, que al alternar de costado invierte el rumbo de golpe.
      //
      // Un giro de verdad —doblar una esquina, rodear una mesa— DURA. Uno de
      // un cuadro no existe como movimiento: solo alcanza a torcer el muñeco.
      // Así que la primera vez que el rumbo se da la vuelta se conserva el
      // anterior, y si al cuadro siguiente sigue queriendo ir para allá, se
      // le hace caso. Cuesta un cuadro de retraso en un giro brusco de
      // verdad, y ahorra la vuelta entera en los falsos.
      if (dirPrev) {
        const giro = dirPrev.x * dx + dirPrev.z * dz; // coseno del ángulo
        if (giro < VOLANTAZO && vetado < VETO_CUADROS) {
          vetado++;
          return { dir: { x: dirPrev.x, z: dirPrev.z }, mirar, llego: false, abandonado: false };
        }
      }
      vetado = 0;
      dirPrev = { x: dx, z: dz };
      // DOS VECTORES, y por eso son dos: `dir` es POR DÓNDE SE ANDA —con el
      // costado del bordeo mezclado, que es lo que rodea el obstáculo— y
      // `mirar` es HACIA DÓNDE SE MIRA, que sigue siendo el objetivo. Con uno
      // solo, cada vez que el bordeo alterna de lado el cuerpo giraba 126° de
      // golpe: la mezcla pesa más el costado (0.9) que el rumbo (0.45), así
      // que un cambio de signo es casi media vuelta. El movimiento estaba
      // bien; lo que estaba mal era ENSEÑARLO como si fuera el rumbo.
      return { dir: { x: dx, z: dz }, mirar, llego: false, abandonado: false };
    },
  };
}
