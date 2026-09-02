/**
 * ¿SE PUEDE TERMINAR EL DÍA JUGANDO DE VERDAD?
 *
 * `check:partida` ya comprueba que la COSTURA del día encaja: que cada paso
 * abre el siguiente y que ninguna misión se queda sin salida. Pero para poder
 * mirar eso aparta el juego — TELETRANSPORTA a la jugadora de estación en
 * estación, le quita la vista al jefe (`_updateVision` en blanco) y sube el
 * cupo de amonestaciones a 99. Es lo correcto para lo que mide: con el jefe
 * encima, un fallo sería «me atraparon», que no dice nada de la costura.
 *
 * El precio es que NADIE estaba midiendo lo otro, que es justo lo que decide
 * si el juego es jugable:
 *
 *   · que se pueda LLEGAR andando a los sitios (no colocándose en ellos),
 *   · que ESCAQUEARSE PAGUE energía, que es lo único que da para los cuatro
 *     minutos de jornada,
 *   · y que el bucle de una actividad CIERRE con el jefe suelto.
 *
 * Lo que NO se exige es un RESULTADO de la jornada —cuántas amonestaciones,
 * cuántas misiones—, porque la ronda del jefe y el ir y venir del piso son
 * aleatorios: medido, las amonestaciones dan entre 0 y 3 y las misiones entre
 * 2 y 13, y un umbral de 3 misiones ya falló en una tanda. Eso se IMPRIME,
 * con el porqué de cada amonestación. Exigir ahí un número sería una prueba a
 * cara o cruz que acabaría relajándose hasta no medir nada — la lección de
 * `check:chase`, que se aflojó dos veces antes de mirarse de verdad.
 *
 * Las tres son preguntas de BALANCE, no de datos: los JSON pueden estar
 * perfectos —y lo están, `check:contenido` lo dice— y la jornada ser
 * imposible igual. Un día que no se puede terminar no falla en ningún sitio:
 * simplemente se acaba.
 *
 * Cómo se juega aquí, y por qué así:
 *  · SE CAMINA, no se coloca. Se escriben las MISMAS teclas que escribe el
 *    teclado (`player.keys`), así que el paseo pasa por las colisiones, el
 *    navmesh y el detector de atascos de siempre.
 *  · El rumbo se convierte a tecla con la matriz de la cámara
 *    (`window.__iso`), no con una yaw a mano: la cámara está a un ángulo
 *    oblicuo y dando por hecho que mira de frente se camina en diagonal.
 *  · EL JEFE SE QUEDA VIVO, con su cupo de tres. Que te amonesten es un
 *    resultado, no un error del montaje.
 *  · Y SE JUEGA EN TIEMPO REAL, que aquí no es pereza sino obligación:
 *    `game.update()` NO mueve a la jugadora —el paso lo da `player.update`
 *    desde el bucle de dibujado de `main.js`—, así que una prueba que avance
 *    por cuadros a mano deja el mundo corriendo y el cuerpo clavado. Y
 *    llamarlo desde aquí tampoco vale: con el rAF vivo se actualizaría dos
 *    veces por cuadro y andaría al doble de velocidad, que es justo el número
 *    que se viene a medir. La jornada cuesta sus cuatro minutos de reloj.
 *
 * Uso: npm run check:jugable   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
// QUÉ DÍA SE JUEGA. Por defecto el lunes, que es el que está publicado desde
// siempre; con `--dia N` se valida cualquier otro. Existe para lo que pide
// PENDIENTES §2.2 al activar un día nuevo: «activar + validar». Un día recién
// metido en el manifiesto puede tener sus JSON impecables y ser imposible de
// terminar, y eso no falla en ningún sitio — se acaba y ya.
const argDia = process.argv.indexOf("--dia");
const DIA = argDia > 0 ? Number(process.argv[argDia + 1]) : 0;
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate((d) => {
  window.__DIA = d;
}, DIA);
await p.evaluate(() => {
  window.__game.engine.startDay(window.__DIA, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

const jornada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const engine = window.__game.engine;
  const iso = window.__iso;
  const diario = [];
  const stalls = [];
  g.onHeatAlert = null;
  g.setPaused(false);

  // POR QUÉ TE AMONESTAN, no solo cuántas veces. Un «3/3» a secas no dice si
  // el día aprieta demasiado o si es el aviso de quedarte pasadas las seis,
  // que es otra cosa y llega siempre. Se envuelve `_warn` porque es la ÚNICA
  // puerta de una amonestación (las dos vías del motor pasan por ella).
  const avisos = [];
  const warnOriginal = g._warn.bind(g);
  g._warn = function () {
    avisos.push({
      seg: +(g.rules.duration - g.timeLeft).toFixed(1),
      sospecha: Math.round(g.suspicion),
      camuflaje: +g._camuflaje().toFixed(2),
      llevo: [...g.inventario],
      enSeguro: !!g.inSafeSpot,
      fingiendo: !!g.player.isPretending,
      jefe: g.boss.state,
      dist: +Math.hypot(
        g.boss.position.x - g.player.position.x,
        g.boss.position.z - g.player.position.z
      ).toFixed(1),
    });
    return warnOriginal();
  };

  // Los contadores viven AQUÍ, antes de `avanzar`, porque los escribe ella en
  // cada muestra: declarados más abajo caen en la zona muerta temporal y la
  // primera llamada revienta con un ReferenceError.
  let energiaMin = g.energy;
  const energiaAlAbrir = g.energy;
  let energiaMax = g.energy;
  let dormidas = 0;
  let dormidaVista = g.asleepFor > 0;

  // ── EL RELOJ: SE JUEGA EN TIEMPO REAL, y no es una preferencia ──────
  //
  // ⚠️ `game.update()` NO MUEVE A LA JUGADORA. El paso lo da
  // `player.update(dt, world)` y quien lo llama es el BUCLE DE DIBUJADO de
  // `main.js`, no el motor. Por eso esta prueba no puede avanzar por cuadros
  // como `check:chase`: llamando a `g.update()` a mano el mundo corre y el
  // cuerpo se queda clavado. La primera versión «caminaba» solo porque cedía
  // el hilo cada cuadro y el rAF de verdad se colaba entre medias — al
  // espaciar las cesiones el paseo se paró en seco, y el fallo no era del
  // piso: era del montaje. (Es también por lo que `check:partida` COLOCA a la
  // jugadora en vez de andar: desde un bucle propio no se puede caminar.)
  //
  // Llamar aquí a `player.update` tampoco vale: el rAF sigue vivo, así que se
  // actualizaría DOS VECES por cuadro y la jugadora andaría al doble de su
  // velocidad — justo el número que esta prueba existe para medir.
  //
  // Así que se deja conducir al bucle de verdad y aquí solo se PULSAN TECLAS
  // y se espera. La jornada cuesta sus cuatro minutos de reloj de pared, y
  // ese es el precio de medir el juego y no una maqueta suya.
  //
  // El plazo es HOLGADO (ocho minutos) porque cubre más que la jornada: la
  // escolta de apertura, los 240 s del día y el paseo hasta el ascensor. A
  // 5,5 minutos se cortaba a mitad y el informe salía con media jornada
  // medida — y un verde sacado de media jornada no vale nada, que es por lo
  // que hay una comprobación que vigila justo eso.
  const finTarde = Date.now() + 480000;
  let seAgoto = false;
  const avanzar = async (n = 1) => {
    if (g.paused) g.setPaused(false);
    if (g.gameOver) return;
    if (Date.now() > finTarde) {
      seAgoto = true;
      return;
    }
    await new Promise((r) => setTimeout(r, Math.max(4, (n * 1000) / 60)));
    if (g.energy < energiaMin) energiaMin = g.energy;
    if (g.energy > energiaMax) energiaMax = g.energy;
    // La siesta, por FLANCO: `asleepFor` se queda alto varios segundos y
    // contarlo por muestra daría decenas de siestas de una sola cabezada.
    if (g.asleepFor > 0 && !dormidaVista) dormidas++;
    dormidaVista = g.asleepFor > 0;
  };

  // ── EL MANDO ─────────────────────────────────────────────────────────
  // Las mismas teclas que pulsa una persona. Se sueltan todas antes de
  // escribir las nuevas: dejarse una puesta es el bug clásico de estos
  // montajes y se lee como «el personaje se va solo».
  const TECLAS = ["w", "a", "s", "d"];
  const soltar = () => TECLAS.forEach((t) => g.player.keys.delete(t));
  const rumboATeclas = (dx, dz) => {
    const { right, up } = iso.groundToScreen(dx, dz);
    const m = Math.max(Math.abs(right), Math.abs(up)) || 1;
    const t = [];
    // Las diagonales también: un juego que solo se anda en cruz se atasca en
    // cada esquina y el atasco sería del montaje, no del piso.
    if (right / m > 0.45) t.push("d");
    if (right / m < -0.45) t.push("a");
    if (up / m > 0.45) t.push("w");
    if (up / m < -0.45) t.push("s");
    return t;
  };

  // Pestillo de la huida: `esconderse()` también camina, así que sin él
  // caminarA se llamaría a sí misma sin fondo.
  let huyendo = false;
  /** ¿Me tienen fichada ahora mismo? */
  const meCazan = () => g.boss.lockedOn || g.boss.state === "CHASE";

  /**
   * Caminar hasta un punto SIGUIENDO EL PLANO. Devuelve si llegó.
   *
   * Se rutea por el navmesh y se caminan los tramos uno a uno con las teclas.
   * Ir en línea recta al destino sería medir otra cosa: el piso tiene un MURO
   * que separa las alas con un solo hueco, y una persona que ve el plano lo
   * rodea. Sin ruta, esta prueba se quedaba clavada contra ese muro a diez
   * unidades del Parce y lo cantaba como si el café fuera inalcanzable.
   */
  // 2400 cuadros = 40 s andando. El piso se cruza de punta a punta en bastante
  // menos; el tope solo existe para que un fallo no cuelgue la prueba. Quien
  // dice de verdad «no se puede llegar» es el detector de atascos de abajo.
  // `yaVale` NO es una forma de llegar antes: es lo que se pregunta cuando el
  // paseo se ATASCA, para saber si ese atasco importa. Ver `esconderse`.
  const caminarA = async (x, z, { tol = 1.6, cuadros = 2400, etiqueta = "", yaVale = null } = {}) => {
    let mejor = Infinity;
    let sinMejorar = 0;
    let ruta = null;
    let nodo = 0;
    let replan = 0;
    for (let i = 0; i < cuadros; i++) {
      if (g.gameOver || seAgoto) break;
      const d = Math.hypot(x - g.player.position.x, z - g.player.position.z);
      if (d < tol) {
        soltar();
        return true;
      }
      // La ruta se recalcula de vez en cuando: el Parce y los compañeros
      // ANDAN, así que un camino trazado hace diez segundos apunta a donde ya
      // no está nadie.
      if (!ruta || replan-- <= 0) {
        ruta = window.__game.navmesh.path(g.player.position, { x, z }) ?? [{ x, z }];
        nodo = 0;
        replan = 90;
      }
      // El tramo que toca: se descartan los nodos que ya quedaron detrás.
      while (
        nodo < ruta.length - 1 &&
        Math.hypot(ruta[nodo].x - g.player.position.x, ruta[nodo].z - g.player.position.z) < 0.9
      )
        nodo++;
      const meta = ruta[nodo] ?? { x, z };
      const dx = meta.x - g.player.position.x;
      const dz = meta.z - g.player.position.z;
      // SI TE ESTÁN CAZANDO A MEDIO CAMINO, PRIMERO TE ESCONDES. Cruzar el
      // piso con el HDMI encima (`sospecha: 1.9`) mientras Gabo te persigue es
      // la forma más rápida de gastar el cupo, y ningún jugador lo haría. El
      // pestillo evita la recursión: esconderse también camina.
      if (!huyendo && meCazan()) {
        huyendo = true;
        try {
          await esconderse();
        } finally {
          huyendo = false;
        }
        ruta = null;
        sinMejorar = 0;
        continue;
      }
      // Un paseo GUIADO (una escena que te lleva, el telón tras un regaño)
      // manda sobre el teclado: aquí no hay nada que teclear, solo esperar.
      // Contarlo como atasco sería medir el montaje, no el juego.
      if (g.player.walkTo || g.player.inputLocked || g.asleepFor > 0) {
        soltar();
        await avanzar(1);
        sinMejorar = 0;
        continue;
      }
      if (d < mejor - 0.05) {
        mejor = d;
        sinMejorar = 0;
      } else if (++sinMejorar > 240 && yaVale?.()) {
        // ATASCADA PERO YA VALE. No todo atasco es un fallo: si lo que se
        // venía a conseguir ya está conseguido, dejar de acercarse no dice
        // nada malo del piso. Es el caso del refugio (ver `esconderse`).
        soltar();
        return true;
      } else if (sinMejorar > 240) {
        // Cuatro segundos sin acercarse: o hay un mueble en medio que no se
        // bordea, o el destino no es alcanzable andando.
        // Un atasco con la jornada YA TERMINADA no dice nada: el motor deja
        // de mover a nadie, así que se apuntaría un «no se puede llegar»
        // falso por cada destino pendiente. Solo cuenta lo de la partida viva.
        if (!g.gameOver && !seAgoto)
          stalls.push(`${etiqueta || "destino"}: atascada a ${d.toFixed(1)} de (${x.toFixed(1)},${z.toFixed(1)})`);
        soltar();
        return false;
      }
      soltar();
      for (const t of rumboATeclas(dx, dz)) g.player.keys.add(t);
      await avanzar(1);
    }
    soltar();
    if (yaVale?.()) return true;
    if (!g.gameOver && !seAgoto)
      stalls.push(`${etiqueta || "destino"}: no llegó en ${cuadros} cuadros`);
    return false;
  };

  // ── LOS VERBOS, jugados como los jugaría alguien que sabe ────────────
  const resolverVasos = (vasos, capacidad) => {
    const clave = (v) => v.map((x) => x.join("")).sort().join("|");
    const listo = (v) => v.every((x) => !x.length || (x.length === capacidad && x.every((c) => c === x[0])));
    const vistos = new Set();
    const dfs = (v, prof) => {
      if (listo(v)) return [];
      if (prof > 40) return null;
      const k = clave(v);
      if (vistos.has(k)) return null;
      vistos.add(k);
      for (let a = 0; a < v.length; a++) {
        if (!v[a].length) continue;
        const color = v[a][v[a].length - 1];
        let n = 0;
        while (n < v[a].length && v[a][v[a].length - 1 - n] === color) n++;
        if (n === v[a].length && (v[a].length === capacidad || v.every((x, i) => i === a || !x.length))) continue;
        for (let q = 0; q < v.length; q++) {
          if (q === a || v[q].length >= capacidad) continue;
          if (v[q].length && v[q][v[q].length - 1] !== color) continue;
          if (!v[q].length && n === v[a].length) continue;
          const nv = v.map((x) => x.slice());
          const mueve = Math.min(n, capacidad - nv[q].length);
          for (let m = 0; m < mueve; m++) nv[q].push(nv[a].pop());
          const resto = dfs(nv, prof + 1);
          if (resto) return [[a, q], ...resto];
        }
      }
      return null;
    };
    const sol = dfs(vasos.map((x) => x.slice()), 0);
    return sol && sol.length ? sol[0] : null;
  };

  const jugarVerbo = () => {
    if (g.verter.active) {
      const s = g.verter.snapshot();
      const mov = resolverVasos(s.vasos, s.capacidad);
      if (mov) {
        g.verter.elegir(mov[0]);
        g.verter.elegir(mov[1]);
      }
    } else if (g.baile.active) {
      const s = g.baile.snapshot();
      const paso = s?.pasos[s.indice];
      if (paso) g.baile.pulsar(paso.dir);
    } else if (g.chisme.active) {
      for (let i = 0; i < 3; i++) {
        const r = g.chisme.responder(i);
        if (r === "acierto" || r === "ganado" || r === null) break;
      }
    } else if (g.microondas.active) {
      g.microondas.poner(0, 0);
    } else if (g.pulse.active) {
      const s = g.pulse.snapshot();
      if (s && Math.abs(s.pos - s.zonaAt) < s.zona / 3) g.pulse.hit();
    }
  };

  const resolverReto = async () => {
    for (let v = 0; v < 12 && g.cables.active; v++) {
      const s = g.cables.snapshot();
      const i = s.izq.findIndex((x) => !x.unido);
      if (i < 0) break;
      const j = s.der.findIndex((x) => x.color === s.izq[i].color && !x.unido);
      g.cables.elegir("izq", i);
      g.cables.elegir("der", j);
      await avanzar(1);
    }
    for (let v = 0; v < 20 && g.trivia.active; v++) {
      for (let i = 0; i < 3; i++) {
        if (!g.trivia.active) break;
        const r = g.trivia.responder(i);
        if (r === "acierto" || r === "ganado") break;
      }
      await avanzar(1);
    }
  };

  /**
   * ESCONDERSE CUANDO VIENEN A POR TI. Es EL BUCLE del juego, no un extra:
   * plantarse en la estación mientras Gabo se acerca es lo único que garantiza
   * las tres amonestaciones. Se va al lugar seguro más cercano y se SUELTA EL
   * MANDO —un escondite solo cubre si te quedas quieta—, hasta que la caza se
   * rompa.
   */
  const esconderse = async () => {
    const spots = window.__floorplan.safeSpots ?? [];
    if (!spots.length) return false;
    // NO VALE EL MÁS CERCANO A SECAS: una sala (`meeting`) cubre con entrar,
    // pero se GASTA y se ocupa sola; un puesto (`desk`) no se gasta pero solo
    // cubre MIENTRAS FINGES. Metiéndose en el puesto sin fingir, el refugio no
    // cubre nada — y desde fuera se ve igual que un escondite que no funciona.
    const libre = (s, i) => {
      const st = g.safeSpotState?.[i];
      if (!st) return true;
      if (st.busyLeft > 0 || st.spent) return false;
      if (st.left != null && st.left <= 0) return false;
      return true;
    };
    const orden = spots
      .map((s, i) => ({ s, i, d: Math.hypot(s.x - g.player.position.x, s.z - g.player.position.z) }))
      .filter(({ s, i }) => libre(s, i))
      .sort((a, c) => a.d - c.d);
    const elegido = orden.find(({ s }) => s.kind === "meeting" && s.d < 26) ?? orden[0];
    if (!elegido) return false;
    const cerca = elegido.s;
    g.player.keys.delete(" ");
    // SE VA AL CENTRO, PERO EL FALLO ES NO ESTAR CUBIERTA.
    //
    // Esto pedía acercarse a `radius * 0.5` del punto del refugio y cantaba
    // «no se puede llegar andando» si no lo lograba. Pero esa distancia es un
    // SUCEDÁNEO de estar a salvo, y encima no siempre se puede cumplir: una
    // sala de reuniones tiene MESA (`tableShape` en el plano), su centro no se
    // pisa, y el punto de la Sala 1 cae justo en el canto de la suya. Según
    // por qué lado entres te plantas a 2,3 y ya no te acercas más — con la
    // jugadora DENTRO del radio y perfectamente cubierta. La prueba fallaba a
    // cara o cruz por un fallo de juego que no existía.
    //
    // Lo que NO vale es rebajar el objetivo a «en cuanto cubra, para»: el
    // borde del radio es el peor sitio del piso, porque el jefe es INAMOVIBLE
    // (`_updateCrowdSeparation`) y un empujón suyo te saca de la cobertura.
    // Medido: parando en el borde, la jornada acababa en 3/3 amonestaciones y
    // 4 de 8 misiones, contra 13/13 yendo al fondo. Quien sabe jugar se mete
    // DENTRO, así que la prueba sigue yendo al centro.
    //
    // Se queda, entonces, donde debe estar: en el ATASCO. Si no puede
    // acercarse más pero el juego dice que está cubierta (`inSafeSpot`, que en
    // una sala basta con entrar), eso no es un fallo del piso.
    await caminarA(cerca.x, cerca.z, {
      tol: Math.max(1.1, (cerca.radius ?? 2) * 0.5),
      etiqueta: `refugio ${cerca.id}`,
      yaVale: () => !!g.inSafeSpot,
    });
    soltar();
    // En un puesto hay que FINGIR para estar cubierta; en una sala basta con
    // estarse quieta. La quietud es lo que cubre, no haber entrado.
    if (cerca.kind === "desk") g.player.keys.add(" ");
    for (let v = 0; v < 600 && meCazan(); v++) await avanzar(1);
    await avanzar(30);
    g.player.keys.delete(" ");
    return true;
  };

  /**
   * UNA COARTADA ANTES DEL BOTÍN. El HDMI delata (`sospecha: 1.9`) y el piso
   * tiene tapaderas que multiplican por 0.55 y 0.7 — o sea que la de la peli
   * está PENSADA para hacerse con un acta en la mano, y sin ella el paseo con
   * el cable es un imán de amonestaciones. Quien sabe jugar coge el papel
   * primero, así que la prueba también.
   */
  const conseguirCoartada = async () => {
    const yaLlevo = (g._itemSpots ?? []).some((it) => it.coartada && g.inventario.has(it.id));
    if (yaLlevo) return true;
    const papel = (g._itemSpots ?? []).find((it) => it.coartada && !g.inventario.has(it.id));
    if (!papel) return false;
    if (!(await caminarA(papel.x, papel.z, { etiqueta: `coartada ${papel.id}` }))) return false;
    g.player.keys.delete(" ");
    await avanzar(1);
    g.player.keys.add(" ");
    await avanzar(3);
    g.player.keys.delete(" ");
    await avanzar(2);
    return g.inventario.has(papel.id);
  };

  /** Ir ANDANDO a por el recado de una actividad y ganárselo. */
  const conseguirObjeto = async (ob) => {
    if (!ob || g.inventario.has(ob.id)) return true;
    const donde = g._dondeEsta(ob);
    if (!donde) return false;
    if (!await caminarA(donde.x, donde.z, { etiqueta: `objeto ${ob.id}` })) return false;
    if (ob.de) {
      g.completeTalk(ob.de);
    } else {
      const spot = (g._itemSpots ?? []).find((it) => it.id === ob.id);
      if (spot && g.safeSpotState[spot.salaIndex]) g.safeSpotState[spot.salaIndex].busyLeft = 0;
      g.player.keys.delete(" ");
      await avanzar(1);
      g.player.keys.add(" ");
      await avanzar(2);
      g.player.keys.delete(" ");
    }
    for (let v = 0; v < 40 && g.reto; v++) {
      await resolverReto();
      await avanzar(1);
    }
    return g.inventario.has(ob.id);
  };

  const jugarEstacion = async (st) => {
    if (!await caminarA(st.x, st.z, { etiqueta: `estación ${st.id}` })) return false;
    g.player.keys.add(" ");
    await avanzar(3);
    for (let v = 0; v < 1200 && !st.done && !g.gameOver; v++) {
      // SI VIENEN A POR TI, SE DEJA LA TAREA. Esa decisión —seguir un segundo
      // más o salir corriendo— ES el juego; una prueba que se queda quieta
      // mide un piso sin jefe.
      if (meCazan()) {
        g.player.keys.delete(" ");
        await esconderse();
        if (!(await caminarA(st.x, st.z, { etiqueta: `vuelta a ${st.id}` }))) break;
        g.player.keys.add(" ");
        await avanzar(3);
        continue;
      }
      jugarVerbo();
      // Sin soltarse del sitio: alejarse cierra el verbo.
      const d = Math.hypot(st.x - g.player.position.x, st.z - g.player.position.z);
      if (d > 1.4) await caminarA(st.x, st.z, { cuadros: 240, etiqueta: `vuelta a ${st.id}` });
      await avanzar(1);
      if (st.encendida) {
        g.player.keys.delete(" ");
        await avanzar(6);
        g.player.keys.add(" ");
      }
    }
    g.player.keys.delete(" ");
    return !!st.done;
  };

  // ── LA JORNADA ───────────────────────────────────────────────────────
  g.clearGate();
  // LA ESCOLTA VA SOLA, Y HAY QUE DEJARLA TERMINAR. Mientras Gabo te lleva al
  // puesto, `_updateEscolta` reescribe `player.walkTo` CADA CUADRO, y el paseo
  // guiado de `player.update` manda sobre el teclado. O sea que teclear
  // durante la escolta no mueve nada: la jugadora no está atascada, está
  // siendo llevada. Sin esperar aquí, esta prueba medía su propio montaje.
  let cuadrosEscolta = 0;
  while (g._esperandoPuesto && !g.gameOver && cuadrosEscolta < 60 * 45) {
    await avanzar(1);
    cuadrosEscolta++;
  }
  diario.push({
    hito: "escolta",
    segundos: +(cuadrosEscolta / 60).toFixed(1),
    energia: Math.round(g.energy),
    reloj: Math.round(g.timeLeft),
  });
  // Sentada al llegar: hay que soltarse del puesto para poder andar.
  g.player.keys.delete(" ");
  await avanzar(10);

  let vueltas = 0;


  // La cadena ENCADENA: cumplir una misión abre la siguiente, así que hay que
  // dar vueltas — de un solo barrido, la que depende de fingir no existe aún.
  while (!g.gameOver && !seAgoto && vueltas++ < 12) {
    const pend = g.objectives.filter((o) => !o.done);
    if (!pend.length) break;

    // ── Las de ESTACIÓN: la más cercana primero, que es lo que haría nadie.
    const conSitio = pend.filter((o) => !o.dynamic && Number.isFinite(o.x));
    conSitio.sort(
      (a, c) =>
        Math.hypot(a.x - g.player.position.x, a.z - g.player.position.z) -
        Math.hypot(c.x - g.player.position.x, c.z - g.player.position.z)
    );
    for (const st of conSitio) {
      if (g.gameOver) break;
      // El botín que delata se lleva CON tapadera: es la mecánica, no un truco.
      if (st.objeto && st.objeto.sospecha > 1.5) await conseguirCoartada();
      if (st.objeto && !(await conseguirObjeto(st.objeto))) {
        diario.push({ hito: st.id, falló: `sin el objeto ${st.objeto.id}` });
        continue;
      }
      await jugarEstacion(st);
      diario.push({
        hito: st.id,
        hecha: !!st.done,
        energia: Math.round(g.energy),
        reloj: Math.round(g.timeLeft),
        avisos: g.warnings,
      });
    }

    // ── FINGIR: se va ANDANDO a un puesto y se sostiene la acción allí.
    const fingir = pend.find((o) => !o.done && o.dynamic && o.accion === "fingir");
    if (fingir) {
      const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
      if (desk && (await caminarA(desk.x, desk.z, { etiqueta: "puesto para fingir" }))) {
        g.player.keys.add(" ");
        for (let v = 0; v < 900 && !fingir.done && !g.gameOver; v++) await avanzar(1);
        g.player.keys.delete(" ");
      }
      diario.push({ hito: "fingir", hecha: !!fingir.done, energia: Math.round(g.energy) });
    }

    // ── HABLAR: los «cómos». Se va hasta la persona y se le habla.
    for (const o of pend.filter((x) => !x.done && x.dynamic && x.npcId)) {
      const quien = g.npcs?.find((n) => n.id === o.npcId);
      if (quien) await caminarA(quien.position.x, quien.position.z, { tol: 1.6, etiqueta: `hablar con ${o.npcId}` });
      g.completeTalk(o.npcId);
      for (let v = 0; v < 20 && g.trivia.active; v++) {
        for (let i = 0; i < 3; i++) if (g.trivia.responder(i) === "acierto") break;
        await avanzar(1);
      }
      await avanzar(2);
    }

    if (!conSitio.length && !fingir && !pend.some((x) => x.dynamic && x.npcId)) break;
  }

  // ── LA SALIDA ────────────────────────────────────────────────────────
  // A las seis se sale por el ascensor: la jornada no termina donde estés.
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
  let salio = false;
  if (lift) {
    salio = await caminarA(lift.x, lift.z, { tol: 2, cuadros: 2400, etiqueta: "ascensor" });
    for (let v = 0; v < 600 && !g.gameOver; v++) await avanzar(1);
  }

  return {
    diario,
    seAgoto,
    porQue: avisos,
    stalls: [...new Set(stalls)],
    energiaMin: Math.round(energiaMin),
    energiaMax: Math.round(energiaMax),
    energiaAlAbrir: Math.round(energiaAlAbrir),
    energiaFin: Math.round(g.energy),
    relojFin: Math.round(g.timeLeft),
    dormidas,
    avisos: g.warnings,
    cupo: g.rules.maxWarnings,
    hechas: g.objectives.filter((o) => o.done).length,
    total: g.objectives.length,
    gameOver: !!g.gameOver,
    salio,
  };
});

console.log(`\njornada: ${JSON.stringify(jornada.diario, null, 1)}\n`);
if (jornada.porQue?.length)
  console.log(`por qué te amonestaron: ${JSON.stringify(jornada.porQue, null, 1)}\n`);
console.log(
  `energía ${jornada.energiaMin}–${jornada.energiaMax} (abrió en ${jornada.energiaAlAbrir}) · siestas ${jornada.dormidas} · ` +
    `amonestaciones ${jornada.avisos}/${jornada.cupo} · misiones ${jornada.hechas}/${jornada.total}\n`
);

check(
  "se LLEGA andando a todos los sitios del día",
  jornada.stalls.length === 0,
  jornada.stalls.join(" · ")
);
// CUÁNTAS MISIONES CAEN NO ES UN INVARIANTE: depende de por dónde ande la
// ronda del jefe. Medido, entre 2 y 13 — y un umbral de 3 ya falló en una
// tanda, que es la definición de prueba a cara o cruz. Lo que sí es
// invariante son estas dos, y son las que pillan algo roto de verdad:
//
//  · que la campaña OFREZCA la primera tanda de misiones. Si `clearGate` deja
//    de avisar a la campaña, el piso se abre con la lista VACÍA — el fallo que
//    se llevó por delante media suite cuando entró la campaña, y que no se ve
//    porque el día «funciona», solo que no hay nada que hacer.
//  · que el bucle conseguir → activar → aguantar CIERRE al menos una vez. Con
//    cero, o el recado no se consigue, o el verbo no enciende, o la tarea no
//    se banca: cualquiera de las tres deja el día sin salida.
check(
  "la campaña OFRECE misiones al abrirse el piso",
  jornada.total >= 3,
  `solo ${jornada.total} misiones en la lista`
);
check(
  "y el bucle conseguir → activar → aguantar CIERRA al menos una vez",
  jornada.hechas >= 1,
  `${jornada.hechas} de ${jornada.total} misiones`
);
// LAS AMONESTACIONES SE INFORMAN, NO SE EXIGEN. Medido en cinco jornadas
// seguidas salieron 0, 1, 2, 3 y 3 de cupo: la ronda del jefe, los secuaces y
// los compañeros que se cruzan son aleatorios, así que exigir un número aquí
// sería una prueba a cara o cruz —justo lo que se corrigió en `check:chase`—
// y acabaría relajándose hasta no medir nada. Lo que SÍ es invariante es que
// el día se pueda terminar, y de eso se encarga la comprobación de arriba.
// El detalle de `porQue` está impreso: si un día empiezan a caer siempre en
// el mismo sitio, ahí se ve.
console.log(
  `      (amonestaciones ${jornada.avisos}/${jornada.cupo} — se informan, no se exigen: ` +
    `la ronda del jefe es aleatoria y medido da entre 0 y 3)`
);
// LA ENERGÍA SE INFORMA, NO SE EXIGE, y no por comodidad: quien mide la
// economía de verdad es `npm run check:energia`, que la prueba directamente y
// sin dados. Aquí cualquier umbral sería un proxy peor del mismo invariante —
// dormirse no es perder (se despierta con un 25%, y lo que castiga es
// dormirse DONDE TE VEN), y una jornada puede cerrar su única misión hablando
// con alguien, que no paga energía ninguna. Duplicar un verde con una versión
// a cara o cruz es cómo se acaba aflojando el bueno.
// Y que lo de arriba se midió con la jornada ENTERA, no con media: un verde
// sacado de una partida truncada por el plazo no vale nada.
check(
  "la jornada se midió entera (no se agotó el plazo de la prueba)",
  jornada.seAgoto !== true,
  "se cortó por plazo: lo de arriba está medido a medias"
);
check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nUna jornada jugada de verdad: andando, con el jefe vivo, y se puede terminar"
    : `\n${fallos} fallo(s): el día no se puede jugar de punta a punta`
);
process.exit(fallos === 0 ? 0 : 1);
