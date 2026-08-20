/**
 * LA DELACIÓN: el medidor compartido es LO QUE GABO SABE.
 *
 * En Sneaky Sasquatch el campista no te atrapa — llena su barra y va a
 * buscar al guardabosques. Aquí igual: un secuaz no amonesta nunca, pero
 * cuando su vigilancia propia (`localHeat`) cruza su umbral, va con el
 * cuento y el medidor del jefe pega un SALTO.
 *
 * Lo que vigila, y es todo lo que hace falta para que la mecánica exista:
 *  1. Por debajo de su umbral, un secuaz NO mueve el medidor compartido.
 *     (Antes goteaba solo, y la barra subía «porque sí».)
 *  2. Cruzarlo lo sube de golpe, y lo ANUNCIA con nombre.
 *  3. Es un SUCESO, no un goteo: seguir por encima del umbral no vuelve a
 *     cobrar hasta que pasa el plazo de silencio (`reportingCooldown`).
 *
 * Uso: npm run check:delacion   (necesita `npm run preview` en :4173)
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

const out = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // LA ESCOLTA, YA VIVIDA. Superar la puerta del día pone a Gabo a
  // llevarte al puesto, y durante ese trayecto no te vigila a propósito:
  // vas pegada a él. Esto mide la jornada EN MARCHA, no la apertura.
  g.saltarEscolta();
  const m = g.minions[0];
  if (!m) return { error: "no hay secuaces" };

  // Los DEMÁS secuaces, callados: se mide UNO. Y el jefe lejos, que si te ve
  // él sube el medidor por su cuenta y ya no se sabe quién lo movió.
  for (const otro of g.minions) if (otro !== m) otro.localHeat = 0;
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 80;
  g.suspicion = 0;

  const correr = (n) => {
    for (let i = 0; i < n; i++) g.update(1 / 60);
  };

  // 1 · Por debajo del umbral: mirar no es delatar.
  m.localHeat = m.followThreshold * 0.8;
  const antes = g.suspicion;
  correr(30);
  const tibio = g.suspicion;

  // 2 · Cruza el umbral: el salto, de una vez, y con nombre en pantalla.
  m.localHeat = m.followThreshold + 0.05;
  correr(2);
  const trasDelatar = g.suspicion;
  const anuncio = g.bigMessage?.text ?? "";

  // 3 · Sigue por encima: no vuelve a cobrar dentro del plazo de silencio.
  for (let i = 0; i < 60; i++) {
    m.localHeat = m.followThreshold + 0.05;
    g.update(1 / 60);
  }
  const trasInsistir = g.suspicion;

  return {
    umbral: m.followThreshold,
    antes,
    tibio,
    trasDelatar,
    trasInsistir,
    anuncio,
    plazo: m._delacionCooldown,
  };
});

if (out.error) {
  check("hay secuaces que puedan delatar", false, out.error);
} else {
  check(
    "por debajo de su umbral, un secuaz no mueve el medidor compartido",
    out.tibio - out.antes < 1,
    JSON.stringify({ antes: out.antes, tibio: out.tibio })
  );
  check(
    "cruzarlo lo sube DE GOLPE",
    out.trasDelatar - out.tibio >= 10,
    JSON.stringify({ tibio: out.tibio, trasDelatar: out.trasDelatar })
  );
  check(
    "y se anuncia con nombre y apellido",
    /DELAT/i.test(out.anuncio),
    JSON.stringify({ anuncio: out.anuncio })
  );
  check(
    "es un SUCESO, no un goteo: insistir no vuelve a cobrar en el plazo",
    out.trasInsistir - out.trasDelatar < 1,
    JSON.stringify({ trasDelatar: out.trasDelatar, trasInsistir: out.trasInsistir, plazo: out.plazo })
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nA Gabo se le entera: el medidor sube porque alguien fue con el cuento"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
