/**
 * EL GUION QUE DE VERDAD SE LEE.
 *
 * No es una comprobación: es una PRUEBA DE ESCRITORIO. Juega el día entero y
 * va apuntando, EN ORDEN, todo lo que la jugadora lee — la intro, cada
 * anuncio grande, cada aviso, cada línea de diálogo, cada página de libreta,
 * el cierre y la evaluación.
 *
 * Existe porque el guion está repartido por seis archivos (el nivel, la
 * temporada, los diálogos, la libreta, la evaluación y los avisos del motor)
 * y ninguno se lee en el orden en que ocurren. Leerlos por separado da una
 * historia que parece coherente; leerlos SEGUIDOS es la única forma de ver
 * dónde se rompe.
 *
 * Uso: node tools/guion.mjs   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on("pageerror", (e) => console.log("  !! ERROR DE PÁGINA:", String(e).slice(0, 160)));

const guion = [];
function nota(fase, quien, texto) {
  if (!texto) return;
  const ult = guion[guion.length - 1];
  if (ult && ult.quien === quien && ult.texto === texto) return;
  guion.push({ fase, quien, texto });
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });

// ── LA INTRO, línea a línea ──
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 30000 });
for (let i = 0; i < 60; i++) {
  const abierto = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
  if (!abierto) break;
  const linea = await p.evaluate(() => ({
    quien: document.querySelector(".inc-dialogue-speaker-text")?.textContent ?? "",
    texto: document.querySelector(".inc-dialogue-text")?.textContent ?? "",
    narrador: !!document.querySelector(".vn-narrator")?.textContent,
    narrTexto: document.querySelector(".vn-narrator")?.textContent ?? "",
  }));
  nota("INTRO", linea.quien || (linea.narrador ? "(narrador)" : "?"), linea.texto || linea.narrTexto);
  const hayOpciones = await p.evaluate(
    () => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden")
  );
  if (hayOpciones) await p.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
  else await p.keyboard.press("Space");
  await p.waitForTimeout(150);
}

// ── EL DÍA. Se juega igual que en check:partida, pero apuntando todo lo que
// el motor DICE por el camino. ──
await p.evaluate(() => {
  const g = window.__game.engine.game;
  window.__dicho = [];
  g.setPaused(false);
  g.onHeatAlert = null;
  g.rules.maxWarnings = 99;
  // El jefe apartado: aquí se lee el GUION, no se mide la persecución. Con
  // él encima el registro se llena de «¡TE VEO!» y tapa lo que se viene a
  // revisar.
  g.boss._updateVision = function () {
    this.playerVisible = false;
    this.redAlert = false;
  };
  // Se enganchan las DOS bocas del motor: el anuncio grande y el aviso.
  const anuncioOrig = g.announce.bind(g);
  g.announce = (t, tono) => {
    window.__dicho.push({ tipo: "ANUNCIO", texto: t, tono });
    return anuncioOrig(t, tono);
  };
  const toastOrig = g.toast.bind(g);
  g.toast = (t, u) => {
    window.__dicho.push({ tipo: "AVISO", texto: typeof t === "string" ? t : t?.text });
    return toastOrig(t, u);
  };
  const misionOrig = g.onMissionDone;
  g.onMissionDone = (id) => {
    window.__dicho.push({ tipo: "MISIÓN CUMPLIDA", texto: id });
    return misionOrig?.(id);
  };
});

const jugada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const avanzar = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
  };
  const irA = (x, z, n = 6) => {
    for (let i = 0; i < n; i++) {
      g.player.position.x = x;
      g.player.position.z = z;
      avanzar(1);
    }
  };
  const resolverVasos = (vasos, cap) => {
    const clave = (v) => v.map((x) => x.join("")).sort().join("|");
    const listo = (v) => v.every((x) => !x.length || (x.length === cap && x.every((c) => c === x[0])));
    const vistos = new Set();
    const dfs = (v, prof) => {
      if (listo(v)) return [];
      if (prof > 40) return null;
      const k = clave(v);
      if (vistos.has(k)) return null;
      vistos.add(k);
      for (let a = 0; a < v.length; a++) {
        if (!v[a].length) continue;
        const color = v[a][v[a].length - 1];
        let n = 0;
        while (n < v[a].length && v[a][v[a].length - 1 - n] === color) n++;
        if (n === v[a].length && (v[a].length === cap || v.every((x, i) => i === a || !x.length))) continue;
        for (let q = 0; q < v.length; q++) {
          if (q === a || v[q].length >= cap) continue;
          if (v[q].length && v[q][v[q].length - 1] !== color) continue;
          if (!v[q].length && n === v[a].length) continue;
          const nv = v.map((x) => x.slice());
          const mv = Math.min(n, cap - nv[q].length);
          for (let m = 0; m < mv; m++) nv[q].push(nv[a].pop());
          const r = dfs(nv, prof + 1);
          if (r) return [[a, q], ...r];
        }
      }
      return null;
    };
    const sol = dfs(vasos.map((x) => x.slice()), 0);
    return sol && sol.length ? sol[0] : null;
  };
  const resolverReto = () => {
    for (let v = 0; v < 12 && g.cables.active; v++) {
      const s = g.cables.snapshot();
      const i = s.izq.findIndex((x) => !x.unido);
      if (i < 0) break;
      const j = s.der.findIndex((x) => x.color === s.izq[i].color && !x.unido);
      g.cables.elegir("izq", i);
      g.cables.elegir("der", j);
      avanzar(1);
    }
    for (let v = 0; v < 20 && g.trivia.active; v++) {
      for (let i = 0; i < 3; i++) {
        if (!g.trivia.active) break;
        const r = g.trivia.responder(i);
        if (r === "acierto" || r === "ganado") break;
      }
      avanzar(1);
    }
  };
  const conseguir = (ob) => {
    if (!ob || g.inventario.has(ob.id)) return true;
    const donde = g._dondeEsta(ob);
    if (!donde) return false;
    irA(donde.x, donde.z, 4);
    if (ob.de) g.completeTalk(ob.de);
    else {
      const spot = (g._itemSpots ?? []).find((it) => it.id === ob.id);
      if (spot && g.safeSpotState[spot.salaIndex]) g.safeSpotState[spot.salaIndex].busyLeft = 0;
      g.player.keys.delete(" ");
      avanzar(1);
      g.player.keys.add(" ");
      avanzar(2);
      g.player.keys.delete(" ");
    }
    for (let v = 0; v < 30 && g.reto; v++) {
      resolverReto();
      irA(donde.x, donde.z, 1);
    }
    return g.inventario.has(ob.id);
  };
  const jugar = (st) => {
    irA(st.x, st.z, 4);
    g.player.keys.add(" ");
    avanzar(3);
    for (let v = 0; v < 900 && !st.done; v++) {
      if (g.verter.active) {
        const s = g.verter.snapshot();
        const mov = resolverVasos(s.vasos, s.capacidad);
        if (mov) {
          g.verter.elegir(mov[0]);
          g.verter.elegir(mov[1]);
        } else break;
      } else if (g.baile.active) {
        const s = g.baile.snapshot();
        const paso = s?.pasos[s.indice];
        if (paso) g.baile.pulsar(paso.dir);
      } else if (g.chisme.active) {
        for (let i = 0; i < 3; i++) {
          const r = g.chisme.responder(i);
          if (r === "acierto" || r === "ganado" || r === null) break;
        }
      } else if (g.microondas.active) g.microondas.poner(0, 0);
      else if (g.pulse.active) {
        const s = g.pulse.snapshot();
        if (s && Math.abs(s.pos - s.zonaAt) < s.zona / 3) g.pulse.hit();
      }
      irA(st.x, st.z, 1);
      if (st.encendida) {
        g.player.keys.delete(" ");
        avanzar(6);
        g.player.keys.add(" ");
      }
    }
    g.player.keys.delete(" ");
    avanzar(2);
    return st.done;
  };

  g.clearGate();
  avanzar(4);
  const rondaEstaciones = () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const pend = g.objectives.filter((o) => !o.done && !o.dynamic && Number.isFinite(o.x));
      if (!pend.length) break;
      for (const st of pend) {
        if (st.objeto && !conseguir(st.objeto)) continue;
        jugar(st);
      }
    }
  };
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    rondaEstaciones();
    const fingir = g.objectives.find((o) => !o.done && o.dynamic && o.accion === "fingir");
    if (fingir) {
      const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
      irA(desk.x, desk.z, 3);
      g.player.keys.add(" ");
      for (let v = 0; v < 900 && !fingir.done; v++) irA(desk.x, desk.z, 1);
      g.player.keys.delete(" ");
    }
    const charlas = g.objectives.filter((o) => !o.done && o.dynamic && o.npcId);
    if (!charlas.length && !fingir) break;
    for (const o of charlas) {
      g.completeTalk(o.npcId);
      for (let v = 0; v < 20 && g.trivia.active; v++) {
        for (let i = 0; i < 3; i++) if (g.trivia.responder(i) === "acierto") break;
        avanzar(1);
      }
      avanzar(2);
    }
  }
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator") ?? { x: 0, z: 0 };
  for (let v = 0; v < 3000 && !g.gameOver; v++) irA(lift.x, lift.z, 1);

  return {
    dicho: window.__dicho,
    gameOver: g.gameOver,
    win: g.win,
    pendientes: g.objectives.filter((o) => !o.done).map((o) => o.id),
    // La libreta se lee por su getter, no por `data`: `save.data.libreta`
    // devuelve undefined y esta prueba llegó a informar «la libreta nunca se
    // escribe» cuando lo único vacío era la ruta que preguntaba.
    libreta: window.__game.engine.save?.libreta ?? null,
  };
});

for (const d of jugada.dicho) nota("DÍA", d.tipo, d.texto);

// ── EL CIERRE ──
// Se PASA el diálogo de salida línea a línea, igual que la intro. Leyendo el
// DOM una sola vez, lo que salía era la última caja que hubiera quedado en
// pantalla —una frase de captura de hacía dos minutos— y el final del día
// aparecía como una línea suelta sin sentido. El cierre es justo la parte que
// más importa revisar: es donde el día tiene que significar algo.
await p.waitForTimeout(1500);
for (let i = 0; i < 40; i++) {
  const abierto = await p.evaluate(() => window.__game.engine.dialogue.isOpen);
  if (!abierto) break;
  const linea = await p.evaluate(() => ({
    quien: document.querySelector(".inc-dialogue-speaker-text")?.textContent ?? "",
    texto: document.querySelector(".inc-dialogue-text")?.textContent ?? "",
  }));
  nota("CIERRE", linea.quien || "?", linea.texto);
  await p.keyboard.press("Space");
  await p.waitForTimeout(180);
}
const cierre = await p.evaluate(() => {
  const t = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()).filter(Boolean);
  return {
    evaluacion: t(".inc-review *:not(:has(*))").slice(0, 30),
    dialogo: t(".inc-dialogue-text"),
  };
});
for (const l of cierre.evaluacion) nota("CIERRE", "evaluación", l);

console.log("═".repeat(72));
console.log("EL GUION, EN EL ORDEN EN QUE SE LEE");
console.log("═".repeat(72));
let faseAnterior = "";
for (const g of guion) {
  if (g.fase !== faseAnterior) {
    console.log(`\n── ${g.fase} ${"─".repeat(60 - g.fase.length)}`);
    faseAnterior = g.fase;
  }
  console.log(`  ${String(g.quien).padEnd(16)} │ ${g.texto}`);
}
console.log("\n" + "═".repeat(72));
console.log("estado final:", JSON.stringify({
  gameOver: jugada.gameOver,
  win: jugada.win,
  pendientes: jugada.pendientes,
}));
console.log("libreta:", JSON.stringify(jugada.libreta)?.slice(0, 400));

await b.close();
