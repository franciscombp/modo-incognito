/**
 * EL DÍA 3 SE JUEGA ENTERO, Y SU ESCALADA ES DE VERDAD.
 *
 * El miércoles llevaba escrito desde siempre y fuera del manifiesto — o sea,
 * sin que nadie lo jugara ni lo vigilara (PENDIENTES §2.2: «activar +
 * validar»). Al activarlo salieron DOS cosas que no fallaban en ningún sitio:
 *
 *  · VENÍA CON LA JORNADA DE OTRA ÉPOCA. 120 segundos, de cuando el día
 *    entero duraba eso, pero con CINCO objetivos en vez de los tres del
 *    lunes. Medido: la jornada se acababa a mitad de la peli, 5 misiones de
 *    9. No fallaba nada — el día simplemente se terminaba.
 *  · Y SU ESCALADA ERA DATO MUERTO. El día pide cupo de 2 amonestaciones, y
 *    el cupo lo pisaba SIEMPRE el personaje (los cuatro jugables declaran el
 *    suyo). Como los días publicados piden 3 y Fran también pide 3, no se
 *    notaba; pero toda la progresión de la campaña —el 3 pide 2, el 5 pide
 *    1— no se leía jamás.
 *
 * Las dos son invisibles a ojo y las dos convierten «activar un día» en
 * activar un día roto. De ahí esta prueba.
 *
 * Uso: npm run check:dia3   (necesita `npm run preview` en :4173)
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

// ── El miércoles está PUBLICADO ──
// Lo primero, porque todo lo demás depende de ello y porque es exactamente el
// paso que se olvida: el archivo puede estar perfecto y el juego no verlo.
const publicado = await p.evaluate(() => ({
  levels: (window.__game.data?.levels ?? []).map((l) => l.id),
}));
check(
  "el miércoles está en el manifiesto (si no, el juego ni lo ve)",
  publicado.levels.includes("dia-3"),
  JSON.stringify(publicado)
);

// ── PRIMERO SE VIVEN EL LUNES Y EL MARTES ──
//
// Saltar directo al miércoles con la partida virgen es mentirse, y la primera
// versión de esta prueba se lo tragó: la campaña reparte por CADENA
// (`requiere`), así que sin los días anteriores hechos el miércoles amanece
// con UNA misión y nada jugable. No es un fallo del día 3 — es que el día 3
// de verdad llega después de dos jornadas, y el check también tiene que
// llegar por ahí.
async function vivirDia(indice) {
  await p.evaluate((i) => {
    window.__game.engine.startDay(i, { skipMinigame: true });
  }, indice);
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
  // Se rinde SOLO el plato del amanecer, no la cadena entera: barrerla toda
  // completa la temporada en un día, la campaña ASCIENDE, y el día siguiente
  // amanece replayando desde el principio. Un día de verdad rinde lo que cabe
  // en su jornada. (Es la misma trampa que documenta `check:dia2`.)
  await p.evaluate(async () => {
    const g = window.__game.engine.game;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    g.setPaused(false);
    g.clearGate();
    g.saltarEscolta?.();
    g.boss.resetToPatrol();
    g.boss.position.x = g.player.position.x + 60;
    for (const id of g.objectives.filter((x) => !x.done).map((o) => o.id)) {
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
    // Lo desbloqueado en caliente se queda para mañana: sin `onMissionDone`,
    // la campaña no lo cuenta y el día siguiente amanece con plato.
    for (const o of g.objectives.filter((x) => !x.done)) {
      o.done = true;
      o.progress = o.time ?? 1;
    }
    const lift = window.__floorplan.areas.find((a) => a.kind === "elevator");
    g.player.position.x = lift.x;
    g.player.position.z = lift.z;
    for (let i = 0; i < 60 && !g.gameOver; i++) {
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
  });
  // El cierre encadena outro -> evaluación -> panel. Se pasa con teclas y
  // clics hasta que el panel ofrezca la jornada siguiente.
  for (let i = 0; i < 60; i++) {
    const listo = await p.evaluate(
      () =>
        [...document.querySelectorAll("button, .inc-btn")].some((b2) =>
          /Día \d|Siguiente jornada/i.test(b2.textContent ?? "")
        )
    );
    if (listo) break;
    if (await p.evaluate(() => window.__game.engine.dialogue.isOpen)) await p.keyboard.press("Space");
    else
      await p.evaluate(() => {
        for (const b2 of document.querySelectorAll("button, .inc-btn")) {
          if (/Continuar|Firmar|Aceptar|Entendido|Cerrar/i.test(b2.textContent ?? "")) {
            b2.click();
            return;
          }
        }
      });
    await p.waitForTimeout(250);
  }
}

await vivirDia(0);
await vivirDia(1);

// ── Y AHORA SÍ, EL MIÉRCOLES ──
await p.evaluate(() => {
  window.__game.engine.startDay(2, { skipMinigame: true });
});
await p.waitForFunction(
  () => !!window.__game.engine.game && !window.__game.engine.game.gameOver,
  null,
  { timeout: 60000 }
);
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
  const dia = (window.__game.data?.levels ?? []).find((l) => l.id === "dia-3");
  return {
    // Lo que el MOTOR está corriendo, no lo que el JSON pide: la diferencia
    // entre los dos es donde vivían los dos fallos.
    duration: g.rules.duration,
    maxWarnings: g.rules.maxWarnings,
    duracionDelLunes: (window.__game.data?.levels ?? [])[0]?.rules?.duration ?? null,
    cupoPedido: dia?.rules?.maxWarnings ?? null,
    bossSpeedMul: dia?.rules?.bossSpeedMul ?? null,
    desbloqueado: g.metGabo === true,
    misiones: g.objectives.filter((o) => !o.done).length,
    jugablesYa: g.objectives.filter((o) => !o.done && !o.dynamic && !o.objeto).length,
    sinVerbo: g.objectives
      .filter((o) => !o.dynamic && !VERBOS.some((v) => o[v]) && o.type !== "sleep")
      .map((o) => o.id),
  };
});

check("el miércoles arranca y monta el piso", arranque.misiones >= 0);
check("sin puerta: el piso abre DESBLOQUEADO", arranque.desbloqueado === true, JSON.stringify(arranque));
check("hay misiones desde el arranque", arranque.misiones >= 2, `${arranque.misiones}`);
check("y al menos una jugable sin recados", arranque.jugablesYa >= 1, JSON.stringify(arranque));
check(
  "ninguna misión del miércoles cae al pulso",
  arranque.sinVerbo.length === 0,
  JSON.stringify(arranque.sinVerbo)
);

// ── LA JORNADA DURA LO MISMO QUE LAS DEMÁS ──
// Es un invariante del motor (ver CLAUDE.md → los dos medidores: el reloj no
// se alarga ni se acorta), y es lo que estaba roto: un día guardado con la
// duración de otra época se activa y sale imposible sin que falle nada.
check(
  "la jornada del miércoles dura lo mismo que la del lunes",
  arranque.duration === arranque.duracionDelLunes,
  `miércoles ${arranque.duration}s · lunes ${arranque.duracionDelLunes}s`
);

// ── Y SU ESCALADA LLEGA AL MOTOR ──
// El día pide un cupo más corto que el del lunes. Si el personaje lo pisa,
// la progresión de la campaña no existe — que es como estaba.
check(
  "el cupo que pide el día LLEGA al motor (no lo pisa el personaje)",
  arranque.maxWarnings === arranque.cupoPedido,
  `el día pide ${arranque.cupoPedido} y el motor corre con ${arranque.maxWarnings}`
);
check(
  "y aprieta más que el lunes: menos cupo y el jefe más rápido",
  arranque.cupoPedido < 3 && arranque.bossSpeedMul > 1,
  JSON.stringify(arranque)
);

// ── SE PUEDE TERMINAR ──
// Las misiones se completan por la API real, la salida se abre, y el ascensor
// cierra en victoria. (Que se pueda terminar JUGANDO —andando, con el jefe
// suelto— lo mide `check:jugable --dia 2`, que es otra pregunta.)
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
  for (const o of g.objectives.filter((x) => !x.done)) {
    o.done = true;
    o.progress = o.time ?? 1;
  }
  for (let i = 0; i < 30; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  const salida = g.exitOpen === true;
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
check("y el ascensor cierra el miércoles en victoria", cierre.fin && cierre.win, JSON.stringify(cierre));

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl miércoles se juega entero, y aprieta más que el lunes de verdad"
    : `\n${fallos} fallo(s) en el día 3`
);
process.exit(fallos === 0 ? 0 : 1);
