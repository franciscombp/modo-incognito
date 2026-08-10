import { chromium } from "playwright";

// LA ENERGÍA: lo que de verdad dan las tareas, y el sueño que llega si no
// las haces.
//
// Lo que vigila:
//  1. La jornada dura DOS MINUTOS y una tarea no toca el reloj: toca la
//     energía. El reloj sigue existiendo — te guía — pero lo alargan las
//     misiones, no los escaqueos.
//  2. La energía baja sola, y fingir cansa MÁS que no hacer nada.
//  2b. NI CON EL TANQUE LLENO se aguanta el día entero, que es lo que
//     vuelve obligatorio bajar a por un café. Y el café es la mejor
//     recarga del piso: si deja de serlo, deja de ser obligatorio.
//  3. A cero te duermes: unos segundos sin control, y los mandos no
//     responden (que no se lea como un cuelgue).
//  4. Dormirse a la vista del jefe cuesta una AMONESTACIÓN; dormirse en un
//     lugar seguro, no. Elegir dónde caes es la decisión.

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const errors = [];
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
p.on("pageerror", (e) => errors.push(String(e)));

await p.goto(url, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
// Cuerpo de BLOQUE: con cuerpo de expresión se devuelve la promesa de
// startDay, que no resuelve hasta que alguien pase el diálogo de apertura.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 20000 });
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

const out = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const r = { duracion: g.rules.duration };

  // ── 2 · Baja sola, y fingir cansa más ──────────────────────────────
  // Se llama a `_updateEnergy` DIRECTAMENTE y no a `update()`: este último
  // recalcula `isPretending` cada cuadro a partir de dónde estás y de si
  // mantienes espacio, así que pisaba la bandera puesta a mano y las dos
  // medidas salían idénticas. Aquí lo que se mide es el gasto, no cómo se
  // decide que estás fingiendo.
  g.energy = 100;
  g.player.isPretending = false;
  for (let i = 0; i < 60; i++) g._updateEnergy(1 / 60, false); // 1 s
  r.trasUnSegundo = Number(g.energy.toFixed(2));

  g.energy = 100;
  g.player.isPretending = true;
  for (let i = 0; i < 60; i++) g._updateEnergy(1 / 60, false);
  r.fingiendoUnSegundo = Number(g.energy.toFixed(2));
  g.player.isPretending = false;

  // ── 1 · Una tarea da ENERGÍA, no reloj ─────────────────────────────
  g.energy = 20;
  const relojAntes = g.timeLeft;
  const energiaAntes = g.energy;
  g.grantEnergy(30, null);
  r.relojIntacto = g.timeLeft === relojAntes;
  r.energiaSubio = g.energy > energiaAntes;
  r.energiaTopada = (() => {
    g.energy = 95;
    g.grantEnergy(50, null);
    return g.energy <= g.energyMax;
  })();

  // ── 2b · El café es obligatorio, y hay que poder demostrarlo ───────
  // Autonomía = tanque lleno / lo que se gasta por segundo. Si diera para
  // los 120 s, la energía sería un adorno: se entraría y se saldría sin
  // pasar por la cafetera ni una vez.
  const gasto = 100 - r.trasUnSegundo;
  r.autonomia = Number((g.energyMax / gasto).toFixed(1));

  const escaqueos = (g._allStations ?? []).map((s) => ({
    id: s.id,
    energia: s.energy ?? s.reward ?? 0,
  }));
  const cafe = escaqueos.find((s) => s.id === "coffee");
  r.cafe = cafe?.energia ?? 0;
  r.mejorRecarga = Math.max(0, ...escaqueos.map((s) => s.energia));
  r.declaranEnergia = (g._allStations ?? []).every((s) => s.energy != null);

  return r;
});

check(out.duracion === 120, "la jornada dura dos minutos", `${out.duracion}s`);
check(out.trasUnSegundo < 100, "la energía baja sola", `100 → ${out.trasUnSegundo}`);
check(
  out.fingiendoUnSegundo < out.trasUnSegundo,
  "y fingir cansa MÁS que no hacer nada",
  `${out.fingiendoUnSegundo} vs ${out.trasUnSegundo}`
);
check(out.relojIntacto === true, "una tarea NO toca el reloj");
check(out.energiaSubio === true, "una tarea sube la energía");
check(out.energiaTopada === true, "y la energía no pasa de su tope");
check(
  out.autonomia < out.duracion,
  "ni con el tanque lleno se aguanta el día sin reponer",
  `${out.autonomia}s de ${out.duracion}s`
);
check(out.declaranEnergia === true, "cada escaqueo declara su `energy`");
check(
  out.cafe > 0 && out.cafe === out.mejorRecarga,
  "y el café es la mejor recarga del piso",
  `café ${out.cafe} · máximo ${out.mejorRecarga}`
);

// ── 3 · A cero te duermes, y los mandos no responden ────────────────
const dormida = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
  // Lejos de todo y sin que nadie mire, para aislar el sueño de la
  // amonestación (eso se prueba aparte).
  g.player.position.x = lift.x + 20;
  g.player.position.z = lift.z + 6;
  g.boss.position.x = lift.x - 40;
  g.boss.position.z = lift.z - 20;
  g.warnings = 0;
  g._caughtCooldown = 0;
  g.energy = 0.1;
  g.player.keys.add("w");
  for (let i = 0; i < 10; i++) g.update(1 / 60);
  return {
    dormida: g.asleepFor > 0,
    pose: g.player.pose,
    teclas: g.player.keys.size,
    enSnapshot: g.lastSnapshot.asleep === true,
  };
});
check(dormida.dormida === true, "a cero te duermes");
check(dormida.pose === "sleep", "con la pose de dormir");
check(dormida.teclas === 0, "y los mandos dejan de responder");
check(dormida.enSnapshot === true, "el HUD se entera");

// ── 4 · Dormirse a la vista del jefe cuesta amonestación ────────────
const pillada = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.warnings = 0;
  g._caughtCooldown = 0;
  g.asleepFor = 3;
  g.inSafeSpot = false;
  // Que el jefe la vea, sin depender del raycast real.
  g.boss._updateVision = () => {
    g.boss.playerVisible = true;
    g.boss.redAlert = false;
  };
  for (let i = 0; i < 5; i++) g.update(1 / 60);
  return g.warnings;
});
check(pillada === 1, "dormirte a la vista del jefe cuesta una amonestación", `${pillada}`);

const enSalaSegura = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.warnings = 0;
  g._caughtCooldown = 0;
  g.asleepFor = 3;
  for (let i = 0; i < 5; i++) {
    g.update(1 / 60);
    // `inSafeSpot` lo recalcula update() cada cuadro, así que se fuerza
    // JUSTO antes de que lo lea el bloque de la energía. Se reimpone en
    // cada vuelta por lo mismo.
    g.inSafeSpot = true;
  }
  g.asleepFor = 3;
  g.inSafeSpot = true;
  g._updateEnergy(1 / 60, false);
  return g.warnings;
});
check(enSalaSegura === 0, "pero en un lugar seguro puedes dar la cabezada", `${enSalaSegura}`);

check(errors.length === 0, "sin errores de página", errors.slice(0, 2).join(" | "));

console.log(
  failures ? `\n${failures} fallo(s)` : "\nLa jornada se aguanta con energía, y dormirse se paga"
);
process.exit(failures ? 1 : 0);
