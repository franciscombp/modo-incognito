/**
 * LAS TRES AMONESTACIONES SON UNA ESCALADA, Y SE VEN LAS TRES.
 *
 * ── Lo que estaba mal ──
 *
 * El arco está escrito y es bueno: la primera es BUROCRÁTICA (la apunta, va
 * a la carpeta), la segunda es PERSONAL (se lo toma a pecho, «tú vas
 * 50/50») y la tercera ya no es él, es la MÁQUINA (RRHH). Pero al jugarlo
 * se leía 1 → 2 → corte a negro, por dos motivos que se tapaban entre sí:
 *
 * 1. La TERCERA no se jugaba nunca. `handleWarn` se corta en seco al llegar
 *    al cupo —«el outro ya cubre este caso»— así que «¡OTRA VEZ! Esto ya es
 *    una relación. Una tóxica...» no lo oyó nadie. El remate del chiste
 *    moría sin decirse.
 * 2. La SEGUNDA era cara o cruz. Se sorteaba entre la escena formal y una
 *    pulla suelta de `softWarnings`, y la probabilidad de la pulla SUBÍA
 *    con el número de amonestaciones (0 / 0,3 / 0,6): el juego se volvía
 *    más casual justo según se ponía más serio. En la que te deja a una de
 *    RRHH había un 30 % de que soltara «y la de trabajar, ¿te la sabes?» y
 *    nada más.
 *
 * Una escalada que se sortea no es una escalada. Esto la clava: cada
 * amonestación juega LA SUYA, siempre, y las tres son distintas.
 *
 * Se comprueba de las DOS formas, y hacen falta las dos: leyendo el código
 * (que no haya sorteo es una regla de guion, y una prueba que jugase tres
 * amonestaciones con un dado dentro pasaría por suerte dos veces de cada
 * tres) y JUGÁNDOLO — porque «el código elige por índice» no demuestra que
 * la escena salga en pantalla, que es lo que se rompió.
 *
 * Uso: npm run check:amonestaciones   (necesita `npm run preview` en :4173)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const dialogues = JSON.parse(
  readFileSync(new URL("../public/data/dialogues.json", import.meta.url), "utf8")
);
const engine = readFileSync(new URL("../src/game/engine.js", import.meta.url), "utf8");
const game = readFileSync(new URL("../src/game/game.js", import.meta.url), "utf8");

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

const jefe = dialogues.encounters?.jefe ?? {};
const pozo = jefe.warnScenes ?? [];

// ── 1 · Hay una escena POR amonestación, y son distintas ──
check(
  "hay al menos una escena de amonestación por cada una del cupo",
  pozo.length >= 3,
  `${pozo.length} escenas`
);
const textos = pozo.map((sc) => sc.map((n) => n.text).join(" "));
check(
  "y las tres son distintas: la escalada no repite frase",
  new Set(textos).size === textos.length,
  JSON.stringify(textos.map((t) => t.slice(0, 30)))
);

// ── 2 · La escena la elige EL NÚMERO, no un dado ──
// Se lee el código: es una regla de guion, y una prueba que jugase tres
// amonestaciones con un sorteo dentro pasaría por suerte dos veces de cada
// tres. Lo que hay que fijar es que NO HAY sorteo.
check(
  "la amonestación NO se sortea: la escena sale del número",
  /const scene = warnScenes\[Math\.min\(warnings, warnScenes\.length\) - 1\]/.test(engine),
  "no se encontró la elección por índice en handleWarn"
);
check(
  "y ya no queda el sorteo viejo (softChance / useSoft) en el regaño",
  !/softChance|useSoft/.test(engine),
  "sigue habiendo un sorteo en engine.js"
);

// ── 3 · La TERCERA se juega antes de RRHH ──
check(
  "el cierre por RRHH juega la última escena del jefe antes de la suya",
  /elegirWarnScenes\(dialogues\.encounters\.jefe\)/.test(engine) &&
    /pozo\[pozo\.length - 1\]/.test(engine),
  "finishDay no recupera la escena final"
);
// Y sale de UN pozo compartido: escrito dos veces, la tercera escena deja de
// ser la continuación de las otras dos.
check(
  "y las dos vías leen el MISMO pozo (elegirWarnScenes)",
  (engine.match(/elegirWarnScenes\(/g) ?? []).length >= 3,
  "el pozo no está compartido entre handleWarn y finishDay"
);

// ── 4 · Las pullas se mudaron al AVISO ──
// Ahí sí son lo que dicen ser: intimidación de pasillo, en el beat que más
// se repite del día y que era un rótulo fijo.
check("las pullas (`softWarnings`) siguen existiendo", (jefe.softWarnings ?? []).length >= 3);
check(
  "y ahora las usa el AVISO, que tenía una sola frase para todo el día",
  /onAviso/.test(engine) && /softWarnings/.test(engine) && /this\.onAviso\?\.\(\)/.test(game),
  "el aviso no está enganchado a las pullas"
);
check(
  "el aviso no repite la misma pulla dos veces seguidas",
  /ultimoAviso/.test(engine),
  "no hay memoria del último aviso"
);

// ── 5 · Y las reglas del golpe siguen intactas ──
// La amonestación es FÍSICA y el cupo cierra el día: son invariantes, y esta
// prueba tiene que fallar si alguien los toca de paso.
check(
  "la amonestación sigue cerrando el día al llegar al cupo",
  /const final = this\.warnings >= this\.rules\.maxWarnings/.test(game) &&
    /if \(final\) this\._finish\(false\)/.test(game)
);

// ── 6 · Y el trato se DICE: la primera nombra las tres ──
// El contador enseñaba (1/3) y nada explicaba qué es 3 hasta que pasaba, así
// que la segunda no se leía como «me queda una».
check(
  "la primera amonestación nombra el cupo y lo que hay al final",
  /TRES/.test(textos[0] ?? "") && /curso/i.test(textos[0] ?? ""),
  textos[0]?.slice(0, 80)
);

// ══════════════════════════════════════════════════════════════════════
// Y AHORA JUGÁNDOLO. Lo de arriba fija las reglas; esto comprueba que la
// frase SALE EN PANTALLA, que es la parte que llevaba rota.
// ══════════════════════════════════════════════════════════════════════
const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // LA ESCOLTA, YA VIVIDA. Superar la puerta del día pone a Gabo a llevarte
  // al puesto, y MIENTRAS TE ACOMPAÑA NO TE VIGILA: `_updateBossApproach` se
  // corta entero, así que el aviso no llega a pintarse y lo que quedaba en
  // pantalla era el anuncio de la escolta. La prueba lo leía como si fuera
  // la pulla del jefe e informaba «repite» — con el juego haciendo justo lo
  // que debe. Aquí se mide el aviso, así que la escolta se da por terminada.
  g.saltarEscolta();
});

// ── El AVISO habla, y no repite ──
const avisos = [];
for (let n = 0; n < 4; n++) {
  avisos.push(
    await p.evaluate(() => {
      const g = window.__game.engine.game;
      g._avisoCooldown = 0;
      g._avisoGracia = 0;
      g.suspicion = 0;
      g.boss.suspicion = 0;
      g.boss.lockedOn = false;
      g.boss.position.x = g.player.position.x;
      g.boss.position.z = g.player.position.z;
      g.player.isPretending = false;
      g._updateBossApproach(1 / 60);
      return document.querySelector(".inc-msg-centro")?.textContent ?? "";
    })
  );
  await p.waitForTimeout(150);
}
check(
  "al acercarse, el jefe dice algo SUYO (no el rótulo fijo de siempre)",
  avisos.every((a) => a && !/¿NECESITAS ALGO\?/.test(a)),
  JSON.stringify(avisos.map((a) => a.slice(0, 28)))
);
check(
  "y no suelta la misma pulla dos veces seguidas",
  avisos.every((a, i) => i === 0 || a !== avisos[i - 1]),
  JSON.stringify(avisos.map((a) => a.slice(0, 22)))
);

// ── Y LAS TRES AMONESTACIONES, EN ORDEN Y DISTINTAS ──
const vistas = [];
for (const n of [1, 2, 3]) {
  // Se TERMINA el diálogo anterior pasando sus líneas, no cerrándolo a la
  // fuerza: `play()` está awaited y una caja abierta se queda con el turno,
  // así que a la fuerza la siguiente escena no llega a pintarse y las tres
  // se leen como la primera. (Pasó, y parecía que la escalada seguía rota.)
  for (let i = 0; i < 8; i++) {
    if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
    await p.keyboard.press("Space");
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(300);
  await p.evaluate((k) => {
    const g = window.__game.engine.game;
    // La tercera cierra el día; aquí se quiere ver SU escena, así que se
    // rearma el cierre. En partida esa misma escena llega por `finishDay`,
    // que lee el mismo pozo.
    g._finished = false;
    g.gameOver = false;
    g.warnings = k - 1;
    g._warn();
  }, n);
  // POR ESTADO, no por cronómetro. Esto esperaba 900 ms fijos y leía: con la
  // máquina cargada, la caja de la PRIMERA amonestación tardaba más que eso
  // en pintar su primer carácter y la prueba leía «» — con el juego haciendo
  // exactamente lo que debe. Es el mismo anti-patrón ya desterrado del resto
  // de la suite (el telón, el baile): se sondea hasta que el mecanismo
  // responde, y lo estricto sigue intacto — el texto tiene que ser EL DE SU
  // escena, no cualquiera.
  // Y HASTA TENER TEXTO SUFICIENTE, no solo alguno: la caja escribe a
  // máquina, y parar en el primer carácter dejaba la comparación de orden
  // (24 letras) midiendo una frase a medias — «¡AJÁ! Te vi. Y no e» contra
  // «¡AJÁ! Te vi. Y no estabas». Se espera a que lleguen las letras que la
  // aserción va a mirar, o a que el texto deje de crecer (frase corta).
  let visto = "";
  let previo = -1;
  for (let i = 0; i < 50; i++) {
    await p.waitForTimeout(120);
    visto = await p.evaluate(
      () => document.querySelector(".vn-text, .inc-dialogue-text")?.textContent?.trim() ?? ""
    );
    if (visto.length >= 26) break;
    if (visto && visto.length === previo) break;
    previo = visto.length;
  }
  vistas.push(visto);
}
check(
  "cada amonestación abre SU escena, y las tres son distintas",
  vistas.every(Boolean) && new Set(vistas).size === 3,
  JSON.stringify(vistas.map((v) => v.slice(0, 34)))
);
// Y EN EL ORDEN DEL ARCO. Se compara contra el pozo del JSON en vez de
// buscar palabras sueltas: la caja enseña la PRIMERA línea de la escena, y
// el remate de cada una («amonestación uno de TRES», «te asciendo a
// cliente») está en la segunda — la primera versión de esto buscaba esas
// palabras en pantalla y daba FAIL con el orden perfecto.
check(
  "y en orden: la n-ésima amonestación abre la n-ésima escena escrita",
  vistas.every((v, i) => v.startsWith((pozo[i]?.[0]?.text ?? "\u0000").slice(0, 24))),
  JSON.stringify(vistas.map((v, i) => [v.slice(0, 26), (pozo[i]?.[0]?.text ?? "").slice(0, 26)]))
);
check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLa escalada se ve entera: la apunta, se lo toma a pecho, y luego ya no es él"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
