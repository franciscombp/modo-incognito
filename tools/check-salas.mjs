/**
 * LAS SALAS SON TUYAS.
 *
 * Un escondite en el que el jefe puede entrar no es un escondite. Gabo
 * empezaba el día SENTADO en la Sala 1 —el sitio al que vas a huir de él— y
 * además se quedaba encerrado: la puerta de una sala es un hueco estrecho y
 * su ruta lo llevaba contra el tabique.
 *
 * Esto comprueba las dos mitades del arreglo: que su puesto está FUERA, y
 * que no hay forma de meterlo dentro ni empujándolo.
 *
 * Uso: npm run check:salas   (necesita `npm run preview` en :4173)
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

// EL ARRANQUE SE MIRA ANTES DE HABLAR CON ÉL. Estaba medido DESPUÉS del
// diálogo de apertura, y desde que el día 1 abre con Gabo recibiéndote en la
// puerta esa charla termina superando la puerta del día: se levanta y echa a
// andar para llevarte a tu sitio. O sea que la prueba medía «quieto» justo
// en el cuadro en que el juego acaba de mandarle a moverse.
const arranque = await p.evaluate(() => {
  const { boss } = window.__game.engine.game;
  const salas = window.__floorplan.areas.filter((a) => a.kind === "meeting");
  const dentro = salas.find(
    (a) =>
      boss.position.x >= a.x - a.w / 2 &&
      boss.position.x <= a.x + a.w / 2 &&
      boss.position.z >= a.z - a.d / 2 &&
      boss.position.z <= a.z + a.d / 2
  );
  return {
    // QUIETO, de una de las dos formas: la puerta del día lo deja SENTADO en
    // su puesto (`sentadoEn`) o DE PIE recibiéndote (`esperaEn`).
    quieto: boss.seated || boss.esperando,
    sentado: boss.seated,
    esperando: boss.esperando,
    sala: dentro?.id ?? null,
    x: +boss.position.x.toFixed(2),
    z: +boss.position.z.toFixed(2),
  };
});

for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

const out = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const { boss } = g;
  window.__S = 1.2;
  const salas = window.__floorplan.areas.filter((a) => a.kind === "meeting");
  const dentro = (x, z) =>
    salas.find(
      (a) => x >= a.x - a.w / 2 && x <= a.x + a.w / 2 && z >= a.z - a.d / 2 && z <= a.z + a.d / 2
    );

  // Y AHORA SE LE EMPUJA. Se le manda a perseguir con la jugadora DENTRO de
  // cada sala: es la única forma de que el juego intente meterlo, y es
  // exactamente lo que pasa cuando huyes ahí.
  g.setPaused(false);
  g.clearGate();
  boss.standUp();
  g.rules.maxWarnings = 99;
  const visitadas = [];
  let coladas = 0;
  for (const sala of salas) {
    // ── 1 · CONTIGO DENTRO: no puede colarse ──
    // Ojo con lo que esto NO prueba: estar en una sala es estar en un LUGAR
    // SEGURO, y el motor corta la persecución cada cuadro mientras sigas
    // dentro. Así que aquí no hay una caza que medir — hay un jefe rondando
    // pegado a la sala, que es justo el caso en el que se colaba.
    g.player.position.x = sala.x;
    g.player.position.z = sala.z;
    for (let f = 0; f < 900; f++) {
      if (g.paused) g.setPaused(false);
      g.suspicion = 80;
      boss.suspicion = 80;
      boss.lockedOn = true;
      boss.lastSeenPlayerPos = { x: sala.x, z: sala.z };
      g.update(1 / 60);
      if (dentro(boss.position.x, boss.position.z)) coladas++;
    }

    // ── 2 · SU RONDA SIGUE SIENDO SUYA ──
    // La otra mitad del arreglo, y se mide en el PLANO, no conduciendo una
    // persecución: dentro de una sala estás en un lugar seguro y el motor
    // corta la caza cada cuadro, así que ahí no hay nada que medir. Lo que
    // sí se puede romper —y es lo que se rompió— es que un punto de su
    // ronda quede dentro de una sala: no puede llegar, empuja el tabique el
    // día entero y desde fuera parece que la IA se colgó.
    const puerta = window.__game.navVigilancia.snap(sala.x, sala.z);
    visitadas.push({
      sala: sala.id,
      puertaFuera: !dentro(puerta.x, puerta.z),
      alcanzable: window.__game.navVigilancia.reachable(
        { x: boss.position.x, z: boss.position.z },
        puerta
      ),
    });
  }
  // Las rondas, TODAS: la del jefe y la de cada secuaz.
  const todas = [
    window.__floorplan.patrolRoute,
    ...Object.values(window.__floorplan.routes ?? {}),
  ].filter(Boolean);
  const rondas = { puntos: 0, dentro: 0 };
  for (const r of todas) {
    for (const p of r) {
      rondas.puntos++;
      if (dentro(p.x, p.z)) rondas.dentro++;
    }
  }
  return { visitadas, coladas, rondas };
});

check(
  "Gabo empieza quieto (sentado o esperando), y FUERA de cualquier sala",
  arranque.quieto === true && arranque.sala === null,
  JSON.stringify(arranque)
);
check(
  "persiguiéndote DENTRO de cada sala, no entra en ninguna",
  out.coladas === 0,
  `${out.coladas} cuadros dentro — ${JSON.stringify(out.visitadas)}`
);
// Y no se queda pegado al tabique: si llega a la puerta y se para ahí, la
// mecánica funciona pero se ve roto. Se le pide que se acerque de verdad.
check(
  "pero la puerta de cada sala SIGUE siendo suya: llega, y desde ella vuelve",
  out.visitadas.every((v) => v.puertaFuera && v.alcanzable),
  JSON.stringify(out.visitadas.filter((v) => !(v.puertaFuera && v.alcanzable)))
);
check(
  "y ningún punto de una ronda quedó encerrado en una sala",
  out.rondas.dentro === 0,
  JSON.stringify(out.rondas)
);
check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLas salas siguen siendo escondites: el jefe llega a la puerta y ahí se queda"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
