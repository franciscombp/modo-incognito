// La banda sonora es el soundtrack procedural (soundtrackThemes.js) y
// REACCIONA: con el jefe lejos suena al ritmo "calm", en persecucion sube de
// tempo y de mezcla ("chase"). Se comprueba aqui porque el fallo tipico es
// invisible desde fuera: el ánimo cambia de nombre mentalmente pero el
// Transport nunca arrancó, o el tempo/mezcla no se movió con él.
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
// startDay espera a que los modelos base 3D terminen de cargar antes de
// montar el piso y arrancar el diálogo de intro (ver preloadBaseModels en
// main.js): comprobar dialogue.isOpen antes de eso siempre da "false" (el
// diálogo ni ha empezado), así que el bucle de abajo se creía "ya
// despejado" sin haber cerrado nada — y el diálogo largo del día 1 seguía
// abierto cuando se tomaba la muestra "calm".
//
// La espera es LARGA a propósito, y esta es la razón: este archivo navega con
// `domcontentloaded` (no `networkidle` como el resto de la suite) para poder
// tocar el audio antes de que la página se asiente. Eso deja los diez `.glb`
// del reparto descargándose DESPUÉS del goto, así que aquí se espera la carga
// entera del 3D en vez de esperar a la música. En una máquina lenta pasa de
// 20 s de sobra, y entonces esto reventaba con un timeout pelado que no decía
// nada de la música ni de por qué. No es flakiness: es que el presupuesto
// estaba puesto en el sitio equivocado.
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });
// Hay que cerrar los dialogos: mientras haya uno abierto el motor no
// actualiza el animo de la musica.
for (let r = 0; r < 3; r++) {
  for (let i = 0; i < 40; i++) {
    const open = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
    if (!open) break;
    const o = await p.evaluate(() => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden"));
    if (o) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
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
  g.setPaused(false);
  // LAS DOS sospechas, y en este orden. El jefe lleva su propia copia, que
  // game.js sincroniza una vez por cuadro: poniendo solo la del juego,
  // `startChase()` se encuentra al jefe todavía en frío y la puerta del
  // respiro (no persigue por debajo de `chaseSuspicionFloor`) le deniega la
  // caza. Entonces el ánimo se queda en "calm" y esta prueba dice que la
  // música no reacciona, cuando lo que no reaccionó fue el montaje.
  g.suspicion = 95;
  g.boss.suspicion = 95;
  g.boss.startChase();
});
// Y hay que sostenerlo: al nivel de búsqueda 3 el juego se PAUSA solo con el
// aviso a pantalla completa (game.js -> onHeatAlert), y en pausa el motor no
// actualiza el ánimo de la música. `_heatAlertShown` se rearma por su cuenta,
// así que no basta con reanudar una vez — hay que hacerlo dentro del bucle.
for (let i = 0; i < 25; i++) {
  await p.evaluate(() => {
    const g = window.__game.engine.game;
    g.setPaused(false);
    g.suspicion = 95;
    g.boss.suspicion = 95;
  });
  await p.waitForTimeout(100);
}
const chase = await snap("chase:");
console.log("\nerrores:", errors.length ? errors : "ninguno");
const ok = [
  ["el tema calm suena de verdad", calm.mood === "calm" && calm.playing],
  ["la persecución cambia de tema", chase.mood === "chase"],
  ["la persecución sube el tempo", chase.bpm > calm.bpm],
  ["la persecución sube bajo/lead/perc", chase.mix.bass >= calm.mix.bass && chase.mix.perc > calm.mix.perc],
];
let all = true;
for (const [l, v] of ok) { all = all && !!v; console.log(v ? "PASS" : "FAIL", " ", l); }
await b.close();
process.exit(all && !errors.length ? 0 : 1);
