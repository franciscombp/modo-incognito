import { chromium } from "playwright";

// LAS SEIS: TODO EL MUNDO A CASA, Y TÚ SALES POR EL ASCENSOR.
//
// Lo que vigila:
//  1. Terminar las tareas ya NO gana el día donde estés parada: abre la
//     SALIDA. La jornada se cierra llegando al ascensor.
//  2. Irse es una TAREA de la lista del HUD — pero no cuenta para "ya
//     terminaste todo", o la jornada nunca podría darse por hecha.
//  3. A las seis la salida se abre pase lo que pase, y los compañeros
//     recogen y se van (dejan de estar en el piso).
//  4. Quedarte encerrada al acabarse el reloj cuesta una AMONESTACIÓN y
//     cierra el día perdido. No es un despido salvo que colme el vaso.
//
// ── UN PROCESO POR CASO, Y ESTO NO ES CAPRICHO ───────────────────────
// Dos de los tres casos TERMINAN el día, y una pestaña que acaba de
// terminarlo se queda con la evaluación encima y su bucle de render a toda
// velocidad. Encadenar los casos en un solo proceso NO funciona, y se
// probaron todas: reutilizar la pestaña, recargarla, abrir otra en el mismo
// navegador, abrir un navegador nuevo, cerrarlo con plazo, mandarlo antes a
// `about:blank`. Todas se quedaban colgadas al arrancar el caso siguiente,
// sin error y sin que saltara ningún timeout. Lo único que lo corta de raíz
// es que el proceso MUERA entre caso y caso: al salir node se lleva su
// Chromium por delante y el siguiente arranca en un sistema limpio.
//
// Por eso el script recibe el caso por argumento y `check:cierre` lo invoca
// tres veces. Correrlo sin argumento hace los tres, uno detrás de otro.

const CASOS = ["salida", "seis", "encerrada"];
const caso = process.argv[2] && CASOS.includes(process.argv[2]) ? process.argv[2] : null;
const url = process.argv[3] ?? "http://localhost:4173/";

// Sin caso: relanzarse a sí mismo una vez por caso, cada uno en su proceso.
if (!caso) {
  const { spawnSync } = await import("node:child_process");
  let failed = 0;
  for (const c of CASOS) {
    const r = spawnSync(process.execPath, [process.argv[1], c, url], { stdio: "inherit" });
    if (r.status !== 0) failed++;
  }
  console.log(
    failed ? `${failed} caso(s) con fallos` : "\nA las seis se sale por el ascensor, o te saca el guardia"
  );
  process.exit(failed ? 1 : 0);
}

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const errors = [];
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on("pageerror", (e) => errors.push(String(e)));

await p.goto(url, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
// Cuerpo de BLOQUE: con cuerpo de expresión se devuelve la promesa de
// startDay, que no resuelve hasta que alguien pase el diálogo de apertura —
// que es lo que hacemos justo después. Deadlock.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 20000 });

// El prólogo y las presentaciones dejan huecos en los que dialogue.isOpen es
// false sin haber terminado: dos pasadas con espera entre ellas.
for (let round = 0; round < 2; round++) {
  for (let i = 0; i < 40; i++) {
    if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
    const hasOpts = await p.evaluate(
      () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
    );
    if (hasOpts) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
    else await p.keyboard.press("Space");
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(3500);
}
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
});

if (caso === "salida") {
  const trasTareas = await p.evaluate(() => {
    const g = window.__game.engine.game;
    // Lejos del ascensor: se APARECE en él, y con la salida abierta estar
    // ahí gana el día — que es justo lo que se comprueba a continuación.
    const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
    g.player.position.x = lift.x + 25;
    g.player.position.z = lift.z + 8;
    g.objectives.forEach((o) => (o.done = true));
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    return {
      gameOver: g.gameOver,
      exitOpen: g.exitOpen,
      enLista: (g.lastSnapshot.objectives ?? []).some((o) => o.id === "__salida"),
    };
  });
  check(trasTareas.gameOver === false, "terminar las tareas NO cierra el día donde estés");
  check(trasTareas.exitOpen === true, "abre la SALIDA");
  check(trasTareas.enLista === true, "y la pone como tarea en la lista del HUD");

  const enElAscensor = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
    g.player.position.x = lift.x;
    g.player.position.z = lift.z;
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    return { gameOver: g.gameOver, win: g.win };
  });
  check(
    enElAscensor.gameOver === true && enElAscensor.win === true,
    "llegar al ascensor gana el día"
  );
}

if (caso === "seis") {
  const seis = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const vivosAntes = g.npcs.filter((n) => n.active !== false).length;
    // Empujar el reloj de PARED a las seis sin jugar la jornada entera.
    g.timeSpent = g.rules.duration * 0.95;
    // Reloj de sobra: si se acaba a mitad del bucle, el día se cierra con su
    // amonestación y su evaluación encima, y esto solo mira si el piso se
    // vacía.
    g.timeLeft = 9999;
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    const abierta = g.exitOpen;
    const anunciado = g.closingAnnounced;
    // A los compañeros los mueve el bucle de main.js, no game.update, así
    // que aquí hay que tickearlos a mano. Y SOLO a ellos: meter `g.update`
    // arrastra el render completo del HUD en cada vuelta, y mil vueltas de
    // DOM en headless tardan minutos.
    for (let i = 0; i < 1200; i++) {
      g.npcs.forEach((n) => n.update(1 / 30, i / 30));
    }
    return {
      hora: g.formatTime(),
      abierta,
      anunciado,
      vivosAntes,
      vivosDespues: g.npcs.filter((n) => n.active !== false).length,
    };
  });
  check(seis.anunciado === true, `a las seis se anuncia el cierre (${seis.hora})`);
  check(seis.abierta === true, "y la salida se abre sin haber terminado nada");
  check(
    seis.vivosDespues < seis.vivosAntes,
    "los compañeros recogen y se van",
    `${seis.vivosAntes} → ${seis.vivosDespues}`
  );
}

if (caso === "encerrada") {
  const encerrada = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const antes = g.warnings;
    const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
    g.player.position.x = lift.x + 30;
    g.player.position.z = lift.z + 10;
    g.timeLeft = 0;
    for (let i = 0; i < 5; i++) g.update(1 / 60);
    return { antes, despues: g.warnings, gameOver: g.gameOver, win: g.win };
  });
  check(
    encerrada.despues === encerrada.antes + 1,
    "quedarte encerrada cuesta una amonestación",
    `${encerrada.antes} → ${encerrada.despues}`
  );
  check(encerrada.gameOver === true && encerrada.win === false, "y cierra el día perdido");
}

check(errors.length === 0, `sin errores de página (${caso})`, errors.slice(0, 2).join(" | "));

// Sin `b.close()`: cerrar una pestaña que acaba de terminar el día no
// devuelve nunca. `process.exit` se lleva el Chromium por delante, que es
// exactamente lo que hace falta y no cuesta nada.
process.exit(failures ? 1 : 0);
