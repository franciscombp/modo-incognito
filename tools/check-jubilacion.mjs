/**
 * LA JUBILACIÓN: el final del juego, y su puerta (campaign.js + retirement.js).
 *
 * Las reglas que vigila, y por qué importan:
 *
 *  · El juego NO TERMINA hasta tenerlo todo: el último ascenso (Octogenaria →
 *    Jubilación) se RETIENE si la libreta no está completa. Sin esta puerta,
 *    el final llegaba con chismes pendientes y "desbloquear todo" no
 *    significaba nada.
 *  · Con la libreta llena, ese mismo ascenso SÍ jubila, y la pantalla de
 *    felicidades aparece de verdad (no solo el campo en el objeto).
 *  · "Volver a comenzar" resetea el progreso de la ranura y devuelve al
 *    título — el renacer que pide el diseño.
 *
 * Uso: npm run check:jubilacion   (necesita `npm run preview` en :4173)
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

async function boot() {
  await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await p.evaluate(() => {
    window.__game.engine.startDay(0, { skipMinigame: true });
  });
  await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });
}

/** Completa TODA la temporada por la cadena: únicas, qués y cómos. */
const completarTemporada = `(() => {
  const camp = window.__game.engine.campaign;
  const pending = camp.startDay();
  while (pending.length) {
    const m = pending.shift();
    pending.push(...camp.complete(m.id));
  }
})()`;

// ── 1 · La PUERTA: sin libreta completa, el último ascenso se retiene ──
await boot();
const bloqueada = await p.evaluate(`(() => {
  const { engine } = window.__game;
  engine.save.campaign = { temporada: 5, dia: 1, unicas: [] };
  ${completarTemporada};
  const r = engine.campaign.endDay({ win: true, libretaCompleta: false });
  return {
    jubilacion: r.jubilacion,
    bloqueada: r.jubilacionBloqueada,
    temporada: engine.save.campaign.temporada,
  };
})()`);
assert(
  "con la libreta a medias el último ascenso se RETIENE",
  bloqueada.bloqueada === true && bloqueada.jubilacion === false,
  JSON.stringify(bloqueada),
);
assert(
  "y la temporada se queda en la 5 (sigues de Octogenaria)",
  bloqueada.temporada === 5,
  JSON.stringify(bloqueada),
);

// ── 2 · Con la libreta llena, el mismo ascenso JUBILA ──
const jubilada = await p.evaluate(`(() => {
  const { engine } = window.__game;
  engine.save.campaign = { temporada: 5, dia: 1, unicas: [] };
  ${completarTemporada};
  const r = engine.campaign.endDay({ win: true, libretaCompleta: true });
  return {
    jubilacion: r.jubilacion,
    temporada: engine.save.campaign.temporada,
    rango: engine.campaign.rango,
  };
})()`);
assert("con la libreta completa, jubilación concedida", jubilada.jubilacion === true, JSON.stringify(jubilada));
assert(
  "la temporada avanza a la 6 y el rango ES «Jubilación»",
  jubilada.temporada === 6 && jubilada.rango === "Jubilación",
  JSON.stringify(jubilada),
);

// ── 3 · La PANTALLA de verdad: felicidades + volver a comenzar ──
// Se recarga para un estado limpio, se llena la libreta de verdad (por el
// save, como la llenaría jugar), se completa la temporada 5 y se deja que
// el CIERRE REAL del día (outro → evaluación → jubilación) haga su camino.
await boot();
await p.evaluate(async () => {
  const { engine } = window.__game;
  const res = await fetch("/data/libreta.json");
  const lib = await res.json();
  for (const pista of lib.pistas ?? []) engine.save.addPista(pista.id);
  engine.save.campaign = { temporada: 5, dia: 1, unicas: [] };
});
await p.evaluate(`(() => {
  ${completarTemporada};
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.timeLeft = 0.01;
})()`);
// El outro del día espera clics de verdad (dialogue.play): se avanza desde
// fuera, igual que check-review, hasta que aparezca la evaluación.
for (let i = 0; i < 80; i++) {
  if (await p.evaluate(() => !!document.querySelector(".inc-review"))) break;
  const opt = await p.$(".inc-dialogue-option, .vn-option");
  if (opt) await opt.click().catch(() => {});
  else await p.keyboard.press("Space").catch(() => {});
  await p.waitForTimeout(180);
}
assert(
  "el cierre del día llega a la evaluación",
  await p.evaluate(() => !!document.querySelector(".inc-review")),
);
await p.click(".inc-review-ok");
await p.waitForSelector(".inc-retire", { timeout: 8000 }).catch(() => {});
const pantalla = await p.evaluate(() => {
  const card = document.querySelector(".inc-retire-card");
  return card ? card.textContent : null;
});
assert("tras firmar la evaluación aparece LA JUBILACIÓN", !!pantalla, "no salió .inc-retire");
assert(
  "y dice FELICIDADES y JUBILACIÓN con todas las letras",
  !!pantalla && pantalla.includes("FELICIDADES") && pantalla.includes("JUBILACIÓN"),
  String(pantalla).slice(0, 120),
);

// ── 4 · «Volver a comenzar» resetea la ranura y vuelve al título ──
await p.click(".inc-retire-again");
await p.waitForTimeout(600);
const reinicio = await p.evaluate(() => {
  const { engine } = window.__game;
  const c = engine.save.campaign ?? { temporada: 1 };
  return {
    temporada: c.temporada ?? 1,
    libreta: engine.save.libreta.length,
    menuAbierto: engine.menus.isOpen,
  };
});
assert(
  "volver a comenzar deja la carrera en temporada 1 y la libreta vacía",
  reinicio.temporada === 1 && reinicio.libreta === 0,
  JSON.stringify(reinicio),
);
assert("y devuelve al menú principal", reinicio.menuAbierto === true, JSON.stringify(reinicio));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
process.exit(fallos ? 1 : 0);
