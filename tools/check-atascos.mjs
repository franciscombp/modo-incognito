/**
 * NADIE SE QUEDA TRABADO.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 *
 * Es la queja más difícil de perseguir a mano y la más fácil de dar por
 * arreglada sin estarlo: «se quedan pegados contra la planta». No falla
 * nada, no hay error en consola, y en la partida en la que estás mirando casi
 * nunca pasa — pasa cuando un cuerpo se cruza en el hueco justo, que es una
 * de cada tantas.
 *
 * Y había TRES formas distintas de caminar, cada una con su propio agujero:
 *   · la caminata guiada de la jugadora (te escoltan, te sientan) iba en
 *     LÍNEA RECTA, así que una maceta la dejaba empujando para siempre — y
 *     con el control bloqueado, que se ve igual que un juego colgado;
 *   · el paseo de los figurantes no resolvía colisiones ni medía si avanzaba;
 *   · el anti-atasco del jefe empujaba en dirección ALEATORIA.
 *
 * Ahora las tres salen del mismo caminante (`src/entities/walk.js`), y esto
 * es lo que comprueba que de verdad salen de ahí: se pone a cada uno en el
 * peor sitio que se nos ocurre y se exige UNA de dos cosas —llegar, o
 * RENDIRSE LIMPIAMENTE—. Lo que no se admite es la tercera: seguir moliendo.
 *
 * Uso: npm run check:atascos   (necesita `npm run preview` en :4173)
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
  g.saltarEscolta();
  g.onHeatAlert = null;
  // LA JORNADA NO SE PUEDE ACABAR A MITAD DE LA PRUEBA. Aquí se avanzan más
  // de setenta segundos de juego entre los cuatro casos, o sea media jornada:
  // sin esto, la energía se agotaba, la jugadora se dormía delante del jefe y
  // el día terminaba — y los tres casos siguientes medían un juego PARADO,
  // que da cero movimiento en todo y parece que nadie camina. Se congela lo
  // que cuenta el tiempo, no lo que se está midiendo (el paso).
  window.__vivo = () => {
    g.energy = g.energyMax;
    g.timeLeft = Math.max(g.timeLeft, 90);
    g.warnings = 0;
    g.asleepFor = 0;
    if (g.paused) g.setPaused(false);
  };
});

// ── 1 · LA JUGADORA, DETRÁS DE UNA PLANTA ──
// El caso de la captura: te mandan a un sitio y hay una maceta en medio. En
// línea recta esto no se resolvía NUNCA; con ruta, se rodea.
const guiada = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const world = window.__game.world;
  // `plants`, no `props`: el plano ya viene escalado y con ese nombre (ver
  // scene/floorplan.js). Pedirlo por el nombre del JSON crudo devolvía
  // undefined y la prueba se SALTABA sola — un SKIP silencioso es peor que
  // un fallo, porque parece verde.
  const planta = window.__floorplan.plants?.[0];
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  if (!planta || !mesa) return { sinPlanta: true };

  // AL OTRO LADO DE LA PLANTA, en la línea que va de la planta a la mesa:
  // así el trayecto recto pasa literalmente por encima de ella.
  //
  // Y ARRIMADO A SUELO PISABLE (`navmesh.snap`), que es lo que hace el juego
  // en todas partes al colocar a alguien. Sin esto, el punto «detrás de la
  // planta» caía a veces en un hueco no transitable —dentro del alcance del
  // ascensor, contra la fachada— y entonces lo que medía la prueba era su
  // propio montaje: una jugadora emparedada no puede llegar a ninguna parte,
  // y el «no llegó» no decía nada del paseo.
  const nav = window.__game.navmesh;
  const vx = mesa.x - planta.x;
  const vz = mesa.z - planta.z;
  const len = Math.hypot(vx, vz) || 1;
  const detras = nav.snap(planta.x - (vx / len) * 1.6 * S, planta.z - (vz / len) * 1.6 * S);
  g.player.position.x = detras.x;
  g.player.position.z = detras.z;
  g.player.keys.clear();
  world.resolveCircle(g.player.position, g.player.radius);
  const pisable = nav.isWalkable(g.player.position.x, g.player.position.z);

  const d0 = Math.hypot(g.player.position.x - mesa.x, g.player.position.z - mesa.z);
  let llego = false;
  let rindio = false;
  g.player.walkTo = {
    x: mesa.x,
    z: mesa.z,
    tol: 0.9 * S,
    onArrive: () => {
      llego = true;
    },
    onGiveUp: () => {
      rindio = true;
    },
  };
  // EN CUADROS, no en milisegundos: una prueba de movimiento medida con
  // `sleep` mide la máquina. Y el paso de la jugadora vive en el bucle de
  // render de main.js, así que hay que darlo a mano.
  for (let i = 0; i < 900 && !llego && !rindio; i++) {
    window.__vivo();
    g.update(1 / 60);
    g.player.update(1 / 60, world);
  }
  const d1 = Math.hypot(g.player.position.x - mesa.x, g.player.position.z - mesa.z);
  return { d0: +d0.toFixed(2), d1: +d1.toFixed(2), llego, rindio, pisable, S };
});
if (guiada.sinPlanta) {
  console.log("SKIP  el plano no declara plantas");
} else {
  check(
    "con una planta en medio, la caminata guiada LLEGA (rodea, no empuja)",
    guiada.llego === true,
    JSON.stringify(guiada)
  );
  check(
    "y si no pudiera, lo DIRÍA en vez de moler contra el mueble",
    guiada.llego === true || guiada.rindio === true,
    JSON.stringify(guiada)
  );
}

// ── 2 · LA JUGADORA, CONTRA UN MURO SIN SALIDA ──
// El caso imposible a propósito: un destino al que no se puede llegar. Lo
// que se exige aquí NO es llegar — es que se RINDA, y en un tiempo humano.
// Un paseo que no puede llegar y no lo dice es el bug que estamos quitando.
const imposible = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const world = window.__game.world;
  const fuera = window.__floorplan.footprint.reduce(
    (a, [x, z]) => ({ x: Math.max(a.x, x), z: Math.max(a.z, z) }),
    { x: -Infinity, z: -Infinity }
  );
  g.player.keys.clear();
  let llego = false;
  let rindio = false;
  let cuadros = 0;
  // Un punto MUY fuera del piso: no hay casilla pisable que valga.
  g.player.walkTo = {
    x: fuera.x + 40 * S,
    z: fuera.z + 40 * S,
    tol: 0.5 * S,
    onArrive: () => {
      llego = true;
    },
    onGiveUp: () => {
      rindio = true;
    },
  };
  for (let i = 0; i < 900 && !llego && !rindio; i++) {
    cuadros++;
    window.__vivo();
    g.update(1 / 60);
    g.player.update(1 / 60, world);
  }
  return { llego, rindio, segundos: +(cuadros / 60).toFixed(1), suelta: g.player.walkTo === null };
});
check(
  "un destino imposible se ABANDONA, no se muele para siempre",
  imposible.rindio === true || imposible.llego === true,
  JSON.stringify(imposible)
);
check(
  "y se abandona pronto (por debajo de 8 s), no al final de la jornada",
  imposible.segundos < 8,
  JSON.stringify(imposible)
);
check(
  "y el mando se devuelve (no te deja atrapada sin control)",
  imposible.suelta === true,
  JSON.stringify(imposible)
);

// ── 3 · LOS FIGURANTES, EN SU PASEO ──
// Se les deja vivir un buen rato y se comprueba que ninguno se queda vibrando
// en el sitio. Un figurante en `settle` está QUIETO a propósito (es su
// puesto): lo que no puede haber es alguien en `stroll`/`return` —o sea,
// yendo a un sitio— que en varios segundos no se ha movido nada.
const figurantes = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const npcs = g.npcs.filter((n) => n.active !== false);
  // Se les fuerza a pasear YA (sin esto, su reloj desfasado tarda hasta 26 s
  // en levantarlos y la prueba mediría a gente sentada).
  for (const n of npcs) n._timer = 0;
  const quietos = new Map();
  const previo = new Map();
  // CUÁNTO CAMINÓ CADA UNO durante toda la ventana. Mirar el estado FINAL
  // era una foto: un ciclo entero (levantarse, pasear, volver, sentarse) cabe
  // en estos cuarenta segundos, así que acabar en `settle` es lo normal y no
  // dice nada. Lo que se quiere saber es si de verdad se movieron.
  const recorrido = new Map();
  for (const n of npcs) previo.set(n, { x: n.position.x, z: n.position.z });

  for (let i = 0; i < 2400; i++) {
    window.__vivo();
    g.update(1 / 60);
    // EL PASO DE UN FIGURANTE VIVE EN EL BUCLE DE RENDER (main.js), igual
    // que el de la jugadora: sin darlo a mano, esto medía a nueve personas
    // congeladas y decía que nadie se atasca — verde por no mirar.
    for (const n of npcs) n.update(1 / 60, i / 60);
    for (const n of npcs) {
      const yendo = n._state === "stroll" || n._state === "return";
      const a = previo.get(n);
      const movido = Math.hypot(n.position.x - a.x, n.position.z - a.z);
      previo.set(n, { x: n.position.x, z: n.position.z });
      recorrido.set(n, (recorrido.get(n) ?? 0) + movido);
      if (!yendo || movido > 0.004 * S) {
        quietos.set(n, 0);
      } else {
        quietos.set(n, (quietos.get(n) ?? 0) + 1 / 60);
      }
    }
  }
  let peor = 0;
  let quien = null;
  for (const [n, s] of quietos) {
    if (s > peor) {
      peor = s;
      quien = n.id ?? n.cast ?? "figurante";
    }
  }
  return {
    npcs: npcs.length,
    peorParadaSegundos: +peor.toFixed(1),
    quien,
    pasearon: [...recorrido.values()].filter((m) => m > 1 * S).length,
  };
});
// El techo del propio caminante es 3 s (se rinde ahí), más el cuadro que
// tarda el NPC en reaccionar. Cinco segundos es holgura de sobra y sigue
// cazando el caso viejo, que era «para siempre».
check(
  "ningún figurante se queda trabado yendo a un sitio",
  figurantes.peorParadaSegundos < 5,
  JSON.stringify(figurantes)
);
check(
  "y el piso sigue teniendo gente que camina de verdad",
  figurantes.pasearon >= 3,
  JSON.stringify(figurantes)
);

// ── 3bis · UN BLANCO QUE SE MUEVE ──
// La escolta reescribe su destino CADA CUADRO con la posición de Gabo, y un
// destino que se desplaza poco a poco se actualizaba en el sitio sin volver a
// trazar la ruta: se caminaba un plan hecho para donde el otro ESTABA.
//
// Se prueba sin depender de la escena: un punto que se aleja andando en línea
// recta y una jugadora que lo persigue. Tiene que ALCANZARLO —va más rápida—
// y, sobre todo, no puede RENDIRSE por el camino: no acercarse a algo que se
// está yendo no es culpa de quien camina, y con la vara vieja seguir a alguien
// dos pasos por detrás se leía como estar atascada.
const movil = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const world = window.__game.world;
  const nav = window.__game.navmesh;
  const ruta = window.__floorplan.patrolRoute;
  // Dos puntos que el juego GARANTIZA caminables (waypoints de la ronda): un
  // blanco colocado a mano puede caer dentro de un mueble, y entonces lo que
  // mide la prueba es su propio montaje.
  const a = ruta[0];
  const b = ruta[Math.min(2, ruta.length - 1)];
  g.player.position.x = a.x;
  g.player.position.z = a.z;
  g.player.keys.clear();
  world.resolveCircle(g.player.position, g.player.radius);

  // El blanco: empieza junto a la jugadora y se va hacia el otro waypoint a
  // paso de figurante, o sea más despacio que ella.
  const blanco = { x: a.x, z: a.z };
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len = Math.hypot(vx, vz) || 1;
  const VEL = 1.6 * S;

  let rindio = false;
  let alcanzo = false;
  let peorDistancia = 0;
  for (let i = 0; i < 900 && !rindio && !alcanzo; i++) {
    window.__vivo();
    // El blanco camina (arrimado a suelo pisable, como cualquiera del piso).
    const paso = Math.min(VEL * (1 / 60), Math.hypot(b.x - blanco.x, b.z - blanco.z));
    if (paso > 0.001) {
      const n = nav.snap(blanco.x + (vx / len) * paso, blanco.z + (vz / len) * paso);
      if (n) {
        blanco.x = n.x;
        blanco.z = n.z;
      }
    }
    // Y LA ESCOLTA REESCRIBE EL DESTINO CADA CUADRO, igual que en el juego.
    g.player.walkTo = {
      x: blanco.x,
      z: blanco.z,
      tol: 1.1 * S,
      onArrive: () => {
        alcanzo = true;
      },
      onGiveUp: () => {
        rindio = true;
      },
    };
    g.update(1 / 60);
    g.player.update(1 / 60, world);
    peorDistancia = Math.max(
      peorDistancia,
      Math.hypot(g.player.position.x - blanco.x, g.player.position.z - blanco.z)
    );
  }
  return {
    alcanzo,
    rindio,
    peorDistancia: +(peorDistancia / S).toFixed(2),
    separacionFinal: +(
      Math.hypot(g.player.position.x - blanco.x, g.player.position.z - blanco.z) / S
    ).toFixed(2),
  };
});
check(
  "siguiendo a un blanco que SE MUEVE, no se rinde por el camino",
  movil.rindio === false,
  JSON.stringify(movil)
);
check(
  "y lo alcanza (la ruta se rehace, no se camina el plan viejo)",
  movil.alcanzo === true,
  JSON.stringify(movil)
);
check(
  "y nunca se descuelga más de tres mesas mientras lo sigue",
  movil.peorDistancia < 3,
  JSON.stringify(movil)
);

// ── 4 · EL JEFE, ENCAJADO CONTRA UN MUEBLE ──
// Se le planta pegado a un escritorio con la jugadora justo detrás, que es la
// postura que producía el baile de tropezones. Tiene que salir de ahí.
const jefe = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const mesa = window.__floorplan.safeSpots.find((s) => s.kind === "desk");
  g.suspicion = 95;
  g.boss.suspicion = 95;
  g.boss.position.x = mesa.x;
  g.boss.position.z = mesa.z;
  g.player.position.x = mesa.x + 0.2 * S;
  g.player.position.z = mesa.z + 0.2 * S;
  g.boss.startChase();
  const x0 = g.boss.position.x;
  const z0 = g.boss.position.z;
  let avanzo = 0;
  for (let i = 0; i < 600; i++) {
    // Aquí NO se toca la sospecha: este caso la quiere alta (hay persecución
    // que medir). `__vivo` solo cuida energía, reloj y amonestaciones.
    window.__vivo();
    g.suspicion = 95;
    g.boss.suspicion = 95;
    const ax = g.boss.position.x;
    const az = g.boss.position.z;
    g.update(1 / 60);
    avanzo += Math.hypot(g.boss.position.x - ax, g.boss.position.z - az);
  }
  return {
    recorrido: +(avanzo / S).toFixed(2),
    desplazado: +(Math.hypot(g.boss.position.x - x0, g.boss.position.z - z0) / S).toFixed(2),
  };
});
check(
  "el jefe encajado contra un mueble se DESATASCA y camina",
  jefe.recorrido > 1,
  JSON.stringify(jefe)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(fallos === 0 ? "\nNadie se queda trabado: se rodea, y si no se puede, se dice" : `\n${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
