import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.evaluate(() => { window.__game.engine.startDay(0); });
await p.waitForTimeout(400);
// Skip any boot dialogue quickly.
for (let i = 0; i < 10; i++) {
  await p.keyboard.press("Space");
  await p.waitForTimeout(150);
}

const result = await p.evaluate(() => {
  const g = window.__game.engine.game;
  if (!g) return { error: "no game instance exposed" };
  g.suspicion = 40;
  g.player.isPretending = false;
  g.player.isHiding = false;
  g.inSafeSpot = false;
  const before = g.suspicion;
  for (let i = 0; i < 120; i++) g.update(1 / 60); // ~2s standing idle
  const after = g.suspicion;
  const hour = g.getCurrentHour();
  const time = g.formatTime();
  return { before, after, hour, time };
});

console.log(JSON.stringify(result, null, 2));
await ctx.close();
await b.close();
