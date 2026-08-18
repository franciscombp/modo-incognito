/**
 * NI UNA CAJA. La interfaz entera habla el idioma de la lista de misiones.
 *
 * ── Por qué hace falta una prueba y no basta con mirar ──
 *
 * Esto ya se hizo dos veces y se deshizo dos veces. La primera, apilando una
 * piel nueva encima de las anteriores; la segunda, convirtiendo los paneles
 * en «cajas holográficas» —vidrio tenue, filo de 1 px y escuadras—, que se
 * veía mejor pero seguía siendo un contenedor pegado encima del juego.
 *
 * El motivo de que se deshaga siempre es el mismo: la regla vive en una lista
 * de selectores, y una pantalla nueva no está en esa lista. No se rompe nada
 * a la vista — simplemente esa pantalla se queda con su tarjeta, y al lado de
 * las demás se nota un año después.
 *
 * Así que esto no mira una captura: RECORRE el DOM de cada pantalla y busca
 * superficies. Un elemento estructural que pinte fondo, borde o esquina
 * redonda es un fallo con nombre y apellido.
 *
 * Lo que SÍ puede pintar, y por qué:
 *   · el VELO del menú — es quien da la legibilidad, y es el que permite que
 *     los paneles no tengan fondo;
 *   · barras, medidores y pastillas — son datos dibujados, no contenedores;
 *   · avatares, retratos y lienzos — son imágenes;
 *   · los controles REDONDOS del pulgar — la forma es lo que los hace
 *     acertables con el dedo.
 *
 * Uso: npm run check:holo   (necesita `npm run preview` en :4173)
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
await p.waitForTimeout(1500);

/** Busca superficies en lo que haya abierto ahora mismo. */
async function cajas(raiz) {
  return p.evaluate((sel) => {
    const PERMITIDO = [
      "scrim", // el velo: es quien da la legibilidad
      "bar", "meter", "fill", "track", "reel", "pip", "dot", "pips", // datos dibujados
      "avatar", "photo", "portrait", "shot", "mini", "thumb", // imágenes
      "round", "touch-", "stick", // controles de dedo
      "vaso", "cable", "plato", "micro", "baile-pad", "baile-paso", // piezas de minijuego
      "chisme-opt", "quest-key", "kbd", "swatch", "chip",
    ];
    const out = [];
    for (const e of document.querySelectorAll(`${sel} *`)) {
      const cls = typeof e.className === "string" ? e.className : "";
      if (PERMITIDO.some((t) => cls.includes(t))) continue;
      if (["IMG", "CANVAS", "SVG", "PATH", "CIRCLE", "INPUT"].includes(e.tagName)) continue;
      if (e.closest("svg")) continue;
      const r = e.getBoundingClientRect();
      // Solo lo que es un CONTENEDOR de verdad: una pieza pequeña que pinte
      // un fondo es un dato, no una caja.
      if (r.width < 140 || r.height < 44) continue;
      const s = getComputedStyle(e);
      // QUÉ ES UNA CAJA, exactamente: un fondo OPACO, un filo, o una esquina
      // redonda. Un degradado que MUERE en transparente no lo es — ese es el
      // lavado de la fila elegida y la viñeta de peligro, que son el idioma
      // que se quiere, no el que se quiere quitar. Un degradado entre dos
      // colores sólidos sí: eso es una superficie con otro nombre, y fue
      // literalmente el intento anterior de esto.
      const degradado = s.backgroundImage.includes("gradient");
      const muereEnNada = /rgba\([^)]*,\s*0\)/.test(s.backgroundImage);
      const opaco =
        s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent";
      const conFondo = opaco || (degradado && !muereEnNada);
      // UN FILO SUELTO NO ES UN MARCO. El hilo de abajo separa una fila de
      // la siguiente y la barra de la izquierda es ese mismo hilo puesto de
      // pie (la que lleva una notificación para decir de qué tipo es): las
      // dos son el idioma que se quiere. Lo que encierra —y por tanto es una
      // caja— es un filo ARRIBA más uno a los lados.
      const conBorde =
        parseFloat(s.borderTopWidth) > 0 &&
        (parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0);
      const conEsquina = parseFloat(s.borderTopLeftRadius) > 4;
      if (conFondo || conBorde || conEsquina) {
        out.push({
          cls: cls.slice(0, 60),
          fondo: s.backgroundColor,
          img: s.backgroundImage.slice(0, 30),
          borde: s.borderTopWidth + "/" + s.borderLeftWidth,
          radio: s.borderTopLeftRadius,
        });
      }
    }
    return out;
  }, raiz);
}

// ── EL TÍTULO ──
const titulo = await cajas(".inc-menu:not(.inc-hidden)");
check("el TÍTULO no tiene ni una caja", titulo.length === 0, JSON.stringify(titulo.slice(0, 3)));

// El hilo tiene que estar: sin caja Y sin hilo no hay gramática, hay texto
// suelto. Es la mitad que se olvida.
const hilos = await p.evaluate(
  () =>
    [...document.querySelectorAll(".inc-menu:not(.inc-hidden) button")].filter(
      (e) => parseFloat(getComputedStyle(e).borderBottomWidth) > 0
    ).length
);
check("pero SÍ tiene el hilo: cada opción se separa de la siguiente", hilos >= 2, `${hilos} filas con hilo`);

// ── EL CURSOR SE VE ──
// Es lo que más fácil se pierde en una conversión así: sin caja y sin aro, si
// el lavado no gana la cascada no hay forma de saber dónde estás.
const cursor = await p.evaluate(() => {
  const c = document.querySelector(".inc-menu .nav-cursor");
  if (!c) return { sinCursor: true };
  const s = getComputedStyle(c);
  return { lavado: s.backgroundImage.includes("gradient"), barra: s.boxShadow.includes("inset") };
});
check(
  "y el cursor SE VE: lavado que se desvanece y barra a la izquierda",
  cursor.lavado === true && cursor.barra === true,
  JSON.stringify(cursor)
);

// ── LAS HOJAS DE VIDA ──
await p.locator(".inc-menu button", { hasText: "JUGAR" }).first().click().catch(() => {});
await p.waitForTimeout(800);
const cv = await cajas(".inc-menu:not(.inc-hidden)");
check("las HOJAS DE VIDA tampoco", cv.length === 0, JSON.stringify(cv.slice(0, 3)));

// ── EL HUD, EN PARTIDA ──
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
  g.toast("Aviso de prueba");
  for (let i = 0; i < 10; i++) g.update(1 / 60);
});
await p.waitForTimeout(500);
// `.inc-gamehud`, y esto ya costó una vez: la primera versión miraba
// `.inc-layer--hud`, que NO es la clase de la capa del HUD, así que el
// recorrido no visitaba nada y la comprobación pasaba en verde con la placa
// y las notificaciones todavía siendo tarjetas. Una prueba que mira el sitio
// equivocado es peor que no tenerla.
const hud = await cajas(".inc-gamehud");
check("y el HUD de partida tampoco", hud.length === 0, JSON.stringify(hud.slice(0, 3)));

// ── EL ANUNCIO DEL CENTRO ──
// Era un rótulo de pegatina con cuatro sombras duras negras. Lo que se
// comprueba es que habla el mismo idioma que un título de misión: mono y
// versalitas, no la tipografía de otro juego.
const anuncio = await p.evaluate(() => {
  const g = window.__game.engine.game;
  g.announce("PRUEBA", "warn");
  const e = document.querySelector(".inc-msg-centro");
  if (!e) return { sinAnuncio: true };
  const s = getComputedStyle(e);
  return {
    mono: /mono|consol|cascadia|menlo|courier/i.test(s.fontFamily),
    versalitas: s.textTransform === "uppercase",
    espaciado: parseFloat(s.letterSpacing) > 1,
  };
});
check(
  "el ANUNCIO del centro habla el idioma de la lista, no el de una pegatina",
  anuncio.mono && anuncio.versalitas && anuncio.espaciado,
  JSON.stringify(anuncio)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nNi una caja: menús, hojas de vida y HUD hablan el idioma de las misiones"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
