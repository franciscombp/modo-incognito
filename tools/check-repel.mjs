/**
 * EL REPELENTE DEL PUESTO (boss.js → retreatFrom, game.js → _breakAllPursuits)
 * y LA SILLA OCUPADA (safeSpots con busyEvery en el kind "desk").
 *
 * Las dos reglas nuevas del refugio, y por qué se vigilan juntas:
 *
 *  1. Llegar a un lugar seguro ya no solo SUELTA la persecución: el jefe SE
 *     ALEJA — agarra hacia el waypoint de su ronda más lejos de ti, con unos
 *     segundos sin observar. Antes retomaba la ronda en el punto más cercano
 *     y se quedaba merodeando al lado: soltarte y quedarse a dos mesas no se
 *     leía como estar a salvo. Si esto se rompe, no falla nada a la vista —
 *     solo vuelve el merodeo.
 *  2. TU PUESTO a veces está OCUPADO (alguien se sentó en tu silla): un
 *     lugar seguro con busyLeft no cubre, ni siquiera el escritorio propio,
 *     y toca buscar plan B. Es lo que convierte "correr a mi sitio" en una
 *     decisión y no en un botón de ganar.
 *
 * Uso: npm run check:repel   (necesita `npm run preview` en :4173)
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
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });

const res = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const css = document.createElement("style");
  css.textContent = ".vn-layer, .inc-dialogue { display: none !important; }";
  document.head.appendChild(css);
  g.setPaused(false);
  g.clearGate();
  g.minions.forEach((m) => m.setActive(false));
  // La correa del día 1 fuera: aquí se mide la retirada, y la correa lo
  // volvería a acercar por diseño.
  g.boss.setTether(null);
  // La ocupación congelada para la fase 1: la silla ocupada se prueba aparte
  // (fase 2), no por azar a mitad de la retirada.
  g.safeSpotState.forEach((st) => {
    st.nextBusy = Infinity;
    st.busyLeft = 0;
  });

  const out = {};

  // ── 1 · Persecución comprometida + lugar seguro = el jefe SE VA ──
  const sala = window.__floorplan.safeSpots.find((s) => s.kind === "meeting");
  if (!sala) return { error: "no hay sala segura en el plano" };
  // El jefe encima, cazando de verdad. La sospecha POR DEBAJO del nivel 3:
  // a 80 saltaba la alarma general, que PAUSA la partida (MOTOR.md §8, la
  // trampa clásica) y dejó este montaje entero midiendo un mundo congelado.
  g.suspicion = 45;
  g.boss.suspicion = 45;
  g.boss.lockedOn = true;
  // El jefe arranca en el waypoint de su ronda MÁS CERCANO a la sala: un
  // punto transitable seguro. Plantarlo a un offset a mano lo dejaba
  // EMPOTRADO en un mueble — no caminaba, `_updateStuck` le rotaba la ronda
  // cada 1.4 s, y la retirada parecía rota siendo el montaje.
  const cerca = [...g.boss.route].sort(
    (a, b) => Math.hypot(a.x - sala.x, a.z - sala.z) - Math.hypot(b.x - sala.x, b.z - sala.z),
  )[0];
  g.boss.position.x = cerca.x;
  g.boss.position.z = cerca.z;
  g.player.position.x = sala.x;
  g.player.position.z = sala.z;
  await sleep(350);
  out.solto = g.boss.lockedOn === false;
  out.gracia = g.boss.inGrace === true;
  // El waypoint elegido es el MÁS LEJOS de la jugadora de toda su ronda.
  const dists = g.boss.route.map((w) => Math.hypot(w.x - g.player.position.x, w.z - g.player.position.z));
  out.waypointLejano = dists[g.boss.routeIndex] >= Math.max(...dists) - 0.001;
  const d0 = Math.hypot(g.boss.position.x - g.player.position.x, g.boss.position.z - g.player.position.z);
  const way = g.boss.route[g.boss.routeIndex];
  const w0 = Math.hypot(g.boss.position.x - way.x, g.boss.position.z - way.z);
  // La sospecha en frío para que ni piense en volver mientras medimos — y
  // reanudando DENTRO del bucle, que `_heatAlertShown` se rearma sola. La
  // ventana es LARGA a propósito: el camino navegable hacia el waypoint
  // lejano puede pasar primero por el pasillo de al lado (acercándose un
  // momento) antes de abrirse — lo que se mide es a dónde LLEGA, no el
  // primer metro.
  let dMax = d0;
  for (let i = 0; i < 45; i++) {
    g.setPaused(false);
    g.suspicion = 0;
    g.boss.suspicion = 0;
    g.player.position.x = sala.x;
    g.player.position.z = sala.z;
    await sleep(100);
    dMax = Math.max(
      dMax,
      Math.hypot(g.boss.position.x - g.player.position.x, g.boss.position.z - g.player.position.z),
    );
  }
  const w1 = Math.hypot(g.boss.position.x - way.x, g.boss.position.z - way.z);
  out.seAleja = dMax > d0 + 2;
  out.haciaElWaypoint = w1 < w0 - 1;
  out.dists = { d0: +d0.toFixed(1), dMax: +dMax.toFixed(1), w0: +w0.toFixed(1), w1: +w1.toFixed(1) };

  // ── 2 · La silla ocupada NO cubre, ni siendo tuya ──
  const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  if (!desk) return { ...out, error: "no hay puesto propio en el plano" };
  const di = window.__floorplan.safeSpots.indexOf(desk);
  g.setPaused(false);
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.position.x = desk.x;
  g.player.position.z = desk.z;
  // FINGIR DE VERDAD: `isPretending` lo recalcula el motor desde las teclas
  // en cada cuadro — escribirlo a mano dura exactamente un update. Se finge
  // como la jugadora: manteniendo ESPACIO en el sitio.
  g.player.keys.add(" ");
  await sleep(300);
  out.libreCubre = g.inSafeSpot === true;
  // Alguien se sienta en tu silla…
  g.safeSpotState[di].busyLeft = 30;
  await sleep(250);
  out.ocupadaNoCubre = g.inSafeSpot === false;
  // …y la guía de refugio manda a OTRO sitio, no al ocupado.
  const refugio = g._nearestUsableSafeSpot(g.player.position);
  out.planB = !!refugio && Math.hypot(refugio.x - desk.x, refugio.z - desk.z) > 0.5;
  g.player.keys.delete(" ");
  return out;
});

assert("el lugar seguro corta el lockedOn", res.solto === true, JSON.stringify(res));
assert("y el jefe queda en gracia (sin observar)", res.gracia === true, JSON.stringify(res));
assert("agarra hacia el waypoint más lejos de ti", res.waypointLejano === true, JSON.stringify(res));
assert("y camina HACIA él", res.haciaElWaypoint === true, JSON.stringify(res.dists));
assert("alejándose de ti por el camino", res.seAleja === true, JSON.stringify(res.dists));
assert("tu puesto libre te cubre fingiendo", res.libreCubre === true, JSON.stringify(res));
assert("ocupado, NO te cubre — ni siendo tuyo", res.ocupadaNoCubre === true, JSON.stringify(res));
assert("y la guía de refugio manda al plan B", res.planB === true, JSON.stringify(res));
assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLlegar a tu sitio ahuyenta al jefe — salvo que alguien se te haya sentado"
    : `\n${fallos} fallo(s) en el refugio`,
);
process.exit(fallos === 0 ? 0 : 1);
