/**
 * ¿SE VE UN MINIJUEGO PRONTO? (la queja «no veo los minijuegos»)
 *
 * El bucle v2 puso una puerta delante de cada actividad: primero hay que
 * CONSEGUIR su objeto. Bien de diseño… salvo que en la temporada 1 las tres
 * actividades iniciales (café, peli, snack) pedían objeto, y la única
 * misión sin puerta —«finge que trabajas»— no tiene minijuego. Resultado:
 * para ver tu PRIMER pulso había que encontrar al Parce, hablarle y volver,
 * con una jornada de cuatro minutos y el jefe encima. En la práctica, casi
 * nadie llegaba, y el juego parecía no tener minijuegos.
 *
 * Esto lo vigila con una regla dura: entre lo que puedes hacer NADA MÁS
 * empezar tiene que haber al menos una actividad SIN objeto y CON minijuego
 * — y se comprueba jugándola de verdad hasta que la tira aparece en
 * pantalla, no leyendo el JSON.
 *
 * Uso: npm run check:minijuego   (necesita `npm run preview` en :4173)
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

// `domcontentloaded`, no `networkidle`: con los cuerpos .glb cargándose,
// la red no llega a quedarse quieta y el check se cuelga esperando algo
// que nunca pasa. Es el mismo criterio que usa check-energia.
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
// Cuerpo de BLOQUE a propósito: con cuerpo de expresión se devuelve la
// promesa de startDay, que no resuelve hasta que alguien pase el diálogo de
// apertura — y el check se cuelga sin decir por qué.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });

// Pasar el diálogo de apertura, o la puerta del día no se supera.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

// ── 1 · Nada más superar la puerta del día, ¿hay algo jugable sin recados? ──
const arranque = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  const libres = g.objectives.filter((o) => !o.done && !o.dynamic && !o.objeto);
  return {
    total: g.objectives.filter((o) => !o.done).length,
    // Sin objeto Y con minijuego (pulso o gesto): lo que se puede jugar ya.
    jugablesYa: libres.filter((o) => o.pulso || o.gesto).map((o) => o.id),
    conObjeto: g.objectives.filter((o) => !o.done && o.objeto).map((o) => o.id),
  };
});
check(
  "al empezar hay al menos UNA actividad sin recados y con minijuego",
  arranque.jugablesYa.length >= 1,
  JSON.stringify(arranque)
);

// ── 2 · Y se juega de verdad: la tira del pulso aparece EN PANTALLA ──
const jugada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = g.objectives.find((o) => !o.done && !o.dynamic && !o.objeto && (o.pulso || o.gesto));
  if (!st) return { error: "no hay actividad jugable sin objeto" };
  // El jefe lejos: aquí se mide que el minijuego SALE, no la persecución.
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 60;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 60; i++) {
    if (g.paused) g.setPaused(false);
    await sleep(30);
    if (g.pulse.active || g.gesture.active) break;
  }
  const tira = document.querySelector(".inc-pulse");
  const tarjeta = document.querySelector(".inc-action");
  return {
    id: st.id,
    label: st.label,
    activo: g.pulse.active || g.gesture.active,
    // Que esté "activo" por dentro no basta: tiene que PINTARSE.
    tiraVisible: !!tira?.classList.contains("on"),
    tarjetaVisible: !!tarjeta?.classList.contains("on"),
    mundoCongelado: g.worldFrozen,
  };
});
check(
  "esa actividad arranca su minijuego al mantener espacio",
  jugada.activo === true,
  JSON.stringify(jugada)
);
check(
  "y el minijuego SE PINTA (la tira o la tarjeta de acción)",
  jugada.tiraVisible === true || jugada.tarjetaVisible === true,
  JSON.stringify(jugada)
);
check("y congela el mundo mientras se juega", jugada.mundoCongelado === true, JSON.stringify(jugada));

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? `\nHay minijuego desde el primer minuto: «${jugada.label}»`
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
