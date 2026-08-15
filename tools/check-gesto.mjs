/**
 * EL GESTO Y LA CUENTA ATRÁS (src/game/gestures.js, docs/MOTOR.md §1.2).
 *

 * EL CONTRATO CAMBIÓ con el bucle v2 (conseguir → activar → aguantar):
 * activar una actividad ES su propio modo — el mundo se CONGELA (jefe,
 * reloj, sospecha pasiva) y lo único que corre es el minijuego y su cuenta
 * atrás. Lo que impide que la estación sea "el sitio más seguro del piso"
 * ya no es el jefe caminando por detrás: es el TEMPORIZADOR (no puedes
 * quedarte a vivir dentro), el objeto que hubo que conseguir ANTES con el
 * piso vivo, y el AGUANTE de después, a la vista de todos. La primera
 * comprobación es que el piso SIGUE VIVO: jefe andando, `limite` corriendo, reloj de
 * jornada parado.
 *
 * Las otras dos que sostienen el diseño:
 *
 *  · `limite` SIEMPRE mayor que `time`. Si se invirtiera, mantener espacio
 *    dejaría de poder terminar la tarea y el suelo del minijuego —lo único
 *    que garantiza que nadie se quede encallado— se caería sin que nada
 *    fallara a la vista.
 *  · Al agotarse la cuenta, el jefe VIENE DE VERDAD. Amonestar a distancia
 *    rompería el invariante de que la amonestación es siempre física; pero
 *    un pico de sospecha que se quede por debajo de `chaseSuspicionFloor`
 *    deja la amenaza sin convocar a nadie, y entonces la cuenta atrás es un
 *    adorno. Hay que caer justo en medio.
 *
 * Uso: npm run check:gesto   (necesita `npm run preview` en :4173)
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
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });

await p.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = ".vn-layer, .inc-dialogue { display: none !important; }";
  document.head.appendChild(css);
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  g.minions.forEach((m) => m.setActive(false));
});
await p.waitForTimeout(600);

// ── 0 · EL CONTRATO DE LOS DATOS ────────────────────────────────────────
const datos = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const acts = g._allStations ?? [];
  return {
    total: acts.length,
    conGesto: acts.filter((a) => a.gesto).map((a) => a.id),
    sinLimite: acts.filter((a) => !(a.limite > 0)).map((a) => a.id),
    limiteCorto: acts.filter((a) => a.limite > 0 && a.limite <= a.time).map((a) => a.id),
    ambos: acts.filter((a) => a.gesto && a.pulso).map((a) => a.id),
  };
});
assert("todas las actividades traen cuenta atrás", datos.sinLimite.length === 0, datos.sinLimite.join(", "));
assert(
  "y el límite SIEMPRE da para terminarla manteniendo pulsado",
  datos.limiteCorto.length === 0,
  `limite <= time en: ${datos.limiteCorto.join(", ")}`
);
assert("hay actividades con gesto", datos.conGesto.length > 0, JSON.stringify(datos));
assert(
  "ninguna juega al gesto Y al pulso a la vez",
  datos.ambos.length === 0,
  `declaran los dos: ${datos.ambos.join(", ")}`
);

// ── 1 · El gesto arranca, y el HUD lo pinta en primer plano ─────────────
const arranque = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const st = (() => {
    // La actividad del gesto puede no estar ACTIVA hoy (la cadena de la
    // temporada la abre más tarde), y lo que se prueba aquí es el gesto, no
    // la cadena. Si no está en la lista del día se toma su estación del
    // plano — el mismo montaje que ya usan check-objetos y check-chisme.
    // Antes esto tiraba del café, que dejó de jugar al gesto para jugar al
    // puzle de verter, y las cinco afirmaciones fallaban sin que hubiera
    // nada roto en el gesto.
    const enLista = g.objectives.find((o) => o.gesto && !o.dynamic);
    if (enLista) return enLista;
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.gesto);
    if (!base) return null;
    const copia = { ...base, progress: 0, done: false, objeto: null };
    g.objectives.push(copia);
    return copia;
  })();
  if (!st) return { error: "el día no trae ninguna estación con gesto" };
  // El bucle v2 pide CONSEGUIR antes de activar: aquí se mide el gesto, no
  // la búsqueda del objeto (esa la mira check-objetos), así que se concede.
  if (st.objeto) g.inventario.add(st.objeto.id);
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  await sleep(400);
  const panel = document.querySelector(".inc-action");
  return {
    activo: g.gesture.active,
    pintado: !!document.querySelector(".inc-action.on"),
    carril: !!document.querySelector(".inc-action-track.on"),
    // Nunca puede robar un clic: el piso sigue detrás y se sigue jugando.
    robaClics: panel ? getComputedStyle(panel).pointerEvents !== "none" : null,
    // El paso se bloquea mientras dura, que es lo que deja libre el eje.
    pasoBloqueado: g.player.inputLocked,
    cuenta: !!document.querySelector(".inc-action-clock.on"),
    estacion: st.id,
  };
});
assert("el gesto arranca al empezar la actividad", arranque.activo === true, JSON.stringify(arranque));
assert("y el HUD lo pinta en primer plano", arranque.pintado === true, JSON.stringify(arranque));
assert("con su carril", arranque.carril === true, JSON.stringify(arranque));
assert("y su cuenta atrás", arranque.cuenta === true, JSON.stringify(arranque));
assert("el panel NO roba clics", arranque.robaClics === false, JSON.stringify(arranque));
assert("mientras dura el gesto no se camina", arranque.pasoBloqueado === true, JSON.stringify(arranque));

// ── 2 · EL CONTRATO NUEVO: activar es SU PROPIO MODO ───────────────────
// El mundo se CONGELA mientras juegas (jefe quieto, reloj de jornada
// parado) y lo único que corre es el minijuego y su cuenta atrás — el
// temporizador es lo que impide quedarse a vivir dentro. La exposición
// vive antes (conseguir el objeto) y después (el aguante, mundo vivo).
const vivo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g._caughtCooldown = 999;
  // Y CON MOTIVO PARA VENIR: en ronda puede tocarle un tramo parado, y lo
  // que se mide aquí no es su ruta, es que el mundo NO está congelado —
  // activar una tarea dejaba a Gabo de estatua y esa era la captura rota.
  // Justo por encima del umbral de caza y por DEBAJO del nivel 3 de
  // búsqueda: pasado ese nivel, game.js pausa la partida con su aviso a
  // pantalla completa y lo que se mediría es un juego parado.
  g.onHeatAlert = null;
  g.suspicion = Math.max(g.suspicion, g.boss.chaseSuspicionFloor + 5);
  g.boss.suspicion = g.suspicion;
  g.boss.position.x = g.player.position.x + 30;
  g.boss.position.z = g.player.position.z;
  g.boss.startChase();
  const antes = { x: g.boss.position.x, z: g.boss.position.z };
  const st = (() => {
    // La actividad del gesto puede no estar ACTIVA hoy (la cadena de la
    // temporada la abre más tarde), y lo que se prueba aquí es el gesto, no
    // la cadena. Si no está en la lista del día se toma su estación del
    // plano — el mismo montaje que ya usan check-objetos y check-chisme.
    // Antes esto tiraba del café, que dejó de jugar al gesto para jugar al
    // puzle de verter, y las cinco afirmaciones fallaban sin que hubiera
    // nada roto en el gesto.
    const enLista = g.objectives.find((o) => o.gesto && !o.dynamic);
    if (enLista) return enLista;
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.gesto);
    if (!base) return null;
    const copia = { ...base, progress: 0, done: false, objeto: null };
    g.objectives.push(copia);
    return copia;
  })();
  const limite0 = st.limiteLeft ?? st.limite;
  const reloj0 = g.timeLeft;
  // POR CUADROS, no con `sleep()`. En headless el bucle de render va
  // estrangulado y en una vuelta cargada puede no pasar NI UN cuadro: lo que
  // se medía entonces era la máquina, y «el jefe sigue viniendo» salía cara o
  // cruz. Es la misma lección que ya se aplicó en check-chase.
  for (let i = 0; i < 54; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  return {
    // No es la pausa de menú: el juego no está `paused` — está en SU modo.
    pausado: g.paused,
    congelado: g.worldFrozen,
    // EL JEFE SIGUE ANDANDO. Antes esto exigía lo contrario: activar
    // congelaba el mundo. Era el fallo que rompía la captura —mantener
    // espacio en cualquier estación dejaba a Gabo de estatua a un palmo, en
    // rojo, sin llegar a tocarte— y de paso vaciaba el minijuego, porque sin
    // nadie acercándose no hay nada que apretar.
    jefeAnda:
      Math.hypot(g.boss.position.x - antes.x, g.boss.position.z - antes.z) > 0.01,
    limiteCorre: (st.limiteLeft ?? st.limite) < limite0,
    // Y EL DÍA CORRE: la jornada dura siempre lo mismo, pase lo que pase.
    relojCorre: g.timeLeft < reloj0,
  };
});
assert("activar NO es la pausa de menú", vivo.pausado === false, JSON.stringify(vivo));
assert("y el mundo SIGUE VIVO mientras juegas", vivo.congelado === false, JSON.stringify(vivo));
assert("el jefe SIGUE VINIENDO mientras juegas", vivo.jefeAnda === true, JSON.stringify(vivo));
assert("la cuenta atrás del minijuego SÍ corre", vivo.limiteCorre === true, JSON.stringify(vivo));
assert("y el reloj de la jornada NO se para", vivo.relojCorre === true, JSON.stringify(vivo));

// ── 3 · Dentro de la zona acelera; el extremo hace RUIDO ────────────────
// Se llama a `gesture.update()` DIRECTAMENTE, con el eje a mano: por el bucle
// normal habría que acertar el momento y la medida saldría del azar de dónde
// pillara el valor. Aquí lo que se mide es el mecanismo, no el pilotaje.
const mando = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const st = (() => {
    // La actividad del gesto puede no estar ACTIVA hoy (la cadena de la
    // temporada la abre más tarde), y lo que se prueba aquí es el gesto, no
    // la cadena. Si no está en la lista del día se toma su estación del
    // plano — el mismo montaje que ya usan check-objetos y check-chisme.
    // Antes esto tiraba del café, que dejó de jugar al gesto para jugar al
    // puzle de verter, y las cinco afirmaciones fallaban sin que hubiera
    // nada roto en el gesto.
    const enLista = g.objectives.find((o) => o.gesto && !o.dynamic);
    if (enLista) return enLista;
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.gesto);
    if (!base) return null;
    const copia = { ...base, progress: 0, done: false, objeto: null };
    g.objectives.push(copia);
    return copia;
  })();
  g.gesture.end();
  g.gesture.begin(st);
  const r = {};

  // (a) DENTRO: empujar hacia la zona hasta entrar, y ver el multiplicador.
  let mult = 1;
  for (let i = 0; i < 600; i++) {
    const s = g.gesture.snapshot();
    const dir = s.valor < s.zonaAt ? 1 : -1;
    mult = g.gesture.update(1 / 60, { right: dir, up: dir });
    if (g.gesture.snapshot().dentro) break;
  }
  r.dentro = g.gesture.snapshot().dentro;
  r.multDentro = Number(mult.toFixed(2));

  // (b) FUERA: soltar y dejar que la deriva se lo lleve. Ni acelera ni frena
  // — el suelo se mantiene intacto, que es la regla.
  let multFuera = null;
  for (let i = 0; i < 600; i++) {
    multFuera = g.gesture.update(1 / 60, { right: 0, up: 0 });
    if (!g.gesture.snapshot().dentro) break;
  }
  r.multFuera = Number(multFuera.toFixed(2));

  // (c) EL EXTREMO: dejar que se vaya del todo hace RUIDO cada segundo.
  const antes = g.suspicion;
  for (let i = 0; i < 900; i++) {
    const s = g.gesture.snapshot();
    // Empujar SIEMPRE hacia el extremo que delata.
    const dir = s.delatada ? 0 : 1;
    g.gesture.update(1 / 60, { right: dir, up: dir });
    if (g.gesture.snapshot().delatada) break;
  }
  r.delatada = g.gesture.snapshot().delatada;
  for (let i = 0; i < 60; i++) g.gesture.update(1 / 60, { right: 1, up: 1 });
  r.ruido = g.suspicion > antes;
  g.gesture.end();
  return r;
});
assert("se puede meter el valor en la zona buena", mando.dentro === true, JSON.stringify(mando));
assert("y estar dentro ACELERA la tarea", mando.multDentro > 1, JSON.stringify(mando));
assert("fuera avanza al ritmo del suelo, sin frenar", mando.multFuera === 1, JSON.stringify(mando));
assert("dejarlo en el extremo hace RUIDO", mando.ruido === true, JSON.stringify(mando));

// ── 3bis · La cuenta atrás NO se congela si te vas ─────────────────────
// Es lo que la convierte en presión de verdad: empezaste algo prohibido, y
// salir corriendo del jefe no te devuelve el tiempo. Si esto se rompiera, la
// cuenta atrás pasaría a ser gratis — bastaría con soltar y volver.
const sigue = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ENFRIAR PRIMERO. La fase anterior hace ruido a propósito hasta el tope, y
  // el nivel de búsqueda 3 PAUSA la partida desde game.js con su aviso a
  // pantalla completa. En pausa `update()` sale antes de tocar nada: la
  // primera vez esto pareció que la cuenta atrás se congelaba al abandonar, y
  // lo que estaba congelado era el juego entero.
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  g.setPaused(false);

  const st = (() => {
    // La actividad del gesto puede no estar ACTIVA hoy (la cadena de la
    // temporada la abre más tarde), y lo que se prueba aquí es el gesto, no
    // la cadena. Si no está en la lista del día se toma su estación del
    // plano — el mismo montaje que ya usan check-objetos y check-chisme.
    // Antes esto tiraba del café, que dejó de jugar al gesto para jugar al
    // puzle de verter, y las cinco afirmaciones fallaban sin que hubiera
    // nada roto en el gesto.
    const enLista = g.objectives.find((o) => o.gesto && !o.dynamic);
    if (enLista) return enLista;
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.gesto);
    if (!base) return null;
    const copia = { ...base, progress: 0, done: false, objeto: null };
    g.objectives.push(copia);
    return copia;
  })();
  st.done = false;
  st.progress = 0;
  st.limiteLeft = st.limite;
  // Lejos de la estación y sin pulsar nada: se ha abandonado la tarea.
  g.player.keys.delete(" ");
  g.player.position.x = st.x + 40;
  // `_heatAlertShown` se rearma sola, así que se reanuda DENTRO del bucle.
  for (let i = 0; i < 10; i++) {
    g.setPaused(false);
    g.suspicion = 0;
    await sleep(50);
  }
  return { antes: st.limite, despues: st.limiteLeft, haciendo: g.player.isDoingActivity };
});
assert("la cuenta atrás sigue corriendo aunque abandones", sigue.despues < sigue.antes, JSON.stringify(sigue));
assert("y sí que la habías abandonado", sigue.haciendo === false, JSON.stringify(sigue));

// ── 4 · Se te acaba el tiempo: pierdes lo hecho y VIENE ────────────────
const plazo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.player.keys.delete(" ");
  await sleep(150);
  g.setPaused(false);
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  g._caughtCooldown = 999;

  const st = (() => {
    // La actividad del gesto puede no estar ACTIVA hoy (la cadena de la
    // temporada la abre más tarde), y lo que se prueba aquí es el gesto, no
    // la cadena. Si no está en la lista del día se toma su estación del
    // plano — el mismo montaje que ya usan check-objetos y check-chisme.
    // Antes esto tiraba del café, que dejó de jugar al gesto para jugar al
    // puzle de verter, y las cinco afirmaciones fallaban sin que hubiera
    // nada roto en el gesto.
    const enLista = g.objectives.find((o) => o.gesto && !o.dynamic);
    if (enLista) return enLista;
    const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find((a) => a.gesto);
    if (!base) return null;
    const copia = { ...base, progress: 0, done: false, objeto: null };
    g.objectives.push(copia);
    return copia;
  })();
  st.done = false;
  st.progress = st.time * 0.7;
  st.limiteLeft = 0.02;
  // `.inc-msg` es el carril LATERAL del director de mensajes (ui/messages.js).
  // Antes esto miraba `.inc-notice`, la clase de las tarjetas que vivían
  // arriba a la derecha encima de la lista de misiones; ese canal se retiró.
  const avisosAntes = document.querySelectorAll(".inc-msg").length;
  // Dos cuadros: el primero agota la cuenta, y con eso basta. Se llama a
  // `update` a mano para que no dependa de cuándo pinte el navegador.
  g.update(1 / 60);
  g.update(1 / 60);
  return {
    progresoPerdido: st.progress === 0,
    reintentable: st.limiteLeft === null,
    // El jefe COMPROMETIDO: no es que "se acerque a mirar", es que viene.
    comprometido: g.boss.lockedOn,
    estado: g.boss.state,
    sobreElUmbral: g.suspicion >= g.boss.chaseSuspicionFloor,
    // Y NO amonesta a distancia: eso sigue siendo cosa de que te toque.
    sinAmonestacion: g.warnings === 0,
    aviso: document.querySelectorAll(".inc-msg").length > avisosAntes,
  };
});
assert("agotar la cuenta pierde lo hecho", plazo.progresoPerdido === true, JSON.stringify(plazo));
assert("y la tarea se puede reintentar de cero", plazo.reintentable === true, JSON.stringify(plazo));
assert("la sospecha salta POR ENCIMA del umbral de caza", plazo.sobreElUmbral === true, JSON.stringify(plazo));
assert("y el jefe VIENE, comprometido", plazo.comprometido === true, JSON.stringify(plazo));
assert(
  "pero NO amonesta a distancia: la amonestación sigue siendo física",
  plazo.sinAmonestacion === true,
  JSON.stringify(plazo)
);
assert("el aviso se ve en pantalla", plazo.aviso === true, JSON.stringify(plazo));

// ── 5 · Al soltar, el gesto se apaga y se vuelve a caminar ─────────────
const apagado = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  g.player.keys.delete(" ");
  await new Promise((r) => setTimeout(r, 350));
  return {
    activo: g.gesture.active,
    pintado: !!document.querySelector(".inc-action.on"),
    paso: g.player.inputLocked,
  };
});
assert("soltar apaga el gesto", apagado.activo === false, JSON.stringify(apagado));
assert("el HUD lo esconde", apagado.pintado === false, JSON.stringify(apagado));
assert("y se vuelve a caminar", apagado.paso === false, JSON.stringify(apagado));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl gesto se juega con el piso VIVO — el jefe viene mientras — y la cuenta atrás convoca"
    : `\n${fallos} fallo(s) en el gesto`
);
process.exit(fallos === 0 ? 0 : 1);
