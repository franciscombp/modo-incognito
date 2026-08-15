/**
 * VERTER — el primer minijuego DE PUNTERO.
 *
 * Los otros tres verbos son «mantén una tecla» o «pulsa un número»: se
 * pintan distintos pero el gesto es el mismo, y ninguno usa el ratón en un
 * ordenador ni el dedo en un teléfono. Este es un puzle de verter, y se
 * juega con las tres entradas.
 *
 * Lo que vigila, y se comprueba JUGÁNDOLO:
 *  1. La actividad que declara `verter` arranca SU puzle, no el pulso.
 *  2. Los vasos son PULSABLES de verdad y llevan su número.
 *  3. UN CLIC DE RATÓN de verdad (no una llamada al módulo) levanta el vaso.
 *     Es la mitad del encargo: si esto falla, el minijuego no se puede jugar
 *     con el ratón por mucho que el módulo funcione.
 *  4. El teclado hace lo mismo por la otra puerta.
 *  5. Verter bien EMPUJA la tarea; verter mal hace RUIDO y no rompe nada.
 *  6. El puntero de la pantalla se abre SOLO para esto: un panel a pantalla
 *     completa que se coma los clics rompe la cámara y los menús.
 *  7. Y no congela el mundo.
 *
 * Uso: npm run check:verter   (necesita `npm run preview` en :4173)
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
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

// ── Montaje: en la estación del puzle, con el jefe lejos y VINIENDO ──
const arranque = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  g.onHeatAlert = null;
  g.setPaused(false);
  g.clearGate();

  let st = g.objectives.find((o) => o.verter && !o.dynamic) ?? null;
  if (!st) {
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.verter);
    if (!base) return { error: "ninguna actividad declara `verter`" };
    st = { ...base, progress: 0, done: false };
    g.objectives.push(st);
  }
  // Sin el recado por delante: aquí se prueba el puzle, no el bucle v2.
  st.objeto = null;
  // Y A UN MOVIMIENTO DE RESOLVERSE (`mezclas: 1`). Lo que se comprueba aquí
  // es el PAGO —que dejar un vaso de un solo color empuje la tarea—, no si
  // el test sabe resolver un puzle: un solucionador greedy hace ping-pong
  // entre dos vasos para siempre y el resultado sería «no paga» cuando lo
  // que falla es el solucionador.
  st.verter = { ...st.verter, mezclas: 1 };
  st.progress = 0;
  st.done = false;
  st.encendida = false;
  window.__st = st;

  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 25 * S;
  g.boss.position.z = st.z;
  g.suspicion = Math.max(g.suspicion, g.boss.chaseSuspicionFloor + 5);
  g.boss.suspicion = g.suspicion;
  g.boss.startChase();
  window.__bossX0 = g.boss.position.x;

  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 16; i++) {
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    g.update(1 / 60);
  }
  return {
    id: st.id,
    verterActivo: g.verter.active,
    pulsoActivo: g.pulse.active,
    gestoActivo: g.gesture.active,
    congelado: g.worldFrozen,
  };
});

if (arranque.error) {
  check("hay una actividad que juegue a verter", false, arranque.error);
} else {
  check(
    "la actividad de verter arranca SU puzle, no el pulso ni el gesto",
    arranque.verterActivo === true &&
      arranque.pulsoActivo === false &&
      arranque.gestoActivo === false,
    JSON.stringify(arranque)
  );

  // ── Los vasos, en pantalla y pulsables ──
  await p.waitForTimeout(400);
  const vasos = await p.$$(".inc-vaso");
  const numeros = await p.evaluate(() =>
    [...document.querySelectorAll(".inc-vaso")].map((v) => v.dataset.n)
  );
  check(
    "los vasos se pintan y llevan su número",
    vasos.length >= 3 && numeros[0] === "1" && numeros.every((n) => n),
    JSON.stringify({ vasos: vasos.length, numeros })
  );

  // ── 1 · EL RATÓN. Un clic de verdad, no una llamada al módulo ──
  await vasos[0].click();
  await p.waitForTimeout(150);
  const trasClic = await p.evaluate(() => window.__game.engine.game.verter.snapshot()?.elegido);
  check(
    "UN CLIC DE RATÓN levanta el vaso",
    trasClic === 0,
    `elegido tras el clic: ${trasClic}`
  );

  // ── 2 · EL TECLADO, por la otra puerta ──
  await p.evaluate(() => window.__game.engine.game.verter.elegir(0)); // soltar
  await p.keyboard.press("2");
  await p.waitForTimeout(120);
  const trasTecla = await p.evaluate(() => window.__game.engine.game.verter.snapshot()?.elegido);
  check("y la tecla 2 hace lo mismo", trasTecla === 1, `elegido tras la tecla: ${trasTecla}`);

  // ── 3 · Verter bien empuja; verter mal hace ruido y no rompe nada ──
  const jugado = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const st = window.__st;
    const v = () => g.verter.snapshot();
    // Se busca un trasvase LEGAL leyendo el estado, no adivinando.
    const legal = () => {
      const s = v();
      for (let a = 0; a < s.vasos.length; a++) {
        if (!s.vasos[a].length) continue;
        const color = s.vasos[a][s.vasos[a].length - 1];
        for (let bq = 0; bq < s.vasos.length; bq++) {
          if (bq === a) continue;
          const d = s.vasos[bq];
          if (d.length < s.capacidad && (!d.length || d[d.length - 1] === color)) return [a, bq];
        }
      }
      return null;
    };
    // Y uno ILEGAL: colores que no pegan.
    const ilegal = () => {
      const s = v();
      for (let a = 0; a < s.vasos.length; a++) {
        if (!s.vasos[a].length) continue;
        const color = s.vasos[a][s.vasos[a].length - 1];
        for (let bq = 0; bq < s.vasos.length; bq++) {
          if (bq === a) continue;
          const d = s.vasos[bq];
          if (d.length && d[d.length - 1] !== color) return [a, bq];
        }
      }
      return null;
    };

    // ILEGAL primero: no debe tocar el progreso, sí la sospecha.
    g.verter.soltar();
    const par = ilegal();
    const susAntes = g.suspicion;
    const progAntes = st.progress;
    let resultadoIlegal = null;
    if (par) {
      g.verter.elegir(par[0]);
      resultadoIlegal = g.verter.elegir(par[1]);
    }
    const susDespues = g.suspicion;
    const progTrasIlegal = st.progress;

    // EL QUE RESUELVE UN VASO. Con `mezclas: 1` hay exactamente uno, y es el
    // que tiene que pagar. Un greedy de «primer movimiento legal» haría
    // ping-pong entre dos vasos sin resolver nada.
    g.verter.soltar();
    const antesDeVerter = st.progress;
    const resueltos0 = v().resueltos;
    let vertidos = 0;
    for (let i = 0; i < 30; i++) {
      const s = v();
      let elegido = null;
      for (let a = 0; a < s.vasos.length && !elegido; a++) {
        if (!s.vasos[a].length) continue;
        // NO SE MUEVE UN VASO YA RESUELTO. Verter uno lleno y uniforme a otro
        // vacío lo deja igual de resuelto, así que el contador no cambia y el
        // bucle se queda haciendo ping-pong entre esos dos para siempre —
        // que es exactamente lo que pasaba.
        const uniforme = s.vasos[a].every((c) => c === s.vasos[a][0]);
        if (uniforme && s.vasos[a].length === s.capacidad) continue;
        const color = s.vasos[a][s.vasos[a].length - 1];
        for (let bq = 0; bq < s.vasos.length; bq++) {
          if (bq === a) continue;
          const d = s.vasos[bq];
          if (d.length >= s.capacidad) continue;
          if (d.length && d[d.length - 1] !== color) continue;
          // Solo el que DEJA un vaso resuelto.
          const iguales = s.vasos[a].slice().reverse().findIndex((c) => c !== color);
          const nCap = iguales === -1 ? s.vasos[a].length : iguales;
          // Y el destino tiene que TENER algo del mismo color: verter en un
          // vaso vacío nunca resuelve nada nuevo.
          if (d.length && d.length + nCap === s.capacidad && d.every((c) => c === color)) {
            elegido = [a, bq];
            break;
          }
        }
      }
      if (!elegido) break;
      g.verter.elegir(elegido[0]);
      if (g.verter.elegir(elegido[1]) === "vertido") vertidos++;
      g.update(1 / 60);
    }

    return {
      resultadoIlegal,
      ruido: susDespues > susAntes,
      progresoIntacto: Math.abs(progTrasIlegal - progAntes) < 0.001,
      vertidos,
      antesDeVerter: +antesDeVerter.toFixed(2),
      resueltos0,
      progreso: +st.progress.toFixed(2),
      time: st.time,
      resueltos: v()?.resueltos ?? 0,
    };
  });
  check(
    "un trasvase ILEGAL hace ruido",
    jugado.resultadoIlegal === "ilegal" && jugado.ruido === true,
    JSON.stringify(jugado)
  );
  check(
    "y no te quita lo que llevabas hecho",
    jugado.progresoIntacto === true,
    JSON.stringify(jugado)
  );
  check(
    "resolver un vaso EMPUJA la tarea",
    jugado.vertidos > 0 && jugado.progreso > jugado.antesDeVerter,
    JSON.stringify(jugado)
  );

  // ── 4 · El puntero, y el mundo ──
  const pantalla = await p.evaluate(() => {
    const cap = document.querySelector(".inc-mg");
    return {
      abierta: !!cap?.classList.contains("on"),
      puntero: !!cap?.classList.contains("puntero"),
      eventos: cap ? getComputedStyle(cap).pointerEvents : null,
      acecho: !!document.querySelector(".inc-mg-acecho")?.classList.contains("on"),
      bossAndó: Math.abs(window.__game.engine.game.boss.position.x - window.__bossX0) > 0.01,
      congelado: window.__game.engine.game.worldFrozen,
    };
  });
  check(
    "el puntero se abre SOLO para este minijuego",
    pantalla.puntero === true && pantalla.eventos === "auto",
    JSON.stringify(pantalla)
  );
  check(
    "se juega a pantalla completa y con el acecho dentro",
    pantalla.abierta === true && pantalla.acecho === true,
    JSON.stringify(pantalla)
  );
  check(
    "y no congela el mundo: el jefe sigue viniendo",
    pantalla.congelado === false && pantalla.bossAndó === true,
    JSON.stringify(pantalla)
  );

  // ── 5 · Al soltar, el puntero se cierra otra vez ──
  const soltado = await p.evaluate(() => {
    const g = window.__game.engine.game;
    g.player.keys.delete(" ");
    for (let i = 0; i < 40; i++) g.update(1 / 60);
    const cap = document.querySelector(".inc-mg");
    return {
      activo: g.verter.active,
      puntero: !!cap?.classList.contains("puntero"),
    };
  });
  check(
    "soltar cierra el puzle Y devuelve los clics al juego",
    soltado.activo === false && soltado.puntero === false,
    JSON.stringify(soltado)
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl café se sirve con el ratón, con el dedo o con las teclas — y Gabo viene igual"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
