// Captures the menu screens (title, settings, camera workbench) at desktop
// and phone sizes, so UI regressions show up as a picture rather than a bug
// report.
//
// Usage: node tools/shoot-menus.mjs
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

for (const [name, w, h] of [
  ["menu-desktop", 1440, 900],
  ["menu-phone", 390, 844],
]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("ERR", String(e)));
  await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `shots/${name}.png` });
  console.log(name, "ok");
  await ctx.close();
}

// Settings screen with the camera panel open.
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.click("text=Ajustes");
await p.waitForTimeout(400);
await p.screenshot({ path: "shots/menu-settings-game.png" });
await p.click(".px-tab:nth-child(2)");
await p.waitForTimeout(400);
await p.screenshot({ path: "shots/menu-settings-camera.png" });
console.log("settings ok");
await b.close();
