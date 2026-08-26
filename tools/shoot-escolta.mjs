// Capturas de la ESCOLTA en marcha, para mirar con los ojos lo que los
// checks miden con números: los dos caminando juntos, el globo de Gabo, y
// la llegada. Uso: node tools/shoot-escolta.mjs
import { chromium } from "playwright";

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => window.__game.engine.startDay(0, { skipMinigame: true }));
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(130);
}
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.boss._updateVision = function () {
    this.playerVisible = false;
    this.redAlert = false;
  };
  g.clearGate();
});
// Se deja correr EN EL BUCLE REAL (nada de update sintético): la escena
// entera con render, globos y cámara.
for (const [espera, nombre] of [
  [2500, "escolta-1-arranque"],
  [4000, "escolta-2-camino"],
  [5000, "escolta-3-llegada"],
]) {
  await p.waitForTimeout(espera);
  await p.screenshot({ path: `/tmp/${nombre}.png` });
  const st = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const d = Math.hypot(
      g.boss.position.x - g.player.position.x,
      g.boss.position.z - g.player.position.z
    );
    return {
      dJugadoraGabo: +d.toFixed(2),
      sentada: g.player.isPretending,
      escolta: g._esperandoPuesto,
      globo: document.querySelector(".inc-globo.on")?.textContent?.slice(0, 60) ?? null,
    };
  });
  console.log(nombre, JSON.stringify(st));
}
await b.close();
