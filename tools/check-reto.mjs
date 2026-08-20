/**
 * EL RETO DE CONSEGUIR: un objeto se GANA, no se recoge.
 *
 * Robar el HDMI era pulsar una tecla al lado de una sala. La pieza clave de
 * tu escaqueo del día no puede costar lo mismo que abrir una puerta: si el
 * objeto es gratis, el primer tramo del bucle (conseguir → activar →
 * aguantar) está vacío, y el objeto nunca se siente como el LOGRO que
 * después te delata mientras lo llevas encima.
 *
 * Lo que vigila:
 *  1. Acercarse y pulsar NO da el objeto: abre el reto de cables.
 *  2. Los cables se pintan y se juegan CON EL RATÓN de verdad.
 *  3. Unir mal hace RUIDO y no rompe nada.
 *  4. Unirlos todos da el objeto Y lo anuncia como un logro.
 *  5. Alejarse cierra el reto sin dar nada — no se deja abierto y se va.
 *  6. Y no congela el mundo.
 *
 * Uso: npm run check:reto   (necesita `npm run preview` en :4173)
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
// El diálogo de apertura, pasado: su scrim se come los clics del ratón y un
// `click()` de Playwright se queda esperando para siempre a que el elemento
// sea alcanzable.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(120);
}

// ── Montaje: al lado del objeto con reto, con el jefe lejos y VINIENDO ──
const abierto = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  g.onHeatAlert = null;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();

  const it = (g._itemSpots ?? []).find((x) => x.reto?.tipo === "cables");
  if (!it) return { error: "ningún objeto declara un reto de cables" };
  window.__it = it;
  // La sala, vacía: con gente dentro el objeto ni se intenta (eso es el
  // bucle v2 y tiene su propia prueba).
  if (g.safeSpotState[it.salaIndex]) g.safeSpotState[it.salaIndex].busyLeft = 0;

  g.boss.resetToPatrol();
  g.boss.position.x = it.x + 25 * S;
  g.boss.position.z = it.z;
  g.suspicion = Math.max(g.suspicion, g.boss.chaseSuspicionFloor + 5);
  g.boss.suspicion = g.suspicion;
  g.boss.startChase();
  window.__bossX0 = g.boss.position.x;

  g.player.position.x = it.x;
  g.player.position.z = it.z;
  // El flanco de la tecla: se suelta y se pulsa, como haría un dedo.
  g.player.keys.delete(" ");
  g.update(1 / 60);
  g.player.keys.add(" ");
  for (let i = 0; i < 4; i++) {
    g.player.position.x = it.x;
    g.player.position.z = it.z;
    g.update(1 / 60);
  }
  g.player.keys.delete(" ");
  return {
    nombre: it.nombre,
    retoAbierto: !!g.reto,
    cablesActivos: g.cables.active,
    // Lo que NO debe haber pasado: que el objeto ya sea tuyo.
    yaLoTienes: g.inventario.has(it.id),
    congelado: g.worldFrozen,
  };
});

if (abierto.error) {
  check("hay un objeto con reto", false, abierto.error);
} else {
  check(
    "pulsar NO te da el objeto: abre el reto",
    abierto.retoAbierto === true && abierto.cablesActivos === true && abierto.yaLoTienes === false,
    JSON.stringify(abierto)
  );

  await p.waitForTimeout(400);
  const puntas = await p.$$(".inc-cable");
  check("los cables se pintan (dos columnas)", puntas.length >= 6, `puntas: ${puntas.length}`);

  // ── EL RATÓN de verdad ──
  await puntas[0].click();
  await p.waitForTimeout(150);
  const trasClic = await p.evaluate(() => window.__game.engine.game.cables.snapshot()?.punta);
  check(
    "UN CLIC DE RATÓN levanta la punta",
    trasClic?.lado === "izq" && trasClic?.i === 0,
    JSON.stringify(trasClic)
  );

  // ── Unir MAL hace ruido ──
  const mal = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const s = g.cables.snapshot();
    g.cables.soltar();
    // Una pareja de colores distintos, leída del estado.
    let par = null;
    for (let i = 0; i < s.izq.length && !par; i++) {
      for (let j = 0; j < s.der.length; j++) {
        if (s.izq[i].color !== s.der[j].color) {
          par = [i, j];
          break;
        }
      }
    }
    const susAntes = g.suspicion;
    g.cables.elegir("izq", par[0]);
    const r = g.cables.elegir("der", par[1]);
    return { r, ruido: g.suspicion > susAntes, unidos: g.cables.snapshot()?.unidos };
  });
  check(
    "unir MAL hace ruido y no une nada",
    mal.r === "fallo" && mal.ruido === true && mal.unidos === 0,
    JSON.stringify(mal)
  );

  // ── Unirlos TODOS: el objeto es tuyo, y se anuncia ──
  const ganado = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const it = window.__it;
    g.cables.soltar();
    for (let vuelta = 0; vuelta < 12; vuelta++) {
      const s = g.cables.snapshot();
      if (!s) break;
      const i = s.izq.findIndex((x) => !x.unido);
      if (i < 0) break;
      const j = s.der.findIndex((x) => x.color === s.izq[i].color && !x.unido);
      g.cables.elegir("izq", i);
      g.cables.elegir("der", j);
      g.update(1 / 60);
    }
    return {
      loTienes: g.inventario.has(it.id),
      retoCerrado: g.reto === null,
      cablesApagados: g.cables.active === false,
      anuncio: g.bigMessage?.text ?? "",
    };
  });
  check(
    "unirlos todos te DA el objeto",
    ganado.loTienes === true,
    JSON.stringify(ganado)
  );
  check(
    "y se anuncia como un LOGRO, no como un toast",
    /ES TUYO/i.test(ganado.anuncio),
    JSON.stringify(ganado)
  );
  check(
    "el reto se cierra al ganarlo",
    ganado.retoCerrado === true && ganado.cablesApagados === true,
    JSON.stringify(ganado)
  );

  // ── El mundo, PARADO ──
  // Un reto ocupa la pantalla entera igual que un verbo, así que también
  // para el mundo. Esto exigía lo contrario, y con razón entonces: congelar
  // al jefe hacía de la estación un escudo. Lo que cambió es que ya no se
  // puede ENTRAR con él encima — ver `check:pausa`.
  const mundo = await p.evaluate(() => {
    const g = window.__game.engine.game;
    // SE REABRE: los pasos de arriba GANAN el reto, y ganarlo lo cierra —que
    // es su final—. Medir sin reabrir sería medir un piso sin reto, y el
    // mundo anda, claro que anda.
    let reabierto = false;
    if (!g.reto) {
      reabierto = true;
      const item = [...g._carriables.values()].find((i) => i.reto);
      g.inventario.delete(item.id);
      g.boss.resetToPatrol();
      g.minions.forEach((m) => m.resetToPatrol());
      g.suspicion = 0;
      g.boss.suspicion = 0;
      g._abrirReto(item);
      for (let i = 0; i < 6; i++) g.update(1 / 60);
    }
    const x0 = g.boss.position.x;
    for (let i = 0; i < 90; i++) {
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
    const out = {
      abierto: !!g.reto,
      bossAndó: Math.abs(g.boss.position.x - x0) > 0.01,
    };
    // SE CIERRA LO QUE SE ABRIÓ. Si esta medida deja un reto abierto, el
    // bloque siguiente llama a `_abrirReto` y se encuentra con que ya hay uno
    // —`_abrirReto` sale si `this.reto`— y acaba midiendo el reto
    // equivocado, con el objeto equivocado y a la distancia equivocada.
    if (reabierto) g.cerrarReto();
    return out;
  });
  check(
    "y el MUNDO SE PARA mientras conectas (ver check:pausa)",
    mundo.abierto === true && mundo.bossAndó === false,
    JSON.stringify(mundo)
  );

  // ── Alejarse lo cierra sin dar nada ──
  const alejarse = await p.evaluate(() => {
    const g = window.__game.engine.game;
    const it = window.__it;
    // Se vuelve a abrir a mano, sin el objeto encima.
    g.inventario.delete(it.id);
    g._factorLlevado.delete(it.id);
    g._abrirReto(it);
    const abierto = !!g.reto;
    const lejos = window.__floorplan.patrolRoute[0];
    g.player.position.x = lejos.x;
    g.player.position.z = lejos.z;
    for (let i = 0; i < 10; i++) {
      g.player.position.x = lejos.x;
      g.player.position.z = lejos.z;
      g.update(1 / 60);
    }
    return {
      abierto,
      cerrado: g.reto === null,
      sinObjeto: !g.inventario.has(it.id),
      pausado: g.paused,
      dist: +Math.hypot(it.x - g.player.position.x, it.z - g.player.position.z).toFixed(1),
    };
  });
  check(
    "alejarse cierra el reto y no regala nada",
    alejarse.abierto === true && alejarse.cerrado === true && alejarse.sinObjeto === true,
    JSON.stringify(alejarse)
  );
}

// ── EL EXAMEN DEL PARCE ────────────────────────────────────────────────
// El café se conseguía hablándole y ya: la mitad del bucle v2 regalada. Él
// no se mete en problemas ajenos, así que primero quiere saber para quién es.
const trivia = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.cerrarReto();
  const ob = g.objectives.map((o) => o.objeto).find((o) => o?.reto?.tipo === "trivia");
  if (!ob) return { error: "ningún objeto se consigue por trivia" };
  g.inventario.delete(ob.id);
  g._factorLlevado.delete(ob.id);
  // AL LADO DEL PARCE. El reto se cierra si te alejas de quien te lo dio
  // (igual que con un objeto del piso), así que examinarse desde el otro
  // extremo del piso lo cancelaba en el primer cuadro.
  const parce = g.npcs.find((n) => n.cast === ob.de || n.id === ob.de);
  if (parce) {
    g.player.position.x = parce.position.x;
    g.player.position.z = parce.position.z;
  }

  // Hablarle NO da el café: abre el examen.
  g.completeTalk(ob.de);
  const abierto = !!g.reto && g.trivia.active;
  const loTienesYa = g.inventario.has(ob.id);
  const s0 = g.trivia.snapshot();

  // Las preguntas son LAS SUYAS, no las del minijuego de chismear.
  const suyas = /parce/i.test(s0?.titular ?? "") || /examen/i.test(s0?.titular ?? "");

  // Se responde hasta ganarlo, leyendo del propio módulo cuál es la buena:
  // se prueba la mecánica, no si el test se sabe las respuestas.
  for (let vuelta = 0; vuelta < 20 && g.trivia.active; vuelta++) {
    for (let i = 0; i < 3; i++) {
      if (!g.trivia.active) break;
      const r = g.trivia.responder(i);
      if (r === "acierto" || r === "ganado") break;
    }
    if (parce) {
      g.player.position.x = parce.position.x;
      g.player.position.z = parce.position.z;
    }
    g.update(1 / 60);
  }
  return {
    abierto,
    loTienesYa,
    titular: s0?.titular ?? "",
    suyas,
    loTienes: g.inventario.has(ob.id),
    anuncio: g.bigMessage?.text ?? "",
    cerrado: g.reto === null,
    poolParce: (g._chismes ?? []).filter((f) => f.pool === "parce").length,
    total: (g._chismes ?? []).length,
  };
});

if (trivia.error) {
  check("hay un objeto que se gana con trivia", false, trivia.error);
} else {
  check(
    "hablarle al Parce NO te da el café: te EXAMINA",
    trivia.abierto === true && trivia.loTienesYa === false,
    JSON.stringify(trivia)
  );
  check(
    "y las preguntas son LAS SUYAS, no las del chisme de actividad",
    trivia.suyas === true,
    JSON.stringify({ titular: trivia.titular, poolParce: trivia.poolParce, total: trivia.total })
  );
  check(
    "aprobar el examen te da el café y lo anuncia",
    trivia.loTienes === true && /ES TUYO/i.test(trivia.anuncio) && trivia.cerrado === true,
    JSON.stringify(trivia)
  );
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl HDMI se GANA: cables, con el ratón, y con Gabo acercándose"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
