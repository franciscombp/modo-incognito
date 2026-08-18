/**
 * UNA PARTIDA COMPLETA. La prueba que faltaba.
 *
 * Todas las demás miran UNA pieza. Esta juega el día ENTERO como lo jugaría
 * una persona —hablar con Gabo, ir al puesto, conseguir los objetos, hacer
 * las tareas con sus minijuegos, salir por el ascensor— y falla si en
 * cualquier punto la partida se queda sin salida.
 *
 * Es la que responde a «el juego está rotísimo»: las piezas pueden estar
 * todas verdes y la partida no correr igual, porque lo que se rompe es la
 * COSTURA entre ellas.
 *
 * No mide destreza: se le da al motor lo que haría alguien que sabe jugar
 * (resolver el puzle, responder bien la trivia). Lo que comprueba es que
 * cada paso ABRA el siguiente.
 *
 * Uso: npm run check:partida   (necesita `npm run preview` en :4173)
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

// El día entero se juega DENTRO de la página, por cuadros: medir con reloj
// de pared mide la máquina, no el juego (la lección de check-chase).
const partida = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const paso = [];
  g.onHeatAlert = null;
  g.setPaused(false);
  // El jefe, apartado: aquí se prueba que el DÍA se pueda completar, no la
  // persecución — esa tiene sus propias pruebas. Con él encima, un fallo
  // sería «me atraparon», que no dice nada de la costura.
  g.boss._updateVision = function () {
    this.playerVisible = false;
    this.redAlert = false;
  };
  g.rules.maxWarnings = 99;

  const avanzar = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (g.paused) g.setPaused(false);
      g.update(1 / 60);
    }
  };
  // Llevar a la jugadora a un sitio: se COLOCA (esto es una prueba, no una
  // demo de navegación) y se le dan cuadros para que el motor reaccione.
  const irA = (x, z, n = 6) => {
    for (let i = 0; i < n; i++) {
      g.player.position.x = x;
      g.player.position.z = z;
      avanzar(1);
    }
  };
  const tocar = () => {
    g.player.keys.delete(" ");
    avanzar(1);
    g.player.keys.add(" ");
    avanzar(2);
    g.player.keys.delete(" ");
  };

  // ── 1 · La puerta del día: conocer a Gabo ──
  paso.push({ hito: "gate", metGabo: g.metGabo });
  g.clearGate();
  avanzar(4);
  paso.push({ hito: "trasGabo", metGabo: g.metGabo, misiones: g.objectives.filter((o) => !o.done).length });

  // ── 2 · Resolver TODAS las misiones que tengan estación ──
  const resolverReto = () => {
    // Cables
    for (let v = 0; v < 12 && g.cables.active; v++) {
      const s = g.cables.snapshot();
      const i = s.izq.findIndex((x) => !x.unido);
      if (i < 0) break;
      const j = s.der.findIndex((x) => x.color === s.izq[i].color && !x.unido);
      g.cables.elegir("izq", i);
      g.cables.elegir("der", j);
      avanzar(1);
    }
    // Trivia
    for (let v = 0; v < 20 && g.trivia.active; v++) {
      for (let i = 0; i < 3; i++) {
        if (!g.trivia.active) break;
        const r = g.trivia.responder(i);
        if (r === "acierto" || r === "ganado") break;
      }
      avanzar(1);
    }
  };

  const conseguirObjeto = (ob) => {
    if (!ob || g.inventario.has(ob.id)) return true;
    const donde = g._dondeEsta(ob);
    if (!donde) return false;
    irA(donde.x, donde.z, 4);
    if (ob.de) {
      g.completeTalk(ob.de);
    } else {
      // Vaciar la sala: robar exige que no haya nadie, y eso lo cubre
      // check-objetos. Aquí se quita del medio para probar la COSTURA.
      const spot = (g._itemSpots ?? []).find((it) => it.id === ob.id);
      if (spot && g.safeSpotState[spot.salaIndex]) g.safeSpotState[spot.salaIndex].busyLeft = 0;
      tocar();
    }
    // El reto que se haya abierto, resuelto — sin soltarse del sitio.
    for (let v = 0; v < 30 && g.reto; v++) {
      resolverReto();
      irA(donde.x, donde.z, 1);
    }
    return g.inventario.has(ob.id);
  };

  // Devuelve el PRIMER trasvase de una solución completa, o null si no la hay.
  const resolverVasos = (vasos, capacidad) => {
    const clave = (v) => v.map((x) => x.join("")).sort().join("|");
    const listo = (v) =>
      v.every((x) => !x.length || (x.length === capacidad && x.every((c) => c === x[0])));
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
        if (n === v[a].length && (v[a].length === capacidad || v.every((x, i) => i === a || !x.length)))
          continue;
        for (let q = 0; q < v.length; q++) {
          if (q === a || v[q].length >= capacidad) continue;
          if (v[q].length && v[q][v[q].length - 1] !== color) continue;
          if (!v[q].length && n === v[a].length) continue;
          const nv = v.map((x) => x.slice());
          const mueve = Math.min(n, capacidad - nv[q].length);
          for (let m = 0; m < mueve; m++) nv[q].push(nv[a].pop());
          const resto = dfs(nv, prof + 1);
          if (resto) return [[a, q], ...resto];
        }
      }
      return null;
    };
    const sol = dfs(vasos.map((x) => x.slice()), 0);
    return sol && sol.length ? sol[0] : null;
  };

  const jugarEstacion = (st) => {
    irA(st.x, st.z, 4);
    g.player.keys.add(" ");
    avanzar(3);
    // Cada verbo, jugado como lo jugaría alguien que sabe.
    for (let v = 0; v < 900 && !st.done; v++) {
      if (g.verter.active) {
        // Se BUSCA la solución (DFS con estados vistos), no se aplica una
        // heurística: una heurística que se atasca haría fallar la prueba por
        // su propio montaje, que es el error clásico de estas comprobaciones.
        const s = g.verter.snapshot();
        const mov = resolverVasos(s.vasos, s.capacidad);
        if (mov) {
          g.verter.elegir(mov[0]);
          g.verter.elegir(mov[1]);
        } else break;
      } else if (g.baile.active) {
        // EL BAILE: se lee el paso que toca y se «pulsa» su flecha. El
        // compás corre solo, así que aquí no hay nada que esperar — se
        // responde y el propio motor avanza al siguiente.
        const s = g.baile.snapshot();
        const paso = s?.pasos[s.indice];
        if (paso) g.baile.pulsar(paso.dir);
      } else if (g.chisme.active) {
        for (let i = 0; i < 3; i++) {
          const r = g.chisme.responder(i);
          if (r === "acierto" || r === "ganado" || r === null) break;
        }
      } else if (g.microondas.active) {
        g.microondas.poner(0, 0);
      } else if (g.pulse.active) {
        const s = g.pulse.snapshot();
        if (s && Math.abs(s.pos - s.zonaAt) < s.zona / 3) g.pulse.hit();
      }
      irA(st.x, st.z, 1);
      // Encendida: soltar para BANCARLA.
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

  const hechas = [];
  const rondaEstaciones = () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const pend = g.objectives.filter((o) => !o.done && !o.dynamic && Number.isFinite(o.x));
      if (!pend.length) break;
      for (const st of pend) {
        if (st.objeto && !conseguirObjeto(st.objeto)) {
          paso.push({ hito: "objetoFallido", id: st.id, objeto: st.objeto.id });
          continue;
        }
        const ok = jugarEstacion(st);
        hechas.push({ id: st.id, done: ok, intentos: 1, prog: +(st.progress / (st.time || 1)).toFixed(2) });
      }
    }
  };
  rondaEstaciones();

  // Las dinámicas (fingir, hablar) se cumplen por su camino, y EN VUELTAS:
  // la cadena encadena, así que cumplir una abre la siguiente. De un solo
  // barrido, la misión que depende de fingir no existía todavía.
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    rondaEstaciones();
    const fingir = g.objectives.find((o) => !o.done && o.dynamic && o.accion === "fingir");
    if (fingir) {
      const desk = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
      irA(desk.x, desk.z, 3);
      tocar();
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
  paso.push({ hito: "tareas", hechas });

  const pendientes = g.objectives.filter((o) => !o.done);
  paso.push({ hito: "pendientes", ids: pendientes.map((o) => o.id) });

  // ── 3 · SALIR por el ascensor ──
  const lift = window.__floorplan.areas.find((a) => a.kind === "elevator") ?? { x: 0, z: 0 };
  for (let v = 0; v < 3000 && !g.gameOver; v++) {
    irA(lift.x, lift.z, 1);
  }

  return {
    paso,
    gameOver: g.gameOver,
    win: g.win,
    pendientes: pendientes.length,
    energia: Math.round(g.energy),
  };
});

const hitos = Object.fromEntries(partida.paso.map((x) => [x.hito, x]));
check(
  "el día ARRANCA y la puerta se supera",
  hitos.trasGabo?.metGabo === true && hitos.trasGabo?.misiones > 0,
  JSON.stringify(hitos.trasGabo)
);
check(
  "ningún objeto se queda sin poder conseguirse",
  !partida.paso.some((x) => x.hito === "objetoFallido"),
  JSON.stringify(partida.paso.filter((x) => x.hito === "objetoFallido"))
);
// Se juzga el estado FINAL de cada estación, no cada intento: una sala de
// reuniones ocupada rechaza el primer intento a propósito (se libera sola),
// y contar intentos convertiría una mecánica del juego en un fallo.
const hechas = hitos.tareas?.hechas ?? [];
const porId = new Map();
for (const h of hechas) porId.set(h.id, (porId.get(h.id)?.done ? porId.get(h.id) : h));
const sinTerminar = [...porId.values()].filter((h) => !h.done);
check(
  "todas las tareas con estación se pueden TERMINAR",
  porId.size > 0 && sinTerminar.length === 0,
  JSON.stringify(sinTerminar)
);
check(
  "no queda ninguna misión imposible",
  partida.pendientes === 0,
  JSON.stringify(hitos.pendientes)
);
check(
  "y la jornada CIERRA saliendo por el ascensor",
  partida.gameOver === true,
  JSON.stringify({ gameOver: partida.gameOver, win: partida.win, energia: partida.energia })
);
check("sin errores de página en toda la partida", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nUna jornada entera, de la puerta al ascensor, sin quedarse sin salida"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
