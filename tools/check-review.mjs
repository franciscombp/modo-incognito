/**
 * EL CIERRE DE JORNADA: evaluación de desempeño y plan de nivelación
 * (docs/PANTALLAS.md §3.2, docs/CAMPANA.md §5.1).
 *
 * Estas dos pantallas son fáciles de romper sin que se note, porque solo
 * aparecen al final de un día — nadie las ve mientras desarrolla. Y las dos
 * tienen una regla que, si se cae, cambia el juego entero:
 *
 *  · La evaluación tiene que enseñar los DOS EJES POR SEPARADO. Es el chiste
 *    central: cumplir todo el trabajo y suspender por no hablar con nadie.
 *    Si vuelve a resumirse en una letra, el juego pierde su tema.
 *  · El plan de nivelación NO PUEDE PERDERSE. Es la red de seguridad, y si
 *    algún día se puede fallar deja de serlo.
 *
 * Se prueban contra `campaign.endDay()` directamente en vez de jugar cinco
 * días: el cálculo es el mismo y así la comprobación tarda segundos.
 *
 * Uso: npm run check:review   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });

// ── 1 · La nota mira los dos ejes POR SEPARADO ──
// Se monta el caso que da nombre al chiste: todos los Qués hechos, ningún
// Cómo. Tiene que salir B, y con los dos ejes contados aparte.
const ejes = await p.evaluate(async () => {
  const { engine } = window.__game;
  const camp = engine.campaign;
  if (!camp?.active) return { error: "no hay campaña cargada" };

  // El caso se monta por la CADENA, no marcando objetivos del piso: hay que
  // dejar un Cómo ELEGIBLE y sin hacer, y para eso hace falta abrirlo antes.
  // `chisme-fran` (cómo) depende de `fingir-101` (qué), así que se completan
  // todos los qués —lo que además lo desbloquea— y se deja ese sin tocar.
  // La primera versión llamaba a clearGate() y daba por hecho `meet-gabo`,
  // con lo que los dos ejes salían completos y la nota no era B, sino "—".
  // OJO: la lista de qués tiene que seguir a la temporada — completar `movie`
  // desbloquea `siesta-tactica` y esa a `ventana` (únicas qué), y un qué
  // elegible sin hacer también rompe la B. Si añades un qué a la cadena,
  // añádelo aquí o deja su requisito sin cumplir.
  engine.save.campaign = { temporada: 1, dia: 1, unicas: [] };
  camp.startDay();
  camp.complete("meet-gabo");
  for (const id of ["fingir-101", "stretch", "coffee", "movie", "snack", "siesta-tactica", "ventana"])
    camp.complete(id);
  const r = camp.endDay({ win: false });
  return { nota: r.nota, ques: r.ques, comos: r.comos, detalle: r.detalle };
});
assert(
  "la evaluación cuenta Qués y Cómos por separado",
  !!ejes.ques && !!ejes.comos && typeof ejes.ques.total === "number",
  JSON.stringify(ejes),
);
assert(
  "cumplir solo los Qués da B (el chiste: trabajas pero no hablas)",
  ejes.nota === "B",
  JSON.stringify(ejes),
);

// ── 3 · La NIVELACIÓN sale al quinto día sin cerrar la temporada ──
const nivel = await p.evaluate(() => {
  const camp = window.__game.engine.campaign;
  const save = window.__game.engine.save;
  // Se coloca el calendario en el día 5 sin haber cerrado la temporada, y se
  // ARRANCA el día: sin esto el `hoy` de la prueba anterior seguía dentro y
  // la nota salía la de aquel caso, no la de este.
  save.campaign = { temporada: 1, dia: 5, unicas: [] };
  camp.startDay();
  const r = camp.endDay({ win: false });
  return { nota: r.nota, dia: r.dia };
});
assert("al quinto día sin cerrar, la nota es Nivelación", nivel.nota === "Nivelación", JSON.stringify(nivel));

// ── 4 · LA RED DE SEGURIDAD: el plan devuelve al día 1 y NO borra progreso ──
const red = await p.evaluate(() => {
  const camp = window.__game.engine.campaign;
  const save = window.__game.engine.save;
  save.campaign = { temporada: 2, dia: 5, unicas: ["meet-gabo", "chisme-fran"] };
  camp.afterLevelling();
  const c = save.campaign;
  return { temporada: c.temporada, dia: c.dia, unicas: c.unicas };
});
assert("tras el plan se vuelve al día 1", red.dia === 1, JSON.stringify(red));
assert("sin cambiar de temporada", red.temporada === 2, JSON.stringify(red));
assert(
  "y SIN perder las misiones únicas ya hechas",
  Array.isArray(red.unicas) && red.unicas.length === 2,
  JSON.stringify(red),
);

// ── 5 · La pantalla de evaluación existe y se puede cerrar ──
// El bucle vive AQUÍ, en Node, y no dentro de un evaluate: `finishDay` hace
// `await dialogue.play(outro)` antes de la evaluación, y ese diálogo solo
// avanza con un clic o una tecla de verdad — `dialogue` no expone ningún
// `advance()` público. Desde dentro de la página no había forma de pasarlo,
// y la prueba se quedaba esperando eternamente una pantalla que estaba
// correctamente esperando su turno.
await p.evaluate(() => {
  const { engine } = window.__game;
  engine.save.campaign = { temporada: 1, dia: 1, unicas: [] };
  const g = engine.game;
  g.setPaused(false);
  g.timeLeft = 0.01;
});
for (let i = 0; i < 80; i++) {
  if (await p.evaluate(() => !!document.querySelector(".inc-review"))) break;
  const opt = await p.$(".inc-dialogue-option, .vn-option");
  if (opt) await opt.click().catch(() => {});
  else await p.keyboard.press("Space").catch(() => {});
  await p.waitForTimeout(180);
}
const pantalla = await p.evaluate(() => {
  const layer = document.querySelector(".inc-review");
  return {
    aparece: !!layer,
    nota: layer?.querySelector(".inc-review-nota-value")?.textContent ?? null,
    ejes: layer ? layer.querySelectorAll(".inc-review-eje").length : 0,
    comentario: (layer?.querySelector(".inc-review-quote-text")?.textContent ?? "").length,
    barras: layer ? layer.querySelectorAll(".inc-review-eje-bar > i").length : 0,
  };
});
assert("la pantalla de evaluación aparece al cerrar el día", pantalla.aparece === true, JSON.stringify(pantalla));
assert("con los DOS ejes en pantalla", pantalla.ejes === 2, JSON.stringify(pantalla));
assert("y con comentario del evaluador", pantalla.comentario > 20, JSON.stringify(pantalla));

await p.click(".inc-review-ok").catch(() => {});
await p.waitForTimeout(500);
const cerrada = await p.evaluate(() => !document.querySelector(".inc-review"));
assert("se cierra al firmar", cerrada === true);

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLa evaluación enseña los dos ejes y el plan de nivelación no se puede perder"
    : `\n${fallos} fallo(s) en el cierre de jornada`,
);
process.exit(fallos === 0 ? 0 : 1);
