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

// ── 1 · Gabo TE RECIBE EN LA PUERTA ──
// Antes empezaba sentado y la primera misión era ir a buscarlo. Ahora está
// de pie delante del ascensor esperándote: sales, le saludas, y te lleva.
// Un primer día no empieza buscando a tu jefe por la oficina.
const inicio = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const donde = g.gate?.esperaEn ?? g.gate?.sentadoEn;
  const sp =
    window.__floorplan.puestos.find((s) => s.id === donde) ??
    window.__floorplan.safeSpots.find((s) => s.id === donde);
  const ascensor = window.__floorplan.areas.find((a) => a.kind === "elevator");
  // Se le dejan correr cuadros: esperando NO debe andar ni un palmo.
  const x0 = g.boss.position.x;
  const z0 = g.boss.position.z;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  return {
    donde,
    esperando: g.boss.esperando === true,
    sentado: g.boss.seated === true,
    quieto: Math.hypot(g.boss.position.x - x0, g.boss.position.z - z0) < 0.01,
    enSuSitio: sp
      ? Math.hypot(g.boss.position.x - sp.x, g.boss.position.z - sp.z) < (sp.radius ?? 2 * S) * 2
      : false,
    // Y CERCA DE LA PUERTA: el sitio importa, no solo que no se mueva. Si el
    // punto se mudara al otro lado del piso, todo lo de arriba seguiría en
    // verde y la escena habría dejado de existir.
    aLaPuerta: ascensor
      ? Math.hypot(g.boss.position.x - ascensor.x, g.boss.position.z - ascensor.z) < 8 * S
      : false,
  };
});
check(
  "Gabo te RECIBE de pie, no sentado ni patrullando",
  inicio.esperando === true && inicio.sentado === false,
  JSON.stringify(inicio)
);
check("y esperando no se mueve del sitio", inicio.quieto === true, JSON.stringify(inicio));
check(
  "en el punto que dice el nivel, y JUNTO AL ASCENSOR",
  inicio.enSuSitio === true && inicio.aLaPuerta === true,
  JSON.stringify(inicio)
);

// ── 2 · Saludarle y que TE LLEVE ──
const trasHablar = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  const antes = Math.hypot(g.boss.position.x - mesa.x, g.boss.position.z - mesa.z);
  // CIEGO PARA ESTA MEDIDA. Lo que se mide es la ESCOLTA, y aquí la jugadora
  // se queda plantada en mitad del pasillo sin moverse: Gabo la ve fuera de
  // sitio, se pone a investigarla y acaba persiguiéndola, y eso pisa el
  // acompañamiento. Con él viendo, lo que mediría esta prueba es su reacción
  // a un montaje que ninguna persona reproduce — jugando, le sigues.
  g.boss._updateVision = function () {
    this.playerVisible = false;
    this.redAlert = false;
  };
  g.clearGate();
  // Se le dan cuadros para que ECHE A ANDAR. Lo que se mide no es que diga
  // «ve a tu puesto» —eso es una línea de texto— sino que se ponga en camino:
  // «te lleva» tiene que verse.
  for (let i = 0; i < 240; i++) g.update(1 / 60);
  const despues = Math.hypot(g.boss.position.x - mesa.x, g.boss.position.z - mesa.z);
  return {
    sentado: g.boss.seated === true,
    esperando: g.boss.esperando === true,
    esperandoPuesto: g._esperandoPuesto === true,
    seAcerco: +(antes - despues).toFixed(2),
  };
});
check(
  "saludarle lo pone en marcha: deja de esperar en la puerta",
  trasHablar.sentado === false && trasHablar.esperando === false,
  JSON.stringify(trasHablar)
);
check(
  "y TE LLEVA: echa a andar hacia tu puesto, no se queda en la puerta",
  trasHablar.seAcerco > 1,
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
//
// Y AHORA SON DOS CAMINOS, según lo lejos que estés (ver `seatAtDesk`):
// CERCA te lleva andando y la escena entera se ve; LEJOS baja el telón,
// porque `walkTo` va en línea recta y cruzar el piso a pie se atasca contra
// el primer mueble — con el control bloqueado, que desde fuera se ve igual
// que un juego colgado.
//
// Esta prueba mide EL CAMINO ANDADO, que es donde vive la promesa de que
// nadie parpadea de sitio, así que se coloca a la jugadora CERCA. Estaba
// puesta lejos y por eso empezó a fallar: medía un salto que ya no existe
// —el telón— como si fuera un teletransporte.
const cuerpo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const desk0 = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  // A tres unidades de plano: dentro del margen del paseo, y lo bastante
  // lejos como para que la caminata se pueda medir.
  g.player.position.x = desk0.x + 3 * S;
  g.player.position.z = desk0.z;
  g.player.keys.clear();
  g._pretendToggle = false;
  const desk = desk0;
  const d0 = Math.hypot(g.player.position.x - desk.x, g.player.position.z - desk.z);
  g.seatAtDesk();
  let saltoMax = 0;
  for (let i = 0; i < 600; i++) {
    const ax = g.player.position.x;
    const az = g.player.position.z;
    g.update(1 / 60);
    // El paso de la jugadora vive en el bucle de render de main.js: sin
    // esto, `walkTo` no se consume nunca y la prueba mide a una jugadora
    // clavada con el juego perfecto.
    g.player.update(1 / 60, window.__game.world);
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

// ── 4bis · Y DESDE LEJOS, EL TELÓN ──
// El otro camino, que es el que arregló «me quedo atrapada por una maceta y
// no llego nunca». Aquí no se mide que ande —no debe— sino que el traslado
// SE COMPLETA y que el negro llega a bajar: un cambio de sitio a cara
// descubierta sí sería el teletransporte que este archivo persigue.
const lejano = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  const lejos = window.__floorplan.patrolRoute[2];
  g.player.position.x = lejos.x;
  g.player.position.z = lejos.z;
  g.player.keys.clear();
  g._pretendToggle = false;
  g.player.isPretending = false;
  const d0 = Math.hypot(g.player.position.x - desk.x, g.player.position.z - desk.z);
  // POR ESTADO, no espiando la opacidad. La versión anterior sondeaba el velo
  // cada 50 ms buscando `opacity > 0.5`, y el telón entero dura ~760 ms: bajo
  // carga, dos sondeos consecutivos se separaban más que eso y el corte
  // completo pasaba ENTRE ellos — fallaba con la jugadora ya sentada y el
  // traslado hecho como se debe (una vez cada tantas suites). Lo que promete
  // el juego es que el traslado LARGO pasa por el corte — y eso se pregunta
  // en la costura: se envuelve `onCorte` y se mira que el teletransporte
  // ocurrió DENTRO de su negro, no a cara descubierta.
  let corteUsado = false;
  let cambioEnElNegro = false;
  const onCorte0 = g.onCorte;
  g.onCorte = (enElNegro) => {
    corteUsado = true;
    return onCorte0.call(g, () => {
      enElNegro?.();
      cambioEnElNegro = g.player.isPretending === true;
    });
  };
  g.seatAtDesk();
  g.onCorte = onCorte0;
  // EN TIEMPO REAL, no en cuadros: el telón se mueve con `setTimeout`, así
  // que un bucle síncrono de `update()` lo dejaría a medias para siempre.
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    if (g.player.isPretending) break;
  }
  return {
    d0: +d0.toFixed(1),
    d1: +Math.hypot(g.player.position.x - desk.x, g.player.position.z - desk.z).toFixed(1),
    corteUsado,
    cambioEnElNegro,
    sentada: g.player.isPretending === true,
  };
});
check(
  "desde el otro lado del piso el traslado SE COMPLETA (no te quedas atrapada)",
  lejano.d1 < 2,
  JSON.stringify(lejano)
);
check(
  "y se hace detrás del telón, no a cara descubierta",
  lejano.corteUsado === true && lejano.cambioEnElNegro === true,
  JSON.stringify(lejano)
);
check("y acabas sentada, fingiendo", lejano.sentada === true, JSON.stringify(lejano));

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
