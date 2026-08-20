/**
 * TRES MANDOS, UN JUEGO.
 *
 * Nació de un fallo concreto: las preguntas del Parce no se podían contestar
 * ni con el dedo ni con el mando. Sus opciones eran `<span>` dentro de una
 * pantalla `pointer-events: none`, así que el único camino era pulsar 1-3 —
 * que en un teléfono no existen. Un minijuego al que solo se puede jugar de
 * una manera no está terminado.
 *
 * Esta prueba NO mira una captura, a propósito: una tarjeta con tres
 * opciones se ve idéntica tanto si se puede pulsar como si no. Lo que hace
 * es USAR cada mando —clic de ratón de verdad, teclas de verdad, cursor de
 * verdad— y mirar si el juego se enteró.
 *
 * Uso: npm run check:mandos   (necesita `npm run preview` en :4173)
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
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });

// ── EL TÍTULO: el mando tiene que servir ANTES de que empiece nada ──
await p.waitForTimeout(600);
const menuHay = await p.evaluate(() => !!document.querySelector(".inc-menu:not(.inc-hidden) button"));
if (menuHay) {
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(120);
  const conCursor = await p.evaluate(() => !!document.querySelector(".inc-menu .nav-cursor"));
  check("en un menú, las FLECHAS mueven un cursor visible", conCursor);
} else {
  check("en un menú, las FLECHAS mueven un cursor visible", false, "no había menú abierto");
}

await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
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

/** Abre el examen del Parce, que es donde apareció el fallo. */
async function abrirExamen() {
  await p.evaluate(() => {
    const g = window.__game.engine.game;
    g.setPaused(false);
    g.clearGate();
    g.cerrarReto();
    const item = [...g._carriables.values()].find((i) => i.reto?.tipo === "trivia");
    g._abrirReto(item);
  });
  await p.waitForTimeout(350);
}

await abrirExamen();
check(
  "el examen del Parce se abre y SE PINTA con sus tres opciones",
  (await p.locator(".inc-chisme.on .inc-chisme-opt").count()) === 3
);
check(
  "y sus opciones son BOTONES, no texto muerto",
  (await p.locator(".inc-chisme.on .inc-chisme-opt").first().evaluate((e) => e.tagName)) === "BUTTON"
);

// ── 1 · EL RATÓN (y con él el dedo: es el mismo `click` del DOM) ──
const antesClic = await p.evaluate(() => window.__game.engine.game.trivia.snapshot()?.pregunta);
const correcta = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const s = g.trivia.snapshot();
  const f = g._chismes.find((x) => x.pregunta === s.pregunta);
  return f.correcta;
});
await p.locator(".inc-chisme.on .inc-chisme-opt").nth(correcta).click();
await p.waitForTimeout(250);
const trasClic = await p.evaluate(() => window.__game.engine.game.trivia.snapshot()?.aciertos ?? "ganado");
check(
  "un CLIC de ratón responde de verdad (y con él el dedo)",
  trasClic === 1 || trasClic === "ganado",
  `pregunta="${antesClic}" aciertos=${trasClic}`
);

// ── 2 · EL TECLADO por su atajo, que es el camino rápido ──
await abrirExamen();
const buena = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const s = g.trivia.snapshot();
  return g._chismes.find((x) => x.pregunta === s.pregunta).correcta;
});
await p.keyboard.press(String(buena + 1));
check("la TECLA del número que se lee en la tarjeta responde", await respondio(p));

/**
 * ESPERAR A QUE LA RESPUESTA CUENTE, en vez de dormir una cifra fija.
 *
 * Las dos aserciones de abajo leían `aciertos` exactamente 250 ms después de
 * pulsar, y esa única muestra bajo carga cae ANTES de que la respuesta se
 * registre: en la suite completa esto fallaba una de cada dos veces y suelto
 * pasaba siempre, o sea que lo que medía era la máquina y no el mando (la
 * misma lección que dejó escrita `check:chase`). Sondeando, el resultado deja
 * de depender de lo ocupado que esté el equipo.
 */
async function respondio(pagina, ms = 3000) {
  try {
    await pagina.waitForFunction(
      () => (window.__game.engine.game.trivia.snapshot()?.aciertos ?? "ganado") !== 0,
      null,
      { timeout: ms }
    );
    return true;
  } catch {
    return false;
  }
}

// ── 3 · EL CURSOR: flechas hasta la opción buena y Enter ──
// Es el camino del mando: la cruceta y la palanca acaban en el mismo
// `mover()`, así que probar las flechas prueba los tres.
await abrirExamen();
const buena3 = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const s = g.trivia.snapshot();
  return g._chismes.find((x) => x.pregunta === s.pregunta).correcta;
});
await p.waitForTimeout(150);
const posado = await p.evaluate(() => !!document.querySelector(".inc-chisme.on .nav-cursor"));
check("el cursor se POSA solo al abrirse la tarjeta", posado);
for (let i = 0; i < buena3; i++) {
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(90);
}
const dondeEsta = await p.evaluate(() => {
  const opts = [...document.querySelectorAll(".inc-chisme.on .inc-chisme-opt")];
  return opts.findIndex((o) => o.classList.contains("nav-cursor"));
});
check("las FLECHAS lo mueven de opción en opción", dondeEsta === buena3, `cursor en ${dondeEsta}`);
await p.keyboard.press("Enter");
check("y ENTER responde con la que está señalada", await respondio(p));

// ── El mando no puede robarle las teclas al juego ──
await p.evaluate(() => window.__game.engine.game.cerrarReto());
await p.waitForTimeout(700);
const quedan = await p.evaluate(() =>
  [...document.querySelectorAll(".nav-cursor")].map((e) => e.className)
);
check(
  "cerrado el minijuego, el cursor DESAPARECE (las flechas vuelven a ser de caminar)",
  quedan.length === 0,
  quedan.join(" | ")
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nRatón, dedo, teclado y mando: los cuatro llegan a la misma respuesta"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
