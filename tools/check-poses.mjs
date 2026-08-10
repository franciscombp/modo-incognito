// Las poses de acción van y vienen entre dos posturas, y la gracia es que se
// note: tomando café la taza sube y baja, comiendo la mano va a la boca y
// vuelve. Si alguien toca character3d.js y deja la pose congelada, en una
// captura no se nota y en el diff tampoco — aquí sí.
//
// Comprueba, para cada actividad del día 1, que la pose que sale del JSON es
// la que se aplica Y que el muñeco se sigue moviendo con el tiempo.
//
// Antes esto se medía en el desplazamiento UV del pliego `*-acciones.png`.
// Ya no hay pliego: las poses son rotaciones de las articulaciones, así que
// lo que se muestrea es la huella del rig (`sprite.poseSignature()`).
//
// Uso: node tools/check-poses.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  // Giuli es la única con pliego de acciones propio.
  window.__game.engine.save.setCharacter("giu");
  window.__game.engine.menus.close();
});
await page.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 15000 });

const result = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const game = window.__game.engine.game;
  const player = window.__game.player;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");
  // Este test es sobre las poses de actividad, no sobre la puerta del día 1
  // (encontrar a Gabo primero) — se salta directo a tareas desbloqueadas.
  // `clearGate` y no `metGabo = true` a pelo: la bandera sola abre el piso
  // pero deja la lista de tareas VACIA, porque quien suelta el plan del dia
  // es la campana al enterarse de que la mision de la puerta cayo.
  game.clearGate();

  const out = { hasPoses: player.sprite.hasPoses, activities: [] };

  // LAS ACTIVIDADES DEL DÍA, no la lista de tareas del momento.
  //
  // Desde que la campaña reparte las misiones (docs/CAMPANA.md), `objectives`
  // ya no trae las tres actividades del día 1 de golpe: llegan encadenadas,
  // y al arrancar solo hay una estación activa — las otras dos se desbloquean
  // al hacerla. Iterando esa lista, la prueba medía el RITMO de la campaña en
  // vez de las poses, y decía que faltaban dos actividades que están ahí.
  //
  // `rules.objectives` es lo que el JSON del día declara como sus actividades,
  // y no depende de por dónde vaya la cadena; `_allStations` las resuelve a
  // estaciones del plano con su pose. Eso es lo que este archivo quiere.
  const delDia = game.rules.objectives ?? null;
  const stations = (game._allStations ?? [])
    .filter((s) => !delDia || delDia.includes(s.id))
    .map((s) => ({ ...s, progress: 0, done: false }));
  // Y se ponen TODAS en la lista de tareas: `nearStation` solo mira ahí, así
  // que plantarse encima de una estación que la cadena aún no ha desbloqueado
  // no dispara ninguna pose. Aquí se prueban las poses, no la cadena.
  game.objectives = stations;
  // El bucle v2 pide CONSEGUIR antes de activar: sin su objeto, la estación
  // ni arranca y la pose no llega a ponerse. Se conceden todos — aquí se
  // prueban las poses, no la búsqueda (esa es de check-objetos).
  for (const st of stations) if (st.objeto) game.inventario.add(st.objeto.id);
  for (const station of stations) {
    player.keys.clear();
    player.position.x = station.x;
    player.position.z = station.z;
    player.keys.add(" "); // la tecla de acción es espacio, no "e"
    await sleep(500);

    // La huella del rig ES la postura del momento. Se muestrea durante un
    // segundo largo: una pose viva tiene que dar varias distintas.
    const seen = new Set();
    for (let i = 0; i < 14; i++) {
      seen.add(player.sprite.poseSignature());
      await sleep(100);
    }
    out.activities.push({
      id: station.id,
      wanted: station.pose,
      applied: player.pose,
      frames: seen.size,
    });
    station.done = false;
    station.progress = 0;
  }
  return out;
});

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert("Giuli puede hacer poses de acción", result.hasPoses === true);
for (const a of result.activities) {
  assert(`${a.id}: usa la pose "${a.wanted}" del JSON`, !!a.wanted && a.applied === a.wanted);
  assert(`${a.id}: la pose se anima (${a.frames} posturas distintas)`, a.frames >= 2);
}
assert("las tres actividades del día 1 tienen pose", result.activities.length === 3);

process.exit(failed ? 1 : 0);
