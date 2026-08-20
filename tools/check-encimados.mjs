/**
 * NADA SE PISA CON NADA.
 *
 * ── Por qué ──
 *
 * «Se sobrepone» es la queja más difícil de perseguir a mano: no falla nada,
 * no hay error en consola, y en la pantalla en la que estás mirando casi
 * siempre se ve bien. Se rompe en la combinación — el HUD con una tarea
 * encendida Y una notificación Y el nombre de zona, o un minijuego a
 * pantalla completa con el acecho dentro.
 *
 * El lienzo es FIJO (1920×1080 o 1280×720), así que esto se puede medir de
 * verdad y no «según la pantalla»: se sacan los rectángulos de las piezas de
 * primer nivel y se comprueba que no se solapan. Es la comprobación que no
 * existía, porque `check:layout` mira que nada se SALGA del lienzo — que es
 * otra cosa: dos piezas pueden caber las dos y estar una encima de la otra.
 *
 * Lo que NO cuenta como pisarse, y por qué:
 *   · un velo o una capa a pantalla completa — su trabajo es cubrir;
 *   · lo que está dentro de otra cosa — un hijo se solapa con su padre por
 *     definición;
 *   · lo que no pinta nada (`pointer-events: none` y sin fondo ni texto);
 *   · un solape mínimo de unos pocos píxeles, que es el aire de un margen.
 *
 * Uso: npm run check:encimados   (necesita `npm run preview` en :4173)
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

// Las piezas del HUD que tienen SITIO PROPIO. Es la lista de docs/HUD.md:
// cada una vive en una esquina o en una banda, y el reparto es el diseño.
// Si dos de estas se tocan, una está en el sitio de la otra.
const PIEZAS = [
  ".inc-plate", // sup. izq · la placa
  ".inc-quests", // sup. der · la lista de misiones
  ".inc-bar-center", // centro arriba · el reloj
  ".inc-sysbtns", // sup. der · pausa
  ".inc-zone-name", // inf. der · el nombre de zona
  ".inc-msg-lado", // el carril de avisos
  "#hint", // la píldora de mandos
];

/** ¿Cuánto se pisan dos rectángulos? En píxeles de área. */
function solape(a, b2) {
  const w = Math.min(a.right, b2.right) - Math.max(a.left, b2.left);
  const h = Math.min(a.bottom, b2.bottom) - Math.max(a.top, b2.top);
  return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : null;
}

async function medir(piezas) {
  return p.evaluate((sels) => {
    const out = [];
    for (const sel of sels) {
      for (const e of document.querySelectorAll(sel)) {
        const s = getComputedStyle(e);
        if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        out.push({
          sel,
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
    return out;
  }, piezas);
}

/** Compara todos contra todos y devuelve los pares que se pisan de verdad. */
function encimados(rects, tolerancia = 6) {
  const malos = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const s = solape(rects[i], rects[j]);
      // La TOLERANCIA es el aire de un margen: dos piezas que se rozan por
      // tres píxeles no están una encima de la otra. Se pide que el solape
      // sea de verdad en LOS DOS ejes, o una sombra de 8 px daría un falso
      // positivo eterno.
      if (!s || s.w <= tolerancia || s.h <= tolerancia) continue;
      malos.push({ a: rects[i].sel, b: rects[j].sel, solape: `${s.w}×${s.h}px` });
    }
  }
  return malos;
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
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();
  for (let i = 0; i < 30; i++) g.update(1 / 60);
});
await p.waitForTimeout(600);

// ── 1 · EL HUD EN CALMA ──
const calma = encimados(await medir(PIEZAS));
check("en calma, ninguna pieza del HUD pisa a otra", calma.length === 0, JSON.stringify(calma));

// ── 2 · EL PEOR CASO: todo encendido a la vez ──
// Es donde se rompe de verdad. Una pieza sola siempre cabe; lo que no cabe
// es el día real, con una tarea en marcha, un aviso cayendo y el nombre de
// zona saliendo al mismo tiempo.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.toast("Un aviso largo de los que caen en mitad de la jornada", 6, "warn");
  g.announce("¡GABO TE VIO!", "danger");
  for (let i = 0; i < 20; i++) g.update(1 / 60);
});
await p.waitForTimeout(500);
const lleno = encimados(await medir([...PIEZAS, ".inc-msg-centro"]));
check(
  "y con aviso, anuncio y zona a la vez, tampoco",
  lleno.length === 0,
  JSON.stringify(lleno)
);

// ── 3 · UN MINIJUEGO A PANTALLA COMPLETA ──
// La pantalla del verbo SÍ tapa el piso (es su trabajo), pero el ACECHO va
// DENTRO de ella: es lo que impide que jugar sea que te capturen a ciegas.
// Que se pisen esos dos es perder justo la mitad que avisa.
const mg = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const st = g.objectives.find((o) => !o.done && !o.dynamic && !o.objeto);
  if (!st) return { sinEstacion: true };
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 60;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 90; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  return { abierto: !!document.querySelector(".inc-mg.on") };
});
await p.waitForTimeout(400);
if (!mg.sinEstacion && mg.abierto) {
  const dentro = encimados(await medir([".inc-mg-acecho", ".inc-mg-salir", ".inc-mg-body"]));
  check("dentro de un minijuego, el ACECHO no lo tapa nada", dentro.length === 0, JSON.stringify(dentro));
  // Y el botón de SALIR existe y es acertable: sin él no se sale del verbo.
  const salir = await p.evaluate(() => {
    const e = document.querySelector(".inc-mg-salir");
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check("y el botón de SALIR está en pantalla", !!salir && salir.h >= 20, JSON.stringify(salir));
} else {
  console.log("SKIP  el minijuego no llegó a abrirse en este montaje");
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(fallos === 0 ? "\nCada pieza en su sitio: nada se pisa" : `\n${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
