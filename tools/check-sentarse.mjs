/**
 * SENTARTE LOS DESPACHA.
 *
 * ── Por qué ──
 *
 * Llegar a un lugar seguro tenía media escena escrita: el JEFE se alejaba
 * (`retreatFrom`, y su toast «A salvo: Gabo se aleja»), pero el secuaz que
 * te venía siguiendo se quedaba plantado a un palmo mirándote fingir. La
 * causa es de fontanería y por eso no cantaba: un secuaz nunca persigue
 * —`catches()` es false para él, invariante—, así que vive en INVESTIGATE y
 * no en CHASE, y `breakPursuit()` solo mira CHASE, SEARCH y `lockedOn`.
 * Enfriarle el halo tampoco le movía los pies: mientras su `localHeat`
 * siguiera sobre su umbral, el propio INVESTIGATE le volvía a apuntar el
 * objetivo a tu posición en el cuadro siguiente.
 *
 * O sea que la mitad de la escena decía «a salvo» y la otra mitad decía lo
 * contrario, que es lo que se ve al jugar.
 *
 * Esto mide LO QUE SE VE: que el secuaz SE ALEJA de verdad. Bajarle un
 * número no es irse.
 *
 * Uso: npm run check:sentarse   (necesita `npm run preview` en :4173)
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
  g.setPaused(false);
  g.clearGate();
  const m = g.minions[0];
  if (!m) return { error: "no hay secuaces" };
  // Uno solo, y el jefe lejos: lo que se mide es el secuaz.
  for (const otro of g.minions) if (otro !== m) otro.setActive(false);
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 80;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  // LA BIENVENIDA DE CRISPO, YA VISTA. Llegar por primera vez a tu puesto
  // manda a un secuaz a presentarse (`_updateBienvenida` → `distract`, 20 s
  // hacia ti), y eso pisa la retirada en el mismo cuadro — como debe ser:
  // una escena escrita gana a la regla de ambiente. Pero aquí se mide la
  // regla, así que la escena se da por vivida. Sin esto la prueba medía a
  // Crispo viniendo a saludar y lo contaba como «no se va».
  g.saltarEscolta();

  // En CUADROS, no en milisegundos: una prueba de IA medida con `sleep`
  // mide la máquina (ver la nota de check:chase en CLAUDE.md).
  const correr = (n) => {
    for (let i = 0; i < n; i++) {
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
  };

  // ── 1 · FUERA de un lugar seguro, siguiéndote: no te suelta ──
  // El caso de control. Sin esto, un secuaz que nunca sigue a nadie pasaría
  // la prueba de abajo con matrícula.
  const sitio = (window.__floorplan.safeSpots ?? []).find((s) => s.kind === "desk") ?? null;
  if (!sitio) return { error: "el piso no tiene ningún puesto de trabajo" };
  // Lejos de su puesto: aquí no está a salvo.
  g.player.position.x = sitio.x + 30;
  g.player.position.z = sitio.z + 30;
  m.position.x = g.player.position.x + 1.5;
  m.position.z = g.player.position.z;
  m.localHeat = 1;
  correr(60);
  const fuera = {
    dist: +Math.hypot(m.position.x - g.player.position.x, m.position.z - g.player.position.z).toFixed(2),
    calor: +m.localHeat.toFixed(2),
    umbral: m.followThreshold,
  };

  // ── 2 · Y AHORA TE SIENTAS: pierde el interés y se VA ──
  g.player.position.x = sitio.x;
  g.player.position.z = sitio.z;
  m.position.x = sitio.x + 1.5;
  m.position.z = sitio.z;
  m.localHeat = 1;
  // Fingir es lo que hace que un puesto cubra (`kind: "desk"` no cubre por
  // el mero hecho de estar encima), así que se mantiene la tecla.
  g.player.keys.add(" ");
  const d0 = Math.hypot(m.position.x - sitio.x, m.position.z - sitio.z);
  correr(10);
  const seguro = g.inSafeSpot;
  const calorTrasSoltar = m.localHeat;
  correr(170); // ~3 s para que la retirada se ANDE, no solo se ordene
  const d1 = Math.hypot(m.position.x - sitio.x, m.position.z - sitio.z);
  g.player.keys.delete(" ");

  return {
    fuera,
    seguro,
    // Por debajo de su umbral: es lo que le quita el «te sigo» de encima.
    calorTrasSoltar: +calorTrasSoltar.toFixed(2),
    umbral: m.followThreshold,
    d0: +d0.toFixed(2),
    d1: +d1.toFixed(2),
    alejado: +(d1 - d0).toFixed(2),
  };
});

if (out.error) {
  console.log(`FAIL  montaje — ${out.error}`);
  await b.close();
  process.exit(1);
}

check(
  "de control: fuera de un sitio seguro, el secuaz SÍ se te queda encima",
  out.fuera.dist <= 4 && out.fuera.calor >= out.fuera.umbral,
  JSON.stringify(out.fuera)
);
check("sentarte en tu puesto es estar a salvo", out.seguro === true, JSON.stringify(out));
check(
  "y ahí el secuaz baja de su umbral: deja de seguirte",
  out.calorTrasSoltar < out.umbral,
  `${out.calorTrasSoltar} vs umbral ${out.umbral}`
);
// LO QUE SE VE. Un número que baja no es una escena; que se vaya, sí.
check(
  "pero sobre todo SE VA: se aleja de verdad, no solo se enfría",
  out.alejado >= 2,
  JSON.stringify(out)
);
check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nTe sientas y te dejan en paz: el jefe se aleja y el secuaz también"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
