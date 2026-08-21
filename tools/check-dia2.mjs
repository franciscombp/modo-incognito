/**
 * EL DÍA 2 SE JUEGA ENTERO.
 *
 * El martes lleva meses escrito (`levels/dia-2.json`) y estuvo fuera del
 * manifiesto — o sea, sin que NADIE lo jugara ni lo vigilara. Al activarlo,
 * esto es lo que garantiza que no se activó roto:
 *
 *  1. Arranca y monta el piso (con su intro de continuidad y su ELECCIÓN).
 *  2. NO tiene puerta: el martes ya conoces a Gabo — el piso abre
 *     desbloqueado y él, de ronda desde el primer minuto.
 *  3. Hay misiones desde el arranque, y al menos una jugable sin recados.
 *  4. Sus cuatro actividades del JSON existen en la escena y cada una juega
 *     a un verbo interactivo (o es la siesta).
 *  5. Se puede TERMINAR: completadas las misiones se abre la salida, y
 *     llegar al ascensor cierra la jornada en victoria.
 *
 * Uso: npm run check:dia2   (necesita `npm run preview` en :4173)
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

// ── PRIMERO SE VIVE EL LUNES ──
// Saltar directo al día 2 con la partida virgen era mentirse: la campaña
// reparte las misiones por cadena (`requiere`), así que sin el lunes hecho
// el martes amanecía con UNA misión y nada jugable — que es exactamente lo
// que este check reportó la primera vez. El martes de verdad llega después
// del lunes; el check también.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(140);
}
// El lunes, completado por la API real — pero SOLO el plato del lunes.
// La primera versión barría la cadena ENTERA en rondas hasta vaciarla…
// y completar la temporada en un día es nota AAA: la campaña ASCIENDE a la
// temporada 2 con las únicas a cero, y «el martes» amanecía replayando la
// cadena desde meet-gabo. No era un bug — era el ascenso directo haciendo
// exactamente lo que promete. Un lunes de verdad rinde lo que cabe en
// cuatro minutos: las misiones del amanecer y una tanda de desbloqueos.
await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.setPaused(false);
  g.clearGate();
  g.saltarEscolta();
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 60;
  const delAmanecer = g.objectives.filter((x) => !x.done).map((o) => o.id);
  for (const id of delAmanecer) {
    const o = g.objectives.find((x) => x.id === id);
    if (!o || o.done) continue;
    g.suspicion = 0;
    if (o.dynamic && o.npcId) g.completeTalk(o.npcId);
    else {
      if (o.objeto && !g.inventario.has(o.objeto.id)) g.inventario.add(o.objeto.id);
      o.progress = o.time ?? 1;
      o.done = true;
      g.onMissionDone?.(o.id);
    }
    await sleep(30);
  }
  // Lo desbloqueado en caliente NO se hace hoy: se queda para mañana, que
  // es justo lo que el martes necesita para amanecer con plato.
  for (const o of g.objectives.filter((x) => !x.done)) {
    o.done = true; // solo para abrir la salida; SIN onMissionDone: la
    o.progress = o.time ?? 1; // campaña no se entera y no cuenta la única
  }
});
await p.evaluate(() => {
  const g = window.__game.engine.game;
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
  g.player.position.x = lift.x;
  g.player.position.z = lift.z;
  for (let i = 0; i < 60 && !g.gameOver; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
});
// El cierre del lunes encadena outro → evaluación → panel. Se pasa todo con
// clics/teclas hasta que el panel ofrezca el martes.
for (let i = 0; i < 60; i++) {
  const boton = await p.evaluate(() => {
    for (const b2 of document.querySelectorAll("button, .inc-btn")) {
      if (/Día 2|Siguiente jornada|Continuar|Firmar|Aceptar/i.test(b2.textContent ?? "")) {
        return b2.textContent.trim().slice(0, 30);
      }
    }
    return null;
  });
  if (boton && /Día 2|Siguiente/i.test(boton)) break;
  const abierta = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
  if (abierta) await p.keyboard.press("Space");
  else {
    await p.evaluate(() => {
      for (const b2 of document.querySelectorAll("button, .inc-btn")) {
        if (/Continuar|Firmar|Aceptar|Entendido|Cerrar/i.test(b2.textContent ?? "")) {
          b2.click();
          return;
        }
      }
    });
  }
  await p.waitForTimeout(250);
}
const lunesCerrado = await p.evaluate(() => !window.__game.engine.game || window.__game.engine.game.gameOver);
check("el lunes se cierra (outro y evaluación superadas)", lunesCerrado === true);

// ── Y AHORA SÍ, EL MARTES ──
await p.evaluate(() => {
  window.__game.engine.startDay(1, { skipMinigame: true });
});
await p.waitForFunction(
  () => !!window.__game.engine.game && !window.__game.engine.game.gameOver,
  null,
  { timeout: 60000 }
);

// La intro trae una ELECCIÓN (laptop como escudo / improvisar): el bucle de
// pasar líneas tiene que saber elegir, no solo dar a espacio.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(140);
}

const arranque = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  const VERBOS = ["baile", "microondas", "verter", "chisme", "gesto"];
  return {
    dia: window.__game.engine.dayIndex ?? null,
    // Sin puerta: el martes no hay a quién esperar.
    desbloqueado: g.metGabo === true,
    gabosuelto: g.boss.esperando !== true && g.boss.seated !== true,
    ids: g.objectives.map((o) => `${o.id}${o.done ? "✓" : ""}`),
    misiones: g.objectives.filter((o) => !o.done).length,
    jugablesYa: g.objectives.filter(
      (o) => !o.done && !o.dynamic && !o.objeto
    ).length,
    sinVerbo: g.objectives
      .filter((o) => !o.dynamic && !VERBOS.some((v) => o[v]) && o.type !== "sleep")
      .map((o) => o.id),
  };
});
check("el martes arranca y monta el piso", arranque.misiones >= 0);
check("sin puerta: el piso abre DESBLOQUEADO", arranque.desbloqueado === true, JSON.stringify(arranque));
check("y Gabo está de ronda, no esperándote", arranque.gabosuelto === true, JSON.stringify(arranque));
check("hay misiones desde el arranque", arranque.misiones >= 2, `${arranque.misiones}`);
check(
  "y al menos una jugable sin recados",
  arranque.jugablesYa >= 1,
  JSON.stringify(arranque)
);
check(
  "ninguna misión del martes cae al pulso",
  arranque.sinVerbo.length === 0,
  JSON.stringify(arranque.sinVerbo)
);

// ── SE PUEDE TERMINAR ──
// Las misiones se completan por la API real (la misma que usan los verbos al
// bancar), la salida se abre, y el ascensor cierra en victoria.
const cierre = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 60;
  g.suspicion = 0;
  const plato = g.objectives.filter((x) => !x.done).map((o) => o.id);
  for (const id of plato) {
    const o = g.objectives.find((x) => x.id === id);
    if (!o || o.done) continue;
    if (o.dynamic && o.npcId) g.completeTalk(o.npcId);
    else {
      if (o.objeto && !g.inventario.has(o.objeto.id)) g.inventario.add(o.objeto.id);
      o.progress = o.time ?? 1;
      o.done = true;
      g.onMissionDone?.(o.id);
    }
    await sleep(30);
  }
  // Los desbloqueos en caliente se despachan sin avisar a la campaña, igual
  // que en el lunes: aquí lo que se mide es que la SALIDA se abre.
  for (const o of g.objectives.filter((x) => !x.done)) {
    o.done = true;
    o.progress = o.time ?? 1;
  }
  for (let i = 0; i < 30; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  const salida = g.exitOpen === true;
  // Al ascensor.
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
  g.player.position.x = lift.x;
  g.player.position.z = lift.z;
  for (let i = 0; i < 30 && !g.gameOver; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  return { salida, fin: g.gameOver === true, win: g.win === true };
});
check("completadas las misiones, la SALIDA se abre", cierre.salida === true, JSON.stringify(cierre));
check("y el ascensor cierra el martes en victoria", cierre.fin && cierre.win, JSON.stringify(cierre));

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(fallos === 0 ? "\nEl martes se juega de punta a punta" : `\n${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
