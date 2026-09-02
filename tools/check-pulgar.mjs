/**
 * EL PULGAR NAVEGA. Un teléfono tiene que poder recorrer un menú entero.
 *
 * ── Por qué ──
 *
 * El cursor (`ui/focusNav.js`) nació preparado para esto: expone `empujar` y
 * `aceptar`, y su propio comentario dice «para la palanca de pantalla». Pero
 * nadie se lo enchufó nunca, así que en un móvil la palanca movía a una
 * jugadora que no está en pantalla y el botón de acción no hacía nada.
 *
 * Y había un segundo fallo tapando al primero: con cualquier menú abierto el
 * mando entero estaba `display: none` (`body.menu-open .touch-controls`). O
 * sea que aunque el pulgar hubiera mandado sobre el cursor, no había pulgar.
 * Arreglar solo uno de los dos no se nota — por eso esto los mide POR
 * SEPARADO.
 *
 * Se prueba con toques de verdad (`page.touchscreen`), no llamando a la API:
 * lo que falla en un teléfono es el camino entero, y el camino incluye que
 * el botón esté en pantalla y que el dedo le acierte.
 *
 * Uso: npm run check:pulgar   (necesita `npm run preview` en :4173)
 */
import { chromium, devices } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
// Un teléfono de verdad: `pointer: coarse` es lo que enciende `touch-device`
// y elige el lienzo pequeño. En un escritorio con el ratón esto no existe, y
// una prueba en escritorio pasaría midiendo un mando que ni se dibuja.
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
await p.waitForTimeout(1800);

// La cortina de orientación: en vertical el juego se pausa a propósito y pide
// girar el teléfono. Se le da el apaisado que el juego quiere.
await p.setViewportSize({ width: 915, height: 412 });
await p.waitForTimeout(600);

check(
  "el navegador se reconoce como táctil",
  await p.evaluate(() => document.body.classList.contains("touch-device"))
);

// ── 1 · Con el TÍTULO abierto, el mando está EN PANTALLA ──
// Esta es la mitad que no se veía: da igual a quién escuche la palanca si la
// palanca no se dibuja.
const visible = await p.evaluate(() => {
  const vis = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { display: s.display, w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    hayMenu: !!document.querySelector(".inc-menu:not(.inc-hidden)"),
    modo: document.body.classList.contains("inc-nav-touch"),
    stick: vis(".touch-stick-zone"),
    boton: vis(".touch-btn-interact"),
    utils: vis(".touch-utils"),
  };
});
check("con un menú abierto, el cursor toma el mando", visible.modo === true, JSON.stringify(visible));
check(
  "y la palanca de pantalla SE VE (no está display:none)",
  visible.stick && visible.stick.display !== "none" && visible.stick.w > 0,
  JSON.stringify(visible.stick)
);
check(
  "y el botón de aceptar también, con tamaño de dedo (≥40px)",
  visible.boton && visible.boton.display !== "none" && Math.min(visible.boton.w, visible.boton.h) >= 40,
  JSON.stringify(visible.boton)
);
// Y NO SE COME LA PANTALLA. En partida la zona del stick ocupa media
// pantalla, que aquí se tragaría los toques de los propios botones del menú.
check(
  "pero la palanca se encoge a una esquina, no tapa el menú",
  visible.stick && visible.stick.w <= 320 && visible.stick.h <= 320,
  JSON.stringify(visible.stick)
);
check(
  "las utilidades de partida (zoom, plano, pausa) no salen en un menú",
  !visible.utils || visible.utils.display === "none",
  JSON.stringify(visible.utils)
);

// ── 2 · Y el pulgar MUEVE el cursor, con un arrastre de verdad ──
// `.nav-cursor` es la marca que deja el cursor en el DOM (focusNav.js).
const antes = await p.evaluate(
  () => document.querySelector(".inc-menu:not(.inc-hidden) .nav-cursor")?.textContent?.trim() ?? null
);
const zona = await p.locator(".touch-stick-zone").boundingBox();
if (zona) {
  const cx = zona.x + zona.width / 2;
  const cy = zona.y + zona.height / 2;
  // Un ARRASTRE: apoyar, empujar hacia abajo y sostener. Sostener importa —
  // el paseo del cursor se repite desde un temporizador, no desde el evento.
  await p.touchscreen.tap(cx, cy);
  await p.evaluate(
    ([x, y]) => {
      const z = document.querySelector(".touch-stick-zone");
      const ev = (t, cy2) =>
        z.dispatchEvent(
          new PointerEvent(t, { pointerId: 7, clientX: x, clientY: cy2, bubbles: true, pointerType: "touch" })
        );
      ev("pointerdown", y);
      ev("pointermove", y + 70);
    },
    [cx, cy]
  );
  await p.waitForTimeout(500);
}
// SE MUESTREA MIENTRAS DURA EL EMPUJÓN, no se lee en un instante fijo.
// El cursor se REPITE mientras la palanca está apoyada, y el título tiene
// tres opciones: leyendo justo a los 500 ms se le pilla habiendo dado la
// vuelta entera, otra vez sobre la primera — y eso se informaba como «la
// palanca no mueve el cursor» con la palanca funcionando perfectamente.
// Lo que se quiere saber es si LLEGÓ A MOVERSE, así que se mira si en algún
// momento estuvo en otra opción.
const movido = await p.evaluate(async () => {
  const donde = () =>
    document.querySelector(".inc-menu:not(.inc-hidden) .nav-cursor")?.textContent?.trim()?.slice(0, 40) ?? null;
  const inicio = donde();
  const vistos = new Set();
  for (let i = 0; i < 40; i++) {
    const d = donde();
    if (d) vistos.add(d);
    await new Promise((r) => setTimeout(r, 25));
  }
  return {
    hayCursor: !!donde(),
    donde: donde(),
    inicio,
    visitados: [...vistos],
  };
});
// LO QUE IMPORTA ES QUE SE MOVIÓ, no solo que exista un cursor: al abrirse un
// grupo el cursor SE POSA solo en el primero, así que «hay cursor» sería
// cierto sin haber tocado nada.
check(
  "empujar la palanca MUEVE el cursor dentro del menú",
  movido.hayCursor === true && movido.visitados.some((v) => v !== antes),
  JSON.stringify({ antes, ...movido })
);

// ── 3 · Y el botón ACEPTA: el toque tiene que CAMBIAR de pantalla ──
// Lo que se mide es la consecuencia, no que se llamara a una función: el
// título lleva a las hojas de vida, así que el menú de después no puede ser
// el mismo que el de antes.
// SE MIRA DÓNDE ESTÁ EL CURSOR, no el texto del contenedor: todas las
// pantallas de menú viven DENTRO del mismo `.inc-menu`, así que su
// `textContent` es idéntico antes y después de avanzar. La primera versión
// de esta comprobación miraba eso y daba FAIL con el botón funcionando
// perfectamente.
const dondeAntes = await p.evaluate(
  () => document.querySelector(".inc-menu:not(.inc-hidden) .nav-cursor")?.textContent?.trim() ?? ""
);
const bb = await p.locator(".touch-btn-interact").boundingBox();
if (bb) await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
// SE ESPERA AL CAMBIO, NO A UN RELOJ. Esto leía a los 700 ms clavados y
// fallaba en la tanda completa —«7Jugar» → «7Jugar»— pasando siempre suelto:
// entre pantalla y pantalla se cierran y se abren LAS PUERTAS DEL ASCENSOR
// (ui/doors.js), que duran lo que dure `--dur-puerta` más el remontaje, y con
// la máquina cargada eso se pasa de 700 ms sin que nada esté roto. Un plazo
// fijo mide la MÁQUINA, que es la lección de check:chase.
//
// Si de verdad no avanza, esto tarda su espera y falla igual: lo único que se
// pierde es el falso negativo.
await p
  .waitForFunction(
    (previo) =>
      (document.querySelector(".inc-menu:not(.inc-hidden) .nav-cursor")?.textContent?.trim() ??
        "") !== previo,
    dondeAntes,
    { timeout: 8000 }
  )
  .catch(() => {});
const dondeDespues = await p.evaluate(
  () => document.querySelector(".inc-menu:not(.inc-hidden) .nav-cursor")?.textContent?.trim() ?? ""
);
check(
  "y el botón del pulgar ACEPTA: la pantalla avanza",
  dondeAntes !== dondeDespues && dondeDespues.length > 0,
  `«${dondeAntes.slice(0, 30)}» → «${dondeDespues.slice(0, 30)}»`
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl juego se recorre entero con un pulgar"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
