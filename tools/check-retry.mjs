// Reintentar el día después de perderlo en el cruce.
//
// EL CRUCE ESTÁ DESACTIVADO en el día 1 publicado (su bloque se llama
// `$minigame`), pero el código sigue vivo y el día puede reactivarlo cuando
// quiera, así que esta comprobación NO se tira: se lo vuelve a activar solo
// para ella, interceptando el JSON del día. Lo primero que mira, eso sí, es
// que el día tal como se publica abra en el ASCENSOR.
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

// Primero, el día tal cual se publica: tiene que abrir en el ascensor.
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.save.setCharacter("giu");
  window.__game.engine.menus.close();
  window.__game.engine.startDay(0);
});
await page.waitForTimeout(1200);
const opensAtLift = await page.evaluate(() => {
  const lobby = document.querySelector(".inc-lobby-scene");
  return !!lobby && !lobby.classList.contains("inc-hidden") && !window.__game.engine.crossingActive;
});

// A partir de aquí, con el cruce puesto a mano: el ciclo de derrota y
// reintento es código vivo y hay que seguir vigilándolo.
await page.route("**/data/levels/dia-1.json*", async (route) => {
  const res = await route.fetch();
  const day = await res.json();
  if (day.$minigame) {
    day.minigame = day.$minigame;
    delete day.$minigame;
  }
  await route.fulfill({ response: res, body: JSON.stringify(day) });
});
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
    return !el.classList.contains("inc-hidden") && r.width > 0 && r.height > 0;
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

// Perder a propósito: caminar hasta el primer carril y quedarse quieta
// hasta que pase un coche. Con el movimiento CONTINUO del cruce se MANTIENE
// la tecla hasta una `z` MEDIDA (el centro de la franja del carril 1), no
// un tiempo: en headless el rAF va famélico y 650 ms de reloj eran la mitad
// de tiempo simulado — la jugadora se quedaba a un paso del tráfico, nada
// la atropellaba nunca, y la espera de abajo caducaba pareciendo otra cosa.
await page.keyboard.down("ArrowUp");
await page.waitForFunction(() => window.__game.crossing3D.getState().z >= 2.6, null, {
  timeout: 20000,
});
await page.keyboard.up("ArrowUp");
await page.waitForFunction(
  () => !document.querySelector(".crossing-ui:not(.hidden)"),
  null,
  { timeout: 40000 }
);
// El diálogo de "eso se avisa con tiempo" va antes de la tarjeta.
for (let i = 0; i < 10 && !(await visible(".inc-modal")); i++) {
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
}
out.lostShowsResult = await visible(".inc-modal");
out.lostShowsLobby = await visible(".inc-lobby-scene");

// Reintentar, tal cual lo haría la jugadora: el botón de la tarjeta.
await page.locator(".inc-modal button", { hasText: "Reintentar" }).first().click();
out.secondRun = await reachCrossing();
out.lobbyGone = !(await visible(".inc-lobby-scene"));
out.resultGone = !(await visible(".inc-modal"));

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert("el día 1 publicado abre en el ascensor, no en la calle", opensAtLift);
assert("con el cruce puesto, el día 1 abre en él", out.firstRun);
assert("perder el cruce muestra la tarjeta de despido", out.lostShowsResult);
assert("perder el cruce deja el vestíbulo puesto", out.lostShowsLobby);
assert("Reintentar vuelve a la avenida", out.secondRun);
assert("al reintentar el vestíbulo ya no tapa la avenida", out.lobbyGone);
assert("al reintentar la tarjeta de despido ya no tapa la avenida", out.resultGone);

process.exit(failed ? 1 : 0);
