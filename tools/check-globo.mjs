/**
 * EL GLOBO SOBRE LA CABEZA, Y SU RELLENO.
 *
 * La sospecha de cada vigilante se lee del PISO, no de un panel: un globo
 * encima de su cabeza con "?" o "!", y un aro que se llena según lo cerca
 * que está de actuar. Es la ventana de reacción — con dos estados discretos
 * se pasaba de tranquila a delatada sin nada que leer en medio.
 *
 * Esto lo vigila mirando el DATO, no una captura: el escalón de relleno que
 * el sprite tiene pintado ahora mismo (`userData.alertIcon.paso`). Y de paso
 * comprueba lo que ya costó una vez: que el material NO esté transparente.
 * Los globos estuvieron invisibles semanas enteras con `opacity: 0` mientras
 * todos los tests miraban `.visible` y daban verde — un sprite que existe,
 * se actualiza y no pinta un solo píxel.
 *
 * Uso: npm run check:globo   (necesita `npm run preview` en :4173)
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

// Cuerpo de BLOQUE: con cuerpo de expresión se devuelve la promesa de
// startDay, que no resuelve hasta que alguien pase el diálogo de apertura.
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
  g.setPaused(false);
  g.clearGate();
  const m = g.minions[0];
  if (!m) return { error: "no hay secuaces" };

  // La medida: se le fija SU vigilancia y se dejan correr unos cuadros para
  // que el globo se repinte. `paso` es el escalón de relleno pintado.
  const medir = (heat) => {
    m.localHeat = heat;
    for (let i = 0; i < 4; i++) g.update(1 / 60);
    const d = m.alertIcon.userData.alertIcon;
    return { paso: d.paso, estado: d.state, visible: m.alertIcon.visible };
  };

  const umbral = m.followThreshold;
  const vacio = medir(0.02);
  const medio = medir(umbral * 0.5);
  const casi = medir(umbral * 0.9);
  const pasado = medir(Math.min(1, umbral * 1.2));

  return {
    umbral,
    vacio,
    medio,
    casi,
    pasado,
    opacidad: m.alertIcon.material.opacity,
    enEscena: !!m.alertIcon.parent,
  };
});

if (out.error) {
  check("hay secuaces a los que mirarles el globo", false, out.error);
} else {
  check(
    "el aro CRECE con la vigilancia del secuaz",
    out.vacio.paso < out.medio.paso && out.medio.paso < out.casi.paso,
    JSON.stringify({ vacio: out.vacio.paso, medio: out.medio.paso, casi: out.casi.paso })
  );
  check(
    "y se mide contra SU umbral: a media subida el aro va a media asta",
    out.medio.paso >= 4 && out.medio.paso <= 8,
    `paso=${out.medio.paso} de 12 (umbral ${out.umbral})`
  );
  check(
    "cruzado el umbral el globo se pone ROJO y el aro se completa",
    out.pasado.estado === "red" && out.pasado.paso === 12,
    JSON.stringify(out.pasado)
  );
  check(
    "el globo se PINTA de verdad (ni transparente ni fuera de escena)",
    out.opacidad > 0.9 && out.enEscena === true,
    JSON.stringify({ opacidad: out.opacidad, enEscena: out.enEscena })
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLa sospecha se lee del piso: el aro se llena antes de que te delaten"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
