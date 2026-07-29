import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

p.on("pageerror", (e) => console.log("ERR", String(e)));
p.on("console", (m) => { if (m.type()==="error" && !m.text().includes("favicon")) console.log("CERR", m.text()); });

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

// Wait for boot to complete
await p.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 10000 });

// Start the day
await p.evaluate(() => { window.__game.engine.startDay(0); });

// Wait for the narrator element to appear with text
await p.waitForFunction(() => {
  const narrator = document.querySelector(".vn-narrator");
  return narrator && !narrator.classList.contains("hidden") && narrator.textContent.trim().length > 0;
}, null, { timeout: 5000 }).catch(() => {
  console.log("Narrator did not appear as expected");
  return false;
});

// Take screenshot of narrator
await p.waitForTimeout(300);
const narratorText = await p.evaluate(() => {
  const narrator = document.querySelector(".vn-narrator-text");
  return narrator?.textContent || "NOT FOUND";
});
console.log("Narrator text:", narratorText.substring(0, 100));

await p.screenshot({ path: "shots/narrator-test.png" });
console.log("✓ Narrator screenshot captured");

await ctx.close();
await b.close();
