/**
 * ¿SE VE UN MINIJUEGO PRONTO? (la queja «no veo los minijuegos»)
 *
 * El bucle v2 puso una puerta delante de cada actividad: primero hay que
 * CONSEGUIR su objeto. Bien de diseño… salvo que en la temporada 1 las tres
 * actividades iniciales (café, peli, snack) pedían objeto, y la única
 * misión sin puerta —«finge que trabajas»— no tiene minijuego. Resultado:
 * para ver tu PRIMER pulso había que encontrar al Parce, hablarle y volver,
 * con una jornada de cuatro minutos y el jefe encima. En la práctica, casi
 * nadie llegaba, y el juego parecía no tener minijuegos.
 *
 * Esto lo vigila con una regla dura: entre lo que puedes hacer NADA MÁS
 * empezar tiene que haber al menos una actividad SIN objeto y CON minijuego
 * — y se comprueba jugándola de verdad hasta que la tira aparece en
 * pantalla, no leyendo el JSON.
 *
 * Uso: npm run check:minijuego   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";
// DEL REGISTRO. La lista estuvo escrita a mano aquí con DOS verbos cuando ya
// había seis, y al pasar estirarse al baile esta prueba dejó de ver la única
// actividad jugable del día: falló sin que nada del juego estuviera roto.
import { VERBOS } from "../src/game/verbos.js";

const CAMPOS_VERBO = VERBOS.map((v) => v.campo).filter(Boolean);
// Los PARES {id, campo}: el id es cómo se llama la instancia en `game` y el
// campo es la clave del JSON. No coinciden (`gesture`/`gesto`,
// `pulse`/sin clave), y traducirlos a mano en cada sitio es de donde salían
// los desajustes.
const PARES = VERBOS.map(({ id, campo }) => ({ id, campo }));

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.addInitScript(
  ({ campos, pares }) => {
    window.__VERBOS = campos;
    window.__PARES = pares;
  },
  { campos: CAMPOS_VERBO, pares: PARES }
);
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// `domcontentloaded`, no `networkidle`: con los cuerpos .glb cargándose,
// la red no llega a quedarse quieta y el check se cuelga esperando algo
// que nunca pasa. Es el mismo criterio que usa check-energia.
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
// Cuerpo de BLOQUE a propósito: con cuerpo de expresión se devuelve la
// promesa de startDay, que no resuelve hasta que alguien pase el diálogo de
// apertura — y el check se cuelga sin decir por qué.
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });

// Pasar el diálogo de apertura, o la puerta del día no se supera.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

// ── 1 · Nada más superar la puerta del día, ¿hay algo jugable sin recados? ──
const arranque = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();
  // LOS VERBOS, TODOS. Estaba escrito «pulso o gesto» y se quedó viejo en
  // cuanto el piso tuvo seis: al pasar estirarse al baile, esta prueba dejó
  // de ver la única actividad jugable sin recados y falló sin que nada del
  // juego estuviera roto. Si añades un verbo, va aquí.
  // (lo inyecta `addInitScript`, ver arriba)
  const tieneVerbo = (o) => window.__VERBOS.some((v) => o[v]);
  // Una actividad sin ningún verbo declarado cae al PULSO, que es el suelo:
  // también es jugable ya.
  const jugable = (o) => tieneVerbo(o) || !o.objeto;
  const libres = g.objectives.filter((o) => !o.done && !o.dynamic && !o.objeto);
  return {
    total: g.objectives.filter((o) => !o.done).length,
    // Sin objeto Y con minijuego (pulso o gesto): lo que se puede jugar ya.
    jugablesYa: libres.filter(jugable).map((o) => o.id),
    conObjeto: g.objectives.filter((o) => !o.done && o.objeto).map((o) => o.id),
  };
});
check(
  "al empezar hay al menos UNA actividad sin recados y con minijuego",
  arranque.jugablesYa.length >= 1,
  JSON.stringify(arranque)
);

// ── 2 · Y se juega de verdad: la tira del pulso aparece EN PANTALLA ──
const jugada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const VERBOS = window.__VERBOS;
  const st = g.objectives.find(
    (o) => !o.done && !o.dynamic && !o.objeto && (VERBOS.some((v) => o[v]) || true)
  );
  if (!st) return { error: "no hay actividad jugable sin objeto" };
  // El jefe lejos: aquí se mide que el minijuego SALE, no la persecución.
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 60;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  // Se espera a que arranque CUALQUIER verbo. Preguntando solo por dos, con
  // una estación de baile la espera se agotaba entera y luego se informaba
  // «no arrancó» — cuando lo que no sabía mirar era la prueba.
  for (let i = 0; i < 60; i++) {
    if (g.paused) g.setPaused(false);
    await sleep(30);
    if (window.__PARES.some((v) => g[v.id]?.active)) break;
  }
  const tira = document.querySelector(".inc-pulse");
  const tarjeta = document.querySelector(".inc-action");
  return {
    id: st.id,
    label: st.label,
    // Cualquiera de los verbos, por lo mismo que arriba: mirar solo dos era
    // preguntar por un juego que ya no existe.
    activo: window.__PARES.some((v) => g[v.id]?.active),
    // Que esté "activo" por dentro no basta: tiene que PINTARSE.
    tiraVisible: !!tira?.classList.contains("on"),
    tarjetaVisible: !!tarjeta?.classList.contains("on"),
    // LA PANTALLA es lo que comparten TODOS los verbos desde que se juegan a
    // pantalla completa: preguntar por la tira del pulso o la tarjeta del
    // gesto era preguntar por dos de seis.
    pantallaVisible: !!document.querySelector(".inc-mg.on"),
    mundoCongelado: g.worldFrozen,
  };
});
check(
  "esa actividad arranca su minijuego al mantener espacio",
  jugada.activo === true,
  JSON.stringify(jugada)
);
check(
  "y el minijuego SE PINTA (la tira o la tarjeta de acción)",
  jugada.pantallaVisible === true || jugada.tiraVisible === true || jugada.tarjetaVisible === true,
  JSON.stringify(jugada)
);
// Y SE JUEGA CON EL PISO VIVO. Esto exigía lo contrario —activar congelaba
// el mundo— y era el fallo que rompía la captura: mantener espacio en
// cualquier estación dejaba a Gabo de estatua a un palmo, en rojo, sin
// llegar a tocarte nunca. Un minijuego que congela al jefe convierte la
// estación en el sitio más seguro del piso, que es lo contrario de su
// función: una tarea tiene que EXPONERTE.
check(
  "y se juega con el piso VIVO, no con el mundo congelado",
  jugada.mundoCongelado === false,
  JSON.stringify(jugada)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? `\nHay minijuego desde el primer minuto: «${jugada.label}»`
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
