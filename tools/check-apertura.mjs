/**
 * LA APERTURA DEL DÍA 1, de principio a fin.
 *
 * Gabo SENTADO en una sala (la primera misión deja de ser una persecución)
 * → le hablas → se levanta y te manda a tu puesto → llegas → Crispo se
 * acerca ANDANDO, se presenta y se va.
 *
 * Y las dos reglas de cuerpo que este trabajo vino a arreglar:
 *  · NADIE SE TELETRANSPORTA. Que te sienten en tu puesto tras un regaño es
 *    una CAMINATA, no un salto de posición: un cuerpo que parpadea de sitio
 *    deja de ser un cuerpo.
 *  · En un lugar seguro los HALOS RETROCEDEN. Cortar la persecución no
 *    bastaba: los conos seguían rojos encima de ti justo donde no pueden
 *    tocarte.
 *
 * Uso: npm run check:apertura   (necesita `npm run preview` en :4173)
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

// EL CUERPO DE LA JUGADORA NO LO MUEVE `game.update`: lo mueve
// `player.update`, que vive en el bucle de render de main.js. Sin avanzarlo
// aquí, un bucle sintético deja a la jugadora clavada y las pruebas de
// movimiento pasan EN VACÍO — que es justo lo que hacían. Se le da el mismo
// paso que al juego, igual que hace main.js.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  const orig = g.update.bind(g);
  g.update = (dt) => {
    // Y SE REANUDA EN CADA CUADRO. Un `update()` con la partida en pausa
    // vuelve sin hacer nada, así que un bucle sintético sin esto mide un
    // juego parado: «el jefe sentado no se mueve» pasaba EN VACÍO porque no
    // se movía nadie. La alarma de nivel 3 además se rearma sola, así que
    // hay que reanudar dentro del bucle y no una vez al principio.
    if (g.paused) g.setPaused(false);
    orig(dt);
    g.player.update(dt, window.__game.world);
  };
  g.onHeatAlert = null;
  g.setPaused(false);
});

// ── 1 · Gabo arranca SENTADO, y en la sala que dice el nivel ──
const inicio = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const sala = g.gate?.sentadoEn;
  const sp = window.__floorplan.safeSpots.find((s) => s.id === sala);
  // Se le dejan correr cuadros: sentado NO debe andar ni un palmo.
  const x0 = g.boss.position.x;
  const z0 = g.boss.position.z;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  return {
    sala,
    sentado: g.boss.seated === true,
    quieto: Math.hypot(g.boss.position.x - x0, g.boss.position.z - z0) < 0.01,
    enLaSala: sp
      ? Math.hypot(g.boss.position.x - sp.x, g.boss.position.z - sp.z) < (sp.radius ?? 2 * S) * 2
      : false,
  };
});
check("Gabo empieza SENTADO, no patrullando", inicio.sentado === true, JSON.stringify(inicio));
check("y sentado no se mueve del sitio", inicio.quieto === true, JSON.stringify(inicio));
check("en la sala que dice el nivel", inicio.enLaSala === true, JSON.stringify(inicio));

// ── 2 · Hablarle lo levanta y te manda a tu puesto ──
const trasHablar = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.clearGate();
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  return { sentado: g.boss.seated === true, esperandoPuesto: g._esperandoPuesto === true };
});
check(
  "hablarle lo LEVANTA de la reunión",
  trasHablar.sentado === false,
  JSON.stringify(trasHablar)
);
check(
  "y te manda a tu puesto",
  trasHablar.esperandoPuesto === true,
  JSON.stringify(trasHablar)
);

// ── 3 · Llegar al puesto manda a Crispo, ANDANDO ──
const bienvenida = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  g.player.position.x = desk.x;
  g.player.position.z = desk.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 10; i++) g.update(1 / 60);
  const crispo = g.minions.find((m) => m.id === "crispo") ?? g.minions[0];
  const x0 = crispo.position.x;
  const z0 = crispo.position.z;
  const mandado = !!g._presentador;
  for (let i = 0; i < 240; i++) g.update(1 / 60);
  return {
    mandado,
    // ANDANDO: se comprueba que RECORRIÓ camino, no que apareció al lado.
    caminó: Math.hypot(crispo.position.x - x0, crispo.position.z - z0) > 0.5,
    yaNoEspera: g._esperandoPuesto === false,
  };
});
check(
  "llegar a tu puesto manda a Crispo a presentarse",
  bienvenida.mandado === true,
  JSON.stringify(bienvenida)
);
check("y Crispo viene ANDANDO, no aparece", bienvenida.caminó === true, JSON.stringify(bienvenida));

// ── 4 · NADIE SE TELETRANSPORTA ──
const cuerpo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  // Lejos del puesto, y que la sienten: antes esto la plantaba allí de un
  // frame al siguiente.
  const lejos = window.__floorplan.patrolRoute[2];
  g.player.position.x = lejos.x;
  g.player.position.z = lejos.z;
  g.player.keys.clear();
  g._pretendToggle = false;
  const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  const d0 = Math.hypot(g.player.position.x - desk.x, g.player.position.z - desk.z);
  g.seatAtDesk();
  let saltoMax = 0;
  for (let i = 0; i < 600; i++) {
    const ax = g.player.position.x;
    const az = g.player.position.z;
    g.update(1 / 60);
    saltoMax = Math.max(saltoMax, Math.hypot(g.player.position.x - ax, g.player.position.z - az));
  }
  const d1 = Math.hypot(g.player.position.x - desk.x, g.player.position.z - desk.z);
  return {
    // Un paso de andar en un cuadro son ~0.07 unidades de plano. Se deja
    // margen de sobra: lo que se caza aquí es un SALTO, no un paso rápido.
    saltoMax: +(saltoMax / S).toFixed(3),
    seAcercó: d1 < d0 - 1 * S,
  };
});
check(
  "sentarte en tu puesto es una CAMINATA, no un teletransporte",
  cuerpo.saltoMax < 0.3,
  `salto máximo en un cuadro: ${cuerpo.saltoMax} unidades de plano`
);
check("y de verdad llega hasta allí", cuerpo.seAcercó === true, JSON.stringify(cuerpo));

// ── 5 · En un lugar seguro, los halos RETROCEDEN ──
const refugio = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const bano = window.__floorplan.safeSpots.find((s) => s.id.startsWith("banos"));
  g.suspicion = 90;
  g.boss.suspicion = 90;
  g.boss.startChase();
  for (const m of g.minions) {
    m.localHeat = 1;
    m.redAlert = true;
  }
  const calorAntes = g.minions.reduce((a, m) => a + m.localHeat, 0);
  g.player.position.x = bano.x;
  g.player.position.z = bano.z;
  for (let i = 0; i < 90; i++) {
    g.player.position.x = bano.x;
    g.player.position.z = bano.z;
    g.update(1 / 60);
  }
  return {
    calorAntes,
    calorDespues: g.minions.reduce((a, m) => a + m.localHeat, 0),
    rojos: g.minions.filter((m) => m.redAlert).length,
    cazando: g.boss.isHunting,
  };
});
check(
  "en un lugar seguro la vigilancia de todos RETROCEDE",
  refugio.calorDespues < refugio.calorAntes * 0.6,
  JSON.stringify(refugio)
);
check("y nadie se queda en rojo encima de ti", refugio.rojos === 0, JSON.stringify(refugio));
check("y la persecución se corta", refugio.cazando === false, JSON.stringify(refugio));

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLa apertura se cuenta sola, y nadie parpadea de sitio"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
