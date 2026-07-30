// La banda sonora es la pista compuesta (public/audio/*.mp3), y ademas
// REACCIONA: con el jefe lejos suena filtrada y baja, en persecucion se abre
// y acelera. Se comprueba aqui porque los dos fallos que tuvo son invisibles
// desde fuera: el mp3 cargaba pero no llegaba a sonar (carrera entre la
// decodificacion y el primer cambio de animo), y el animo no se aplicaba.
//
// Uso: npm run check:music   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });
const url = process.argv[2] ?? "http://localhost:4173/";
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 25000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
// Hay que cerrar los dialogos: mientras haya uno abierto el motor no
// actualiza el animo de la musica.
for (let r = 0; r < 3; r++) {
  for (let i = 0; i < 40; i++) {
    const open = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
    if (!open) break;
    const o = await p.evaluate(() => !document.querySelector(".vn-options")?.classList.contains("hidden"));
    if (o) await p.evaluate(() => document.querySelector(".vn-option")?.click());
    else await p.keyboard.press("Space");
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(1900);
}
await p.waitForTimeout(2000);
const snap = async (label) => {
  const s = await p.evaluate(() => window.__game.soundtrackState());
  console.log(label.padEnd(10), JSON.stringify(s));
  return s;
};
const calm = await snap("calm:");
await p.evaluate(async () => {
  const g = window.__game.engine.game;
  g.setPaused(false); g.suspicion = 95; g.boss.startChase();
});
await p.waitForTimeout(2500);
const chase = await snap("chase:");
console.log("\nerrores:", errors.length ? errors : "ninguno");
const ok = [
  ["usa la pista compuesta", calm.usingTrack && !calm.trackFailed],
  ["la pista suena de verdad", calm.playing],
  ["el ánimo abre el filtro", chase.cutoff > calm.cutoff],
  ["el ánimo sube el tempo", chase.rate > calm.rate],
];
let all = true;
for (const [l, v] of ok) { all = all && !!v; console.log(v ? "PASS" : "FAIL", " ", l); }
await b.close();
process.exit(all && !errors.length ? 0 : 1);
