// Comprueba que se puede ENTRAR a cada sala de reuniones, y si no, dice qué
// `doorSide` habría que ponerle.
//
// `check-reachable` apunta a UN punto de la sala (justo dentro de la pared de
// delante). Eso deja pasar los dos fallos típicos: una puerta que da contra la
// fachada o contra el bloque del vecino, y una mesa tan grande que tapa el
// propio hueco de la puerta. En los dos casos la sala es inentrable y el juego
// no avisa — simplemente hay una actividad a la que nunca se llega.
//
// Aquí se mira si queda ALGÚN sitio pisable dentro de la sala al que se pueda
// llegar desde los ascensores. Y cuando una falla, se vuelve a cargar el juego
// con cada una de las otras tres puertas para decir cuál sí funciona, que es
// la pregunta que uno se hace justo después.
//
// Uso: node tools/check-doors.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const SIDES = ["frente", "fondo", "norte", "sur"];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});

const errors = [];

/**
 * Abre el juego (opcionalmente cambiándole la puerta a una sala) y devuelve,
 * por cada sala de reuniones, si se puede entrar.
 *
 * El cambio se hace interceptando el JSON del plano, no escribiéndolo: así se
 * pueden probar las cuatro puertas sin tocar el repo ni dejar nada a medias.
 */
async function probe(override = null) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });

  if (override) {
    await page.route("**/data/scenes/*.json", async (route) => {
      const res = await route.fetch();
      const plan = JSON.parse(await res.text());
      for (const a of plan.areas ?? []) {
        if ((a.name ?? a.id) === override.room) a.doorSide = override.side;
      }
      await route.fulfill({ response: res, body: JSON.stringify(plan) });
    });
  }

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

  const rooms = await page.evaluate(() => {
    const { navmesh } = window.__game;
    const fp = window.__floorplan;
    const from = fp.spawn;

    return fp.areas
      .filter((a) => a.kind === "meeting")
      .map((a) => {
        // Se barre el interior en rejilla. Con un solo punto en el centro, una
        // sala con mesa sale siempre "bloqueada" aunque se entre de sobra.
        let standing = 0;
        let reached = 0;
        const steps = 7;
        for (let i = 0; i < steps; i++) {
          for (let j = 0; j < steps; j++) {
            const x = a.x + ((i / (steps - 1)) * 2 - 1) * a.w * 0.42;
            const z = a.z + ((j / (steps - 1)) * 2 - 1) * a.d * 0.42;
            if (!navmesh.isWalkable(x, z)) continue;
            standing += 1;
            if (navmesh.reachable(from, { x, z })) reached += 1;
          }
        }
        return { name: a.name ?? a.id, side: a.doorSide ?? "frente", standing, reached };
      });
  });

  await page.close();
  return rooms;
}

const rooms = await probe();
const bad = rooms.filter((r) => r.reached === 0);

// Para cada sala rota se prueban las otras tres puertas. Son cargas de página
// enteras, así que solo se hace con las que ya fallaron.
for (const room of bad) {
  room.alternatives = [];
  if (room.standing === 0) continue; // no cabe nadie dentro: la puerta da igual
  for (const side of SIDES) {
    if (side === room.side) continue;
    const probed = await probe({ room: room.name, side });
    const found = probed.find((r) => r.name === room.name);
    if (found?.reached > 0) room.alternatives.push(side);
  }
}

await browser.close();

console.log(`${rooms.length} salas comprobadas`);
if (errors.length) {
  console.error("Errores de consola:");
  [...new Set(errors)].slice(0, 6).forEach((e) => console.error(" ", e));
}
if (bad.length) {
  console.error(`SALAS INENTRABLES (${bad.length}):`);
  for (const r of bad) {
    if (r.standing === 0) {
      console.error(`  ${r.name}: no cabe nadie dentro — la mesa se come la sala entera.`);
      console.error("    Súbele `d`/`w`, bájale `capacity`, o quítale la mesa.");
      continue;
    }
    console.error(`  ${r.name} · doorSide "${r.side}": hay sitio dentro pero no se llega.`);
    console.error(
      r.alternatives.length
        ? `    Ponle doorSide: "${r.alternatives[0]}"${r.alternatives.length > 1 ? ` (también vale: ${r.alternatives.slice(1).join(", ")})` : ""}.`
        : "    Ninguna de las cuatro puertas funciona: la sala está tapiada por sus vecinas."
    );
  }
} else if (!errors.length) {
  console.log("Se puede entrar a todas");
}
process.exit(errors.length || bad.length ? 1 : 0);
