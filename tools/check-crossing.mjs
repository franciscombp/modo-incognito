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
  const out = { wins: 0, rounds: 10 };

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

    // Bot para el movimiento CONTINUO: mantiene ↑ mientras el carril de
    // delante esté limpio y SUELTA cuando no — keydown/keyup, como un pulgar
    // de verdad. Si le pilla la duda a MITAD de un carril con tráfico, sigue
    // empujando: pararse dentro del carril es lo único peor que cruzarlo.
    const press = (down) =>
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "ArrowUp" }));
    const laneClear = (s, row) =>
      !s.vehicles.some((v) => {
        if (v.row !== row) return false;
        // Peligroso si está encima, o si viene de frente y llega pronto.
        const dx = v.x - 0; // el bot nunca se mueve de la columna central
        return Math.abs(dx) < 2.6 || (v.dir > 0 ? dx < 0 && dx > -5 : dx > 0 && dx < 5);
      });
    for (let step = 0; step < 900 && !outcome; step++) {
      const s = crossing3D.getState();
      // 2.88 = LANE_DEPTH en unidades de mundo (2.4 × WORLD_SCALE 1.2).
      const enMedio = Math.abs(s.z - s.row * 2.88) < 1.1 && !laneClear(s, s.row);
      press(laneClear(s, s.row + 1) || enMedio);
      await sleep(60);
    }
    press(false);
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
// No basta con que sea posible: el día 1 abre con esto, así que tiene que
// salir bien la mayoría de las veces. Un bot que solo mira si el carril de
// delante está limpio debe cruzar al menos 7 de cada 10.
assert(
  `el cruce se pasa con holgura (${result.wins}/${result.rounds} intentos del bot)`,
  result.wins >= 7
);

process.exit(failed ? 1 : 0);
