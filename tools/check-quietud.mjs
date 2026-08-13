/**
 * EL ESCONDITE PIDE QUIETUD.
 *
 * En Sneaky Sasquatch te metes en un arbusto y te quedas COMPLETAMENTE
 * quieto; moverte dentro no te cubre. Es lo que convierte la huida en una
 * decisión en vez de una carrera: hay un instante en el que tienes que
 * soltar el mando y aguantar con el jefe cerca.
 *
 * Lo que vigila:
 *  1. Dentro y quieta, escondida.
 *  2. Dentro y moviéndote, NO. (Se mira la intención del mando, no la
 *     velocidad: contra una pared la velocidad es cero y el hueco sería
 *     «entro corriendo y no suelto».)
 *  3. Cruzarlo de paso no te lo QUEMA: el cupo se gasta escondida, no
 *     pasando por encima.
 *
 * Uso: npm run check:quietud   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

const out = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const fp = window.__floorplan;
  g.setPaused(false);
  g.clearGate();

  const hueco = fp.hidingSpots[0];
  const dentro = () => {
    g.player.position.x = hueco.x;
    g.player.position.z = hueco.z;
  };

  // QUIETA: sin teclas y sin joystick, la intención del mando es cero.
  const quieta = () => {
    g.player.keys.clear();
    g.player.touchAxis.x = 0;
    g.player.touchAxis.z = 0;
  };
  // ANDANDO: se empuja el eje táctil, que es el mismo canal que lee
  // `readIntent` — así no hace falta simular teclado desde dentro.
  const andando = () => {
    g.player.keys.clear();
    g.player.touchAxis.x = 1;
    g.player.touchAxis.z = 0;
  };

  quieta();
  dentro();
  for (let i = 0; i < 10; i++) {
    dentro();
    g.update(1 / 60);
  }
  const escondidaQuieta = g.player.isHiding;

  andando();
  for (let i = 0; i < 10; i++) {
    dentro();
    g.update(1 / 60);
  }
  const escondidaAndando = g.player.isHiding;

  // Cruzar de paso no gasta el cupo: se mide el desgaste del sitio mientras
  // te mueves dentro de él.
  const gasto0 = g.hidingCharge(0);
  andando();
  for (let i = 0; i < 120; i++) {
    dentro();
    g.update(1 / 60);
  }
  const gastoAndando = g.hidingCharge(0);

  quieta();
  for (let i = 0; i < 120; i++) {
    dentro();
    g.update(1 / 60);
  }
  const gastoQuieta = g.hidingCharge(0);

  return { escondidaQuieta, escondidaAndando, gasto0, gastoAndando, gastoQuieta };
});

check("dentro y QUIETA, escondida", out.escondidaQuieta === true, JSON.stringify(out));
check(
  "dentro pero MOVIÉNDOTE, no te cubre",
  out.escondidaAndando === false,
  JSON.stringify(out)
);
check(
  "cruzarlo de paso no te lo QUEMA",
  Math.abs(out.gastoAndando - out.gasto0) < 0.01,
  JSON.stringify({ antes: out.gasto0, trasAndar: out.gastoAndando })
);
check(
  "y esconderse de verdad sí gasta su cupo",
  out.gastoQuieta < out.gastoAndando - 0.05,
  JSON.stringify({ trasAndar: out.gastoAndando, trasEsconderse: out.gastoQuieta })
);
check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl escondite pide soltar el mando: la huida es una decisión, no una carrera"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
