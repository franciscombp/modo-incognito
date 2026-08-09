import { chromium } from "playwright";

// EL ARRANQUE: título → hoja de vida → personaje → juego.
//
// Sustituye a la comprobación del login de la etapa anterior, que daba por
// contrato que con el localStorage limpio el juego abría DIRECTO en elegir
// personaje. Ya no: abre en el título, y quién juega y en qué carrera lo
// deciden las hojas de vida. Aquella además probaba `.inc-login-enter` y
// `.inc-login-mini`, que se habían quitado hacía tiempo — o sea que llevaba
// un rato roja sin que la rojez significara nada.
//
// Lo que vigila, y por qué importa cada cosa:
//  1. El título NO decide nada. Tres puertas y la primera es Jugar. Llegó a
//     tener seis, con «Reiniciar progreso» de primera cuando no había nada
//     que borrar.
//  2. Hay TRES hojas y de entrada están en blanco, y la hoja en blanco se
//     anuncia como tal (enseña el hueco, no dice "vacía").
//  3. Abrir una hoja en blanco pide personaje; firmar entra al juego.
//  4. LA HOJA SE ESCRIBE SOLA: tras jugar, esa ranura deja de estar en
//     blanco y lista la experiencia ganada. Es la mecánica entera.

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));

await p.goto(url, { waitUntil: "domcontentloaded" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.waitForTimeout(700);

const screen = () => p.evaluate(() => window.__game.engine.menus.screen);

// ── 1 · El título ────────────────────────────────────────────────────
check((await screen()) === "title", "con el localStorage limpio se abre el TÍTULO");
// La <section> y no [data-screen] a secas: el contenedor del menú lleva el
// mismo atributo, y con el selector suelto se recogen los botones de TODAS
// las pantallas a la vez.
const puertas = await p.$$eval('section[data-screen="title"] .inc-btn span:last-child', (n) =>
  n.map((x) => x.textContent.trim())
);
check(puertas.length === 3, "el título tiene tres puertas y nada más", puertas.join(" · "));
check(puertas[0] === "Jugar", "y la primera es Jugar");

// ── 2 · Las hojas de vida ────────────────────────────────────────────
await p.click('section[data-screen="title"] .inc-btn--primary');
await p.waitForTimeout(400);
check((await screen()) === "slots", "Jugar lleva a las hojas de vida");
check(
  (await p.$$eval('section[data-screen="slots"] .inc-cv', (n) => n.length)) === 3,
  "hay tres hojas"
);
check(
  (await p.$$eval('section[data-screen="slots"] .inc-cv--blank', (n) => n.length)) === 3,
  "y de entrada las tres están en blanco"
);
const hoja1 = await p.$eval('section[data-screen="slots"] .inc-cv', (n) =>
  n.innerText.replace(/\s+/g, " ").trim()
);
check(/diligenciar/i.test(hoja1), "la hoja en blanco se anuncia sin diligenciar", hoja1);

// ── 3 · Abrir una hoja en blanco pide personaje, y firmar entra ──────
await p.click('section[data-screen="slots"] .inc-cv');
await p.waitForTimeout(500);
check((await screen()) === "characters", "abrir una hoja en blanco pide personaje");
check(
  (await p.evaluate(() => window.__game.engine.save.slot)) === 1,
  "y deja abierta esa ranura"
);

await p.keyboard.press("Enter"); // firma el contrato
await p.waitForTimeout(2600);
check(
  !!(await p.evaluate(() => window.__game.engine.save.characterId)),
  "firmar guarda el personaje EN la hoja"
);
check(
  (await p.evaluate(() => window.__game.engine.menus.isOpen)) === false,
  "y entra al juego, sin volver a un menú"
);

// ── 4 · La hoja se escribe sola ──────────────────────────────────────
await p.evaluate(() => {
  const s = window.__game.engine.save;
  s.completeDay("dia-1", { spare: 12 });
  s.completeDay("dia-2", { spare: 8 });
  s.campaign = { temporada: 1, dia: 3, unicas: ["a", "b"] };
  s.findEgg("incognito");
});
await p.evaluate(() => window.__game.engine.menus.openSlots());
await p.waitForTimeout(400);
check(
  (await p.$$eval('section[data-screen="slots"] .inc-cv--blank', (n) => n.length)) === 2,
  "tras jugar, esa hoja deja de estar en blanco"
);
const escrita = await p.$eval('section[data-screen="slots"] .inc-cv', (n) =>
  n.innerText.replace(/\s+/g, " ").trim()
);
check(
  /jornada/i.test(escrita) && /encargo/i.test(escrita) && /hallazgo/i.test(escrita),
  "y se ha ESCRITO con la experiencia ganada",
  escrita
);

check(errors.length === 0, "sin errores de página", errors.join(" | "));

await ctx.close();
await b.close();
console.log(failures ? `${failures} fallo(s)` : "\nEl arranque cuenta la secuencia: jugar → qué hoja → quién");
process.exit(failures ? 1 : 0);
