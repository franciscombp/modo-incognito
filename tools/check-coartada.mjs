/**
 * COARTADAS Y BOTÍN: lo que llevas encima cambia lo rápido que te fichan.
 *
 * Es la respuesta de oficina a la ropa que le compras al mapache en Sneaky
 * Sasquatch: la progresión que hace que el piso apriete MENOS según
 * inviertes. Sin ella el día 1 aprieta igual en el minuto 1 que en el 4.
 *
 * Lo que vigila:
 *  1. Una coartada ENFRÍA lo que un secuaz acumula al verte pasar.
 *  2. El botín CALIENTA (y por eso robar tiene un coste mientras lo llevas).
 *  3. El camuflaje SOLO tapa el paseo: pillada en falta (`redAlert`) la tasa
 *     no se toca. Nadie para a quien cruza el pasillo con un acta en la
 *     mano, pero llevarla no salva a quien está viendo una película.
 *  4. La placa lo ENSEÑA. Un multiplicador que no se ve es una estadística
 *     oculta: se notaría que a veces te fichan antes y nunca se sabría por
 *     qué.
 *
 * Uso: npm run check:coartada   (necesita `npm run preview` en :4173)
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

const out = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // LA ESCOLTA, YA VIVIDA. Superar la puerta del día pone a Gabo a
  // llevarte al puesto, y durante ese trayecto no te vigila a propósito:
  // vas pegada a él. Esto mide la jornada EN MARCHA, no la apertura.
  g.saltarEscolta();
  const m = g.minions[0];
  if (!m) return { error: "no hay secuaces" };

  // El montaje: UN secuaz te ve, tú fuera de tu puesto y sin fingir. Se mide
  // cuánto sube SU vigilancia en un tramo fijo de cuadros, que es justo lo
  // que el camuflaje multiplica.
  const subida = ({ pillada = false } = {}) => {
    for (const otro of g.minions) if (otro !== m) otro.localHeat = 0;
    g.boss.resetToPatrol();
    g.boss.position.x = g.player.position.x + 80;
    m.localHeat = 0;
    m.playerVisible = true;
    m.redAlert = pillada;
    m._updateVision = () => {
      m.playerVisible = true;
      m.redAlert = pillada;
    };
    g.player.isPretending = false;
    g._pretendToggle = false;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    return m.localHeat;
  };

  const limpia = subida();
  const factorLimpia = g._camuflaje();

  // LA MEDALLA en el piso. Sin ella la coartada es un objeto invisible
  // tirado por ahí que nadie encontraría jamás — y una mecánica que no se
  // puede encontrar es una mecánica que no existe. Se busca en la escena de
  // verdad, no en una lista de JS.
  const medallas = [];
  window.__game.scene.traverse((o) => {
    if (o.userData?.itemId) medallas.push(o);
  });

  // Con COARTADA encima.
  const acta = [...g._carriables.values()].find((it) => it.coartada);
  const suMedalla = medallas.find((o) => o.userData.itemId === acta.id);
  const medallaAntes = !!suMedalla?.visible;
  g._recoger(acta);
  // La medalla se apaga en `updateActivityMarkers`, que corre en el bucle
  // de render, no en `game.update`: hay que dejar pasar cuadros de verdad.
  // Un segundo: en headless el rAF va estrangulado y con menos margen el
  // bucle de render puede no llegar a pasar ni una vez.
  await new Promise((r) => setTimeout(r, 1000));
  const medallaDespues = !!suMedalla?.visible;
  const conCoartada = subida();
  const factorCoartada = g._camuflaje();
  const enPlaca = [...document.querySelectorAll(".inc-plate-carry-item")].map((e) => e.textContent);
  const filaVisible = !!document.querySelector(".inc-plate-carry")?.classList.contains("on");

  // Y con la coartada quitada, BOTÍN.
  g.inventario.delete(acta.id);
  g._factorLlevado.delete(acta.id);
  const botin = [...g._carriables.values()].find((it) => (it.sospecha ?? 1) > 1);
  g._recoger(botin);
  const conBotin = subida();

  // El camuflaje NO tapa que te pillen en falta.
  const pilladaConCoartada = subida({ pillada: true });
  g.inventario.delete(botin.id);
  g._factorLlevado.delete(botin.id);
  const pilladaLimpia = subida({ pillada: true });

  return {
    limpia,
    conCoartada,
    conBotin,
    factorLimpia,
    factorCoartada,
    acta: acta.nombre,
    botin: botin.nombre,
    enPlaca,
    filaVisible,
    pilladaConCoartada,
    pilladaLimpia,
    medallas: medallas.length,
    medallaAntes,
    medallaDespues,
  };
});

if (out.error) {
  check("hay secuaces con los que medir", false, out.error);
} else {
  check(
    "una coartada ENFRÍA lo que un secuaz acumula al verte pasar",
    out.conCoartada < out.limpia * 0.9,
    JSON.stringify({ limpia: out.limpia, conCoartada: out.conCoartada, factor: out.factorCoartada })
  );
  check(
    "el botín CALIENTA",
    out.conBotin > out.limpia * 1.1,
    JSON.stringify({ limpia: out.limpia, conBotin: out.conBotin })
  );
  check(
    "y sin nada encima el camuflaje es neutro",
    Math.abs(out.factorLimpia - 1) < 0.001,
    `factor=${out.factorLimpia}`
  );
  check(
    "el camuflaje NO tapa que te pillen en falta",
    Math.abs(out.pilladaConCoartada - out.pilladaLimpia) < 0.001,
    JSON.stringify({ conCoartada: out.pilladaConCoartada, limpia: out.pilladaLimpia })
  );
  check(
    "cada coartada tiene MEDALLA en el piso, y se apaga al recogerla",
    out.medallas >= 1 && out.medallaAntes === true && out.medallaDespues === false,
    JSON.stringify({
      medallas: out.medallas,
      antes: out.medallaAntes,
      despues: out.medallaDespues,
    })
  );
  check(
    "y la placa ENSEÑA lo que llevas",
    out.filaVisible === true && out.enPlaca.some((t) => t.includes(out.acta)),
    JSON.stringify({ filaVisible: out.filaVisible, enPlaca: out.enPlaca, esperado: out.acta })
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLo que llevas encima decide lo rápido que te fichan al pasar"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
