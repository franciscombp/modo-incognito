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

// CUATRO minutos por decisión de diseño (antes 120): el bucle v2 mete
// conseguir-activar-aguantar en cada actividad y la jornada corta se
// quedaba sin sitio para la vuelta al ascensor.
check(out.duracion === 240, "la jornada dura cuatro minutos", `${out.duracion}s`);
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
// `doze`: la cabezada de pie, sin mueble ninguno. La cama se retiró del
// motor entera (ver la sección 5): lo que cuenta que duermes es el ZZZ.
check(dormida.pose === "doze", "con la pose de cabezada (sin cama)", dormida.pose);
check(dormida.teclas === 0, "y los mandos dejan de responder");
check(dormida.enSnapshot === true, "el HUD se entera");

// ── 3bis · El Zzz SE VE, no solo existe ─────────────────────────────
// La lección cara: el globo estuvo con material.opacity = 0 y todos los
// tests miraban `visible`, que daba true — un sprite que existe, se
// actualiza y no pinta un píxel. Aquí se comprueban las TRES cosas que
// pueden apagarlo en silencio: visible, opacidad y estar EN la escena
// (parent). Y de paso, las mismas tres del globo de alerta del jefe,
// que nació con el mismo defecto en el mismo archivo.
const zzz = await p.evaluate(() => {
  const player = window.__game.player;
  const boss = window.__game.boss;
  // El bloque anterior la dejó dormida (asleepFor > 0); un frame del bucle
  // real posiciona el globo.
  window.__game.engine.game.update(1 / 60);
  player.update(1 / 60, window.__game.world);
  // El Zzz son TRES sprites de la letra Z subiendo (un Group), no un
  // icono suelto: se mira que alguno esté encendido de verdad.
  const zs = player.sleepIcon.children ?? [];
  return {
    // El REVERSO: caritas mientras te escaqueas. Se comprueba que existen y
    // que NO están encendidas ahora — dormida no te lo pasas bien, y los
    // dos globos a la vez sobre la misma cabeza serían ilegibles.
    carasCuantas: (player.happyIcon?.children ?? []).length,
    carasVisibles: player.happyIcon?.visible ?? null,
    zzzVisible: player.sleepIcon.visible,
    zzzCuantas: zs.length,
    zzzOpacity: Math.max(0, ...zs.map((s) => s.material.opacity)),
    zzzEnEscena: !!player.sleepIcon.parent,
    alertaOpacity: boss.alertIcon.material.opacity,
    alertaEnEscena: !!boss.alertIcon.parent,
    // Y la pose de agotamiento NO monta cama: `doze`, no `sleep`.
    pose: window.__game.engine.game.player.pose,
  };
});
check(
  zzz.zzzVisible === true && zzz.zzzCuantas === 3 && zzz.zzzOpacity > 0.3 && zzz.zzzEnEscena === true,
  "el Zzz dormida SE VE: tres Z, opacas y dentro de la escena",
  JSON.stringify(zzz)
);
check(
  zzz.carasCuantas === 3 && zzz.carasVisibles === false,
  "y las caritas del escaqueo existen pero NO salen dormida",
  JSON.stringify({ carasCuantas: zzz.carasCuantas, carasVisibles: zzz.carasVisibles })
);
check(
  zzz.pose === "doze",
  "y dormirse de agotamiento usa `doze` (sin cama), no `sleep`",
  JSON.stringify(zzz)
);
check(
  zzz.alertaOpacity > 0.5 && zzz.alertaEnEscena === true,
  "y el globo de alerta del jefe también pinta de verdad",
  JSON.stringify(zzz)
);


// ── 4 · Dormirse a la vista del jefe: VIENE a despertarte, y la
// amonestación cae cuando llega y te TOCA — nunca por verte a distancia.
// (La regla de MOTOR.md §8: la amonestación es SIEMPRE física. Este era
// el último atajo que la disparaba de lejos.)
const pillada = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.warnings = 0;
  g._caughtCooldown = 0;
  g.asleepFor = 6;
  g.inSafeSpot = false;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  // Lejos: la ve dormida desde la otra punta. NO debe amonestar aún —
  // debe ARRANCAR la caza hacia ella.
  const S = window.__floorplan.WORLD_SCALE;
  g.boss.position.x = g.player.position.x + 6 * S;
  g.boss.position.z = g.player.position.z;
  g.boss._updateVision = () => {
    g.boss.playerVisible = true;
    g.boss.redAlert = false;
  };
  for (let i = 0; i < 5; i++) g.update(1 / 60);
  const sinTocar = { warnings: g.warnings, cazando: g.boss.isHunting === true };
  // Y cuando LLEGA (se le planta encima), el toque amonesta.
  g.boss.position.x = g.player.position.x + 0.1;
  for (let i = 0; i < 5; i++) g.update(1 / 60);
  return { ...sinTocar, alTocar: g.warnings };
});
check(
  pillada.warnings === 0 && pillada.cazando === true,
  "verte dormida NO amonesta de lejos: arranca la caza hacia ti",
  JSON.stringify(pillada)
);
check(pillada.alTocar === 1, "y la amonestación cae cuando llega y te TOCA", `${pillada.alTocar}`);

const enSalaSegura = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.warnings = 0;
  g._caughtCooldown = 0;
  g.asleepFor = 3;
  // El bloque anterior dejó al jefe ENCIMA y cazando: aquí se mide la
  // cabezada a cubierto, así que se le manda lejos y a su ronda.
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 40;
  g.suspicion = 0;
  g.boss.suspicion = 0;
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

// ── 5 · LA CAMA NO VA: lo que cuenta que duermes es el ZZZ ────────
// Decisión de diseño. Había una pose (`sleep`) que montaba un colchón en su
// `context.furniture`, y las dos actividades que la pedían eran «dormir en el
// escritorio» y «estirar cinco minutos»: una cama apareciendo de la nada en
// tu puesto, y otra al desperezarte. Se leía como un fallo, no como una
// siesta. Se retiró del motor entera; si vuelve una cama será mobiliario del
// PLANO en un sitio concreto, no algo que la pose invoque donde estés parada.
//
// Va AL FINAL a propósito: corre treinta cuadros de partida de verdad y deja
// al jefe y al medidor movidos, así que en medio del archivo le robaba el
// montaje a la sección de al lado.
const cama = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__game.engine.game;
  const out = {};

  // Ninguna pose del motor puede montar una cama.
  out.posesConCama = Object.entries(window.__game.POSE_LIBRARY ?? {})
    .filter(([, v]) => (v?.context?.furniture ?? []).some((f) => f.name === "bed"))
    .map(([k]) => k);
  // Y ninguna actividad puede seguir pidiendo la pose retirada.
  out.actividadesConSleep = (g._allStations ?? [])
    .filter((a) => a.pose === "sleep")
    .map((a) => a.id);

  // La SIESTA como actividad: Zzz sí, carita no.
  g.asleepFor = 0;
  g.energy = 80;
  const st = g.objectives.find((o) => o.type === "sleep") ?? null;
  if (st) {
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    if (st.objeto) g.inventario.add(st.objeto.id);
    g.player.keys.add(" ");
    for (let i = 0; i < 30; i++) {
      g.setPaused(false);
      g.update(1 / 60);
      await sleep(6);
    }
    out.siestaZzz = g.player.isAsleep === true;
    out.siestaCarita = g.player.isEnjoying === true;
    g.player.keys.delete(" ");
  }
  return out;
});
check(
  cama.posesConCama.length === 0,
  "NINGUNA pose del motor monta una cama",
  `la montan: ${cama.posesConCama.join(", ")}`
);
check(
  cama.actividadesConSleep.length === 0,
  "y ninguna actividad pide la pose retirada `sleep`",
  `la piden: ${cama.actividadesConSleep.join(", ")}`
);
if (cama.siestaZzz !== undefined) {
  check(cama.siestaZzz === true, "la siesta del escritorio lleva ZZZ", JSON.stringify(cama));
  check(cama.siestaCarita === false, "y no carita: dormir no es escaquearse riendo", JSON.stringify(cama));
}

check(errors.length === 0, "sin errores de página", errors.slice(0, 2).join(" | "));

console.log(
  failures ? `\n${failures} fallo(s)` : "\nLa jornada se aguanta con energía, y dormirse se paga"
);
process.exit(failures ? 1 : 0);
