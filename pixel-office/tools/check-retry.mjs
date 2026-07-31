// Reintentar el día después de perderlo en el cruce.
//
// El fallo que motiva esta comprobación: al perder la avenida se muestra el
// vestíbulo (con las puertas cerradas, porque no llegaste) y la tarjeta de
// "Te ascendieron a cliente". El botón de Reintentar volvía a lanzar el día,
// pero ni el vestíbulo ni la tarjeta se quitaban hasta DESPUÉS del minijuego,
// así que el cruce se jugaba debajo de los dos y el juego parecía colgado en
// el ascensor.
//
// Uso: node tools/check-retry.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.save.setCharacter("giu");
  window.__game.engine.menus.close();
});

const visible = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return !el.classList.contains("hidden") && r.width > 0 && r.height > 0;
  }, sel);

/** Salta los diálogos hasta que la avenida esté jugable. */
async function reachCrossing() {
  for (let i = 0; i < 14; i++) {
    if (await page.locator(".crossing-ui:not(.hidden)").count()) return true;
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
  }
  return false;
}

const out = {};
await page.evaluate(() => {
  window.__game.engine.startDay(0);
});
out.firstRun = await reachCrossing();

// Perder a propósito: quedarse quieto en un carril hasta que pase un coche.
await page.keyboard.press("ArrowUp");
await page.waitForFunction(
  () => !document.querySelector(".crossing-ui:not(.hidden)"),
  null,
  { timeout: 40000 }
);
// El diálogo de "eso se avisa con tiempo" va antes de la tarjeta.
for (let i = 0; i < 10 && !(await visible(".hud-overlay")); i++) {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
}
out.lostShowsResult = await visible(".hud-overlay");
out.lostShowsLobby = await visible(".lobby-scene");

// Reintentar, tal cual lo haría la jugadora: el botón de la tarjeta.
await page.locator(".hud-overlay button", { hasText: "Reintentar" }).first().click();
out.secondRun = await reachCrossing();
out.lobbyGone = !(await visible(".lobby-scene"));
out.resultGone = !(await visible(".hud-overlay"));

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert("el día 1 abre en el cruce", out.firstRun);
assert("perder el cruce muestra la tarjeta de despido", out.lostShowsResult);
assert("perder el cruce deja el vestíbulo puesto", out.lostShowsLobby);
assert("Reintentar vuelve a la avenida", out.secondRun);
assert("al reintentar el vestíbulo ya no tapa la avenida", out.lobbyGone);
assert("al reintentar la tarjeta de despido ya no tapa la avenida", out.resultGone);

process.exit(failed ? 1 : 0);
