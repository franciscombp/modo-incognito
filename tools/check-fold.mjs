/**
 * EL REPLIEGUE DE LA LISTA DE MISIONES (docs/HUD.md §4bis.3).
 *
 * La idea: cuanto más aprieta el juego, menos hay que leer. Con el medidor
 * tranquilo la lista se ve entera; en alerta se queda en títulos; en
 * persecución, solo la tarea que sigues.
 *
 * No es un adorno — es la respuesta al único reparo serio que tenía meter una
 * lista de texto en pantalla: el principio que guio las medallas del piso fue
 * «no obligar a leer con el jefe detrás», y una lista de tres filas con
 * descripción es exactamente eso. El repliegue convierte ese problema en
 * parte del bucle de tensión.
 *
 * Por eso se comprueba: si un día alguien «arregla» el HUD y la lista deja de
 * replegarse, no se rompe nada visible y nadie se entera, pero el HUD vuelve
 * a pelearse con el momento en que más importa ver el piso.
 *
 * Uso: npm run check:fold   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });
await p.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = ".vn-layer, .inc-dialogue { display: none !important; }";
  document.head.appendChild(css);
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();
  g.minions.forEach((m) => m.setActive(false));
});
await p.waitForTimeout(900);

/** Lee lo que de verdad se VE, no las clases: es lo que importa. */
async function leer() {
  return p.evaluate(() => {
    const filas = [...document.querySelectorAll(".inc-quest")];
    const visibles = (sel) =>
      filas.filter((f) => {
        const e = f.querySelector(sel);
        return e && getComputedStyle(e).display !== "none";
      }).length;
    return {
      filas: filas.length,
      conBarra: visibles(".inc-quest-bar"),
      conDistancia: visibles(".inc-quest-dist"),
      filasVisibles: filas.filter((f) => Number(getComputedStyle(f).opacity) > 0.05).length,
    };
  });
}

// ── 1 · En calma, la lista se ve ENTERA ──
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
});
await p.waitForTimeout(500);
const calma = await leer();
assert("en calma hay misiones en la lista", calma.filas > 0, JSON.stringify(calma));
assert("en calma se ven las distancias", calma.conDistancia === calma.filas, JSON.stringify(calma));

// ── 2 · En ALERTA se repliega a títulos ──
await p.evaluate(async () => {
  const g = window.__game.engine.game;
  // El nivel de búsqueda 1 basta; se evita el 3, que pausa la partida.
  g.suspicion = g.suspicionConfig.max * 0.45;
  g.boss.suspicion = g.suspicion;
  await new Promise((r) => setTimeout(r, 400));
});
await p.waitForTimeout(500);
const alerta = await leer();
assert(
  "en alerta desaparecen barras y distancias (quedan los títulos)",
  alerta.conDistancia === 0 && alerta.conBarra === 0,
  JSON.stringify(alerta),
);
assert("pero las filas siguen ahí", alerta.filas === calma.filas, JSON.stringify(alerta));

// ── 3 · En PERSECUCIÓN, solo la seguida ──
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.suspicion = g.boss.chaseSuspicionFloor + 20;
  g.boss.suspicion = g.suspicion;
  g.boss.redAlert = true;
  g.boss.startChase();
});
// Se ESPERA a que se asiente en vez de dormir un rato fijo: el repliegue va
// por transición de opacidad, y una espera a ojo mide a mitad del fundido y
// dice que no se replegó. Con 600 ms daba falso negativo aunque el mecanismo
// estuviera perfecto.
const medir = () =>
  p.evaluate(() => {
    const filas = [...document.querySelectorAll(".inc-quest")];
    return {
      estado: window.__game.boss.state,
      filas: filas.length,
      visibles: filas.filter((f) => Number(getComputedStyle(f).opacity) > 0.05).length,
    };
  });
let caza = await medir();
for (let i = 0; i < 25 && caza.visibles > 1; i++) {
  await p.waitForTimeout(100);
  caza = await medir();
}
assert("el jefe entra en persecución para la prueba", caza.estado === "CHASE", JSON.stringify(caza));
assert(
  "en persecución solo queda visible la misión seguida",
  caza.filas > 1 ? caza.visibles === 1 : caza.visibles <= 1,
  JSON.stringify(caza),
);

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nCuanto más aprieta el juego, menos hay que leer"
    : `\n${fallos} fallo(s) en el repliegue`,
);
process.exit(fallos === 0 ? 0 : 1);
