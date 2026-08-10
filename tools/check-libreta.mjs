/**
 * LA LIBRETA (data/libreta.json · ui/libreta.js · enganches en engine.js).
 *
 * Lo que hay que proteger, en orden:
 *
 *  1. EL DATO NO MIENTE: cada pista apunta a una fuente que EXISTE (un cast
 *     con escenas, una misión de la temporada, un egg del plano o del
 *     manifest). Una ref con typo compila igual y esa página no se escribe
 *     NUNCA — el fallo silencioso exacto de temporada-1.json, pero en la
 *     libreta.
 *  2. Las piezas del proyecto deletrean EXACTAMENTE el código secreto al
 *     que apuntan (manifest -> codeEggs -> egg_incognito). Si alguien toca
 *     las letras o las teclas y se separan, el secreto final promete una
 *     palabra que no abre nada.
 *  3. Hallar un secreto ESCRIBE su página (permanente, por ranura) y avisa.
 *  4. La tecla L abre la libreta con lo hallado legible, lo no hallado en
 *     blanco PERO visible, y se cierra con la misma tecla.
 *  5. Con todas las piezas, la página del proyecto enseña las letras y el
 *     cierre — sin revelar el chiste (eso vive en el egg).
 *
 * Uso: npm run check:libreta   (necesita `npm run preview` en :4173)
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

// ── 1 · El dato, en frío: toda fuente existe ──
const lib = JSON.parse(readFileSync("public/data/libreta.json", "utf8"));
const dialogues = JSON.parse(readFileSync("public/data/dialogues.json", "utf8"));
const escena = JSON.parse(readFileSync("public/data/scenes/piso7.json", "utf8"));
const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const temporada = JSON.parse(readFileSync("public/data/campaign/temporada-1.json", "utf8"));

const casts = new Set(Object.keys(dialogues.encounters ?? {}));
const misiones = new Set((temporada.misiones ?? []).map((m) => m.id));
const eggs = new Set([
  ...(escena.eggs ?? []).map((e) => e.id),
  ...(manifest.codeEggs ?? []).map((e) => e.id),
]);

const rotas = [];
for (const p of lib.pistas ?? []) {
  const { tipo, ref } = p.fuente ?? {};
  const ok =
    (tipo === "charla" && casts.has(ref)) ||
    (tipo === "mision" && misiones.has(ref)) ||
    (tipo === "secreto" && eggs.has(ref));
  if (!ok) rotas.push(`${p.id} -> ${tipo}:${ref}`);
}
assert("toda pista apunta a una fuente que existe", rotas.length === 0, rotas.join(" | "));

const ids = new Set((lib.pistas ?? []).map((p) => p.id));
const piezas = lib.proyecto?.piezas ?? [];
const piezasRotas = piezas.filter((x) => !ids.has(x.pista)).map((x) => x.pista);
assert("toda pieza del proyecto es una pista real", piezasRotas.length === 0, piezasRotas.join(" | "));

// La palabra que deletrean las piezas TIENE que ser la que el egg escucha.
const palabra = piezas.map((x) => x.letra).join("");
const eggCode = (manifest.codeEggs ?? []).find((e) => e.id === "egg_incognito");
const teclas = (eggCode?.keys ?? []).join("").toUpperCase();
assert(
  "las piezas deletrean el código secreto, letra por letra",
  palabra.toUpperCase() === teclas && palabra.length > 0,
  `piezas: "${palabra}" · egg: "${teclas}"`,
);

// ── En el juego de verdad ──
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

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
await p.waitForTimeout(500);

// ── 3 · Pisar un secreto escribe su página ──
const hallazgo = await p.evaluate(async () => {
  const g = window.__game.engine.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const egg = window.__floorplan.locationEggs.find((e) => e.id === "egg_servidor");
  if (!egg) return { error: "egg_servidor no está en el plano" };
  // Quieta encima del secreto el tiempo de dwell. Se re-teletransporta en
  // cada vuelta por si un empujón de la separación la saca del radio.
  for (let i = 0; i < 60; i++) {
    g.setPaused(false);
    g.player.position.x = egg.x;
    g.player.position.z = egg.z;
    if ((window.__game.engine.save.libreta ?? []).includes("p_servidor")) break;
    await sleep(120);
  }
  const notices = [...document.querySelectorAll(".inc-notice-text")].map((n) => n.textContent);
  return {
    anotada: window.__game.engine.save.libreta.includes("p_servidor"),
    aviso: notices.some((t) => t.includes("libreta") || t.includes("Libreta")),
  };
});
assert("pisar un secreto escribe su página en la libreta", hallazgo.anotada === true, JSON.stringify(hallazgo));
assert("y cae el aviso de página nueva", hallazgo.aviso === true, JSON.stringify(hallazgo));

// El egg deja su escena esperando clic: se pasa antes de abrir la libreta.
for (let i = 0; i < 30; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(140);
}

// ── 4 · La tecla L abre y cierra; lo hallado se lee, lo demás en blanco ──
await p.evaluate(() => window.__game.engine.game.setPaused(false));
await p.keyboard.press("l");
await p.waitForTimeout(400);
const abierta = await p.evaluate(() => {
  const layer = document.querySelector(".inc-lib");
  return {
    abierta: !!layer,
    pausado: window.__game.engine.game.paused,
    conTexto: [...(layer?.querySelectorAll(".inc-lib-pista-title") ?? [])].some((n) =>
      n.textContent.includes("Compila de madrugada"),
    ),
    enBlanco: layer ? layer.querySelectorAll(".inc-lib-pista.blank").length : 0,
    letrasOn: layer ? layer.querySelectorAll(".inc-lib-letra.on").length : 0,
  };
});
assert("la tecla L abre la libreta", abierta.abierta === true, JSON.stringify(abierta));
assert("y el piso queda en pausa mientras lees", abierta.pausado === true, JSON.stringify(abierta));
assert("la página hallada se lee entera", abierta.conTexto === true, JSON.stringify(abierta));
assert("las no halladas están EN BLANCO pero se ven", abierta.enBlanco > 10, JSON.stringify(abierta));
assert("y el proyecto enseña justo sus piezas anotadas", abierta.letrasOn === 1, JSON.stringify(abierta));

await p.keyboard.press("l");
await p.waitForTimeout(400);
const cerrada = await p.evaluate(() => ({
  cerrada: !document.querySelector(".inc-lib"),
  reanudado: !window.__game.engine.game.paused,
}));
assert("la misma tecla la cierra", cerrada.cerrada === true, JSON.stringify(cerrada));
assert("y el piso se reanuda", cerrada.reanudado === true, JSON.stringify(cerrada));

// ── 5 · Con todas las piezas, el proyecto se ARMA ──
await p.evaluate((piezasIds) => {
  const save = window.__game.engine.save;
  for (const id of piezasIds) save.addPista(id);
}, piezas.map((x) => x.pista));
await p.keyboard.press("l");
await p.waitForTimeout(400);
const proyecto = await p.evaluate(() => {
  const layer = document.querySelector(".inc-lib");
  return {
    letras: [...(layer?.querySelectorAll(".inc-lib-letra.on") ?? [])].map((n) => n.textContent).join(""),
    cierre: (layer?.querySelector(".inc-lib-cierre")?.textContent ?? "").length,
  };
});
assert("las nueve piezas deletrean la palabra en pantalla", proyecto.letras === palabra, JSON.stringify(proyecto));
assert("y aparece el cierre que dice dónde escribirla", proyecto.cierre > 40, JSON.stringify(proyecto));
// La regla de lore: la libreta INSINÚA, nunca revela. El cierre no puede
// nombrar el juego ni contar el chiste — eso vive en el egg.
const cierreTexto = (lib.proyecto?.cierre ?? "").toLowerCase();
assert(
  "el cierre no revela el meta-chiste",
  !cierreTexto.includes("juego") && !cierreTexto.includes("modo incógnito"),
  cierreTexto,
);

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLa libreta anota sola, y el secreto final se arma pieza a pieza"
    : `\n${fallos} fallo(s) en la libreta`,
);
process.exit(fallos === 0 ? 0 : 1);
