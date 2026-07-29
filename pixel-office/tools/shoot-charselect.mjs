// Ad-hoc screenshot: character-select screen + a safe-spot marker in level.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) console.log("CONSOLE ERR", m.text()); });
await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.waitForTimeout(500);
await p.click("text=Personaje");
await p.waitForTimeout(400);
await p.screenshot({ path: "shots/menu-characters.png" });
console.log("characters ok");

// Pick Giu (hard mode) then head back to title to confirm the badge updates.
const cards = await p.$$(".px-char");
if (cards[1]) {
  await cards[1].click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: "shots/menu-title-with-char.png" });
  console.log("title badge ok");
}
await ctx.close();

// Now boot into day 1 and fly the camera near a safe spot for a visual check.
const ctx2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx2.newPage();
page.on("pageerror", (e) => console.log("ERR2", String(e)));
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.startDay(0);
});
await page.waitForTimeout(1500);
// Skip through the intro dialogue quickly.
for (let i = 0; i < 20; i++) {
  await page.keyboard.press("Enter").catch(() => {});
  await page.keyboard.press("e").catch(() => {});
  await page.waitForTimeout(150);
}
await page.evaluate(() => {
  const g = window.__game.engine.game;
  const fp = window.__floorplan;
  if (g && fp?.safeSpots?.[0]) {
    window.__game.player.position.x = fp.safeSpots[0].x;
    window.__game.player.position.z = fp.safeSpots[0].z;
  }
});
await page.waitForTimeout(600);
await page.screenshot({ path: "shots/safe-spot.png" });
console.log("safe spot shot ok");
await ctx2.close();

await b.close();
