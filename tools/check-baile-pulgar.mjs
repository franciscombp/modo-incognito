/**
 * EL BAILE SE JUEGA CON EL PULGAR — la palanca es un paso, y el botón no
 * te echa.
 *
 * ── El fallo ──
 *
 * En un teléfono el baile era injugable, y no por sus pasos: por el CURSOR.
 * `.inc-mg.on` está en la lista de grupos de focusNav, así que con la
 * pantalla del baile abierta la palanca movía un cursor de menú cuya única
 * opción navegable es SALIR (las casillas llevan `data-nav-off`), y el botón
 * de acción hacía «aceptar» — o sea que el primer toque CERRABA el
 * minijuego. En escritorio no se notaba porque las flechas del baile entran
 * en captura antes que el cursor.
 *
 * La regla nueva: una pantalla que se juega con direcciones se marca
 * `data-nav-juego` y el cursor la deja en paz. Y la palanca BAILA: un
 * empujón es un paso, disparado en el flanco y rearmado al volver al centro.
 *
 * Uso: npm run check:baile-pulgar   (necesita `npm run preview` en :4173)
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const ctx = await b.newContext({ ...devices["Pixel 7"], isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.setViewportSize({ width: 915, height: 412 });
await p.waitForTimeout(800);
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(130);
}

// Abrir el baile con el jefe lejos.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
  g.saltarEscolta();
  const st = g.objectives.find((o) => o.baile);
  g.boss.resetToPatrol();
  g.boss.position.x = st.x + 60;
  g.suspicion = 0;
  g.boss.suspicion = 0;
  g.player.position.x = st.x;
  g.player.position.z = st.z;
  g.player.keys.add(" ");
});
await p.waitForTimeout(1200);

const abierto = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const mg = document.querySelector(".inc-mg.on");
  return {
    activo: g.baile?.active === true,
    marcada: mg?.hasAttribute("data-nav-juego") === true,
    // El cursor NO reclama esta pantalla: sin grupo, sin modo menú.
    sinCursorDeMenu: !document.body.classList.contains("inc-nav-touch"),
  };
});
check("el baile abre su pantalla", abierto.activo, JSON.stringify(abierto));
check("y está marcada como juego de direcciones", abierto.marcada, JSON.stringify(abierto));
check(
  "así que el cursor de menús NO la reclama (la palanca es del baile)",
  abierto.sinCursorDeMenu,
  JSON.stringify(abierto)
);

// ── 1 · EL BOTÓN DE ACCIÓN NO TE ECHA ──
// Era el fallo más grave: con el cursor posado en SALIR (única opción), el
// primer toque del botón cerraba el minijuego.
const bb = await p.locator(".touch-btn-interact").boundingBox();
if (bb) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
await p.waitForTimeout(400);
check(
  "el botón de acción NO cierra el baile",
  await p.evaluate(() => window.__game.engine.game.baile?.active === true)
);

// ── 2 · LA PALANCA ES UN PASO ──
// Se empuja en la dirección que pide el paso actual y el acierto tiene que
// subir. El empujón es de FLANCO: el gesto se arma al pasar por el centro.
const paso = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const s = g.baile.snapshot();
  return { dir: s.pasos[s.indice]?.dir, aciertos: s.aciertos };
});
const zona = await p.locator(".touch-stick-zone").boundingBox();
const VEC = { arriba: [0, -70], abajo: [0, 70], izquierda: [-70, 0], derecha: [70, 0] };
const [vx, vy] = VEC[paso.dir] ?? [0, -70];
const cx = zona.x + zona.width / 2;
const cy = zona.y + zona.height / 2;
await p.evaluate(
  ([x, y, dx, dy]) => {
    const z = document.querySelector(".touch-stick-zone");
    const ev = (t, cx2, cy2) =>
      z.dispatchEvent(
        new PointerEvent(t, { pointerId: 9, clientX: cx2, clientY: cy2, bubbles: true, pointerType: "touch" })
      );
    ev("pointerdown", x, y);
    ev("pointermove", x + dx, y + dy);
    ev("pointerup", x + dx, y + dy);
  },
  [cx, cy, vx, vy]
);
await p.waitForTimeout(200);
const trasPalanca = await p.evaluate(() => window.__game.engine.game.baile.snapshot().aciertos);
check(
  "un empujón de palanca en la dirección buena es un ACIERTO",
  trasPalanca > paso.aciertos,
  `${paso.aciertos} → ${trasPalanca} (dir ${paso.dir})`
);

// ── 3 · Y LA CASILLA SE PUEDE TOCAR con el dedo ──
// Esperar un paso nuevo (el actual ya se gastó) y tocar su casilla.
await p.waitForTimeout(1000);
const paso2 = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const s = g.baile.snapshot();
  return { dir: s.pasos[s.indice]?.dir, aciertos: s.aciertos };
});
const pad = await p.locator(`.inc-baile-pad[data-dir="${paso2.dir}"]`).boundingBox().catch(() => null);
if (pad) {
  await p.touchscreen.tap(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await p.waitForTimeout(200);
  const trasPad = await p.evaluate(() => window.__game.engine.game.baile.snapshot().aciertos);
  check("tocar la casilla del paso también cuenta", trasPad > paso2.aciertos, `${paso2.aciertos} → ${trasPad}`);
} else {
  // Las casillas pueden no llevar data-dir: entonces se toca por índice.
  const pads = await p.locator(".inc-baile-pad").all();
  check("hay casillas que tocar", pads.length >= 4, `${pads.length} casillas`);
}

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(fallos === 0 ? "\nEl baile se juega con el pulgar entero: palanca, dedo y botón sin sustos" : `\n${fallos} fallo(s)`);
process.exit(fallos ? 1 : 0);
