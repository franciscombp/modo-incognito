// Las reglas de "dónde puedes fingir que trabajas", que son el corazón del
// día: solo valen los LUGARES SEGUROS, y cada tipo funciona distinto.
//
//  · En mitad del pasillo o en la cafetería, mantener F no hace nada.
//  · Una SALA DE REUNIONES te cubre con solo estar dentro, pero se gasta y
//    cada tanto la ocupa gente de verdad.
//  · TU PUESTO no se gasta nunca, pero solo te cubre mientras finges: estar
//    ahí de brazos cruzados no cuenta.
//
// Uso: node tools/check-safespots.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.menus.close();
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 15000 });

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const game = window.__game.engine.game;
  const player = window.__game.player;
  const spots = window.__floorplan.safeSpots;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");
  game.minions.forEach((m) => m.setActive(false));
  // Este test es sobre lugares seguros, no sobre la puerta del día 1 — sin
  // esto la sospecha se queda fija en 0 (ver rules.gate) y el aviso rojo
  // nunca se dispara pase lo que se le fuerce a mano.
  // `clearGate` y no `metGabo = true` a pelo: la bandera sola abre el piso
  // pero deja la lista de tareas VACIA, porque quien suelta el plan del dia
  // es la campana al enterarse de que la mision de la puerta cayo.
  game.clearGate();
  // El jefe fuera de escena: aquí se mide la mecánica del sitio, no su IA.
  game.boss.setTether(null);
  game.boss._updateVision = () => {
    game.boss.playerVisible = false;
    game.boss.redAlert = false;
  };

  const meeting = spots.find((s) => s.kind === "meeting");
  const desk = spots.find((s) => s.kind === "desk");
  const res = { hasMeeting: !!meeting, hasDesk: !!desk };

  // Dos lugares seguros SOLAPADOS se anulan entre sí sin que se note: uno se
  // ocupa o se gasta y el otro te sigue cubriendo desde el mismo metro
  // cuadrado, así que la sala nunca deja de servir. Estuvo así con un
  // duplicado encima de la Sala 1, y desde fuera parecía que la mecánica de
  // "se gasta" no funcionaba.
  res.overlaps = [];
  res.duplicateIds = [];
  const seen = new Set();
  spots.forEach((a, i) => {
    if (seen.has(a.id)) res.duplicateIds.push(a.id);
    seen.add(a.id);
    spots.slice(i + 1).forEach((b) => {
      if (Math.hypot(a.x - b.x, a.z - b.z) < a.radius + b.radius) {
        res.overlaps.push(`${a.id} ∩ ${b.id}`);
      }
    });
  });

  /** Coloca a la jugadora, mantiene (o no) F, y devuelve qué pasa. */
  async function probe({ at, pretend, ms = 700 }) {
    player.keys.clear();
    player.position.x = at.x;
    player.position.z = at.z;
    if (pretend) player.keys.add(" "); // la tecla de fingir es espacio, no "f"
    game.suspicion = 50;
    await sleep(ms);
    return {
      pretending: player.isPretending,
      inSafeSpot: game.inSafeSpot,
      suspicion: game.suspicion,
    };
  }

  // Un punto claramente fuera de cualquier lugar seguro: la cafetería.
  const coffee = game.objectives.find((o) => o.id === "coffee");
  res.corridor = await probe({ at: coffee, pretend: true });
  res.meetingIdle = await probe({ at: meeting, pretend: false });
  res.meetingPretend = await probe({ at: meeting, pretend: true });
  res.deskIdle = await probe({ at: desk, pretend: false });
  res.deskPretend = await probe({ at: desk, pretend: true });

  // El aviso rojo: por encima del 90% la pantalla se tiñe, y es lo que te
  // manda a buscar una sala. Va aquí porque es la otra mitad de la misma
  // mecánica: sin el aviso, el jugador no sabe cuándo tiene que correr.
  player.keys.clear();
  game.suspicion = 0.95 * game.suspicionConfig.max;
  await sleep(400);
  res.dangerHigh = document.querySelector(".inc-hud-danger")?.classList.contains("on");
  game.suspicion = 0.2 * game.suspicionConfig.max;
  await sleep(400);
  res.dangerLow = document.querySelector(".inc-hud-danger")?.classList.contains("on");

  const mi = spots.indexOf(meeting);

  // Ocupada: llega gente a reunirse de verdad y deja de servir, aunque le
  // quede cupo. Se fuerza en vez de esperar a que toque sola.
  // LA ALARMA DE NIVEL 3 ACABA DE PAUSAR LA PARTIDA. El aviso rojo de arriba
  // se prueba al 95% de sospecha, y ese nivel dispara la alarma a pantalla
  // completa, que pausa DESDE game.js (la trampa nº1 de MOTOR.md §8). Este
  // test es ANTERIOR a la alarma y no lo sabía: todo lo de aquí abajo corría
  // contra un juego congelado — el cupo no se gastaba nunca (en pausa,
  // update() sale en seco) y «la sala deja de cubrirte» pasaba de chiripa,
  // con inSafeSpot helado en false de antes de la pausa. El FAIL histórico
  // «y su marcador lo refleja» era exactamente esto.
  game.suspicion = 0;
  game.setPaused(false);
  await sleep(150);

  game.safeSpotState[mi].busyLeft = 8;
  res.meetingBusy = await probe({ at: meeting, pretend: true });
  res.meetingBusyCharge = game.safeSpotCharge(mi);
  game.safeSpotState[mi].busyLeft = 0;

  // La sala se gasta: dentro el tiempo suficiente, deja de servir. Se apaga
  // la ocupación mientras tanto, o el cupo dejaría de bajar a ratos y esto
  // mediría dos cosas a la vez.
  game.safeSpotState[mi].nextBusy = Infinity;
  player.keys.clear();
  // Se avanza con game.update(dt) directo, no con sleep() + el bucle de
  // render real: en Chromium headless el framerate real puede ir muy por
  // debajo de 60 fps, y el dt de cada frame se recorta a 0.05s (ver
  // main.js), así que el reloj del juego avanza mucho más lento que el
  // reloj de pared — un sleep(500) no garantiza 0.5s de juego. Empujando el
  // dt a mano el gasto es determinista y no depende de cuántos frames de
  // verdad pintó el navegador.
  // Se la ancla en el sitio EN CADA VUELTA, no solo al empezar. El cupo solo
  // baja mientras estás dentro, y en medio minuto cualquier empujón (un
  // secuaz, la colisión con un mueble) la sacaba del radio: la sala dejaba de
  // gastarse a media cuenta y la comprobación fallaba una de cada tres veces
  // sin que hubiera nada roto.
  for (let i = 0; i < 1200 && game.safeSpotCharge(mi) > 0; i++) {
    // Reanudar DENTRO del bucle: `_heatAlertShown` se rearma sola y otra
    // alarma a mitad de cuenta volvería a congelar el gasto.
    game.setPaused(false);
    player.position.x = meeting.x;
    player.position.z = meeting.z;
    game.update(1 / 30);
  }
  player.position.x = meeting.x;
  player.position.z = meeting.z;
  game.update(1 / 30);
  res.meetingAfterBudget = { inSafeSpot: game.inSafeSpot, charge: game.safeSpotCharge(mi) };

  return res;
});

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert("el plano define alguna sala de reuniones como lugar seguro", out.hasMeeting);
assert("el plano define tu puesto como lugar seguro", out.hasDesk);

assert(
  `ningún lugar seguro se solapa con otro${out.overlaps?.length ? ` (${out.overlaps.join(", ")})` : ""}`,
  out.overlaps?.length === 0
);
assert(
  `ningún id de lugar seguro está repetido${out.duplicateIds?.length ? ` (${out.duplicateIds.join(", ")})` : ""}`,
  out.duplicateIds?.length === 0
);

assert("fuera de un lugar seguro, mantener F no finge nada", out.corridor?.pretending === false);
assert("fuera de un lugar seguro no estás a cubierto", out.corridor?.inSafeSpot === false);

assert("en una sala de reuniones basta con estar dentro", out.meetingIdle?.inSafeSpot === true);
assert("en una sala de reuniones sí puedes fingir", out.meetingPretend?.pretending === true);
assert(
  "fingir en la sala baja la sospecha",
  out.meetingPretend != null && out.meetingPretend.suspicion < 50
);

assert("en tu puesto, parada, NO estás a cubierto", out.deskIdle?.inSafeSpot === false);
assert("en tu puesto, fingiendo, sí lo estás", out.deskPretend?.inSafeSpot === true);

assert("con la sospecha al 95% la pantalla avisa en rojo", out.dangerHigh === true);
assert("y con la sospecha baja no", out.dangerLow === false);

assert("una sala ocupada deja de cubrirte", out.meetingBusy?.inSafeSpot === false);
assert("y ocupada tampoco puedes fingir dentro", out.meetingBusy?.pretending === false);
assert("su marcador avisa de que está ocupada", out.meetingBusyCharge === 0);

assert("una sala se gasta y deja de cubrirte", out.meetingAfterBudget?.inSafeSpot === false);
assert("y su marcador lo refleja", out.meetingAfterBudget?.charge === 0);

process.exit(failed ? 1 : 0);
