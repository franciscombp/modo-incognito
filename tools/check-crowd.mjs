/**
 * SEPARACIÓN ENTRE PERSONAJES (game.js → _updateCrowdSeparation).
 *
 * Lo que hay que proteger no es que "los cuerpos choquen": es la regla de
 * juego que va montada encima — **quien está de servicio NO CEDE**. El
 * contacto del jefe y de los secuaces es mecánica (la amonestación es un
 * toque, la persecución exige cerrar distancia), así que si un figurante
 * pudiera empujar al jefe un centímetro, el decorado estaría empujando a las
 * reglas y la captura se rompería sin que nada lo delatara.
 *
 * Por eso la primera aserción no es «se separan»: es «el JEFE no se movió».
 *
 * Uso: npm run check:crowd   (necesita `npm run preview` en :4173)
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

const res = await p.evaluate(async () => {
  const { engine } = window.__game;
  const game = engine.game;
  engine.dialogue.close?.();
  document.querySelector(".vn-layer")?.classList.add("hidden");
  game.setPaused(false);
  game.clearGate();
  // El jefe quieto y ciego: aquí se mide la separación, no su IA. Se le
  // clava la ruta en su sitio para que el movimiento que midamos sea SOLO
  // el que la separación le hubiera metido.
  game.boss.setTether(null);
  game.boss._updateVision = () => {
    game.boss.playerVisible = false;
    game.boss.redAlert = false;
  };
  game.boss.route = [{ x: game.boss.position.x, z: game.boss.position.z }];
  game.boss.routeIndex = 0;
  game.minions.forEach((m) => m.setActive(false));
  await new Promise((r) => setTimeout(r, 300));

  const out = {};
  const paso = () => {
    game.setPaused(false);
    game.suspicion = 0;
    game.update(1 / 30);
  };

  // ── 1 · Un NPC encima del jefe: cede el NPC, el jefe NI SE INMUTA ──
  const npc = game.npcs.find((n) => n.active !== false);
  out.hayNpc = !!npc;
  if (npc) {
    // MÓVIL a la fuerza: el primer intento usó al NPC tal cual, que estaba
    // SENTADO — y un sentado contra el jefe son DOS inamovibles, o sea que el
    // par se salta a propósito y no hay nada que medir. El caso que esta
    // aserción quiere es «figurante ANDANDO se mete en el jefe».
    Object.defineProperty(npc, "isSeated", { value: false, configurable: true });
    const jefe0 = { x: game.boss.position.x, z: game.boss.position.z };
    npc.position.x = jefe0.x + 0.05;
    npc.position.z = jefe0.z;
    for (let i = 0; i < 30; i++) paso();
    const d = Math.hypot(npc.position.x - game.boss.position.x, npc.position.z - game.boss.position.z);
    const min = (npc.radius ?? 0.3) + (game.boss.radius ?? 0.3);
    out.jefeSeMovio = +Math.hypot(game.boss.position.x - jefe0.x, game.boss.position.z - jefe0.z).toFixed(3);
    out.separados = +(d / min).toFixed(2); // >= ~1 cuando ya no se solapan
  }

  // ── 2 · Dos NPC móviles solapados se reparten el empujón ──
  // Los NPC de fondo pasan casi todo el día SENTADOS (y un sentado no cede:
  // nadie resbala de su silla porque pasen a su lado), así que el estado
  // "móvil" es cuestión de cazar el momento. Para que la prueba sea
  // determinista se les quita la condición de sentado por la costura del
  // test, no tocando su máquina de estados.
  const [na, nb] = game.npcs.filter((n) => n.active !== false).slice(1, 3);
  out.hayPar = !!(na && nb);
  if (na && nb) {
    Object.defineProperty(na, "isSeated", { value: false, configurable: true });
    Object.defineProperty(nb, "isSeated", { value: false, configurable: true });
    const cx = na.position.x;
    const cz = na.position.z;
    nb.position.x = cx + 0.03;
    nb.position.z = cz;
    for (let i = 0; i < 30; i++) paso();
    const d = Math.hypot(na.position.x - nb.position.x, na.position.z - nb.position.z);
    const min = (na.radius ?? 0.3) + (nb.radius ?? 0.3);
    out.parSeparado = +(d / min).toFixed(2);
    // Repartido: ninguno de los dos se comió el empujón entero.
    out.movioA = +Math.hypot(na.position.x - cx, na.position.z - cz).toFixed(3);
  }

  return out;
});

assert("hay NPC vivos para la prueba", res.hayNpc === true, JSON.stringify(res));
assert(
  "el JEFE no cede ni un centímetro ante un figurante",
  res.jefeSeMovio === 0,
  `se movió ${res.jefeSeMovio}`,
);
assert("y el NPC quedó fuera de su cuerpo", res.separados >= 0.95, `d/min=${res.separados}`);
assert("dos NPC móviles solapados se separan", res.hayPar && res.parSeparado >= 0.95, JSON.stringify(res));
assert("y el empujón se repartió (el primero también se movió)", res.movioA > 0, JSON.stringify(res));
assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLos cuerpos ocupan sitio, y el que está de servicio no cede"
    : `\n${fallos} fallo(s) en la separación`,
);
process.exit(fallos === 0 ? 0 : 1);
