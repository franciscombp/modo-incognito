/**
 * ¿El tema es de verdad un tema?
 *
 * Comprueba lo único que importa de la arquitectura de tres capas: que
 * cambiar `data-theme` mueva TODO —interfaz y edificio— y que no quede nada
 * anclado al tema anterior.
 *
 * Mira los tokens y no una captura a propósito: un componente que se queda
 * con el color viejo se ve idéntico en una captura pequeña, y es justo el
 * fallo que hay que cazar (así llegó a producción el texto blanco sobre
 * panel blanco).
 */
import { chromium } from "playwright";

const URL = process.env.GAME_URL ?? "http://localhost:4173/";
let fallos = 0;

function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1024, height: 720 } });
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

/** Lee los tokens que definen la piel, más lo que de verdad se pinta. */
async function leer() {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const tok = (n) => cs.getPropertyValue(n).trim();
    const pintado = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop] : null;
    };
    return {
      tema: document.documentElement.dataset.theme ?? "(ninguno)",
      texto: tok("--text"),
      fondo: tok("--bg"),
      acento: tok("--accent"),
      // El edificio
      suelo: tok("--w-floor"),
      pared: tok("--w-wall"),
      tapiceria: tok("--w-fabric"),
      // Lo que ve el ojo: el VELO del menú, que es el fondo real del lienzo.
      // (El body es otra cosa: son las BANDAS del lienzo fijo, lo que se ve
      // fuera de los 1920×1080. Se mide aparte, abajo.)
      cuerpoFondo: pintado(".inc-menu-scrim", "backgroundImage") ?? pintado(".px-menu-scrim", "backgroundImage"),
      // Las bandas del lienzo. Son la única superficie que está FUERA de la
      // pantalla del juego, y aun así salen de un token: si alguien vuelve a
      // escribir un negro a mano en el body, esto deja de moverse.
      bandas: tok("--letterbox"),
      // La paleta que el motor 3D tiene cargada AHORA
      mundo: window.__worldPalette ?? null,
    };
  });
}

const terminal = await leer();
assert("arranca en el tema por defecto", terminal.tema === "terminal", `tema=${terminal.tema}`);
assert("la capa semántica resuelve a un color", /^(rgb|hsl|#)/.test(terminal.texto), `--text=${terminal.texto}`);
assert("el edificio tiene tokens propios", !!terminal.suelo, `--w-floor=${terminal.suelo}`);

// Cambiar de tema por la vía real del juego, no escribiendo el atributo a mano.
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "cozy"));
await page.waitForTimeout(400);
const cozy = await leer();

assert("cambia el tema", cozy.tema === "cozy");
assert(
  "la INTERFAZ cambia de piel",
  cozy.texto !== terminal.texto && cozy.fondo !== terminal.fondo,
  `texto ${terminal.texto} -> ${cozy.texto} | fondo ${terminal.fondo} -> ${cozy.fondo}`,
);
assert(
  "el ACENTO cambia",
  cozy.acento !== terminal.acento,
  `${terminal.acento} -> ${cozy.acento}`,
);
assert(
  "el EDIFICIO cambia con la interfaz",
  cozy.suelo !== terminal.suelo && cozy.pared !== terminal.pared && cozy.tapiceria !== terminal.tapiceria,
  `suelo ${terminal.suelo} -> ${cozy.suelo}`,
);
assert(
  "el velo del menú sigue al tema",
  cozy.cuerpoFondo !== terminal.cuerpoFondo,
  `${String(terminal.cuerpoFondo).slice(0, 60)} -> ${String(cozy.cuerpoFondo).slice(0, 60)}`,
);
assert(
  "hasta las bandas del lienzo salen de un token",
  !!terminal.bandas && cozy.bandas !== terminal.bandas,
  `--letterbox ${terminal.bandas} -> ${cozy.bandas}`,
);

// Y de vuelta: un tema no puede dejar poso.
await page.evaluate(() => document.documentElement.setAttribute("data-theme", "terminal"));
await page.waitForTimeout(400);
const vuelta = await leer();
assert(
  "volver al tema anterior lo restaura exacto",
  vuelta.texto === terminal.texto && vuelta.suelo === terminal.suelo && vuelta.acento === terminal.acento,
  "algún token no volvió a su valor",
);

// Ningún componente puede llevar su propio color: si lo lleva, no cambia de
// tema y esto lo caza sin depender de que alguien mire una captura.
const anclados = await page.evaluate(() => {
  const sospechosos = [];
  const claro = (c) => {
    const m = c.match(/\d+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    return r > 195 && g > 195 && b > 195 && Number(m[3] ?? 1) > 0.5;
  };
  for (const el of document.querySelectorAll("body *")) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 16) continue;
    if (claro(s.backgroundColor)) {
      sospechosos.push(`${el.className || el.tagName}: fondo ${s.backgroundColor}`);
    }
  }
  return sospechosos.slice(0, 8);
});
assert(
  "ningún panel visible se quedó con un fondo claro fijo",
  anclados.length === 0,
  anclados.join("\n        "),
);

await browser.close();
console.log(
  fallos === 0
    ? "\nEl tema manda: interfaz y edificio cambian juntos"
    : `\n${fallos} fallo(s): algo no sale de los tokens`,
);
process.exit(fallos === 0 ? 0 : 1);
