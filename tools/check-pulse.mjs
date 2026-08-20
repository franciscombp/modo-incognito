/**
 * EL PULSO DE LA ACTIVIDAD (docs/CAMPANA.md §8, src/game/activityGame.js).
 *
 * Lo que hay que proteger aquí no es que el minijuego "funcione": es que NO
 * ROMPA EL BUCLE. Un minijuego de tarea que pausa el mundo convertiría las
 * estaciones en el sitio más seguro del piso, que es lo contrario de lo que
 * son. Así que la primera comprobación —y la que de verdad importa— es que
 * el jefe SIGUE MOVIÉNDOSE mientras se juega.
 *
 * Y la segunda: que mantener pulsado sigue terminando la tarea sin tocar el
 * pulso. Si el pulso fuera obligatorio, alguien se quedaría encallado en la
 * primera tarea del día 1 sin entender por qué.
 *
 * Uso: npm run check:pulse   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";
// DEL REGISTRO, no de una lista escrita a mano. Estuvo escrita —y con dos
// verbos, cuando ya había seis—, así que al pasar estirarse al baile esta
// prueba se puso a medir el pulso en una estación que ya no lo juega. Una
// comprobación que pregunta por un juego que no existe no falla: pasa.
import { VERBOS } from "../src/game/verbos.js";

/** Las claves de JSON de los verbos que NO son el pulso (el pulso es el suelo). */
const OTROS_VERBOS = VERBOS.map((v) => v.campo).filter(Boolean);

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
// El registro viaja a la página: dentro de un `evaluate` no hay imports, y
// copiar la lista a mano es exactamente cómo se quedó vieja la vez anterior.
await p.addInitScript((lista) => {
  window.__OTROS_VERBOS = lista;
}, OTROS_VERBOS);
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });

// Piso abierto y sin diálogos por medio.
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

await p.evaluate(() => {
  // LA ESTACIÓN DE PULSO, PUESTA A MANO SI HACE FALTA.
  //
  // La cadena del día 1 abre con el café, y el café juega al GESTO desde que
  // existen los gestos: en ese momento `objectives` no tiene ni una estación
  // de pulso, y la prueba se quedaba sin sitio donde ponerse. La que sí lo
  // juega (`snack`) se desbloquea más adelante en la cadena, así que aquí se
  // adelanta desde el plano — que es exactamente lo que hace la campaña al
  // desbloquear una misión, no un atajo inventado para la prueba.
  const g = window.__game.engine.game;
  // La guarda usa el MISMO criterio que la búsqueda de abajo: preguntando
  // solo por `gesto`, daba por buena una lista donde la única candidata era
  // el baile, se saltaba el adelanto y luego no había estación que medir.
  const YA = window.__OTROS_VERBOS;
  if (g.objectives.some((o) => !o.dynamic && !YA.some((v) => o[v]))) return;
  // EL PULSO ES EL SUELO: lo juega la actividad que NO declara otro verbo.
  // Estaba escrito «la que no tenga gesto», y se quedó viejo en cuanto hubo
  // seis verbos — al pasar estirarse al baile, esto elegía `stretch` y medía un
  // pulso que ya no existe ahí. Si añades un verbo, va a esta lista.
  const OTROS = window.__OTROS_VERBOS;
  const soloPulso = (a) => !OTROS.some((v) => a[v]);
  const base = (g._allStations ?? window.__floorplan.activityStations ?? []).find(soloPulso);
  if (!base) return;
  // Y NO PUEDE SER UNA SIESTA. Hoy la única estación del piso que no declara
  // otro verbo es la cabezada (`type: "sleep"`), así que esto inyectaba ESA
  // y el archivo entero medía el pulso sobre una siesta. Se nota en una sola
  // aserción —«mantener pulsado no basta»— y encima solo a veces: dormir se
  // TERMINA quedándote quieta, que es exactamente lo que una cabezada es,
  // así que la regla del pulso no le aplica y salía FAIL con el juego
  // intacto.
  //
  // Se le quita el `type` a la copia en vez de buscar otra estación: no hay
  // otra, y lo que este archivo tiene que medir es EL VERBO, no qué tareas
  // trae el día 1. La copia es de la prueba y no toca el piso.
  //
  // `time` con margen por lo mismo: seis segundos a ritmo mantenido (0.3)
  // son 1.8 de progreso, así que sobre una tarea de 2.5 la afirmación queda
  // al filo y depende de la calibración — que es justo lo que su comentario
  // promete que no pasa.
  const { type, ...pulso } = base;
  g.objectives.push({ ...pulso, time: Math.max(base.time ?? 0, 5), progress: 0, done: false });
});

// ── 1 · El pulso arranca al ponerse a hacer una actividad ──
const arranque = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // SIN `gesto`: esa juega al otro minijuego (check-gesto.mjs). Pedir "una
  // estación" a secas empezó a caer en el café en cuanto los gestos
  // entraron, y el pulso salía apagado sin que nada estuviera roto.
  const OTROS = window.__OTROS_VERBOS;
  const st = g.objectives.find((o) => !o.dynamic && !OTROS.some((v) => o[v]));
  if (!st) return { error: "el día no trae ninguna estación de pulso" };
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  await sleep(400);
  return {
    activo: g.pulse.active,
    pintado: !!document.querySelector(".inc-pulse.on"),
    estacion: st.id,
  };
});
assert("el pulso arranca al empezar la actividad", arranque.activo === true, JSON.stringify(arranque));
assert("y el HUD lo pinta", arranque.pintado === true, JSON.stringify(arranque));

// ── 2 · EL CONTRATO NUEVO (bucle v2): activar CONGELA el mundo ──
// El minijuego es su propio modo: jefe quieto, reloj de jornada parado,
// sospecha pasiva congelada — y lo único que corre es el pulso con su
// cuenta atrás. Lo que impide vivir aquí dentro es el temporizador, no el
// jefe caminando por detrás; la exposición vive antes (conseguir) y
// después (aguantar, con el mundo vivo).
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
  // El jefe LEJOS y de ronda. Antes se le lanzaba a la caza a propósito, para
  // demostrar que el minijuego no lo congelaba; ahora una pantalla de tarea NO
  // SE ABRE con un vigilante encima —esa es la puerta que permite parar el
  // mundo sin que la estación sea un escudo—, así que montar una persecución
  // aquí solo impide que se abra lo que se viene a medir. La caza y el
  // anti-escudo tienen su prueba en `check:pausa`.
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.position.x = g.player.position.x + 30;
  g.boss.position.z = g.player.position.z;
  const antes = { x: g.boss.position.x, z: g.boss.position.z };
  const marcaAntes = g.pulse.snapshot()?.pos ?? null;
  const reloj0 = g.timeLeft;
  // POR CUADROS, no con `sleep()`. En headless el bucle de render va
  // estrangulado y en una vuelta cargada puede no pasar NI UN cuadro: lo que
  // se medía entonces era la máquina, y «el jefe sigue viniendo» salía cara o
  // cruz. Es la misma lección que ya se aplicó en check-chase.
  for (let i = 0; i < 54; i++) {
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  const dsp = { x: g.boss.position.x, z: g.boss.position.z };
  return {
    pausado: g.paused,
    congelado: g.worldFrozen,
    // EL JEFE SIGUE ANDANDO. Antes esto exigía lo contrario: activar
    // congelaba el mundo. Era el fallo que rompía la captura —mantener
    // espacio en cualquier estación dejaba a Gabo de estatua a un palmo, en
    // rojo, sin llegar a tocarte— y de paso vaciaba el minijuego, porque sin
    // nadie acercándose no hay nada que apretar.
    jefeAnda: Math.hypot(dsp.x - antes.x, dsp.z - antes.z) > 0.01,
    marcaSeMueve: (g.pulse.snapshot()?.pos ?? null) !== marcaAntes,
    // Y EL DÍA CORRE: la jornada dura siempre lo mismo, pase lo que pase.
    relojCorre: g.timeLeft < reloj0,
  };
});
assert("activar NO es la pausa de menú", vivo.pausado === false, JSON.stringify(vivo));
assert("y el mundo SIGUE VIVO mientras juegas", vivo.congelado === false, JSON.stringify(vivo));
// EL MUNDO SE PARA MIENTRAS DURA LA PANTALLA. Esto exigía lo contrario, y
// con razón entonces: congelar al jefe hacía de la estación un escudo. Lo que
// cambió es que ya no se puede ENTRAR con él encima — ver `check:pausa`.
assert("el MUNDO SE PARA mientras juegas (ver check:pausa)", vivo.jefeAnda === false, JSON.stringify(vivo));
assert("el marcador del pulso SÍ se mueve", vivo.marcaSeMueve === true, JSON.stringify(vivo));
// Y EL RELOJ TAMPOCO CORRE. La jornada sigue durando lo mismo: lo que no se
// te cobra es el rato que pasas dentro de una pantalla que te tapa el piso.
assert("y el RELOJ se para con ella", vivo.relojCorre === false, JSON.stringify(vivo));

// ── 3 · Un fallo hace RUIDO (sube la sospecha), un acierto avanza ──
// Hay que ESPERAR AL MOMENTO de cada caso en vez de golpear a ciegas: la
// primera versión daba a ciegas cada 60 ms, encadenaba tres aciertos, la
// tarea se completaba y el pulso se apagaba antes de haber fallado una sola
// vez. O sea que "el fallo no hace ruido" era, en realidad, "no llegó a
// fallar nunca".
const golpes = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = () => g.pulse.snapshot();

  // REARMAR antes de medir: si algo de la fase anterior apagó el pulso (una
  // pausa, un empujón que te sacó del radio), aquí se vuelve al estado que
  // esta fase necesita en vez de heredar el azar de la anterior.
  g.setPaused(false);
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  const OTROS = window.__OTROS_VERBOS;
  const st0 = g.objectives.find((o) => !o.dynamic && !OTROS.some((v) => o[v]));
  g.player.position.x = st0.x;
  g.player.position.z = st0.z;
  g.player.keys.add(" ");
  for (let i = 0; i < 60 && !g.pulse.active; i++) {
    g.setPaused(false);
    g.player.position.x = st0.x;
    g.player.position.z = st0.z;
    await sleep(60);
  }
  if (!g.pulse.active) return { error: "el pulso no llegó a rearmar" };
  const dentro = (s) => Math.abs(s.pos - s.zonaAt) <= s.zona / 2;

  /** Espera a que el marcador esté dentro (o fuera) y devuelve ahí mismo. */
  async function esperar(queEsteDentro) {
    for (let i = 0; i < 200; i++) {
      const s = snap();
      if (!s) return null;
      if (dentro(s) === queEsteDentro) return s;
      await sleep(16);
    }
    return null;
  }

  const st = g.pulse.station;
  const out = {};

  // (a) ACIERTO: dentro de la zona, el progreso sube.
  st.progress = 0;
  st.done = false;
  if (await esperar(true)) {
    const antes = st.progress;
    out.r1 = g.pulse.hit();
    out.avance = st.progress > antes;
  }

  // (b) FALLO: fuera de la zona, sube la SOSPECHA. Se deja progreso de sobra
  // para que restar no lo mande a cero y la tarea no se complete por el
  // camino, que es lo que apagaba el pulso a media prueba.
  st.progress = st.time * 0.5;
  st.done = false;
  if (await esperar(false)) {
    const antesS = g.suspicion;
    const antesP = st.progress;
    out.r2 = g.pulse.hit();
    out.ruido = g.suspicion > antesS;
    out.restaProgreso = st.progress < antesP;
  }
  return out;
});
assert("un acierto empuja el progreso de la tarea", golpes.avance === true, JSON.stringify(golpes));
assert("un fallo hace RUIDO: sube la sospecha", golpes.ruido === true, JSON.stringify(golpes));
assert("y un fallo resta progreso", golpes.restaProgreso === true, JSON.stringify(golpes));

// ── 4 · El SUELO: manteniendo pulsado, sin tocar el pulso, se termina ──
// Antes hay que ENFRIAR. La prueba anterior falla el pulso a propósito, y cada
// fallo hace ruido: la sospecha sube hasta el nivel de búsqueda 3, que PAUSA
// la partida desde game.js con su aviso a pantalla completa (MOTOR.md §8).
// En pausa `update()` sale antes de tocar nada y la tarea no avanza nunca —
// la primera vez esto pareció que el suelo estaba roto, y lo que estaba era
// el montaje.
const suelo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 40;
  g.setPaused(false);
  await sleep(200);
  // La MISMA estación que el resto del archivo: la que no declara otro
  // verbo, o sea la que juega al pulso. La inyecta el bloque de arriba ya
  // saneada (sin `type: "sleep"` y con margen de tiempo).
  const juegaAlPulso = (o) => !o.dynamic && !window.__OTROS_VERBOS.some((v) => o[v]);
  const st = g.objectives.find((o) => juegaAlPulso(o) && !o.done) ?? g.objectives.find(juegaAlPulso);
  st.done = false;
  st.progress = 0;
  st.encendida = false;
  g.player.keys.delete(" ");
  await sleep(120);
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  // Nunca se llama a hit(): solo se mantiene. Y NO debe bastar.
  //
  // El suelo del bucle v2 era «mantener la termina igual, lento». En la mano
  // eso significaba que el pulso era decoración: se podía jugar el día entero
  // sin tocar un solo minijuego y sin enterarse de que existían. Ahora
  // mantener te MANTIENE en la tarea (avanza a `ritmoMantenido`, muy por
  // debajo de 1) y lo que la termina son los toques.
  //
  // El suelo no desaparece, cambia de sitio: fallar toques resta, nunca te
  // expulsa de la tarea.
  // POR CUADROS, no por reloj de pared. Con `sleep()` lo que se medía era la
  // máquina: en una vuelta cargada cada iteración tardaba de más, se
  // acumulaba tiempo de juego de sobra y la tarea SÍ se terminaba manteniendo
  // — la prueba salía cara o cruz. Seis segundos de juego exactos: a ritmo
  // mantenido (0.3) eso es 1.8 de progreso, muy por debajo de lo que cuesta
  // cualquier tarea, así que la afirmación no depende de la calibración.
  const SEGUNDOS = 6;
  // SE MIRA EL MÁXIMO, no el valor final. La cuenta atrás de la tarea
  // (`limite`) sigue corriendo mientras se mantiene, y al agotarse pierde lo
  // hecho y deja el progreso en cero — leyendo solo al final, «avanza algo»
  // salía 0 y parecía que mantener no hacía nada. Aquí importa que mantener
  // EMPUJE, no dónde quedó cuando se acabó el plazo.
  let maxProgreso = 0;
  for (let i = 0; i < SEGUNDOS * 60 && !st.encendida && !st.done; i++) {
    maxProgreso = Math.max(maxProgreso, st.progress);
    // Se reanuda dentro del bucle: `_heatAlertShown` se rearma sola y una
    // alerta a mitad de cuenta volvería a congelar la tarea.
    g.setPaused(false);
    g.suspicion = 0;
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    g.update(1 / 60);
  }
  const encendida = st.encendida || st.done;
  // Y AL SOLTAR SE BANCA: el aguante acumulado se cobra y la misión cae.
  g.player.keys.delete(" ");
  for (let i = 0; i < 20 && !st.done; i++) {
    g.setPaused(false);
    g.suspicion = 0;
    await sleep(100);
  }
  return {
    encendida,
    hecha: st.done,
    id: st.id,
    progreso: +Math.max(maxProgreso, st.progress).toFixed(2),
    time: st.time,
  };
});
assert(
  "mantener pulsado NO basta: sin tocar el pulso la tarea no se enciende",
  suelo.encendida === false,
  JSON.stringify(suelo),
);
assert(
  "pero AVANZA algo, para que soltar no sea un castigo",
  suelo.progreso > 0,
  JSON.stringify(suelo),
);

// ── 4bis · EL TOQUE POR TECLAS, el camino REAL de la jugadora ──
// La prueba (a) de arriba llama a `pulse.hit()` directo, y eso TAPÓ un bug
// entero: soltar espacio un frame mataba el pulso (pulse.end) y el re-toque
// lo reiniciaba de cero (begin resetea aciertos) — «tocar al ritmo», lo que
// el juego te pide, era imposible por teclado y el test seguía verde. Aquí
// se juega como se juega de verdad: SOLTAR y VOLVER A TOCAR con la tecla,
// esperando la zona buena, y los aciertos tienen que ACUMULARSE.
const toqueReal = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.boss.resetToPatrol();
  g.boss.position.x = g.player.position.x + 40;
  g.setPaused(false);
  const st =
    g.objectives.find(
      (o) =>
        !o.dynamic &&
        !window.__OTROS_VERBOS.some((v) => o[v]) &&
        !o.done
    ) ??
    g.objectives.find(
      (o) => !o.dynamic && !window.__OTROS_VERBOS.some((v) => o[v])
    );
  st.done = false;
  st.progress = 0;
  st.encendida = false;
  if (st.objeto) g.inventario.add(st.objeto.id);
  st.time = 999; // que no se encienda por el suelo a mitad de la medición
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
  await sleep(450); // pasada la gracia inicial de hit() (t < 0.25)

  let aciertos = 0;
  for (let intento = 0; intento < 8 && aciertos < 2; intento++) {
    // Espera la zona buena CON la tecla puesta…
    for (let i = 0; i < 200; i++) {
      const s = g.pulse.snapshot();
      if (s && Math.abs(s.pos - s.zonaAt) <= s.zona / 2 - 0.03) break;
      g.setPaused(false);
      g.suspicion = 0;
      await sleep(16);
    }
    // …y el TOQUE de verdad: soltar un frame y volver a pulsar.
    g.player.keys.delete(" ");
    await sleep(40);
    g.player.keys.add(" ");
    await sleep(60);
    aciertos = g.pulse.snapshot()?.aciertos ?? 0;
  }
  const activoTrasToques = g.pulse.active;
  g.player.keys.delete(" ");
  st.time = 20;
  return { aciertos, activoTrasToques };
});
assert(
  "SOLTAR y TOCAR con la tecla acumula aciertos (el pulso se juega de verdad)",
  toqueReal.aciertos >= 2,
  JSON.stringify(toqueReal),
);
assert(
  "y el pulso SOBREVIVE al toque: la gracia cubre el frame suelto",
  toqueReal.activoTrasToques === true,
  JSON.stringify(toqueReal),
);

// ── 5 · Al soltar, el pulso se apaga sin castigo ──
const apagado = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  await new Promise((r) => setTimeout(r, 300));
  return { activo: g.pulse.active, pintado: !!document.querySelector(".inc-pulse.on") };
});
assert("soltar apaga el pulso", apagado.activo === false, JSON.stringify(apagado));
assert("y el HUD lo esconde", apagado.pintado === false, JSON.stringify(apagado));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl pulso se juega sin pausar el mundo, y mantener pulsado sigue bastando"
    : `\n${fallos} fallo(s) en el pulso`,
);
process.exit(fallos === 0 ? 0 : 1);
