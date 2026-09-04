/**
 * EL BAILE — estirarse con las cuatro flechas.
 *
 * Estirarse jugaba al PULSO: la misma tira genérica de media docena de
 * tareas, y encima la que peor contaba lo que estás haciendo — nadie se
 * estira apretando un botón en el momento justo. Se leía como un medidor.
 *
 * Lo que se comprueba aquí es lo que hace que sea un BAILE y no una lista de
 * teclas: que el compás corre solo, que acertar empuja y fallar hace ruido,
 * que las cuatro flechas llegan de verdad desde el teclado, y que el cursor
 * de menús no se las roba — que es el choque obvio de meter flechas en una
 * pantalla llena de botones.
 *
 * Uso: npm run check:baile   (necesita `npm run preview` en :4173)
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
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

// Ponerse a estirar, y quedarse ahí. `player.update` vive en el bucle de
// dibujo de main.js, no en `game.update`: sin llamarlo a mano la jugadora no
// se mueve y media comprobación pasaría sin haber probado nada.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();
  g.onHeatAlert = null;
  g.rules.maxWarnings = 99;
  const st = g.objectives.find((o) => o.id === "stretch");
  window.__st = st;
  const ir = () => {
    g.player.position.x = st.x;
    g.player.position.z = st.z;
  };
  window.__paso = (n = 1) => {
    for (let i = 0; i < n; i++) {
      ir();
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
  };
  g.player.keys.add(" ");
  window.__paso(8);
});

const arranca = await p.evaluate(() => {
  const g = window.__game.engine.game;
  return {
    baile: g.baile.active,
    pulso: g.pulse.active,
    gesto: g.gesture.active,
    pasos: g.baile.snapshot()?.pasos.length ?? 0,
  };
});
check(
  "estirarse arranca EL BAILE, no el pulso ni el gesto",
  arranca.baile === true && arranca.pulso === false && arranca.gesto === false,
  JSON.stringify(arranca)
);
check("y su rutina tiene pasos que se ven venir", arranca.pasos >= 4, JSON.stringify(arranca));

const pintada = await p.evaluate(() => ({
  visible: !!document.querySelector(".inc-baile.on"),
  dentroDeLaPantalla: !!document
    .querySelector(".inc-mg")
    ?.contains(document.querySelector(".inc-baile")),
  flechas: document.querySelectorAll(".inc-baile-paso").length,
  pads: document.querySelectorAll(".inc-baile-pad").length,
  ahora: document.querySelectorAll(".inc-baile-paso.ahora").length,
}));
check(
  "SE PINTA a pantalla completa, con la rutina y las cuatro casillas",
  pintada.visible && pintada.dentroDeLaPantalla && pintada.flechas >= 4 && pintada.pads === 4,
  JSON.stringify(pintada)
);
check("y hay exactamente UN paso marcado como el de ahora", pintada.ahora === 1, JSON.stringify(pintada));

// ── EL CURSOR NO SE LLEVA LAS FLECHAS ──
// Es el choque obvio: la pantalla del minijuego es un grupo del cursor de
// menús, y sus casillas son botones. Sin `data-nav-off`, pulsar «→» movería
// un cursor en vez de dar un paso.
check(
  "el cursor de menús no se mete: aquí una flecha es un PASO",
  (await p.evaluate(() => !document.querySelector(".inc-baile .nav-cursor")))
);

// ── ACERTAR EMPUJA ──
const acierto = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const st = window.__st;
  const TECLA = {
    arriba: "ArrowUp",
    abajo: "ArrowDown",
    izquierda: "ArrowLeft",
    derecha: "ArrowRight",
  };
  const antes = st.progress;
  // Se pulsa por TECLADO de verdad, no llamando al módulo: lo que se prueba
  // es que la tecla LLEGA, que es donde se rompen estas cosas.
  const dir = g.baile.snapshot().pasos[g.baile.snapshot().indice].dir;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: TECLA[dir], bubbles: true }));
  window.__paso(2);
  return { antes: +antes.toFixed(3), despues: +st.progress.toFixed(3) };
});
check("acertar el paso con su FLECHA empuja la tarea", acierto.despues > acierto.antes, JSON.stringify(acierto));

// ── FALLAR HACE RUIDO ──
const fallo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const TECLA = {
    arriba: "ArrowUp",
    abajo: "ArrowDown",
    izquierda: "ArrowLeft",
    derecha: "ArrowRight",
  };
  // Hay que esperar a un paso NUEVO: pulsar mal gasta el paso igual que
  // acertarlo, así que sobre el que ya se acertó arriba `pulsar` no hace
  // nada — y la prueba mediría su propio montaje.
  const i0 = g.baile.snapshot().indice;
  for (let f = 0; f < 200 && g.baile.snapshot().indice === i0; f++) window.__paso(1);
  const s = g.baile.snapshot();
  const toca = s.pasos[s.indice].dir;
  const mala = ["arriba", "abajo", "izquierda", "derecha"].find((d) => d !== toca);
  g.suspicion = 10;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: TECLA[mala], bubbles: true }));
  window.__paso(2);
  return { sospecha: g.suspicion };
});
check("y equivocarse de flecha hace RUIDO", fallo.sospecha > 10, JSON.stringify(fallo));

// ── EL COMPÁS NO ESPERA ──
// Es lo que separa un baile de un formulario: el paso se va aunque no lo
// hagas. Sin esto se podría estirar a ritmo de nadie.
const compas = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const antes = g.baile.snapshot().indice;
  window.__paso(120); // dos segundos sin tocar nada
  return { antes, despues: g.baile.snapshot().indice };
});
check(
  "el COMPÁS corre solo: el paso se va aunque no lo hagas",
  compas.despues !== compas.antes,
  JSON.stringify(compas)
);

// ── Y NO CONGELA EL MUNDO ──
const mundo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const st = window.__st;
  // SE REABRE ANTES DE MEDIR. A esta altura la rutina ya ha corrido y la
  // tarea puede haberse ENCENDIDO, y encenderse cierra su pantalla —ahí
  // empieza el aguante, con el mundo vivo otra vez—. Midiendo sin reabrir,
  // lo que se comprobaría es que el mundo anda DESPUÉS del minijuego, que es
  // justo lo contrario de lo que se viene a ver.
  st.done = false;
  st.encendida = false;
  st.progress = 0;
  // Y SE LE DEVUELVE EL PLAZO. La cuenta atrás pudo agotarse durante las
  // pruebas de arriba (la del compás sola son dos segundos), y agotarse
  // suelta la tecla a la fuerza para que no se reentre en bucle: sin esto la
  // pantalla no vuelve a abrirse y la medición del mundo mide un piso sin
  // minijuego, que es otra cosa.
  st.limiteLeft = null;
  g.player.keys.delete(" ");
  window.__paso(6);
  g.player.keys.add(" ");
  window.__paso(10);
  const x0 = g.boss.position.x;
  const z0 = g.boss.position.z;
  // LA SOSPECHA, CLAVADA A CERO durante la medición. Bailar sin responder
  // falla pasos, fallar hace RUIDO, y al nivel 3 de búsqueda `game.js` PAUSA
  // la partida por su cuenta — y pausar limpia las teclas y cierra la
  // pantalla. El resultado era «el mundo anduvo» cuando lo que había pasado
  // es que el minijuego se había cerrado solo. Es la trampa que ya está
  // documentada para las pruebas del jefe.
  for (let i = 0; i < 120; i++) {
    g.suspicion = 0;
    g.boss.suspicion = 0;
    window.__paso(1);
  }
  return {
    andó: Math.hypot(g.boss.position.x - x0, g.boss.position.z - z0) > 0.05,
    // Se informa si la pantalla seguía abierta: sin esto, «el mundo anduvo»
    // no distingue entre «la pausa no funciona» y «no había pantalla que
    // pausara nada», que son dos fallos muy distintos.
    abierta: g.baile.active,
    near: g.nearStation?.id ?? null,
    doing: g.player.isDoingActivity,
    done: st.done,
    enc: st.encendida,
    salida: !!g._salidaManual,
    teclas: [...g.player.keys],
  };
});
// EL MUNDO SE PARA MIENTRAS DURA LA PANTALLA. Esto afirmaba lo
// contrario, y con razón en su momento: congelar al jefe convertía la
// estación en el sitio más seguro del piso. Lo que cambió es que ya no
// se puede ENTRAR con él encima, y sin esa puerta abierta no hay escudo
// que explotar. El anti-escudo se comprueba ahora en `check:pausa`.
check("y el MUNDO SE PARA mientras bailas (ver check:pausa)", mundo.andó === false, JSON.stringify(mundo));

// ── TERMINAR UNA TANDA TIENE SU BEAT ──
// `rutina` se emitía y nadie la escuchaba: en pantalla las flechas volvían a
// empezar sin más, así que no había forma de saber si habías cerrado la tanda
// o si el minijuego se había reiniciado solo.
//
// Se mide que la tanda SE RENUEVA, y por la LISTA DE PASOS, no por el índice:
// al cerrarse, `nuevaRutina()` pone el índice a 0, así que «el índice fue
// hacia atrás» no distingue una tanda nueva de un paso cualquiera — la
// primera versión de esto no detectaba nada por eso.
{
  const tanda = await p.evaluate(async () => {
    const g = window.__game.engine.game;
    if (!g.baile?.active) return { sinAbrir: true };
    const firma = () => (g.baile.snapshot()?.pasos ?? []).map((x) => x.dir).join("");
    const primera = firma();
    for (let i = 0; i < 300; i++) {
      const s = g.baile.snapshot();
      if (!s) return { cerroTarea: true, primera };
      if (firma() !== primera) return { renovada: true, primera, ahora: firma() };
      const paso = s.pasos?.[s.indice];
      if (paso) g.baile.pulsar(paso.dir);
      await new Promise((r) => setTimeout(r, 30));
    }
    return { renovada: false, primera, ahora: firma() };
  });
  check(
    "la tanda se cierra y arranca otra (o la tarea se completa antes)",
    tanda.renovada === true || tanda.cerroTarea === true,
    JSON.stringify(tanda)
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEstirarse es una coreografía: cuatro flechas, y el compás no espera"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
