import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox","--enable-unsafe-swiftshader"] });
// Un teléfono apaisado de verdad: puntero grueso → lienzo compacto 1280×720.
const ctx = await b.newContext({
  viewport: { width: 900, height: 414 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await p.goto("http://localhost:4173/", { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => window.__game.engine.startDay(0, { skipMinigame: true }));
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });
await p.evaluate(() => {
  const g = window.__game.engine.game;
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: ".vn-layer, .inc-dialogue { display:none !important }" }));
  g.setPaused(false);
});
await p.waitForTimeout(1800);
await p.screenshot({ path: "/tmp/movil.png" });

// Y las medidas REALES de las piezas que se quejaron, en píxeles de pantalla.
const m = await p.evaluate(() => {
  const r = (sel) => {
    const n = document.querySelector(sel);
    if (!n) return null;
    const b = n.getBoundingClientRect();
    return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) };
  };
  return {
    placa: r(".inc-plate"),
    cara: r(".inc-plate-face"),
    lienzoCara: r(".inc-plate-face canvas"),
    energia: r(".inc-plate-meter--energy"),
    rombos: r(".inc-plate-pips"),
    misiones: r(".inc-quests"),
    trackTarea: r("#inc-track-task"),
    trackJefe: r("#inc-track-boss"),
    stage: getComputedStyle(document.documentElement).getPropertyValue("--stage-w"),
    escala: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"),
  };
});
console.log(JSON.stringify(m, null, 1));
await b.close();
