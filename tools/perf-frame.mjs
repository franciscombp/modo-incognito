// Mide el COSTE POR CUADRO de una jornada en marcha: cuánto tarda
// `engine.update` (la lógica) y cuánto el cuadro entero (lógica + dibujo),
// con el jefe, los secuaces y los compañeros vivos. No es una comprobación
// con umbral —el número depende de la máquina—: es la regla para comparar
// un antes y un después en el MISMO equipo.
//
// Uso: node tools/perf-frame.mjs [url] [segundos]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const segundos = Number(process.argv[3] ?? 12);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 10000 });

const r = await page.evaluate(async (segundos) => {
  const { engine } = window.__game;
  const game = engine.game;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");
  game.clearGate();
  game.saltarEscolta();
  const logica = [];
  const original = engine.update.bind(engine);
  engine.update = (dt) => {
    const t = performance.now();
    original(dt);
    logica.push(performance.now() - t);
  };
  const cuadros = [];
  let prev = performance.now();
  const fin = prev + segundos * 1000;
  await new Promise((res) => {
    const tick = (now) => {
      cuadros.push(now - prev);
      prev = now;
      if (engine.game?.isPaused) engine.game.setPaused(false);
      if (now < fin) requestAnimationFrame(tick);
      else res();
    };
    requestAnimationFrame(tick);
  });
  engine.update = original;
  const stats = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {
      n: s.length,
      media: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2),
      p50: +q(0.5).toFixed(2),
      p95: +q(0.95).toFixed(2),
      max: +s[s.length - 1].toFixed(2),
    };
  };
  return { logicaMs: stats(logica), cuadroMs: stats(cuadros.slice(5)) };
}, segundos);

console.log(JSON.stringify(r, null, 1));
if (errors.length) console.log("errores:", errors.slice(0, 5));
await browser.close();
