/**
 * EL ESCENARIO ES EL MENÚ: decorados y puertas (docs/PANTALLAS.md §1.8bis).
 *
 * Dos piezas que fallan EN SILENCIO, que es por lo que hace falta una prueba
 * y no basta con mirarlo una vez:
 *
 *  · EL DECORADO sale de una tabla (`src/ui/decorados.js`). Una pantalla
 *    nueva que no esté en ella no rompe nada —cae en `interfaz` a propósito,
 *    para que añadir una pantalla no cueste un fallo— así que se queda sin
 *    sitio sin que nadie se entere, y al año hay cuatro menús otra vez. Que
 *    es literalmente lo que el diseño avisa que pasa.
 *  · LAS PUERTAS solo viajan si CAMBIA el sitio. Si un día viajan siempre, se
 *    meten segundo y medio de espera en cada clic de un menú; si no viajan
 *    nunca, el cambio de decorado se ve crudo. Las dos averías se ven igual
 *    de bien en una captura: perfectas.
 *
 * Y lo que de verdad no se puede romper: `prefers-reduced-motion`. Dos hojas
 * cruzando la pantalla son justo el movimiento que provoca mareo vestibular,
 * así que ahí las puertas CORTAN. Y tienen que cortar en las dos mitades —la
 * animación y las esperas—, porque apagando solo la animación queda segundo y
 * medio de pantalla tapada sin nada que mirar, que es peor que el movimiento.
 *
 * Uso: npm run check:puertas   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

// ── 1 · La tabla cubre TODAS las pantallas que el menú sabe abrir ────────
// Se cruzan las dos listas en vez de comprobar una a mano: escrita a mano, la
// prueba se queda vieja igual que la tabla, y encima en silencio.
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.waitForTimeout(1200);

// Las pantallas se leen DEL DOM, no de una lista escrita aquí: en el build
// servido los módulos van con hash, y sobre todo una lista a mano se queda
// vieja igual que la tabla y en el mismo silencio.
const tabla = await p.evaluate(() => ({
  pantallas: [...document.querySelectorAll(".inc-menu-screen")].map((n) => n.dataset.screen),
}));
check(
  "el menú monta sus pantallas y todas se identifican",
  tabla.pantallas.length >= 5 && tabla.pantallas.every(Boolean),
  JSON.stringify(tabla.pantallas)
);

// ── 2 · Cada pantalla recibe un decorado, y el que le toca ───────────────
const ESPERADO = {
  title: "ascensor",
  slots: "escritorio",
  days: "escritorio",
  characters: "espejo",
  settings: "interfaz",
  help: "interfaz",
  pause: "interfaz",
};

const decorados = {};
for (const pantalla of tabla.pantallas) {
  // Se abre saltándose el viaje (llamando al menú por dentro) y se lee lo que
  // quedó escrito en el `data-decorado`.
  await p.evaluate((n) => window.__game.engine.menus.show(n), pantalla);
  await p.waitForTimeout(700);
  decorados[pantalla] = await p.evaluate(
    () => document.querySelector(".inc-menu")?.dataset.decorado ?? null
  );
}
const sinDecorado = Object.entries(decorados).filter(([, v]) => !v).map(([k]) => k);
check("ninguna pantalla se queda SIN decorado", sinDecorado.length === 0, sinDecorado.join(", "));

const mal = Object.entries(decorados).filter(
  ([k, v]) => ESPERADO[k] && v !== ESPERADO[k]
);
check(
  "y cada una recibe EL SUYO (el ascensor es el título, el espejo el personaje)",
  mal.length === 0,
  mal.map(([k, v]) => `${k}: ${v} (esperado ${ESPERADO[k]})`).join(" · ")
);

// ── 3 · Las puertas existen y están ABIERTAS en reposo ───────────────────
const reposo = await p.evaluate(() => {
  const hojas = [...document.querySelectorAll(".inc-puerta")];
  if (hojas.length !== 2) return { hojas: hojas.length };
  const caja = document.querySelector(".inc-puertas");
  return {
    hojas: hojas.length,
    cerradas: caja.classList.contains("on"),
    // Fuera del hueco: el rectángulo de cada hoja no puede estar tapando el
    // centro de la pantalla cuando no hay viaje.
    tapando: hojas.some((h) => {
      const r = h.getBoundingClientRect();
      return r.width > 4 && r.left < window.innerWidth * 0.5 && r.right > window.innerWidth * 0.5;
    }),
  };
});
check("hay dos hojas", reposo.hojas === 2, JSON.stringify(reposo));
check("y en reposo están ABIERTAS: no tapan la pantalla", reposo.tapando === false, JSON.stringify(reposo));

// ── 4 · Cambiar de SITIO viaja; cambiar de pantalla dentro del sitio, no ──
// Es la regla entera de `hayViaje`, y las dos mitades importan.
async function viajaAl(desde, hasta) {
  await p.evaluate((n) => window.__game.engine.menus.show(n), desde);
  await p.waitForTimeout(700);
  // Se mira si las puertas llegan a cerrarse en algún momento del cambio.
  return p.evaluate(async (destino) => {
    const caja = document.querySelector(".inc-puertas");
    let cerro = false;
    const obs = new MutationObserver(() => {
      if (caja.classList.contains("on")) cerro = true;
    });
    obs.observe(caja, { attributes: true, attributeFilter: ["class"] });
    window.__game.engine.menus.show(destino);
    await new Promise((r) => setTimeout(r, 260));
    obs.disconnect();
    return cerro;
  }, hasta);
}

check(
  "del TÍTULO a las hojas de vida SÍ se viaja (ascensor -> escritorio)",
  (await viajaAl("title", "slots")) === true
);
check(
  "de las hojas de vida a elegir día NO (mismo escritorio: sería un viaje falso)",
  (await viajaAl("slots", "days")) === false
);
check(
  "y abrir AJUSTES tampoco: no te has movido de sitio",
  (await viajaAl("title", "settings")) === false
);

// ── 5 · Con `prefers-reduced-motion`, las puertas CORTAN ─────────────────
// Las dos mitades: sin animación Y sin espera. Una sola de las dos deja el
// peor de los dos mundos.
const p2 = await b.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p2.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p2.waitForTimeout(1200);
const corte = await p2.evaluate(async () => {
  window.__game.engine.menus.show("title");
  await new Promise((r) => setTimeout(r, 300));
  const t0 = performance.now();
  window.__game.engine.menus.show("slots");
  // Se espera lo justo para que un viaje ANIMADO siguiera tapando.
  await new Promise((r) => setTimeout(r, 120));
  const caja = document.querySelector(".inc-puertas");
  const hoja = document.querySelector(".inc-puerta");
  return {
    marcada: caja.classList.contains("inc-puertas--corta"),
    // NO se compara con "0s": el design system ya tiene una regla global de
    // reduced-motion que aplasta las duraciones a 0.00001s, así que exigir el
    // cero exacto suspendía una hoja que de hecho no se anima. Lo que se
    // pregunta es si queda animación EFECTIVA.
    prop: getComputedStyle(hoja).transitionProperty,
    dur: parseFloat(getComputedStyle(hoja).transitionDuration) || 0,
    yaAbiertas: !caja.classList.contains("on"),
    ms: Math.round(performance.now() - t0),
    pantalla: document.querySelector(".inc-menu")?.dataset.screen,
  };
});
check(
  "con reduced-motion la hoja no se anima",
  corte.prop === "none" || corte.dur <= 0.001,
  JSON.stringify(corte)
);
check(
  "y el viaje no hace esperar: a los 120 ms ya está la pantalla nueva",
  corte.pantalla === "slots",
  JSON.stringify(corte)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nCada pantalla es un sitio, y se viaja solo cuando el sitio cambia"
    : `\n${fallos} fallo(s) en los decorados o las puertas`
);
process.exit(fallos === 0 ? 0 : 1);
