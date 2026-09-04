/**
 * UN DÍA QUE EMPIEZA, EMPIEZA ENTERO. Y eso incluye a los CUERPOS.
 *
 * ── El fallo ──
 *
 * Reportado como «en algunos reinicios el personaje no vuelve al lugar que es
 * y rompe la cinemática».
 *
 * Un día que empieza no crea un piso nuevo: los cuerpos son los mismos objetos
 * de siempre (main.js los monta una vez), así que todo lo que dejó puesto el
 * intento anterior sigue puesto hasta que alguien lo quite. `resetEntities`
 * quitaba la mitad:
 *
 *  · LA MALLA NO VOLVÍA. Se escribía `player.position` —el sitio lógico— y
 *    nada más. Quien mueve el cuerpo QUE SE VE es `player.update`, y ese
 *    update está detrás de `!engine.isPaused`… mientras que el guion de
 *    apertura pasa CON LA PARTIDA EN PAUSA. Durante toda la cinemática la
 *    jugadora estaba en pantalla donde la dejó el día anterior; la cámara
 *    encuadraba el ascensor y allí no había nadie.
 *  · Y VENÍAN MANDANDO COSAS DE AYER: `walkTo` (la caminata guiada),
 *    `inputLocked` y la pose sobrevivían al reinicio. Un día cortado mientras
 *    te sientan en tu puesto dejaba un paseo pendiente y el mando bloqueado.
 *  · El jefe se quedaba con `esperando`/`seated`, que solo suelta `standUp()`
 *    al superar la puerta del día: cortar el día 1 antes de saludarle lo
 *    dejaba de estatua la jornada siguiente.
 *
 * ── Por qué «en algunos» ──
 *
 * No es azar. Una jornada que termina bien se termina SALIENDO POR EL
 * ASCENSOR, así que la malla ya estaba donde tenía que estar y no se notaba.
 * Se rompe cuando el día anterior acabó en otro sitio —el despido en tu
 * puesto, el reintento a mitad de partida—, que es justo cuando se reinicia.
 *
 * ── Por qué se mide CON LA CAJA ABIERTA ──
 *
 * Es el único momento en que el fallo existe. En cuanto la partida arranca,
 * el primer `player.update` coloca la malla y todo queda idéntico se hubiera
 * reseteado o no. Una captura tomada un segundo después no ve nada — y la
 * cinemática ya se rompió.
 *
 * ── Y lo que se le fue sumando ──
 *
 * Los dos fallos de arriba vivían en el mismo sitio (`Game._conTelon`), así
 * que el archivo cubre lo que hay alrededor: que un telón OCUPADO no te deje
 * sin mando para siempre, y que reintentar caiga DIRECTO al piso en vez de
 * devolverte a cruzar la avenida. Todo es lo mismo por debajo — algo de un
 * momento que se cobra en otro.
 *
 * Uso: npm run check:reinicio   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

/** Pasar el guion que haya en pantalla. */
async function pasarGuion() {
  for (let i = 0; i < 40; i++) {
    if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
    await p.keyboard.press("Space");
    await p.waitForTimeout(120);
  }
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });

// ── PRIMER DÍA: se juega un rato para ENSUCIAR el piso ───────────────────
// OJO: SIN `return`. `startDay` es async, y una flecha concisa devuelve su
// promesa — que Playwright espera. Esa promesa no resuelve hasta que alguien
// pase el guion de apertura, que es justo lo que no se puede hacer desde
// dentro del `evaluate`: la prueba se cuelga entera sin decir por qué. Con
// cuerpo de bloque se dispara y se sigue.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
await pasarGuion();

// Se supera la puerta y se deja correr la escolta: al cabo de unos segundos
// la jugadora está lejos del ascensor y CON LA MALLA ALLÍ, que es la
// situación de la que se reinicia.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
});
await p.waitForTimeout(6000);

// Y ADEMÁS SE DEJA UN PASEO GUIADO A MEDIAS, que es lo que hace un regaño:
// `seatAtDesk` echa a andar a la jugadora y le bloquea el mando. Cortar el
// día justo aquí es el caso peor, y es un caso real.
// ── EL REINICIO ──────────────────────────────────────────────────────────
//
// ENSUCIAR Y REINICIAR VAN EN LA MISMA VUELTA, y eso no es comodidad: es lo
// único que lo hace determinista. Estaban separados por 300 ms y en ese hueco
// el juego LIMPIA lo que se acababa de ensuciar — el corte del traslado cae a
// los 260 ms y devuelve el mando, y la propia escolta suelta el `walkTo` cada
// cuadro mientras dura. Resultado: se reiniciaba sobre un piso limpio y las
// comprobaciones de abajo pasaban sin medir nada. (Lo cazó la guarda de esta
// misma línea, que para eso está.)
//
// SE MARCA EL DÍA VIEJO ANTES DE TIRARLO. Esperar a `engine.game` no dice
// nada —ya es cierto del día anterior— y esperar a la caja del guion tampoco:
// a estas alturas puede haber una abierta (Crispo se presenta al llegar a tu
// puesto), así que la medida se tomaría ANTES de montar el día nuevo, sobre
// el estado viejo, y diría lo que sea. Lo único que distingue un `Game` de
// otro es que es OTRO OBJETO.
const antes = await p.evaluate(() => {
  const g = window.__game.engine.game;
  // Un regaño: te echa a andar a tu puesto y te quita el mando.
  g.seatAtDesk();
  const sucio = { conPaseo: !!g.player.walkTo || g.player.inputLocked === true };
  g.__viejo = true;
  window.__game.engine.startDay(0, { skipMinigame: true });
  return sucio;
});
check(
  "el primer día deja el piso sucio (si no, no hay reinicio que medir)",
  antes.conPaseo,
  JSON.stringify(antes)
);
await p.waitForFunction(() => !window.__game.engine.game?.__viejo, null, { timeout: 60000 });
// LA MEDIDA VA AQUÍ: con el guion en pantalla y la partida en pausa. Es el
// único momento en que se distingue un reinicio completo de uno a medias.
await p
  .waitForFunction(() => window.__game.engine.dialogue.isOpen, null, { timeout: 30000 })
  .catch(() => {});

const abierto = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const b = g.boss;
  const malla = (o) => (o?.sprite?.object ? { x: o.sprite.object.position.x, z: o.sprite.object.position.z } : null);
  return {
    pausado: !!window.__game.engine.isPaused,
    logica: { x: g.player.position.x, z: g.player.position.z },
    malla: malla(g.player),
    walkTo: g.player.walkTo,
    inputLocked: g.player.inputLocked,
    pose: g.player.pose,
    jefeLogica: { x: b.position.x, z: b.position.z },
    jefeMalla: malla(b),
    jefeEsperando: !!b.esperando,
    jefeSentado: !!b.seated,
    // El día 1 SÍ lo planta en la puerta, así que `esperando` es lo correcto
    // aquí; lo que no puede pasar es que la malla esté en otro sitio.
    plantaEnPuerta: !!g.gate?.esperaEn,
  };
});

const dist = (a, c) => (a && c ? Math.hypot(a.x - c.x, a.z - c.z) : Infinity);

check(
  "se mide con el guion en pantalla y la partida en pausa",
  abierto.pausado === true,
  "la partida ya estaba corriendo: la medida no vale"
);
check(
  "la JUGADORA vuelve a su sitio, y el cuerpo con ella",
  dist(abierto.malla, abierto.logica) < 0.5,
  `malla en (${abierto.malla?.x?.toFixed(1)}, ${abierto.malla?.z?.toFixed(1)}) y lógica en (${abierto.logica.x.toFixed(1)}, ${abierto.logica.z.toFixed(1)})`
);
check(
  "sin un paseo de ayer todavía mandando",
  abierto.walkTo == null,
  `quedaba walkTo a ${JSON.stringify(abierto.walkTo)}`
);
check(
  "y con el mando devuelto",
  abierto.inputLocked === false,
  "el reinicio arrancó con el control bloqueado"
);
check("y sin la pose de ayer puesta", abierto.pose == null, `pose = ${abierto.pose}`);
check(
  "el JEFE vuelve a su sitio, y el cuerpo con él",
  dist(abierto.jefeMalla, abierto.jefeLogica) < 0.5,
  `malla en (${abierto.jefeMalla?.x?.toFixed(1)}, ${abierto.jefeMalla?.z?.toFixed(1)}) y lógica en (${abierto.jefeLogica.x.toFixed(1)}, ${abierto.jefeLogica.z.toFixed(1)})`
);

// ── Y UN DÍA QUE NO LO PLANTA EN LA PUERTA LO DESCONGELA ────────────────
// El día 2 no tiene puerta: Gabo va de ronda desde el primer minuto. Si
// `esperando` sobrevive al cambio de día, se pasa la jornada de estatua y
// nada falla a la vista — sencillamente no viene nunca nadie a por ti.
await pasarGuion();
await p.evaluate(() => {
  window.__game.engine.game.__viejo = true;
  window.__game.engine.startDay(1, { skipMinigame: true });
});
await p.waitForFunction(() => !window.__game.engine.game?.__viejo, null, { timeout: 60000 });
await p
  .waitForFunction(() => window.__game.engine.dialogue.isOpen, null, { timeout: 30000 })
  .catch(() => {});
const dia2 = await p.evaluate(() => {
  const b = window.__game.engine.game.boss;
  return {
    esperando: !!b.esperando,
    sentado: !!b.seated,
    plantaEnPuerta: !!window.__game.engine.game.gate?.esperaEn,
  };
});
check(
  "un día sin puerta arranca con el jefe SUELTO, no congelado de ayer",
  dia2.plantaEnPuerta || (!dia2.esperando && !dia2.sentado),
  `esperando=${dia2.esperando} sentado=${dia2.sentado}`
);

// ── UN TELÓN OCUPADO NO PUEDE DEJARTE SIN MANDO ─────────────────────────
//
// `transition.cortar` devuelve FALSE si ya hay otro telón en marcha —dos a la
// vez dejan el segundo a medias y la pantalla negra para siempre—, y los tres
// sitios que lo llamaban se comían esa respuesta. `seatAtDesk` pone
// `inputLocked = true` en la línea ANTERIOR a pedirlo: rechazado el telón, su
// callback no corría nunca y la jugadora se quedaba SIN CONTROL el resto de
// la jornada, sin un solo error por ninguna parte.
//
// Se reproduce por la costura de verdad (`game.onCorte`, que es el telón), no
// simulando nada: se ocupa, se pide un traslado, y se mira si vuelve el mando.
await pasarGuion();
const sinMando = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  // Se ocupa el telón con un corte cualquiera…
  g.onCorte(() => {});
  // …y se pide un traslado largo. Recién empezado el día la jugadora está en
  // el ascensor, a ~18 unidades de su puesto: muy por encima de SEAT_WALK_MAX,
  // así que este `seatAtDesk` va por el camino del telón y no por el paseo.
  g.seatAtDesk();
  const bloqueadoAlPedirlo = g.player.inputLocked === true;
  await new Promise((r) => setTimeout(r, 1800));
  return { bloqueadoAlPedirlo, bloqueadoDespues: g.player.inputLocked === true };
});
check(
  "el traslado con el telón ocupado llega a bloquear el mando (si no, no se mide nada)",
  sinMando.bloqueadoAlPedirlo === true,
  JSON.stringify(sinMando)
);
check(
  "y el mando VUELVE aunque el telón estuviera ocupado",
  sinMando.bloqueadoDespues === false,
  "la jugadora se quedó sin control indefinidamente"
);

// ── Y REINTENTAR NO TE DEVUELVE A LA CALLE ──────────────────────────────
//
// «Reintentar cae DIRECTO al piso» está escrito en el motor desde hace
// tiempo… y eran DOS banderas de las que solo se pasaba una: `skipPrologue`
// se salta el ascensor y nada más, así que el CRUCE DE LA AVENIDA se seguía
// jugando. Reintentar te devolvía a la calle, y de ahí al piso sin pasar por
// el ascensor — la mitad incoherente de las dos.
//
// Se mide en el DÍA 2, que es el primero publicado que trae cruce (el día 1
// lo tiene desactivado, y por eso esto no se veía). Va AL FINAL a propósito:
// terminar un día deja viva la evaluación y su bucle, y encadenar casos
// detrás de eso es lo que cuelga a `check:cierre`.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.timeLeft = 0;
  for (let i = 0; i < 8; i++) g.update(1 / 60);
});
// EL CIERRE PASA POR SU OUTRO, Y UN OUTRO ESPERA UN CLIC. Esto se quedaba
// mirando la tarjeta durante sesenta segundos sin pasar una sola línea, así
// que la tarjeta no llegaba nunca y el fallo se leía como «la jornada no
// ofrece reinicio» — con el juego entero funcionando. Hay que ir pasando el
// guion MIENTRAS se espera, igual que haría quien juega.
const botonReinicio = () =>
  p.evaluate(() =>
    [...document.querySelectorAll(".inc-overlay-actions button")].some((x) =>
      /reintentar|repetir|siguiente/i.test(x.textContent ?? "")
    )
  );
// Y EL OUTRO NO ES LO ÚNICO QUE HAY EN MEDIO. Cerrar una jornada pasa por su
// guion Y POR LA EVALUACIÓN, que es otra pantalla con su propio botón
// («Firmar y continuar»). Pasando solo el diálogo, esto se quedaba plantado
// delante del acta de evaluación durante todo el plazo y luego informaba de
// que «no salió la tarjeta» — con el día cerrado perfectamente y el juego
// esperando, con toda la razón, a que alguien firmara. Se avanza lo que haya:
// caja con la tecla, pantalla con su botón.
let hayBoton = false;
for (let i = 0; i < 120 && !hayBoton; i++) {
  hayBoton = await botonReinicio();
  if (hayBoton) break;
  if (await p.evaluate(() => window.__game.engine.dialogue.isOpen)) {
    await p.keyboard.press("Space");
  } else {
    await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (x) => x.offsetParent && /firmar|continuar|seguir|aceptar/i.test(x.textContent ?? "")
      );
      b?.click();
    });
  }
  await p.waitForTimeout(250);
}

if (!hayBoton) {
  // Sin tarjeta no hay nada que pulsar; se dice, no se aprueba en silencio —
  // y se dice QUÉ había en pantalla, que «no salió» a secas no se diagnostica.
  const estado = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const vis = (s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return !el.classList.contains("inc-hidden") && r.width > 0 && r.height > 0;
    };
    return {
      gameOver: !!g?.gameOver,
      win: !!g?.win,
      timeLeft: Math.round(g?.timeLeft ?? -1),
      caja: !!window.__game.engine.dialogue.isOpen,
      modal: vis(".inc-modal"),
      review: vis(".inc-review"),
      rrhh: vis(".inc-hr"),
      nivelacion: vis(".inc-levelling"),
      botones: [...document.querySelectorAll("button")]
        .filter((b) => b.offsetParent)
        .map((b) => b.textContent.trim().slice(0, 24))
        .slice(0, 12),
    };
  });
  check("la jornada terminada ofrece un reinicio", false, JSON.stringify(estado));
} else {
  // SE MARCA EL DÍA QUE SE VA, y se espera a PISAR EL PISO. La primera
  // versión de esto solo vigilaba `crossingActive` durante tres segundos, y
  // era un verde falso: con el fallo puesto, el cruce no se enciende enseguida
  // porque ANTES juega su propia intro, que espera un clic — así que en esos
  // tres segundos no hay avenida que ver y la prueba daba por bueno el fallo
  // que venía a cazar. (Comprobado reintroduciéndolo: pasaba igual.)
  //
  // Lo que de verdad afirma «cae directo al piso» es que se LLEGA al piso: un
  // `Game` nuevo, sin pasar por la calle. Con el fallo no llega ninguno,
  // porque `prepareFloor` va después del minijuego.
  await p.evaluate(() => {
    window.__game.engine.game.__viejo = true;
    const btn = [...document.querySelectorAll(".inc-overlay-actions button")].find((x) =>
      /reintentar|repetir|siguiente/i.test(x.textContent ?? "")
    );
    btn?.click();
  });
  let calle = false;
  let enPiso = false;
  for (let i = 0; i < 60 && !enPiso; i++) {
    const s = await p.evaluate(() => {
      const lobby = document.querySelector(".inc-lobby-scene");
      return {
        calle:
          !!window.__game.engine.crossingActive ||
          (!!lobby && !lobby.classList.contains("inc-hidden")),
        nuevo: !!window.__game.engine.game && !window.__game.engine.game.__viejo,
      };
    });
    calle = calle || s.calle;
    enPiso = s.nuevo;
    if (!enPiso) await p.waitForTimeout(250);
  }
  check(
    "reintentar cae DIRECTO al piso: ni avenida ni ascensor",
    enPiso && !calle,
    enPiso ? "pasó por la calle o por el ascensor" : "no llegó a montar el piso (se quedó fuera del edificio)"
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

console.log(
  fallos === 0
    ? "\nUn reinicio devuelve a todo el mundo a su sitio"
    : `\n${fallos} fallo(s): algo sobrevive al reinicio`
);
// Sin `b.close()`, por lo mismo que en check:cierre: cerrar una pestaña que
// acaba de terminar el día no devuelve nunca.
process.exit(fallos === 0 ? 0 : 1);
