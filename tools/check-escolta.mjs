/**
 * LA ESCOLTA DE APERTURA: Gabo te recibe en la puerta Y TE LLEVA.
 *
 * ── El fallo, que no se veía en ningún diff ──
 *
 * El día 1 abre con Gabo esperándote en la puerta; al saludarle te dice «ven,
 * que te enseño tu sitio» y echa a andar hacia tu puesto. Eso es lo que
 * engancha la primera misión con la segunda.
 *
 * No pasaba. Y no por la lógica —el `distract` y la correa estaban bien
 * puestos— sino porque EL SITIO EN EL QUE EMPIEZA ES UN POZO: en
 * (-3.8, -6.7) Gabo podía girar, mirar y sospechar, pero no daba un paso.
 * Medido: 0.6 unidades en cinco segundos, con cualquier destino y con o sin
 * correa. Una unidad de plano más allá anda las 16 hasta el puesto.
 *
 * Un punto que se elige a ojo en un JSON y que resulta estar clavado no
 * produce ningún error: produce un jefe de estatua en la puerta y una
 * escena que nunca ocurre. Es el mismo tipo de fallo que `check:doors`
 * persigue con las puertas de las salas, y se caza igual — midiendo.
 *
 * Y la segunda mitad: MIENTRAS TE ACOMPAÑA NO TE VIGILA. Durante la escolta
 * vas pegada a él por definición, así que su cono te tiene encima todo el
 * rato y saltaba el aviso de «¿no deberías estar trabajando?» seguido de la
 * caza. El día abría con el jefe persiguiéndote tres segundos después de
 * saludarte.
 *
 * Uso: npm run check:escolta   (necesita `npm run preview` en :4173)
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
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });

// ── 1 · Te espera en la puerta, de pie y quieto ──
const puerta = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  return {
    esperando: g.boss.esperando === true,
    cerca: +Math.hypot(
      g.boss.position.x - g.player.position.x,
      g.boss.position.z - g.player.position.z
    ).toFixed(1),
    aLaMesa: +Math.hypot(g.boss.position.x - mesa.x, g.boss.position.z - mesa.z).toFixed(1),
  };
});
check("Gabo te espera en la puerta, de pie", puerta.esperando, JSON.stringify(puerta));
check("y te recibe de cerca, no desde el otro lado del piso", puerta.cerca <= 4, JSON.stringify(puerta));

// Pasar el saludo.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(140);
}

// ── 2 · Y ECHA A ANDAR. En cuadros, no en reloj de pared. ──
const escolta = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const b2 = g.boss;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  g.setPaused(false);
  const d0 = Math.hypot(b2.position.x - mesa.x, b2.position.z - mesa.z);
  const p0 = { x: b2.position.x, z: b2.position.z };
  let cazo = false;
  // 12 segundos de juego. El trayecto son ~17 unidades de plano; con este
  // margen tiene que haber llegado, y si se queda clavado se ve enseguida.
  for (let i = 0; i < 12 * 60; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
    if (b2.state === "CHASE") cazo = true;
  }
  return {
    d0: +d0.toFixed(1),
    d1: +Math.hypot(b2.position.x - mesa.x, b2.position.z - mesa.z).toFixed(1),
    ando: +Math.hypot(b2.position.x - p0.x, b2.position.z - p0.z).toFixed(1),
    cazo,
    estado: b2.state,
  };
});
// LO QUE SE MIDE ES QUE ANDA. Un jefe clavado en la puerta gira, mira y
// sospecha igual: por dentro parece que todo funciona.
check(
  "al saludarle ECHA A ANDAR de verdad (su sitio no es un pozo)",
  escolta.ando >= 4,
  JSON.stringify(escolta)
);
// LLEGA A TU PUESTO — y «llegar» aquí es la zona, no el centímetro: la
// correa le deja una holgura a propósito mientras la sospecha está baja
// (ver el bloque `holgura` en boss.js), así que se planta a unas unidades y
// no encima de tu silla. Lo que esto vigila es que el trayecto se COMPLETA,
// que es lo que no pasaba: se quedaba a 17,6, o sea sin salir de la puerta.
check(
  "y LLEGA a tu puesto: la escolta termina donde tiene que terminar",
  escolta.d1 <= 5,
  JSON.stringify(escolta)
);
// Y NO TE PERSIGUE MIENTRAS TE LLEVA: durante la escolta vas pegada a él por
// definición, así que sin el respiro el día abría con una caza.
check(
  "y no te caza mientras te acompaña",
  escolta.cazo === false,
  JSON.stringify(escolta)
);

// ── 3 · Y SI NO LE SIGUES, LA ESCENA CADUCA ──
// La otra cara de «mientras te acompaña no te vigila»: a nadie se le puede
// obligar a seguirle. Quien se largara por su cuenta se quedaba con el
// medidor CONGELADO EN CERO toda la jornada — el piso entero convertido en
// un lugar seguro, que es exactamente lo contrario del juego.
const plantado = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  // Se rearma la escena y la jugadora se va al lado contrario del piso.
  g._esperandoPuesto = true;
  g._escoltaPlazo = null;
  g.boss._graceTimer = 0;
  const lejos = window.__floorplan.patrolRoute[2];
  g.player.position.x = lejos.x;
  g.player.position.z = lejos.z;
  g.suspicion = 0;
  let frames = 0;
  // Algo más del plazo (30 s), en cuadros.
  for (let i = 0; i < 34 * 60 && g._esperandoPuesto; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
    frames++;
  }
  // Y con la escena caída, la sospecha vuelve a poder moverse.
  g.boss.redAlert = true;
  g.player.isDoingActivity = true;
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  return {
    caduco: g._esperandoPuesto === false,
    segundos: +(frames / 60).toFixed(1),
    sospecha: +g.suspicion.toFixed(1),
  };
});
check(
  "si no le sigues, la escolta CADUCA sola",
  plantado.caduco === true,
  JSON.stringify(plantado)
);
check(
  "y entonces la sospecha vuelve a contar: el piso no es un lugar seguro",
  plantado.sospecha > 0,
  JSON.stringify(plantado)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nGabo te recibe en la puerta y te lleva a tu sitio, andando"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
