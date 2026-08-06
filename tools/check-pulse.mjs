/**
 * EL PULSO DE LA ACTIVIDAD (docs/CAMPANA.md §8, src/game/activityGame.js).
 *
 * Lo que hay que proteger aquí no es que el minijuego "funcione": es que NO
 * ROMPA EL BUCLE. Un minijuego de tarea que pausa el mundo convertiría las
 * estaciones en el sitio más seguro del piso, que es lo contrario de lo que
 * son. Así que la primera comprobación —y la que de verdad importa— es que
 * el jefe SIGUE MOVIÉNDOSE mientras se juega.
 *
 * Y la segunda: que mantener pulsado sigue terminando la tarea sin tocar el
 * pulso. Si el pulso fuera obligatorio, alguien se quedaría encallado en la
 * primera tarea del día 1 sin entender por qué.
 *
 * Uso: npm run check:pulse   (necesita `npm run preview` en :4173)
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

// Piso abierto y sin diálogos por medio.
await p.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = ".vn-layer, .inc-dialogue { display: none !important; }";
  document.head.appendChild(css);
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  g.minions.forEach((m) => m.setActive(false));
});
await p.waitForTimeout(600);

// ── 1 · El pulso arranca al ponerse a hacer una actividad ──
const arranque = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = g.objectives.find((o) => !o.dynamic);
  if (!st) return { error: "el día no trae ninguna estación" };
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  await sleep(400);
  return {
    activo: g.pulse.active,
    pintado: !!document.querySelector(".inc-pulse.on"),
    estacion: st.id,
  };
});
assert("el pulso arranca al empezar la actividad", arranque.activo === true, JSON.stringify(arranque));
assert("y el HUD lo pinta", arranque.pintado === true, JSON.stringify(arranque));

// ── 2 · LA REGLA QUE NO SE ROMPE: el mundo no se pausa ──
const vivo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // El jefe, lejos y con ruta libre, para que tenga a dónde ir.
  g.suspicion = Math.max(g.suspicion, g.boss.chaseSuspicionFloor + 15);
  g.boss.suspicion = g.suspicion;
  const antes = { x: g.boss.position.x, z: g.boss.position.z };
  const marcaAntes = g.pulse.snapshot()?.pos ?? null;
  await sleep(900);
  const dsp = { x: g.boss.position.x, z: g.boss.position.z };
  return {
    pausado: g.paused,
    jefeSeMovio: Math.hypot(dsp.x - antes.x, dsp.z - antes.z) > 0.01,
    marcaSeMueve: (g.pulse.snapshot()?.pos ?? null) !== marcaAntes,
    relojCorre: g.timeLeft,
  };
});
assert("el mundo NO se pausa durante el pulso", vivo.pausado === false, JSON.stringify(vivo));
assert("el jefe sigue caminando mientras juegas", vivo.jefeSeMovio === true, JSON.stringify(vivo));
assert("el marcador del pulso se mueve", vivo.marcaSeMueve === true, JSON.stringify(vivo));

// ── 3 · Un fallo hace RUIDO (sube la sospecha), un acierto avanza ──
// Hay que ESPERAR AL MOMENTO de cada caso en vez de golpear a ciegas: la
// primera versión daba a ciegas cada 60 ms, encadenaba tres aciertos, la
// tarea se completaba y el pulso se apagaba antes de haber fallado una sola
// vez. O sea que "el fallo no hace ruido" era, en realidad, "no llegó a
// fallar nunca".
const golpes = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = () => g.pulse.snapshot();
  const dentro = (s) => Math.abs(s.pos - s.zonaAt) <= s.zona / 2;

  /** Espera a que el marcador esté dentro (o fuera) y devuelve ahí mismo. */
  async function esperar(queEsteDentro) {
    for (let i = 0; i < 200; i++) {
      const s = snap();
      if (!s) return null;
      if (dentro(s) === queEsteDentro) return s;
      await sleep(16);
    }
    return null;
  }

  const st = g.pulse.station;
  const out = {};

  // (a) ACIERTO: dentro de la zona, el progreso sube.
  st.progress = 0;
  st.done = false;
  if (await esperar(true)) {
    const antes = st.progress;
    out.r1 = g.pulse.hit();
    out.avance = st.progress > antes;
  }

  // (b) FALLO: fuera de la zona, sube la SOSPECHA. Se deja progreso de sobra
  // para que restar no lo mande a cero y la tarea no se complete por el
  // camino, que es lo que apagaba el pulso a media prueba.
  st.progress = st.time * 0.5;
  st.done = false;
  if (await esperar(false)) {
    const antesS = g.suspicion;
    const antesP = st.progress;
    out.r2 = g.pulse.hit();
    out.ruido = g.suspicion > antesS;
    out.restaProgreso = st.progress < antesP;
  }
  return out;
});
assert("un acierto empuja el progreso de la tarea", golpes.avance === true, JSON.stringify(golpes));
assert("un fallo hace RUIDO: sube la sospecha", golpes.ruido === true, JSON.stringify(golpes));
assert("y un fallo resta progreso", golpes.restaProgreso === true, JSON.stringify(golpes));

// ── 4 · El SUELO: manteniendo pulsado, sin tocar el pulso, se termina ──
// Antes hay que ENFRIAR. La prueba anterior falla el pulso a propósito, y cada
// fallo hace ruido: la sospecha sube hasta el nivel de búsqueda 3, que PAUSA
// la partida desde game.js con su aviso a pantalla completa (MOTOR.md §8).
// En pausa `update()` sale antes de tocar nada y la tarea no avanza nunca —
// la primera vez esto pareció que el suelo estaba roto, y lo que estaba era
// el montaje.
const suelo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 40;
  g.setPaused(false);
  await sleep(200);
  const st = g.objectives.find((o) => !o.dynamic && !o.done) ?? g.objectives.find((o) => !o.dynamic);
  st.done = false;
  st.progress = 0;
  g.player.keys.delete(" ");
  await sleep(120);
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  // Nunca se llama a hit(): solo se mantiene. Debe completarse igual.
  for (let i = 0; i < 90 && !st.done; i++) {
    // Se reanuda dentro del bucle: `_heatAlertShown` se rearma sola y una
    // alerta a mitad de cuenta volvería a congelar la tarea.
    g.setPaused(false);
    g.suspicion = 0;
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    await sleep(100);
  }
  g.player.keys.delete(" ");
  return { hecha: st.done, id: st.id, progreso: +st.progress.toFixed(2), time: st.time };
});
assert(
  "manteniendo pulsado se termina la tarea SIN jugar al pulso",
  suelo.hecha === true,
  JSON.stringify(suelo),
);

// ── 5 · Al soltar, el pulso se apaga sin castigo ──
const apagado = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  await new Promise((r) => setTimeout(r, 300));
  return { activo: g.pulse.active, pintado: !!document.querySelector(".inc-pulse.on") };
});
assert("soltar apaga el pulso", apagado.activo === false, JSON.stringify(apagado));
assert("y el HUD lo esconde", apagado.pintado === false, JSON.stringify(apagado));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl pulso se juega sin pausar el mundo, y mantener pulsado sigue bastando"
    : `\n${fallos} fallo(s) en el pulso`,
);
process.exit(fallos === 0 ? 0 : 1);
