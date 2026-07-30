import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.waitForTimeout(500);

const screen = await p.evaluate(() => window.__game.engine.menus.screen);
console.log("Pantalla al arrancar (localStorage limpio):", screen);

await p.screenshot({ path: "shots/forced-charselect.png" });

// The "volver" button must be hidden while no character is chosen.
const backHidden = await p.evaluate(() => {
  const btn = document.querySelector('section.px-screen[data-screen="characters"] .px-screen-foot button');
  return btn?.classList.contains("hidden");
});
console.log("Botón volver oculto:", backHidden);

// Pick the second card (Giu) and confirm it lands back on title.
await p.evaluate(() => {
  const cards = document.querySelectorAll(
    'section.px-screen[data-screen="characters"] .px-char:not(.locked)'
  );
  cards[1]?.click();
});
await p.waitForTimeout(300);
const screenAfter = await p.evaluate(() => window.__game.engine.menus.screen);
const charId = await p.evaluate(() => window.__game.engine.save.characterId);
console.log("Pantalla tras elegir:", screenAfter, "| characterId:", charId);

await ctx.close();
await b.close();
