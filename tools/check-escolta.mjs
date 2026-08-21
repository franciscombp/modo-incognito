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

// ── 2 · Y ECHA A ANDAR — Y TÚ CON ÉL. En cuadros, no en reloj de pared. ──
// La escolta es una CINEMÁTICA: la jugadora lo sigue sola (por `walkTo`, o
// sea por las mismas colisiones y la misma animación de andar). Antes era
// una misión con flecha, y en la mano se leía como un fallo: él decía
// «camina conmigo», se iba, y cada uno quedaba fuera de la pantalla del otro.
const escolta = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const b2 = g.boss;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  g.setPaused(false);
  const d0 = Math.hypot(b2.position.x - mesa.x, b2.position.z - mesa.z);
  const p0 = { x: b2.position.x, z: b2.position.z };
  const j0 = { x: g.player.position.x, z: g.player.position.z };
  let cazo = false;
  let dMax = 0;
  let dJMin = Infinity;
  // CUÁNTO DURA LA ESCENA, en segundos de juego. Es un número de DISEÑO: una
  // apertura sin control que se pasa de larga cansa, y una que se pasa de
  // corta es el jefe saliendo disparado (que es de lo que venimos). Sin
  // medirlo, «se aparta poco» y «la escena acaba tarde» se ven igual.
  let sentoEn = null;
  // 26 segundos de juego. Eran 18, calculados con el jefe yendo a prisa FIJA
  // (×1.9). Ahora SE ACOMPASA a la jugadora —afloja si se descuelga, se para
  // si la pierde de vista (game._acompasarEscolta)—, así que la escena dura
  // más A PROPÓSITO: es lo que hace que no se salga del plano. Con la ventana
  // vieja daba tiempo a llegar y a soltarla en su sitio, pero no a que se
  // APARTARA del todo, y la prueba cazaba el final de la escena a medias
  // (d1: 2.3) en vez de un jefe plantado delante de la silla, que es lo que
  // vino a vigilar.
  for (let i = 0; i < 26 * 60; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
    // El paso de la jugadora vive en el bucle de render de main.js, no en
    // `game.update` — sin esta línea el `walkTo` de la cinemática no se
    // consume nunca y la prueba mide a una jugadora clavada (joAnduve: 0)
    // con el juego perfecto. Es la lección de siempre de las pruebas de IA.
    g.player.update(1 / 60, window.__game.world);
    if (b2.state === "CHASE") cazo = true;
    dMax = Math.max(
      dMax,
      Math.hypot(b2.position.x - g.player.position.x, b2.position.z - g.player.position.z)
    );
    dJMin = Math.min(dJMin, Math.hypot(b2.position.x - mesa.x, b2.position.z - mesa.z));
    if (sentoEn === null && g._esperandoPuesto === false) sentoEn = +(i / 60).toFixed(1);
  }
  return {
    d0: +d0.toFixed(1),
    d1: +Math.hypot(b2.position.x - mesa.x, b2.position.z - mesa.z).toFixed(1),
    dJMin: +dJMin.toFixed(1),
    ando: +Math.hypot(b2.position.x - p0.x, b2.position.z - p0.z).toFixed(1),
    joAnduve: +Math.hypot(g.player.position.x - j0.x, g.player.position.z - j0.z).toFixed(1),
    dMax: +dMax.toFixed(1),
    sentada: g.player.isPretending === true,
    sentoEn,
    escoltaViva: g._esperandoPuesto === true,
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
// LLEGA A TU PUESTO Y LUEGO SE APARTA. «Llegar» es haberse plantado junto a
// la mesa (dJMin, el punto más cercano de todo el trayecto); quedarse ahí
// sería peor — quien está de servicio no cede el paso, así que si se queda
// delante del puesto la jugadora no puede sentarse nunca (pasó: 12 segundos
// empujándole la espalda). El final correcto es él en SU sitio y tú en el
// tuyo.
check(
  "y LLEGA a tu puesto (pasó a plantarse junto a la mesa)…",
  escolta.dJMin <= 5,
  JSON.stringify(escolta)
);
check(
  "…y luego SE APARTA: no se queda plantado delante de tu silla",
  escolta.d1 >= 4,
  JSON.stringify(escolta)
);
// Y NO TE PERSIGUE MIENTRAS TE LLEVA: durante la escolta vas pegada a él por
// definición, así que sin el respiro el día abría con una caza.
check(
  "y no te caza mientras te acompaña",
  escolta.cazo === false,
  JSON.stringify(escolta)
);
// Y NO SE HACE ETERNA. Es una apertura sin control: acompasarse a la
// jugadora la alarga a propósito (el jefe espera), pero pasada cierta raya
// deja de leerse como una escena y se lee como un juego que no te deja
// jugar. Dieciocho segundos es el techo.
check(
  "y la escena no se hace eterna (18 s de techo)",
  escolta.sentoEn !== null && escolta.sentoEn <= 18,
  JSON.stringify(escolta)
);
// LA CINEMÁTICA SE VE: la jugadora anda CON él (nunca se quedan cada uno
// fuera de la pantalla del otro) y la escena remata con ella SENTADA.
check(
  "y TÚ VAS CON ÉL: la jugadora lo sigue sola",
  escolta.joAnduve >= 8 && escolta.dMax <= 12,
  JSON.stringify(escolta)
);
check(
  "y la escena remata contigo SENTADA en tu puesto",
  escolta.sentada === true && escolta.escoltaViva === false,
  JSON.stringify(escolta)
);

// ── 3 · Y SI EL PASEO SE ATASCA, EL TELÓN LO REMATA ──
// La escolta ya no se puede abandonar (te lleva sola), pero SÍ se puede
// atascar: un mueble, un compañero en el hueco. Un cuerpo trabado con el
// control fuera se ve igual que un juego colgado, así que al agotarse el
// plazo el telón te deja EN el puesto — la escena se termina, no se cancela.
const atasco = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  // Se rearma la escena con la jugadora "atascada": clavamos su paso.
  g._esperandoPuesto = true;
  g._escoltaPlazo = 0.05;
  g._pretendToggle = false;
  g.player.isPretending = false;
  const lejos = window.__floorplan.patrolRoute[2];
  g.player.position.x = lejos.x;
  g.player.position.z = lejos.z;
  // El telón real corre con setTimeout y aquí el bucle es síncrono: se
  // sustituye por su versión inmediata SOLO para esta medición.
  g.onCorte = (fn) => (fn(), true);
  for (let i = 0; i < 240; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
    if (g._esperandoPuesto && g._escoltaPlazo > 0.1) break;
  }
  for (let i = 0; i < 120; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
    g.player.update(1 / 60, window.__game.world);
  }
  return {
    escoltaViva: g._esperandoPuesto === true,
    enMesa: Math.hypot(g.player.position.x - mesa.x, g.player.position.z - mesa.z) < 2,
    sentada: g.player.isPretending === true,
  };
});
check(
  "si el paseo se atasca, el telón te deja EN el puesto (la escena se termina)",
  atasco.enMesa === true && atasco.escoltaViva === false && atasco.sentada === true,
  JSON.stringify(atasco)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nGabo te recibe en la puerta y te lleva a tu sitio, andando"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
