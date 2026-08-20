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
  g.onHeatAlert = null;
  g.rules.maxWarnings = 99;
  window.__ponerse = (id) => {
    const st = g.objectives.find((o) => o.id === id);
    window.__st = st;
    window.__paso = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.player.position.x = st.x;
        g.player.position.z = st.z;
        if (g.paused) g.setPaused(false);
        g.update(1 / 60);
      }
    };
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
const salir = await p.evaluate(() => {
  const btn = document.querySelector(".inc-mg-salir");
  return {
    esBoton: btn?.tagName === "BUTTON",
    sePuedeTocar: btn ? getComputedStyle(btn).pointerEvents !== "none" : false,
    texto: btn?.textContent ?? "",
  };
});
check(
  "HAY un botón de salir, y se puede tocar de verdad",
  salir.esBoton && salir.sePuedeTocar,
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
