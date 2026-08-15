/**
 * EL BUCLE v2 DE LAS ACTIVIDADES: conseguir → activar → aguantar
 * (game.js → inventario/_itemSpots/_bankActivity, activities[].objeto).
 *
 * Lo que hay que proteger:
 *
 *  1. SIN el objeto NO hay actividad: la estación avisa qué falta y dónde,
 *     y el minijuego ni arranca. Si esto se cae, `objeto` pasa a ser un
 *     campo decorativo y el "conseguir" desaparece del bucle sin que nada
 *     falle a la vista.
 *  2. Robar de una sala OCUPADA no se puede — y una DISTRACCIÓN la vacía.
 *     Es la jugada completa que pide el diseño: todos adentro, alboroto,
 *     salen a mirar, te llevas el HDMI.
 *  3. Comprar por charla: el objeto con `de` cae al hablar con su dueño.
 *  4. Activada (minijuego superado), la actividad NO se cobra sola: empieza
 *     el AGUANTE con el mundo VIVO, y soltar la banca con extra por cada
 *     segundo sostenida.
 *
 * Uso: npm run check:objetos   (necesita `npm run preview` en :4173)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

// ── El dato, en frío: toda fuente de objeto existe ──
const escena = JSON.parse(readFileSync("public/data/scenes/piso7.json", "utf8"));
const dialogues = JSON.parse(readFileSync("public/data/dialogues.json", "utf8"));
const salas = new Set((escena.safeSpots ?? []).map((s) => s.id));
const casts = new Set(Object.keys(dialogues.encounters ?? {}));
const rotos = [];
for (const a of escena.activities ?? []) {
  const o = a.objeto;
  if (!o) continue;
  if (o.en && !salas.has(o.en.sala)) rotos.push(`${a.id} -> sala ${o.en.sala}`);
  if (o.de && !casts.has(o.de)) rotos.push(`${a.id} -> cast ${o.de}`);
  if (!o.en && !o.de) rotos.push(`${a.id} -> sin fuente`);
}
assert("todo objeto apunta a una fuente que existe", rotos.length === 0, rotos.join(" | "));

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });

const res = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.head.appendChild(
    Object.assign(document.createElement("style"), {
      textContent: ".vn-layer, .inc-dialogue { display:none !important }",
    }),
  );
  g.setPaused(false);
  g.clearGate();
  g.minions.forEach((m) => m.setActive(false));
  g.boss.setTether(null);
  g._caughtCooldown = 999;
  const calma = () => {
    g.setPaused(false);
    g.suspicion = 0;
    g.boss.suspicion = 0;
  };
  const out = {};

  // La peli entra a la lista aunque la cadena no la haya soltado aún: aquí
  // se prueba el objeto, no la campaña.
  let movie = g.objectives.find((o) => o.id === "movie" && !o.dynamic);
  if (!movie) {
    const base = (g._allStations ?? []).find((a) => a.id === "movie");
    movie = { ...base, progress: 0, done: false };
    g.objectives.push(movie);
  }

  // ── 1 · Sin el HDMI, la peli ni arranca ──
  calma();
  g.player.position.x = movie.x;
  g.player.position.z = movie.z;
  g.player.keys.add(" ");
  await sleep(500);
  out.sinObjeto = {
    minijuego: g.pulse.active || g.gesture.active,
    haciendo: g.player.isDoingActivity,
    congelado: g.worldFrozen,
  };
  g.player.keys.delete(" ");
  await sleep(150);

  // ── 2 · La sala ocupada no suelta el HDMI; la distracción la vacía ──
  const spot = g._itemSpots.find((it) => it.id === "hdmi");
  if (!spot) return { ...out, error: "el HDMI no está indexado en _itemSpots" };
  g.safeSpotState[spot.salaIndex].busyLeft = 60;
  calma();
  g.player.position.x = spot.x;
  g.player.position.z = spot.z;
  await sleep(120);
  g.player.keys.add(" ");
  await sleep(250);
  g.player.keys.delete(" ");
  out.ocupada = { robado: g.inventario.has("hdmi") };
  // El alboroto: una distracción cerca vacía la sala (jugada completa).
  const d = g.distractionState[0];
  d.cooldownLeft = 0;
  calma();
  g.player.position.x = d.x;
  g.player.position.z = d.z;
  await sleep(120);
  g.player.keys.add(" ");
  await sleep(250);
  g.player.keys.delete(" ");
  const cerca = Math.hypot(d.x - spot.x, d.z - spot.z) < 12 * (g.lastSnapshot?.worldScale ?? 1.2);
  out.alboroto = {
    cerca,
    vaciada: g.safeSpotState[spot.salaIndex].busyLeft <= 0,
  };
  // Si la distracción quedaba lejos de la sala, se vacía a mano: lo que
  // sigue prueba la recogida, no el radio del alboroto.
  if (!out.alboroto.vaciada) g.safeSpotState[spot.salaIndex].busyLeft = 0;

  // ── 3 · Sala libre: el HDMI se recoge ──
  calma();
  g.player.position.x = spot.x;
  g.player.position.z = spot.z;
  await sleep(120);
  g.player.keys.add(" ");
  await sleep(250);
  g.player.keys.delete(" ");
  // EL HDMI YA NO SE RECOGE: SE GANA. Pulsar al lado de la sala abre el reto
  // de cables (src/game/cableGame.js) y hay que resolverlo. Robar la pieza
  // clave de tu escaqueo no puede costar lo mismo que abrir una puerta.
  if (g.reto && g.cables.active) {
    for (let vuelta = 0; vuelta < 12; vuelta++) {
      const cs = g.cables.snapshot();
      if (!cs) break;
      const i = cs.izq.findIndex((x) => !x.unido);
      if (i < 0) break;
      const j = cs.der.findIndex((x) => x.color === cs.izq[i].color && !x.unido);
      g.cables.elegir("izq", i);
      g.cables.elegir("der", j);
      g.update(1 / 60);
    }
  }
  out.recogido = g.inventario.has("hdmi");

  // ── 3b · Comprar por charla: el café del Parce ──
  // EL CAFÉ TAMPOCO SE REGALA: el Parce te EXAMINA antes de vendértelo (una
  // trivia suya, ver `objeto.reto` en la escena). Hablarle abre el examen;
  // aprobarlo es lo que te da el café.
  const parce = g.npcs.find((n) => n.cast === "parce" || n.id === "parce");
  if (parce) {
    g.player.position.x = parce.position.x;
    g.player.position.z = parce.position.z;
  }
  g.completeTalk("parce");
  for (let vuelta = 0; vuelta < 20 && g.trivia.active; vuelta++) {
    for (let i = 0; i < 3; i++) {
      if (!g.trivia.active) break;
      const r = g.trivia.responder(i);
      if (r === "acierto" || r === "ganado") break;
    }
    if (parce) {
      g.player.position.x = parce.position.x;
      g.player.position.z = parce.position.z;
    }
    g.update(1 / 60);
  }
  out.comprado = g.inventario.has("cafe_parce");

  // ── 4 · Con el HDMI: activa CON EL PISO VIVO, y el AGUANTE paga ──
  calma();
  movie.done = false;
  movie.progress = 0;
  movie.encendida = false;
  g.player.position.x = movie.x;
  g.player.position.z = movie.z;
  await sleep(120);
  g.player.keys.add(" ");
  await sleep(400);
  out.conObjeto = {
    minijuego: g.pulse.active || g.gesture.active,
    congelado: g.worldFrozen,
  };
  // Encender ya: el minijuego se le da por jugado — aquí se mide el aguante.
  movie.progress = movie.time - 0.01;
  for (let i = 0; i < 20 && !movie.encendida; i++) {
    calma();
    await sleep(100);
  }
  out.encendida = movie.encendida === true;
  const energia0 = g.energy;
  // AGUANTAR sostenida: el mundo ya vive y el contador sube.
  for (let i = 0; i < 15; i++) {
    calma();
    g.player.position.x = movie.x;
    g.player.position.z = movie.z;
    await sleep(100);
  }
  out.aguantando = {
    vivo: g.worldFrozen === false,
    aguante: +(movie.aguante ?? 0).toFixed(1),
    sinCobrar: movie.done === false,
  };
  // Soltar BANCA: misión hecha y el aguante pagado.
  g.player.keys.delete(" ");
  for (let i = 0; i < 20 && !movie.done; i++) {
    calma();
    await sleep(100);
  }
  // EL AGUANTE SE PAGA EN ENERGÍA, no en reloj: la jornada dura siempre lo
  // mismo, así que el reloj dejó de ser moneda. Se mide la energía.
  out.banco = { hecha: movie.done === true, pagado: g.energy > energia0 };
  return out;
});

assert(
  "sin el objeto, el minijuego NI ARRANCA",
  res.sinObjeto?.minijuego === false && res.sinObjeto?.haciendo === false,
  JSON.stringify(res.sinObjeto),
);
assert("y el mundo sigue vivo (no hay activación)", res.sinObjeto?.congelado === false, JSON.stringify(res.sinObjeto));
assert("la sala ocupada NO suelta el HDMI", res.ocupada?.robado === false, JSON.stringify(res.ocupada));
assert(
  "una distracción cercana vacía la sala",
  res.alboroto?.cerca === false || res.alboroto?.vaciada === true,
  JSON.stringify(res.alboroto),
);
assert("con la sala libre, el HDMI se GANA jugando los cables", res.recogido === true, JSON.stringify(res));
assert("el café se GANA aprobando el examen del Parce", res.comprado === true, JSON.stringify(res));
assert(
  "con el objeto, la activación arranca y el piso SIGUE VIVO",
  res.conObjeto?.minijuego === true && res.conObjeto?.congelado === false,
  JSON.stringify(res.conObjeto),
);
assert("superado el minijuego, la actividad se ENCIENDE", res.encendida === true, JSON.stringify(res));
assert(
  "y el aguante corre con el mundo VIVO, sin cobrarse solo",
  res.aguantando?.vivo === true && res.aguantando?.aguante > 0.8 && res.aguantando?.sinCobrar === true,
  JSON.stringify(res.aguantando),
);
assert(
  "soltar BANCA: la misión cae y el aguante se paga",
  res.banco?.hecha === true && res.banco?.pagado === true,
  JSON.stringify(res.banco),
);
assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nConseguir, activar y aguantar: el bucle v2 entero, de la sala ocupada al banco"
    : `\n${fallos} fallo(s) en el bucle de objetos`,
);
process.exit(fallos === 0 ? 0 : 1);
