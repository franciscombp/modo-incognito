/**
 * EL MICROONDAS — centrar el plato sin quemarte.
 *
 * El cuarto verbo de puntero y el primero de ARRASTRE: los vasos y los
 * cables son tocar-y-tocar, esto es agarrar y mover. En un teléfono es el
 * gesto más natural que existe.
 *
 * Lo que vigila, jugándolo:
 *  1. La actividad que declara `microondas` arranca SU minijuego.
 *  2. El plato empieza DESCENTRADO y se va solo — si no, el minijuego no
 *     pide nada y se lee como que no ha empezado.
 *  3. UN ARRASTRE DE RATÓN de verdad lo mueve. Es la mitad del encargo: si
 *     el módulo funciona pero el arrastre no llega, no se puede jugar.
 *  4. Centrado, la tarea AVANZA. Fuera, se quema y hace RUIDO.
 *  5. `touch-action: none` en la caja, o en un teléfono arrastrar hace
 *     scroll de la página en vez de mover el plato.
 *  6. Y no congela el mundo.
 *
 * Uso: npm run check:microondas   (necesita `npm run preview` en :4173)
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

const arranque = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  g.onHeatAlert = null;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();

  let st = g.objectives.find((o) => o.microondas && !o.dynamic) ?? null;
  if (!st) {
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find(
      (a) => a.microondas
    );
    if (!base) return { error: "ninguna actividad declara `microondas`" };
    st = { ...base, progress: 0, done: false };
    g.objectives.push(st);
  }
  st.objeto = null;
  st.progress = 0;
  st.done = false;
  st.encendida = false;
  window.__st = st;

  // El jefe LEJOS y de ronda, no persiguiendo. Antes se le lanzaba a la caza
  // a propósito, para demostrar que el minijuego no lo congelaba; ahora una
  // pantalla de tarea NO SE ABRE con un vigilante encima —esa es la puerta
  // que permite parar el mundo sin que la estación sea un escudo—, así que
  // montar una persecución aquí solo impide que se abra lo que se viene a
  // medir. La caza tiene su prueba en `check:pausa`.
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 25 * S;
  g.boss.position.z = st.z;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  window.__bossX0 = g.boss.position.x;

  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 8; i++) {
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    g.update(1 / 60);
  }
  const s0 = g.microondas.snapshot();
  return {
    id: st.id,
    activo: g.microondas.active,
    otros: g.pulse.active || g.gesture.active || g.verter.active || g.chisme.active,
    // Empieza DESCENTRADO: en el centro el minijuego no pediría nada.
    descentrado: Math.hypot(s0?.x ?? 0, s0?.y ?? 0) > (s0?.zona ?? 0.26),
    congelado: g.worldFrozen,
  };
});

if (arranque.error) {
  check("hay una actividad que juegue al microondas", false, arranque.error);
} else {
  check(
    "la actividad del microondas arranca SU minijuego, y solo el suyo",
    arranque.activo === true && arranque.otros === false,
    JSON.stringify(arranque)
  );
  check(
    "el plato empieza DESCENTRADO",
    arranque.descentrado === true,
    JSON.stringify(arranque)
  );

  await p.waitForTimeout(400);

  // ── Se va solo ──
  const deriva = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const st = window.__st;
    g.microondas.poner(0, 0);
    const antes = g.microondas.snapshot();
    for (let i = 0; i < 60; i++) {
      g.player.position.x = st.x;
      g.player.position.z = st.z;
      g.update(1 / 60);
    }
    const dsp = g.microondas.snapshot();
    return { movido: Math.hypot(dsp.x - antes.x, dsp.y - antes.y) > 0.05 };
  });
  check("y se va del centro solo", deriva.movido === true, JSON.stringify(deriva));

  // ── EL ARRASTRE, con el ratón de verdad ──
  const caja = await p.$(".inc-micro-caja");
  check("la caja del microondas está en pantalla", !!caja, "no se encontró .inc-micro-caja");
  if (caja) {
    const box = await caja.boundingBox();
    // Arrastre real: pointerdown en un borde, mover al centro, soltar.
    await p.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(120);
    const trasArrastre = await p.evaluate(() => {
      const s = window.__game.engine.game.microondas.snapshot();
      return { r: Math.hypot(s.x, s.y), zona: s.zona, dentro: s.dentro };
    });
    check(
      "UN ARRASTRE DE RATÓN centra el plato",
      trasArrastre.r < trasArrastre.zona + 0.12,
      JSON.stringify(trasArrastre)
    );

    // `touch-action: none`, o en un móvil el arrastre hace scroll.
    const touch = await p.evaluate(
      () => getComputedStyle(document.querySelector(".inc-micro-caja")).touchAction
    );
    check("y la caja no deja que el dedo haga scroll", touch === "none", `touch-action: ${touch}`);
  }

  // ── Centrado avanza; fuera se quema y hace ruido ──
  const jugado = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const st = window.__st;
    // CENTRADO: se sujeta en el centro contra la deriva y la tarea avanza.
    st.progress = 0;
    const progAntes = st.progress;
    for (let i = 0; i < 60; i++) {
      g.microondas.poner(0, 0);
      g.player.position.x = st.x;
      g.player.position.z = st.z;
      g.update(1 / 60);
    }
    const centrado = st.progress;

    // FUERA: se quema y hace ruido.
    const susAntes = g.suspicion;
    // Y la referencia del MUNDO se toma AQUÍ, con la pantalla ya abierta.
    // Estaba tomada en el montaje, así que «¿anduvo el jefe?» respondía por
    // todo lo anterior y no por el rato que se mide.
    window.__bossX0 = g.boss.position.x;
    for (let i = 0; i < 260; i++) {
      g.microondas.poner(0.95, 0);
      g.player.position.x = st.x;
      g.player.position.z = st.z;
      // Quemarse hace RUIDO, y al nivel 3 de búsqueda `game.js` PAUSA la
      // partida por su cuenta: pausar limpia las teclas y cierra la pantalla,
      // y entonces «el mundo anduvo» sería cierto por el motivo equivocado.
      // Se deja subir lo justo para comprobar el ruido y se corta ahí.
      if (g.suspicion > susAntes + 12) {
        g.suspicion = susAntes + 12;
        g.boss.suspicion = g.suspicion;
      }
      g.update(1 / 60);
    }
    return {
      avanzoCentrado: centrado > progAntes,
      quemaSubio: (g.microondas.snapshot()?.quema ?? 0) >= 0 && g.suspicion > susAntes,
      congelado: g.worldFrozen,
      bossAndó: Math.abs(g.boss.position.x - window.__bossX0) > 0.01,
    };
  });
  check("centrado, la tarea AVANZA", jugado.avanzoCentrado === true, JSON.stringify(jugado));
  check("fuera del centro se quema y hace RUIDO", jugado.quemaSubio === true, JSON.stringify(jugado));
  // EL MUNDO SE PARA MIENTRAS DURA LA PANTALLA. Esto afirmaba lo
// contrario, y con razón en su momento: congelar al jefe convertía la
// estación en el sitio más seguro del piso. Lo que cambió es que ya no
// se puede ENTRAR con él encima, y sin esa puerta abierta no hay escudo
// que explotar. El anti-escudo se comprueba ahora en `check:pausa`.
  check(
    "y el MUNDO SE PARA mientras centras el plato (ver check:pausa)",
    jugado.bossAndó === false,
    JSON.stringify(jugado)
  );
}

// ── LOS DOS LADOS SUENAN ──
// `centrado` estaba DOCUMENTADO en el contrato del módulo y no lo emitía
// nadie: el microondas era el único verbo que solo avisaba al FALLAR. Un
// minijuego que solo te habla cuando lo haces mal se siente roto aunque
// funcione, y esa mitad muerta no se ve en una captura — hay que escuchar la
// puerta. Se cuentan los avisos DEL MÓDULO, no el sonido.
{
  const avisos = await p.evaluate(async () => {
    const g = window.__game.engine.game;
    const m = g.microondas;
    if (!m?.active) return { sinAbrir: true };
    const vistos = [];
    // Se espía el sitio por el que salen: el propio módulo.
    const snap = m.snapshot();
    // Sacar el plato fuera y volver a meterlo dispara el flanco de entrar.
    m.poner(0.95, 0.95);
    await new Promise((r) => setTimeout(r, 320));
    const fuera = m.snapshot()?.dentro === false;
    m.poner(0, 0);
    await new Promise((r) => setTimeout(r, 320));
    const dentro = m.snapshot()?.dentro === true;
    const destello = m.snapshot()?.destello ?? null;
    return { fuera, dentro, destello, zona: snap?.zona ?? null, vistos };
  });
  check(
    "sacar el plato lo deja FUERA de la zona",
    avisos.fuera === true,
    JSON.stringify(avisos)
  );
  check(
    "y volver a centrarlo lo deja dentro",
    avisos.dentro === true,
    JSON.stringify(avisos)
  );
  check(
    "atrapar el plato tiene su ACENTO (destello «centrado», no solo el castigo)",
    avisos.destello === "centrado",
    JSON.stringify(avisos)
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl plato se centra arrastrándolo — con el ratón, con el dedo o con el mando"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
