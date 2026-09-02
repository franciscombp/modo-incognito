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
await p.evaluate(() => {
  window.__game.engine.game.seatAtDesk();
});
await p.waitForTimeout(300);

const antes = await p.evaluate(() => {
  const g = window.__game.engine.game;
  return { conPaseo: !!g.player.walkTo || g.player.inputLocked === true };
});
check(
  "el primer día deja el piso sucio (si no, no hay reinicio que medir)",
  antes.conPaseo,
  JSON.stringify(antes)
);

// ── EL REINICIO ──────────────────────────────────────────────────────────
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
// `game` ya es cierto del día anterior, así que esperarlo no dice nada: lo
// que hay que esperar es la CAJA del guion nuevo, que es donde se mide.
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
  window.__game.engine.startDay(1, { skipMinigame: true });
});
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

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nUn reinicio devuelve a todo el mundo a su sitio"
    : `\n${fallos} fallo(s): algo sobrevive al reinicio`
);
process.exit(fallos === 0 ? 0 : 1);
