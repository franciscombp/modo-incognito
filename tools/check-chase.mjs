// Behavioural check for the boss AI: he must spot the player slacking off,
// break off his patrol to chase her, close the distance, lose her when she
// hides, and be pullable off-route by a distraction.
//
// Usage: node tools/check-chase.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

// The title menu is up on boot; start day 1 before poking at the AI.
// Note the braces: startDay's promise only settles once the intro dialogue
// is dismissed, and returning it here would hang the test forever.
await page.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 10000 });

const log = await page.evaluate(async () => {
  const { boss, player, engine, world } = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  // The intro scene freezes the level; drop straight into play for the test.
  const game = engine.game;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");
  // This test is about the boss AI once the day is in progress, not about
  // the day-1 gate (find Gabo before he starts actually watching you) — so
  // clear it directly instead of walking up to him first.
  // `clearGate` y no `metGabo = true` a pelo: la bandera sola abre el piso
  // pero deja la lista de tareas VACIA, porque quien suelta el plan del dia
  // es la campana al enterarse de que la mision de la puerta cayo.
  game.clearGate();
  // This test is about the boss, not the sidekicks: an on-duty minion could
  // walk up and start an unsolicited chat, which pauses the level and would
  // otherwise stall every assertion below on a dialogue nobody answers.
  game.minions.forEach((m) => m.setActive(false));

  // A clear stretch of the front corridor, boss looking east at the player.
  const S = window.__floorplan.WORLD_SCALE;
  const bx = 0 * S;
  const px = 3.4 * S;
  const z = 10.8 * S;
  out.sightLineClear = !world.lineBlocked({ x: bx, z }, { x: px, z }, []);

  player.position.x = px;
  player.position.z = z;
  player.isHiding = false;
  boss.position.x = bx;
  boss.position.z = z;
  boss.route = [{ x: bx, z }]; // pin the route so he holds position until he sees her
  boss.routeIndex = 0;
  boss.facingDir = { x: 1, z: 0 };
  boss.state = "PATROL";

  // El jefe ya NO persigue con la sospecha baja: por debajo de
  // `chaseSuspicionFloor` (40 por defecto) hace su ronda aunque te vea en
  // falta. Este montaje comprobaba la persecucion con la sospecha a cero, o
  // sea el caso en el que ahora, a proposito, NO debe perseguir. Se sube por
  // encima del umbral para probar lo que este archivo quiere probar; el
  // respiro de sospecha baja tiene su propia comprobacion al final.
  // Hay que ponerla en las DOS: el jefe lleva su propia copia, que game.js
  // sincroniza una vez por cuadro. Poniendo solo la del juego, el primer
  // frame lo pilla todavia a cero y arranca la caza un pelo tarde — lo justo
  // para que "cierra distancia" se quedara en 0.24 contra los 0.3 que pide.
  game.suspicion = Math.max(game.suspicion, boss.chaseSuspicionFloor + 15);
  boss.suspicion = game.suspicion;

  // Put a forbidden activity right where she is standing.
  // Tiene que ser una ESTACIÓN de verdad, no cualquier objetivo: desde que
  // la campaña reparte las tareas, la lista mezcla estaciones del plano con
  // misiones sin sitio fijo (`dynamic`) — hablar con alguien, o el tutorial
  // de fingir. Esas no se hacen pulsando espacio encima, así que coger la
  // primera a ciegas dejaba al jefe sin nada que reprocharle y toda la
  // prueba caía por el motivo equivocado.
  const station = game.objectives.find((o) => !o.dynamic) ?? game.objectives[0];
  station.x = px;
  station.z = z;
  station.done = false;
  // EL BUCLE v2 movió la exposición: ACTIVAR congela el mundo (el jefe ni
  // te ve mientras juegas el minijuego), así que la fase que el jefe puede
  // pillar es el AGUANTE — la actividad ya encendida, sostenida a la vista
  // con el piso vivo. Se planta encendida, con su objeto concedido si lo
  // pide: aquí se prueba la caza, no la búsqueda del objeto (check-objetos).
  if (station.objeto) game.inventario.add(station.objeto.id);
  station.progress = station.time;
  station.encendida = true;
  station.aguante = 0;
  player.keys.add(" "); // la tecla de acción es espacio, no "e"

  await sleep(350);
  out.seesPlayer = boss.playerVisible;
  out.redAlert = boss.redAlert;
  out.stateAfterSpotted = boss.state;

  // Blindar la medicion contra la CAPTURA. Si el jefe la alcanza a mitad de
  // la ventana, la amonestacion resetea la sospecha a CERO — y en frio ya no
  // persigue (regla del respiro), asi que se para en seco y la distancia
  // recorrida sale corta. Eso es lo que hacia que esta prueba saliera cara o
  // cruz entre 0.24 y 0.36 contra un umbral de 0.3. Aqui se mide que SE
  // ACERCA; que alcanzarte amonesta lo prueban check-catch-mechanics y
  // check-pursuit.
  game._caughtCooldown = 999;
  const d0 = Math.hypot(boss.position.x - player.position.x, boss.position.z - player.position.z);
  const s0 = game.suspicion;
  // Sample the meter early: give the chase a full second and he reaches her,
  // which resets suspicion to zero as a warning and hides the rise.
  await sleep(250);
  out.suspicionRose = game.suspicion > s0;
  // Ventana ANCHA a proposito. Con 450 ms el jefe recorria entre 0.24 y 0.36
  // contra un umbral de 0.3, o sea que la prueba salia cara o cruz segun lo
  // cargada que estuviera la maquina — y un test que falla una de cada tres
  // veces sin que haya nada roto es peor que no tenerlo: ensena a ignorarlo.
  // Al doblar la ventana, la distancia recorrida se separa del umbral.
  await sleep(900);
  const d1 = Math.hypot(boss.position.x - player.position.x, boss.position.z - player.position.z);
  out.closedDistance = +(d0 - d1).toFixed(2);

  // Fingir A CAMPO ABIERTO ya no rompe nada: desde que te mete en el halo
  // la persecución va comprometida y SOLO un lugar seguro la corta (regla de
  // check-pursuit.mjs; check-modes.mjs cubre el lado de fingir). Aquí se
  // comprueba lo contrario de antes: que la alerta roja SIGUE puesta aunque
  // pulses F en medio del pasillo.
  player.keys.add("f");
  await sleep(200);
  out.redAlertWhilePretending = boss.redAlert;
  player.keys.delete("f");
  player.keys.delete(" ");

  // Perderla de vista ya NO termina la persecución: desde que la mete en el
  // halo va comprometido (boss.lockedOn) y solo un lugar seguro lo corta —
  // ver tools/check-pursuit.mjs, que cubre esa regla entera. Aquí solo se
  // comprueba que teletransportarla lejos no le hace desistir por su cuenta.
  // `isHiding` se recalcula cada frame desde los escondites, así que el test
  // la aleja en vez de tocar la bandera.
  player.position.x = px + 40 * S;
  // Generous: headless throttles frames, and the boss only accumulates
  // "lost sight" time on frames that actually run. A single long sleep(3000)
  // measurably starves requestAnimationFrame in headless Chromium (fewer
  // frames actually execute than with the same total wait chunked into
  // several shorter sleeps), so this polls instead of waiting once.
  for (let i = 0; i < 15; i++) await sleep(200);
  out.stateWhenHidden = boss.state;
  out.lockedWhenHidden = boss.lockedOn;
  out.gameOverWhenHidden = game.gameOver;
  out.loseSightTimer = +boss.loseSightTimer.toFixed(2);
  out.warningsSoFar = game.warnings;

  // A distraction pulls him off patrol.
  player.isHiding = false;
  boss.resetToPatrol();
  await sleep(80);
  const spot = window.__floorplan.distractions[0];
  out.distractAccepted = boss.distract({ x: spot.x, z: spot.z }, 5);
  await sleep(150);
  out.stateAfterDistract = boss.state;

  // ── EL RESPIRO: con la sospecha baja hace su ronda, no te caza ──
  // Es la regla que hace jugable el dia 1. Sin ella el jefe se lanzaba a la
  // primera alerta roja desde el primer minuto y, con Gabo ademas atado a la
  // jugadora, no dejaba hacer nada.
  boss.resetToPatrol();
  boss.lockedOn = false;          // sin compromiso previo: el umbral manda
  game.suspicion = 5;             // muy por debajo del suelo de persecucion
  boss.suspicion = 5;
  boss.redAlert = true;           // le pillan en falta, a la vista
  boss.startChase();              // la puerta unica por la que entra una caza
  out.calmState = boss.state;
  out.calmLocked = boss.lockedOn;
  // Ni CHASE ni comprometido: como mucho se acerca a mirar (INVESTIGATE).
  out.calmNoChase = boss.state !== "CHASE" && boss.lockedOn === false;

  // Y por encima del umbral la caza vuelve a estar disponible, para que esto
  // no pase por "el jefe ya no persigue nunca".
  game.suspicion = boss.chaseSuspicionFloor + 20;
  boss.suspicion = boss.chaseSuspicionFloor + 20;
  boss.startChase();
  out.hotChases = boss.state === "CHASE" && boss.lockedOn === true;

  return out;
});

console.log(JSON.stringify(log, null, 1));

const checks = [
  ["line of sight is clear for the test setup", log.sightLineClear],
  ["boss sees the player", log.seesPlayer],
  ["red alert on a forbidden activity", log.redAlert],
  ["boss switches to CHASE", log.stateAfterSpotted === "CHASE"],
  // Umbral FLOJO a proposito. La ventana es de reloj real pero el juego
  // avanza por frames, y en headless con swiftshader el frame rate varia
  // mucho: la misma prueba daba 0.24 o 0.36 segun cuantos frames cupieran,
  // valores cuantizados que delatan que se estaba midiendo la maquina, no la
  // IA. Con 0.3 salia cara o cruz. Lo que esta prueba tiene que cazar es que
  // el jefe NO se acerque —que se quede plantado o se aleje—, y para eso
  // basta con exigir que la distancia baje de verdad.
  ["boss closes the distance", log.closedDistance > 0.1],
  ["suspicion rises while seen", log.suspicionRose],
  ["fingir a campo abierto NO rompe la alerta (solo el lugar seguro)", log.redAlertWhilePretending === true],
  ["losing sight no longer ends a committed chase", log.stateWhenHidden === "CHASE" && log.lockedWhenHidden],
  ["distraction is accepted", log.distractAccepted === true],
  ["con la sospecha baja NO persigue: sigue su ronda", log.calmNoChase === true],
  ["y por encima del umbral si persigue", log.hotChases === true],
  ["distraction switches to INVESTIGATE", log.stateAfterDistract === "INVESTIGATE"],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
if (errors.length) {
  console.log("page errors:");
  errors.forEach((e) => console.log("  " + e));
}

await browser.close();
process.exit(failed || errors.length ? 1 : 0);
