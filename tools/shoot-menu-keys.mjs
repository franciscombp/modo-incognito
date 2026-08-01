import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));
await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.waitForTimeout(500);

const active0 = await p.evaluate(() => document.activeElement?.textContent?.trim());
console.log("auto-focused on title:", active0);

await p.keyboard.press("ArrowDown");
await p.waitForTimeout(100);
const active1 = await p.evaluate(() => document.activeElement?.textContent?.trim());
console.log("after ArrowDown:", active1);

await p.keyboard.press("ArrowDown");
await p.waitForTimeout(100);
const active2 = await p.evaluate(() => document.activeElement?.textContent?.trim());
console.log("after 2x ArrowDown:", active2);

// Select with "e" instead of space/enter.
await p.keyboard.press("e");
await p.waitForTimeout(400);
const screen = await p.evaluate(() => document.querySelector(".px-menu")?.dataset.screen);
console.log("screen after E:", screen);
await p.screenshot({ path: "shots/menu-keynav.png" });

await ctx.close();
await b.close();
