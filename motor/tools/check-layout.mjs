// Auditor de layout del HUD: en varios tamaños de pantalla reales comprueba
// que ningún elemento legible o pulsable se solape con otro, que ningún texto
// quede recortado por "..." y que nada se salga del viewport.
//
// Existe porque estos fallos son invisibles leyendo el código y fáciles de
// pasar por alto en una captura. Encontró, entre otros: el botón de pausa
// debajo de la tarjeta de tarea, la flecha del jefe bajo los botones
// táctiles, el botón USAR encima de los de utilidades en horizontal, y el
// cartel de controles pisando ambas tarjetas en portátiles de 1024px.
//
// Uso: npm run check:layout   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

// Todo lo que compite por espacio en pantalla durante la partida.
const SEL = [
  ".hud-objectives", ".hud-suspicion", ".hud-timer", ".hud-scorepanel",
  ".track-left .track-card", ".track-right .track-card",
  ".radar", ".touch-btn", ".touch-util", "#hint", ".hud-toast",
  ".track-marker", ".wprompt-card",
];

let failures = 0;

async function audit(w, h, name, touch) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch });
  const p = await ctx.newPage();
  const pageErrors = [];
  p.on("pageerror", (e) => pageErrors.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
  // El prólogo, el vestíbulo y la presentación de secuaces dejan huecos en
  // los que `dialogue.isOpen` es false sin haber terminado todavía.
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 40; i++) {
      const open = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
      if (!open) break;
      const hasOpts = await p.evaluate(() => !document.querySelector(".vn-options")?.classList.contains("hidden"));
      if (hasOpts) await p.evaluate(() => document.querySelector(".vn-option")?.click());
      else await p.keyboard.press("Space");
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(1900);
  }
  await p.waitForTimeout(700);
  const report = await p.evaluate((sels) => {
    const boxes = [];
    for (const s of sels) {
      document.querySelectorAll(s).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || r.width < 2 || r.height < 2) return;
        boxes.push({ sel: `${s}${i ? `[${i}]` : ""}`, x: r.x, y: r.y, w: r.width, h: r.height });
      });
    }
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (ox > 3 && oy > 3) {
          overlaps.push(`${a.sel} ∩ ${c.sel} = ${Math.round(ox)}x${Math.round(oy)}px`);
        }
      }
    }
    // Texto recortado por ellipsis (scrollWidth > clientWidth).
    const clipped = [];
    document.querySelectorAll(".track-label, .track-top, .hud-obj-name").forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 1) {
        clipped.push(`${el.className}: "${el.textContent.trim()}"`);
      }
    });
    // Elementos que se salen del viewport.
    const offscreen = [];
    for (const bx of boxes) {
      if (bx.x < -2 || bx.y < -2 || bx.x + bx.w > innerWidth + 2 || bx.y + bx.h > innerHeight + 2) {
        offscreen.push(`${bx.sel} @ ${Math.round(bx.x)},${Math.round(bx.y)} ${Math.round(bx.w)}x${Math.round(bx.h)}`);
      }
    }
    return { overlaps, clipped, offscreen };
  }, SEL);

  const problems = [...report.overlaps, ...report.clipped, ...report.offscreen, ...pageErrors];
  if (problems.length) {
    failures += problems.length;
    console.log(`FAIL  ${name} (${w}x${h})`);
    problems.forEach((x) => console.log(`        ${x}`));
  } else {
    console.log(`PASS  ${name} (${w}x${h})`);
  }
  await ctx.close();
}

await audit(1440, 900, "desktop", false);
await audit(1280, 720, "desktop-small", false);
await audit(1024, 640, "laptop-small", false);
await audit(390, 844, "phone", true);
await audit(375, 667, "phone-se", true);
await audit(844, 390, "phone-landscape", true);

await b.close();
console.log(failures ? `\n${failures} problema(s) de layout` : "\nLayout limpio en todos los tamaños");
process.exit(failures ? 1 : 0);
