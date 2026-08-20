/**
 * LA PANTALLA DE UNA TAREA: EL MUNDO SE PARA, Y SE PUEDE SALIR.
 *
 * ── Lo que cambia, y por qué se puede ──
 *
 * Había una regla vieja y muy repetida: un minijuego NO congela al jefe,
 * porque congelarlo convertía la estación en el sitio más seguro del piso —
 * se mantenía espacio y Gabo se quedaba de estatua a un palmo, en rojo, sin
 * llegar a tocarte nunca.
 *
 * Era verdad. Pero la causa no era la pausa: era que se podía ENTRAR con él
 * encima. Cerrada esa puerta, no hay escudo que explotar. Y entonces parar el
 * mundo es lo correcto: una pantalla completa te quita el piso de la vista, y
 * que te cacen mientras no puedes ver ni reaccionar no es tensión, es una
 * emboscada.
 *
 * Así que esto comprueba las TRES piezas, que solo funcionan juntas:
 *   1. con la pantalla abierta, el mundo está quieto;
 *   2. pero la cuenta atrás de la tarea SIGUE — esa es la presión;
 *   3. y con un vigilante encima la pantalla NO se abre, que es lo único que
 *      impide que pausar sea un escudo.
 *
 * Más la que motivó todo: que HAY forma de salir.
 *
 * Uso: npm run check:pausa   (necesita `npm run preview` en :4173)
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

await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  // La escolta de apertura, ya vivida: mientras dura, la sospecha no
  // cuenta y el jefe no te aborda —vas pegada a él— así que una prueba
  // de la jornada EN MARCHA tiene que darla por terminada.
  g.saltarEscolta();
  g.onHeatAlert = null;
  g.rules.maxWarnings = 99;
  // Y EL TECHO DE SOSPECHA, POR LAS NUBES. Bailar sin responder falla pasos,
  // fallar hace RUIDO, y al nivel 3 de búsqueda `game.js` PAUSA la partida
  // por su cuenta — cerrando la pantalla justo cuando esta prueba está
  // intentando pulsar su botón de salir. Subiendo el techo, el nivel nunca
  // llega a 3 y lo que se mide es lo que se vino a medir.
  g.suspicionConfig.max = 1e6;
  // Y EL JEFE, CIEGO — hasta el último caso, que es el que lo necesita
  // viendo. Esta prueba tarda minutos entre pasos y la jugadora se los pasa
  // plantada en una estación haciendo algo prohibido: sin esto la alcanza,
  // la amonestación le limpia las teclas y a partir de ahí lo que falla es
  // el montaje. `_vistaOriginal` se guarda para devolvérsela abajo.
  window.__vistaOriginal = g.boss._updateVision;
  g.boss._updateVision = function () {
    this.playerVisible = false;
    this.redAlert = false;
  };
  window.__ponerse = (id) => {
    const st = g.objectives.find((o) => o.id === id);
    window.__st = st;
    window.__paso = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.player.position.x = st.x;
        g.player.position.z = st.z;
        // LA ENERGÍA, LLENA. Esta prueba tarda minutos entre pasos, y a cero
        // la jugadora SE DUERME —lo cual corta la actividad y cierra la
        // pantalla—: entonces lo que fallaba no era la salida, era el sueño.
        // Aquí se mide la pausa y el botón, no la gestión de la energía (esa
        // tiene su `check:energia`).
        g.energy = g.energyMax;
        if (g.paused) g.setPaused(false);
        g.update(1 / 60);
      }
    };
    // LA JUGADORA, CLAVADA A SU ESTACIÓN entre paso y paso. Las medidas de
    // esta prueba van en llamadas separadas, y ENTRE ellas corre el bucle de
    // dibujo de verdad: la física la devuelve fuera del radio de la estación,
    // la pantalla se cierra sola, y lo que fallaba después era el clic sobre
    // un botón que ya no estaba. Con esto, «entre paso y paso» deja de ser un
    // agujero por el que se escapa el montaje.
    const fijar = () => {
      if (window.__pinned === false) return;
      g.player.position.x = st.x;
      g.player.position.z = st.z;
      g.energy = g.energyMax;
      requestAnimationFrame(fijar);
    };
    window.__pinned = true;
    requestAnimationFrame(fijar);
    // El jefe lejos y tranquilo: aquí se mide la pausa, no la persecución.
    g.boss.resetToPatrol();
    g.suspicion = 0;
    g.boss.suspicion = 0;
    g.player.keys.add(" ");
    window.__paso(10);
  };
  window.__ponerse("stretch");
});

const abierta = await p.evaluate(() => window.__game.engine.game.enMinijuego);
check("la pantalla de la tarea se abre", abierta === true);

// ── 1 · EL MUNDO ESTÁ QUIETO ──
const mundo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const b0 = { x: g.boss.position.x, z: g.boss.position.z };
  const m0 = g.minions.map((m) => ({ x: m.position.x, z: m.position.z }));
  window.__paso(180); // tres segundos con la pantalla abierta
  return {
    jefe: +Math.hypot(g.boss.position.x - b0.x, g.boss.position.z - b0.z).toFixed(3),
    secuaces: g.minions
      .map((m, i) => +Math.hypot(m.position.x - m0[i].x, m.position.z - m0[i].z).toFixed(3))
      .reduce((a, c) => a + c, 0),
  };
});
check(
  "con ella abierta el MUNDO SE PARA: ni el jefe ni los secuaces andan",
  mundo.jefe < 0.01 && mundo.secuaces < 0.01,
  JSON.stringify(mundo)
);

// ── 2 · PERO LA CUENTA ATRÁS NO ──
// Es la mitad que hace que la pausa no sea gratis. Sin esto, abrir una tarea
// sería un botón de «detener el día».
const plazo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const st = window.__st;
  const antes = st.limiteLeft;
  window.__paso(60);
  return { antes: +(antes ?? 0).toFixed(2), despues: +(st.limiteLeft ?? 0).toFixed(2) };
});
check(
  "pero la CUENTA ATRÁS de la tarea sigue corriendo: la pausa no es gratis",
  plazo.despues < plazo.antes,
  JSON.stringify(plazo)
);

// ── 3 · SE PUEDE SALIR ──
// Se REABRE justo antes. Las medidas de arriba consumen tiempo real, y la
// cuenta atrás de la tarea (12 s) sigue corriendo con la pantalla abierta —
// esa es justo la mitad que hace que la pausa no sea gratis. Al agotarse, la
// pantalla se cierra y suelta la tecla a la fuerza, así que llegar aquí sin
// reabrir es llegar a un piso sin minijuego que probar.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  const st = window.__st;
  st.done = false;
  st.encendida = false;
  st.progress = 0;
  st.limiteLeft = null;
  // Y NADIE COMPROMETIDO: la puerta que impide abrir una pantalla con un
  // vigilante encima también aplica a los SECUACES, y tras minutos de prueba
  // alguno acaba siguiéndote. Devolverlos a su ronda es restablecer la
  // precondición del caso —«sin nadie encima»—, que es lo que este trozo da
  // por supuesto. El caso contrario tiene su propia comprobación abajo.
  g.boss.resetToPatrol();
  g.minions.forEach((m) => m.resetToPatrol());
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.keys.delete(" ");
  window.__paso(4);
  g.player.keys.add(" ");
  window.__paso(10);
});
const salir = await p.evaluate(() => {
  const btn = document.querySelector(".inc-mg-salir");
  return {
    esBoton: btn?.tagName === "BUTTON",
    sePuedeTocar: btn ? getComputedStyle(btn).pointerEvents !== "none" : false,
    texto: btn?.textContent ?? "",
    // LA PANTALLA TIENE QUE ESTAR ABIERTA, y esto faltaba: sin ello la
    // afirmación pasaba con el minijuego cerrado (el botón conserva sus
    // propios `pointer-events`), y el fallo aparecía dos líneas después como
    // un clic que se agota — que no dice qué pasó.
    pantallaAbierta: !!document.querySelector(".inc-mg.on"),
    verboVivo: window.__game.engine.game.enMinijuego,
    _near: window.__game.engine.game.nearStation?.id ?? null,
    _teclas: [...window.__game.engine.game.player.keys],
    _salida: !!window.__game.engine.game._salidaManual,
    _puede: window.__game.engine.game._puedeAbrirMinijuego(),
    _done: window.__st.done,
    _lim: window.__st.limiteLeft,
  };
});
check(
  "HAY un botón de salir, y se puede tocar de verdad",
  salir.esBoton && salir.sePuedeTocar && salir.pantallaAbierta,
  JSON.stringify(salir)
);

await p.locator(".inc-mg-salir").click();
await p.waitForTimeout(200);
check(
  "pulsarlo CIERRA la pantalla",
  (await p.evaluate(() => window.__game.engine.game.enMinijuego)) === false
);

// Y ESCAPE también, que era la salida que la documentación prometía y que
// nunca llegaba: el menú de pausa se la quedaba antes.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  // SOLTAR primero: salir a mano deja un pestillo que solo se olvida al
  // soltar la tecla. Sin esto, la pantalla no vuelve a abrirse y lo que se
  // acabaría midiendo es el montaje de la prueba, no ESCAPE.
  g.player.keys.delete(" ");
  for (let i = 0; i < 4; i++) g.update(1 / 60);
  window.__ponerse("stretch");
});
await p.keyboard.press("Escape");
await p.waitForTimeout(250);
const trasEsc = await p.evaluate(() => ({
  dentro: window.__game.engine.game.enMinijuego,
  menu: window.__game.engine.menus?.isOpen ?? false,
}));
check(
  "y ESCAPE también sale — sin abrir el menú de pausa encima",
  trasEsc.dentro === false && trasEsc.menu === false,
  JSON.stringify(trasEsc)
);

// ── 4 · CON EL JEFE ENCIMA NO SE ABRE ──
// La puerta que hace legítimo todo lo anterior. Sin ella, pausar sería un
// escudo: mantener espacio con Gabo a un palmo y que se quedara de estatua.
const escudo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  // Aquí SÍ tiene que ver: el caso es justo «con un vigilante encima».
  g.boss._updateVision = window.__vistaOriginal;
  window.__pinned = false;
  g.salirMinijuego();
  const st = g.objectives.find((o) => o.id === "stretch");
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.boss.position.x = st.x + 2;
  g.boss.position.z = st.z;
  g.suspicion = 80;
  g.boss.suspicion = 80;
  g.boss.lockedOn = true;
  g.boss.lastSeenPlayerPos = { x: st.x, z: st.z };
  g.boss.startChase();
  g.player.keys.add(" ");
  const b0 = { x: g.boss.position.x, z: g.boss.position.z };
  for (let i = 0; i < 120; i++) {
    g.player.position.x = st.x;
    g.player.position.z = st.z;
    g.suspicion = 80;
    g.boss.suspicion = 80;
    g.boss.lockedOn = true;
    g.boss.lastSeenPlayerPos = { x: st.x, z: st.z };
    if (g.paused) g.setPaused(false);
    g.update(1 / 60);
  }
  return {
    abrio: g.enMinijuego,
    jefeAndó: +Math.hypot(g.boss.position.x - b0.x, g.boss.position.z - b0.z).toFixed(3),
  };
});
check(
  "con un vigilante ENCIMA la pantalla no se abre: pausar no es un escudo",
  escudo.abrio === false,
  JSON.stringify(escudo)
);
check(
  "y por eso el jefe sigue viniendo a por ti",
  escudo.jefeAndó > 0.05,
  JSON.stringify(escudo)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl mundo se para para jugar, la cuenta atrás no, y siempre se puede salir"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
