// Comprobación del cruce de la Amazonas, que es lo primero que ve alguien que
// entra al juego. Dos cosas que en un diff no se ven y en una captura cuestan:
//
//  1. EL ENCUADRE. La cámara tiene que estar DETRÁS de la jugadora y por
//     encima, con ella de espaldas avanzando hacia el fondo. Si algún día
//     alguien devuelve la vista oblicua del piso, esto lo caza.
//  2. QUE SE PUEDA GANAR. Un bot que solo avanza cuando el carril está
//     despejado debe cruzar. Si los huecos del tráfico se cierran de más, el
//     día 1 se vuelve imposible antes incluso de empezar.
//
// Uso: node tools/check-crossing.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

const result = await page.evaluate(async () => {
  const { crossing3D } = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { wins: 0, rounds: 4 };

  for (let round = 0; round < out.rounds; round++) {
    const done = crossing3D.play(() => {});
    let outcome = null;
    done.then((o) => (outcome = o));
    await sleep(80);

    if (round === 0) {
      const s = crossing3D.getState();
      out.framing = {
        // Detrás: la cámara está a menos Z que la jugadora, que avanza hacia +Z.
        behind: s.camera.z < s.camera.playerZ,
        above: s.camera.y > 0,
      };
    }

    // Bot: avanza solo si el carril de delante está limpio a ambos lados.
    for (let step = 0; step < 900 && !outcome; step++) {
      const s = crossing3D.getState();
      const next = s.row + 1;
      const clear = !s.vehicles.some((v) => {
        if (v.row !== next) return false;
        // Peligroso si está encima, o si viene de frente y llega pronto.
        const dx = v.x - 0; // la columna central es x = 0
        return Math.abs(dx) < 2.4 || (v.dir > 0 ? dx < 0 && dx > -4.5 : dx > 0 && dx < 4.5);
      });
      if (clear) window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      await sleep(60);
    }
    if (outcome === "safe") out.wins++;
    await sleep(700);
  }
  return out;
});

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert("la cámara va por detrás de la jugadora", result.framing?.behind === true);
assert("la cámara mira desde arriba, no a ras de suelo", result.framing?.above === true);
assert(
  `el cruce se puede ganar (${result.wins}/${result.rounds} intentos del bot)`,
  result.wins >= 1
);

process.exit(failed ? 1 : 0);
