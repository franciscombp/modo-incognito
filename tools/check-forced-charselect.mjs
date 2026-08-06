import { chromium } from "playwright";

// La PANTALLA DE LOGIN: con el localStorage limpio el juego tiene que abrir
// en la selección de usuario (no hay a dónde "volver"), el carrusel tiene que
// hojear con las flechas, y "Iniciar sesión" tiene que guardar el personaje y
// soltar al título. Los bloqueados (Manu, Gabo) enseñan candado y su botón no
// entra.

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.evaluate(() => localStorage.clear());
await p.reload({ waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.waitForTimeout(600);

check(
  (await p.evaluate(() => window.__game.engine.menus.screen)) === "characters",
  "con localStorage limpio se abre el login"
);
check(
  await p.evaluate(() => {
    const btn = document.querySelector('section[data-screen="characters"] .inc-menu-screen-foot button');
    return btn?.classList.contains("inc-hidden");
  }),
  "sin sesión iniciada no hay botón de volver"
);

// El carrusel hojea con la flecha derecha y cambia el usuario enfocado.
const nameBefore = await p.evaluate(() => document.querySelector(".inc-login-name")?.textContent);
await p.keyboard.press("ArrowRight");
await p.waitForTimeout(200);
const nameAfter = await p.evaluate(() => document.querySelector(".inc-login-name")?.textContent);
check(nameBefore && nameAfter && nameBefore !== nameAfter, "la flecha derecha hojea el carrusel", `${nameBefore} → ${nameAfter}`);

// Un usuario bloqueado enseña candado y su botón no deja entrar.
const lockedInfo = await p.evaluate(() => {
  const dots = [...document.querySelectorAll(".inc-login-mini")];
  const lockedDot = dots.find((d) => d.classList.contains("locked"));
  if (!lockedDot) return null;
  lockedDot.click();
  return new Promise((resolve) =>
    setTimeout(() => {
      resolve({
        lockShown: !!document.querySelector(".inc-login-lock"),
        enterDisabled: document.querySelector(".inc-login-enter")?.disabled ?? false,
      });
    }, 150)
  );
});
check(lockedInfo?.lockShown === true, "el usuario bloqueado enseña candado");
check(lockedInfo?.enterDisabled === true, "la cuenta bloqueada no deja iniciar sesión");

// Volver a Giuli e iniciar sesión de verdad.
await p.evaluate(() => {
  const dots = [...document.querySelectorAll(".inc-login-mini")];
  const giu = dots.find((d) => d.getAttribute("aria-label") === "Giuli");
  giu?.click();
});
await p.waitForTimeout(150);
await p.evaluate(() => document.querySelector(".inc-login-enter")?.click());
await p.waitForTimeout(300);
const after = await p.evaluate(() => ({
  screen: window.__game.engine.menus.screen,
  characterId: window.__game.engine.save.characterId,
}));
check(after.characterId === "giu", "iniciar sesión guarda el personaje", JSON.stringify(after));
check(after.screen === "title", "tras iniciar sesión se llega al título", after.screen);

await ctx.close();
await b.close();
console.log(failures ? `${failures} fallo(s)` : "login OK");
process.exit(failures ? 1 : 0);
