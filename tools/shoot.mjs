// Visual smoke test: boots the built game, dismisses the intro scene and
// captures the diorama at desktop, phone-portrait and phone-landscape sizes.
// Any page error fails the run, so a black screen can never ship unnoticed.
//
// Usage: node tools/shoot.mjs [url] [outDir]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:4173/";
const outDir = process.argv[3] ?? "shots";
await mkdir(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, framing: 0 },
  { name: "desktop-follow", width: 1440, height: 900, framing: 1 },
  // En VERTICAL el juego no se dibuja a propósito: cae la cortina de «gira el
  // teléfono» (docs/PANTALLAS.md §1.4). Así que aquí no se comprueba que el
  // diorama se pinte —sería exigir lo contrario de lo que se diseñó— sino que
  // la cortina esté puesta. Sin esto la captura salía «EN BLANCO» y el test
  // fallaba por hacer el juego justo lo que debe.
  { name: "phone-portrait", width: 390, height: 844, framing: 0.8, touch: true, esperaCortina: true },
  { name: "phone-landscape", width: 844, height: 390, framing: 0.6, touch: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
let failed = false;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: !!vp.touch,
    isMobile: !!vp.touch,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

  // Se entra al piso por la API de depuración, igual que las comprobaciones de
  // tools/. Pulsando el botón del título se acababa en la pantalla de elegir
  // personaje — que es obligatoria — y estas capturas llevaban desde entonces
  // retratando un menú en vez del diorama, sin que nadie lo notara.
  await page.evaluate(() => {
    window.__game.engine.save.setCharacter("giu");
    window.__game.engine.menus.close();
  });
  await page.evaluate(() => {
    window.__game.engine.startDay(0, { skipMinigame: true });
  });
  await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 15000 });

  // El diálogo de entrada se pasa a clics, y hay que insistir: esconder la
  // capa una sola vez no vale porque el siguiente nodo la vuelve a mostrar, y
  // la captura salía con media pantalla tapada. Se avanza hasta que se quede
  // cerrada dos vueltas seguidas.
  let closedInARow = 0;
  for (let i = 0; i < 40 && closedInARow < 2; i++) {
    const open = await page.evaluate(() => !!document.querySelector(".vn-layer:not(.hidden)"));
    if (!open) {
      closedInARow++;
      await page.waitForTimeout(180);
      continue;
    }
    closedInARow = 0;
    const option = await page.$(".vn-option");
    if (option) await option.click();
    else await page.mouse.click(vp.width / 2, vp.height - 60);
    await page.waitForTimeout(200);
  }

  // La cámara tarda un momento en dejar de estar dentro de una pared: sin
  // esperar a que se asiente, la captura sale mirando un tabique a diez
  // centímetros.
  await page.evaluate((f) => {
    // Con una regla de estilo, no con la clase `hidden`: el diálogo se
    // reabre solo en cuanto entra el siguiente nodo del guion, y quitarle la
    // clase una vez no impedía que volviera a taparlo todo justo al disparar.
    const css = document.createElement("style");
    css.textContent = ".vn-layer { display: none !important; }";
    document.head.appendChild(css);
    window.__game.engine.game?.setPaused(false);
    window.__game.view.setFraming(f);
  }, vp.framing);
  await page.waitForTimeout(2200);
  // El encuadre se vuelve a pedir después de la espera: la cámara sigue a la
  // jugadora en cada frame, así que pedirlo solo antes se lo comía el propio
  // seguimiento y las dos capturas de escritorio salían idénticas.
  await page.evaluate((f) => window.__game.view.setFraming(f), vp.framing);
  await page.waitForTimeout(700);

  const shot = await page.screenshot({ path: `${outDir}/${vp.name}.png` });
  const kb = Math.round(shot.length / 1024);

  let mal;
  let status;
  if (vp.esperaCortina) {
    // Vertical: lo que tiene que verse es la cortina, no el piso.
    const cortina = await page.evaluate(() => {
      const el = document.querySelector(".inc-rotate-guard");
      return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 100;
    });
    mal = !cortina;
    status = errors.length ? "ERROR" : cortina ? "ok (cortina)" : "SIN CORTINA";
  } else {
    // A black screen is a flat image, and a flat image compresses to almost
    // nothing. Anything under ~40KB at these sizes means the floor never drew.
    mal = kb < 40;
    status = errors.length ? "ERROR" : mal ? "EN BLANCO" : "ok";
  }
  console.log(`${vp.name.padEnd(16)} ${status}  png=${kb}KB`);
  errors.forEach((e) => console.error("   ", e));
  if (errors.length || mal) failed = true;
  await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
