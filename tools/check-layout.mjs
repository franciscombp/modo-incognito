// Auditor del LIENZO FIJO (docs/PANTALLAS.md §1.7).
//
// Antes esta comprobación recorría seis tamaños de pantalla buscando
// solapes: cada pieza de interfaz peleaba por su cuenta con el viewport.
// Con el lienzo fijo eso dejó de tener sentido — solo hay UN diseño, a
// 1920×1080 — y lo que puede romperse es OTRA cosa:
//
//   1. Que el lienzo deje de medir 1920×1080 (algo lo redimensionó).
//   2. Que la escala salga mal o quede descentrado en alguna relación de
//      aspecto (16:10, 16:9, 20:9, 4:3, ultrapanorámico).
//   3. Que dentro del lienzo algo se solape o se salga — lo de siempre,
//      pero medido UNA vez, en coordenadas de lienzo.
//   4. Que un clic en una esquina NO llegue a la esquina: la trampa
//      clásica del transform (coordenadas de pantalla vs. de lienzo).
//   5. Que en un táctil vertical salga la CORTINA de girar el teléfono.
//
// Uso: npm run check:layout   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

let failures = 0;
function verdict(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n      ${detail}`}`);
  if (!ok) failures++;
}

// ── 1+2 · El lienzo mide, escala y centra en varias relaciones de aspecto ──
for (const [w, h, name] of [
  [1440, 900, "escritorio 16:10"],
  [1920, 1080, "nativo 16:9"],
  [844, 390, "móvil apaisado 20:9"],
  [1024, 768, "tablet 4:3"],
  [2560, 720, "ultrapanorámico"],
]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#app", { timeout: 20000 });
  await p.waitForTimeout(600);
  const m = await p.evaluate(() => {
    const app = document.getElementById("app");
    const r = app.getBoundingClientRect();
    return { w: app.offsetWidth, h: app.offsetHeight, cx: r.left + r.width / 2, cy: r.top + r.height / 2, shownW: r.width };
  });
  const scale = Math.min(w / 1920, h / 1080);
  const ok =
    m.w === 1920 && m.h === 1080 &&
    Math.abs(m.shownW - 1920 * scale) < 2 &&
    Math.abs(m.cx - w / 2) < 2 && Math.abs(m.cy - h / 2) < 2;
  verdict(
    `lienzo 1920×1080, escalado y centrado — ${name}`,
    ok,
    `mide ${m.w}×${m.h}, mostrado ${Math.round(m.shownW)} (esperado ${Math.round(1920 * scale)}), centro (${Math.round(m.cx)},${Math.round(m.cy)}) vs (${w / 2},${h / 2})`,
  );
  await p.context().close();
}

// ── 3+4 · Dentro del lienzo: solapes, desbordes y el clic de esquina ──
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const pageErrors = [];
  p.on("pageerror", (e) => pageErrors.push(String(e)));
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
  await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
  // El prólogo y las presentaciones dejan huecos en los que dialogue.isOpen
  // es false sin haber terminado: tres pasadas con espera entre ellas.
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 40; i++) {
      const open = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
      if (!open) break;
      const hasOpts = await p.evaluate(() => !document.querySelector(".vn-options")?.classList.contains("hidden"));
      if (hasOpts) await p.evaluate(() => document.querySelector(".vn-option")?.click());
      else await p.keyboard.press("Space");
      await p.waitForTimeout(100);
    }
    await p.waitForTimeout(1500);
  }

  const report = await p.evaluate(() => {
    // Coordenadas de LIENZO: se deshace la escala dividiendo por ella, no
    // midiendo contra el viewport — el viewport ya no es la verdad.
    const app = document.getElementById("app");
    const appR = app.getBoundingClientRect();
    const k = appR.width / 1920;
    const sels = [
      ".inc-plate", ".inc-quests", ".inc-bar-center",
      ".track-left .track-card", ".track-right .track-card",
      ".touch-btn", ".touch-util", "#hint", ".hud-toast",
      ".wprompt-card", ".inc-zone-name",
    ];
    const boxes = [];
    for (const s of sels) {
      document.querySelectorAll(s).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || r.width < 2 || r.height < 2) return;
        boxes.push({ sel: `${s}${i ? `[${i}]` : ""}`, x: (r.x - appR.x) / k, y: (r.y - appR.y) / k, w: r.width / k, h: r.height / k });
      });
    }
    const overlaps = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
        const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
        if (ox > 8 && oy > 8) overlaps.push(`${a.sel} pisa a ${c.sel} (${Math.round(ox)}×${Math.round(oy)})`);
      }
    }
    const outside = boxes
      .filter((bx) => bx.x < -4 || bx.y < -4 || bx.x + bx.w > 1924 || bx.y + bx.h > 1084)
      .map((bx) => `${bx.sel} fuera del lienzo @ ${Math.round(bx.x)},${Math.round(bx.y)} ${Math.round(bx.w)}×${Math.round(bx.h)}`);
    return { overlaps, outside, count: boxes.length };
  });
  verdict(`nada se solapa dentro del lienzo (${report.count} piezas medidas)`, report.overlaps.length === 0, report.overlaps.join("\n      "));
  verdict("nada se sale del lienzo", report.outside.length === 0, report.outside.join("\n      "));
  verdict("sin errores de página", pageErrors.length === 0, pageErrors.join(" | ").slice(0, 300));

  // El clic de esquina: un botón pegado a la esquina inferior derecha DEL
  // LIENZO tiene que recibir un clic dado en la esquina de PANTALLA
  // equivalente. Si el transform desalinea coordenadas, cae en otro sitio.
  await p.evaluate(() => {
    window.__cornerHit = false;
    const btn = document.createElement("button");
    btn.style.cssText = "position:fixed;right:0;bottom:0;width:60px;height:60px;z-index:99999;opacity:0.01;border:0";
    btn.addEventListener("click", () => { window.__cornerHit = true; });
    document.getElementById("app").appendChild(btn);
  });
  const corner = await p.evaluate(() => {
    const r = document.getElementById("app").getBoundingClientRect();
    return { x: r.right - 8, y: r.bottom - 8 };
  });
  await p.mouse.click(corner.x, corner.y);
  const hit = await p.evaluate(() => window.__cornerHit);
  verdict("un clic en la esquina llega a la esquina", hit === true);
  await p.context().close();
}

// ── 5 · En un táctil vertical sale la cortina ──
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".inc-rotate-guard", { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1200);
  const guard = await p.evaluate(() => {
    const g = document.querySelector(".inc-rotate-guard");
    return g ? getComputedStyle(g).display !== "none" : false;
  });
  verdict("táctil en vertical: cortina de «gira el teléfono»", guard === true);
  await ctx.close();
}

await b.close();
console.log(failures === 0 ? "\nEl lienzo cumple su contrato" : `\n${failures} fallo(s) de lienzo`);
process.exit(failures === 0 ? 0 : 1);
