/**
 * LOS SEIS VERBOS, CON LOS TRES MANDOS. La matriz que faltaba.
 *
 * ── Por qué una matriz y no seis pruebas sueltas ──
 *
 * Cada verbo tiene ya su comprobación, y cada una mira UN mando: `check:verter`
 * hace un clic de ratón, `check:microondas` un arrastre de ratón,
 * `check:mandos` el teclado y el cursor sobre la tarjeta del chisme,
 * `check:baile-pulgar` la palanca sobre el baile. Nadie preguntaba lo otro:
 * ¿se puede jugar el chisme CON EL DEDO? ¿el microondas CON LA PALANCA? ¿el
 * pulso en un teléfono?
 *
 * Y esa pregunta no se responde mirando: un minijuego se ve idéntico se pueda
 * tocar o no. La primera vez que se miró en serio salió justo eso — las
 * preguntas del Parce eran `<span>` dentro de una pantalla `pointer-events:
 * none`, o sea solo jugables con 1-3, que en un teléfono no existen.
 *
 * ── Cómo se mide ──
 *
 * Cada verbo tiene UNA puerta de entrada (es el contrato del registro:
 * `pulsar`, `elegir`, `responder`, `poner`, `hit`). Se ENVUELVE esa puerta y
 * se cuenta si la cruzó algo. Así la prueba mide el CABLEADO —que el toque
 * llegue— y no la lógica del verbo, que ya tiene su prueba.
 *
 * Los tres mandos, y qué es real en cada uno:
 *  · TECLADO — teclas de verdad (`keyboard.press`).
 *  · DEDO — toques de verdad sobre el elemento (`touchscreen.tap`), en un
 *    contexto móvil con `hasTouch`.
 *  · PALANCA — el stick EN PANTALLA, arrastrado con el dedo. Es la misma
 *    puerta por la que entra un mando físico (`focusNav.empujar` y
 *    `player.touchAxis`), que Playwright no puede emular: se dice aquí para
 *    no dar por probado un mando que no se enchufó.
 *
 * Uso: npm run check:verbos-mandos   (necesita `npm run preview` en :4173)
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const ctx = await b.newContext({ ...devices["Pixel 7"], isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

// TOQUES DE VERDAD, no `PointerEvent` a mano. Un evento sintético no tiene
// puntero activo detrás, así que `setPointerCapture` —que es lo que usan el
// microondas y la palanca para no soltar el gesto al salirse del elemento—
// tira `NotFoundError`, y entonces la prueba estaría midiendo su propio
// montaje. CDP dispara toques que el navegador trata como toques.
const cdp = await ctx.newCDPSession(p);
async function arrastrarDedo(x0, y0, x1, y1, pasos = 6) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: x0, y: y0, id: 1 }],
  });
  for (let i = 1; i <= pasos; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x0 + ((x1 - x0) * i) / pasos, y: y0 + ((y1 - y0) * i) / pasos, id: 1 }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.setViewportSize({ width: 915, height: 412 });
await p.waitForTimeout(700);
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(130);
}
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  g.saltarEscolta?.();
  g.onHeatAlert = null;
});
await p.waitForTimeout(400);

/**
 * Plantarse en la estación de un verbo con el jefe lejos y el recado en el
 * bolsillo. Lo que se viene a medir es el MANDO, así que todo lo que pueda
 * interrumpir —la caza, la sospecha, un objeto que falta— se aparta: si no,
 * un fallo diría «me atraparon», que no dice nada de si el dedo llega.
 */
/**
 * ABRIR UNA ESTACIÓN EXIGE QUE SEA MISIÓN. Plantarse encima no basta:
 * `nearStation` se busca entre los objetivos ACTIVOS, no entre todas las
 * estaciones del piso — que es lo correcto (no se trabaja en algo que nadie
 * te ha pedido), pero significa que el chisme y el microondas, encadenados
 * detrás de otras misiones, no se pueden abrir el primer minuto.
 *
 * Así que primero se DESBLOQUEA la cadena rindiendo lo que haya abierto,
 * hasta que el verbo que se viene a probar aparezca. Es montaje, no lo que se
 * mide: sin esto la prueba concluía «el chisme no abre» con la mesa ahí.
 */
async function desbloquear(campo, reservados = []) {
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const hay = await p.evaluate((c) => window.__game.engine.game.objectives.some((o) => o[c] && !o.done), campo);
    if (hay) return true;
    // SE RESERVAN LOS VERBOS QUE FALTAN POR PROBAR. Rindiendo todo lo pendiente
    // a lo bruto, desbloquear el chisme se llevaba por delante la comida — y
    // el microondas llegaba a su turno sin misión que abrir. El fallo se leía
    // como «el microondas no abre», y el microondas estaba perfecto.
    const quedan = await p.evaluate(
      (res) => {
        const g = window.__game.engine.game;
        const pend = g.objectives.filter(
          (o) => !o.done && !res.some((v) => o[v])
        );
        if (!pend.length) return 0;
        for (const o of pend) {
          if (o.dynamic && o.npcId) g.completeTalk(o.npcId);
          else {
            if (o.objeto && !g.inventario.has(o.objeto.id)) g.inventario.add(o.objeto.id);
            o.progress = o.time ?? 1;
            o.done = true;
            g.onMissionDone?.(o.id);
          }
        }
        return pend.length;
      },
      reservados
    );
    if (!quedan) return false;
    await p.waitForTimeout(250);
  }
  return false;
}

/**
 * CERRAR UN VERBO DE VERDAD ANTES DE PROBAR EL SIGUIENTE. No basta con
 * `end()`: al salir a mano queda un PESTILLO (`_salidaManual`) que dura hasta
 * que sueltas la tecla o te MUEVES, y la estación sigue siendo la de al lado,
 * así que el verbo siguiente no llegaba a abrirse. Medido: el microondas
 * abría perfectamente solo y fallaba detrás de los otros tres.
 */
async function cerrarVerbo(campo) {
  await p.evaluate((c) => {
    const g = window.__game.engine.game;
    const id = window.__VERBO_ID[c];
    g.player.keys.delete(" ");
    g[id]?.end?.();
    // Apartarse: es lo que suelta el pestillo y limpia `nearStation`.
    g.player.position.x += 40;
  }, campo);
  await p.waitForTimeout(500);
}

async function abrirVerbo(campo, reservados = []) {
  await desbloquear(campo, reservados);
  const listo = await p.evaluate((c) => {
    const g = window.__game.engine.game;
    // La estación sale de `_allStations`, la lista COMPLETA del piso — no de
    // `objectives`, que es lo que la campaña tiene abierto AHORA. El chisme y
    // el microondas están encadenados detrás de otras misiones, así que
    // buscándolos entre los objetivos del amanecer no aparecen y la prueba
    // concluía «ninguna estación juega a chisme» con la cafetera ahí puesta.
    const st =
      g.objectives.find((o) => o[c] && !o.done) ?? (g._allStations ?? []).find((a) => a[c]);
    if (!st) return { ok: false, motivo: `ninguna estación juega a "${c}"` };
    g.boss.resetToPatrol();
    g.boss.position.x = st.x + 80;
    g.suspicion = 0;
    g.boss.suspicion = 0;
    if (st.objeto && !g.inventario.has(st.objeto.id)) g.inventario.add(st.objeto.id);
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    g.player.keys.add(" ");
    return { ok: true, id: st.id };
  }, campo);
  if (!listo.ok) return listo;
  // Por ESTADO y con evaluates sueltos: en el contexto móvil emulado
  // `waitForFunction` ha llegado a decir que no durante quince segundos
  // mientras un evaluate justo después veía el verbo abierto (ver
  // `check:baile-pulgar`). Aquí se cree solo al evaluate.
  for (let i = 0; i < 50; i++) {
    const abierto = await p.evaluate(
      (c) => {
        const g = window.__game.engine.game;
        const id = window.__VERBO_ID[c];
        return g?.[id]?.active === true;
      },
      campo
    );
    if (abierto) return { ok: true, id: listo.id };
    await p.waitForTimeout(250);
  }
  // Un «no abrió» a secas no sirve de nada: lo que hace falta saber es si la
  // estación es misión, si estás encima, si llevas el recado y si el día sigue
  // vivo. Sin esto, cada fallo de aquí cuesta media hora de sondas.
  const porQue = await p.evaluate((c) => {
    const g = window.__game.engine.game;
    const st = g.objectives.find((o) => o[c] && !o.done) ?? (g._allStations ?? []).find((a) => a[c]);
    return {
      estacion: st?.id ?? null,
      esMision: g.objectives.some((o) => o.id === st?.id && !o.done),
      near: g.nearStation?.id ?? null,
      focus: g.focusStation?.id ?? null,
      llevoElRecado: st?.objeto ? g.inventario.has(st.objeto.id) : true,
      teclaPuesta: g.player.keys.has(" "),
      distancia: st ? +Math.hypot(st.x - g.player.position.x, st.z - g.player.position.z).toFixed(1) : null,
      gameOver: !!g.gameOver,
      relojLeft: Math.round(g.timeLeft),
      pausado: !!g.paused,
      otroVerbo: ["baile", "verter", "chisme", "microondas", "gesture", "pulse"].filter(
        (v) => g[v]?.active
      ),
    };
  }, campo);
  return { ok: false, motivo: "no abrió en 12 s", porQue };
}

/** Envolver la puerta de entrada del verbo y contar quién la cruza. */
async function espiar(campo, metodo) {
  await p.evaluate(
    ({ c, m }) => {
      const g = window.__game.engine.game;
      const id = window.__VERBO_ID[c];
      const mod = g[id];
      window.__CRUCES = 0;
      if (!mod || typeof mod[m] !== "function") return;
      if (!mod.__original) mod.__original = mod[m].bind(mod);
      mod[m] = (...args) => {
        window.__CRUCES++;
        return mod.__original(...args);
      };
    },
    { c: campo, m: metodo }
  );
}
const cruces = () => p.evaluate(() => window.__CRUCES ?? 0);

// La tabla `campo -> instancia` sale del registro del motor, no de aquí: una
// lista escrita a mano en `tools/` es justo lo que se quedó vieja cuando los
// verbos pasaron de dos a seis.
await p.evaluate(() => {
  window.__VERBO_ID = {
    baile: "baile",
    microondas: "microondas",
    verter: "verter",
    chisme: "chisme",
    gesto: "gesture",
  };
});

// EL ORDEN DE LOS VERBOS ES EL DE LA CADENA, y no es cosmético: para abrir
// un verbo hay que desbloquearlo rindiendo lo que va antes, así que probar el
// chisme antes que los vasos RINDE el café por el camino y luego los vasos ya
// no se pueden abrir. Se recorren en el orden en que la temporada los ofrece:
// estirarse (baile), café (vasos), chisme, comida (microondas).
// ═══ EL BAILE ═══════════════════════════════════════════════════════════
{
  const abierto = await abrirVerbo("baile", ["verter", "chisme", "microondas"]);
  check("el BAILE abre su pantalla", abierto.ok === true, JSON.stringify(abierto));
  if (abierto.ok) {
    // Teclado: las flechas.
    await espiar("baile", "pulsar");
    await p.keyboard.press("ArrowUp");
    await p.waitForTimeout(200);
    check("  · el baile responde al TECLADO (flechas)", (await cruces()) > 0);

    // Dedo: la cruceta en pantalla.
    await espiar("baile", "pulsar");
    const pad = await p.locator(".inc-baile-pad").first();
    if (await pad.count()) {
      const caja = await pad.boundingBox();
      if (caja) await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
    }
    await p.waitForTimeout(250);
    check("  · y al DEDO (la cruceta en pantalla)", (await cruces()) > 0);

    // Palanca: un empujón del stick.
    await espiar("baile", "pulsar");
    const zona = await p.locator(".touch-stick-base").boundingBox();
    if (zona) {
      const cx = zona.x + zona.width / 2;
      const cy = zona.y + zona.height / 2;
      await arrastrarDedo(cx, cy, cx, cy - 70);
    }
    await p.waitForTimeout(250);
    check("  · y a la PALANCA (un empujón es un paso)", (await cruces()) > 0);
  }
  await cerrarVerbo("baile");
}

// ═══ LOS VASOS ══════════════════════════════════════════════════════════
{
  const abierto = await abrirVerbo("verter", ["chisme", "microondas"]);
  check("VERTER abre su puzle", abierto.ok === true, JSON.stringify(abierto));
  if (abierto.ok) {
    await espiar("verter", "elegir");
    await p.keyboard.press("1");
    await p.waitForTimeout(200);
    check("  · los vasos responden al TECLADO (1-5)", (await cruces()) > 0);

    await espiar("verter", "elegir");
    const vaso = p.locator(".inc-vaso").first();
    if (await vaso.count()) {
      const caja = await vaso.boundingBox();
      if (caja) await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
    }
    await p.waitForTimeout(250);
    check("  · y al DEDO (los vasos son <button> justo para esto)", (await cruces()) > 0);
  }
  await cerrarVerbo("verter");
}

// ═══ EL CHISME ══════════════════════════════════════════════════════════
{
  const abierto = await abrirVerbo("chisme", ["microondas"]);
  check("el CHISME abre su tarjeta", abierto.ok === true, JSON.stringify(abierto));
  if (abierto.ok) {
    await espiar("chisme", "responder");
    await p.keyboard.press("1");
    await p.waitForTimeout(200);
    check("  · el chisme responde al TECLADO (1-3)", (await cruces()) > 0);

    await espiar("chisme", "responder");
    const op = p.locator(".inc-chisme-opt").first();
    if (await op.count()) {
      const caja = await op.boundingBox();
      if (caja) await p.touchscreen.tap(caja.x + caja.width / 2, caja.y + caja.height / 2);
    }
    await p.waitForTimeout(250);
    check("  · y al DEDO (sus opciones son botones, no texto muerto)", (await cruces()) > 0);
  }
  await cerrarVerbo("chisme");
}

// ═══ EL MICROONDAS ══════════════════════════════════════════════════════
{
  const abierto = await abrirVerbo("microondas");
  check("el MICROONDAS abre su caja", abierto.ok === true, JSON.stringify(abierto));
  if (abierto.ok) {
    // El verbo de ARRASTRE: con el dedo es su gesto natural.
    await espiar("microondas", "poner");
    const caja = await p.locator(".inc-micro-caja").first().boundingBox();
    if (caja) {
      const cx = caja.x + caja.width / 2;
      const cy = caja.y + caja.height / 2;
      await arrastrarDedo(cx - 10, cy - 8, cx + 14, cy + 10);
    }
    await p.waitForTimeout(250);
    check("  · el microondas responde al DEDO (arrastre)", (await cruces()) > 0);

    // Y sin puntero: el mando de andar lo empuja (es lo que documenta el
    // registro — `bloqueaPaso` deja libre ese eje justo para esto).
    const antes = await p.evaluate(() => {
      const s = window.__game.engine.game.microondas.snapshot();
      return { x: s?.x ?? null, y: s?.y ?? null };
    });
    await p.keyboard.down("ArrowRight");
    await p.waitForTimeout(500);
    await p.keyboard.up("ArrowRight");
    const despues = await p.evaluate(() => {
      const s = window.__game.engine.game.microondas.snapshot();
      return { x: s?.x ?? null, y: s?.y ?? null };
    });
    check(
      "  · y al TECLADO sin puntero (el mando de andar empuja el plato)",
      antes.x !== null && despues.x !== null && (antes.x !== despues.x || antes.y !== despues.y),
      `${JSON.stringify(antes)} -> ${JSON.stringify(despues)}`
    );
  }
  await cerrarVerbo("microondas");
}

// ═══ EL BOTÓN DE ACCIÓN, que es el mando de TODO lo demás ═══════════════
// El pulso y el gesto no tienen puerta propia: se juegan sosteniendo la
// acción. En un teléfono esa acción es UN botón, así que si ese botón no
// llega al motor, dos verbos enteros son injugables con el dedo.
{
  const bb = await p.locator(".touch-btn-interact").boundingBox();
  check("el botón de acción EXISTE en táctil", !!bb, JSON.stringify(bb));
  if (bb) {
    await p.evaluate(() => {
      window.__game.engine.game.player.keys.delete(" ");
    });
    await p.waitForTimeout(150);
    // ES UN BOTÓN DE MANTENER: pone la tecla en `pointerdown` y la quita en
    // `pointerup`. Un `tap` hace las dos cosas, así que medir DESPUÉS del tap
    // siempre da «no pulsado» — y eso no es un fallo del botón, es la prueba
    // preguntando tarde. Se sostiene, se mira, y se suelta.
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    await p.evaluate(
      ({ cx, cy }) => {
        const btn = document.querySelector(".touch-btn-interact");
        btn.dispatchEvent(
          new PointerEvent("pointerdown", { clientX: cx, clientY: cy, pointerId: 7, bubbles: true, isPrimary: true })
        );
      },
      { cx, cy }
    );
    await p.waitForTimeout(120);
    const pulsado = await p.evaluate(() => window.__game.engine.game.player.keys.has(" "));
    check("  · y MANTENERLO sostiene la acción en el motor", pulsado === true);
    await p.evaluate(
      ({ cx, cy }) => {
        const btn = document.querySelector(".touch-btn-interact");
        btn.dispatchEvent(
          new PointerEvent("pointerup", { clientX: cx, clientY: cy, pointerId: 7, bubbles: true, isPrimary: true })
        );
      },
      { cx, cy }
    );
    await p.waitForTimeout(120);
    const soltado = await p.evaluate(() => window.__game.engine.game.player.keys.has(" ") === false);
    check("  · y soltarlo la suelta (si no, la tarea se queda encendida sola)", soltado === true);
  }
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLos verbos se juegan con teclado, con el dedo y con la palanca"
    : `\n${fallos} fallo(s): hay un verbo al que no se llega con algún mando`
);
process.exit(fallos === 0 ? 0 : 1);
