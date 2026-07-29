import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

p.on("pageerror", (e) => console.log("ERR", String(e)));
p.on("console", (m) => {
  const msg = m.text();
  if (m.type() === "error" && !msg.includes("favicon")) console.log("CERR", msg);
  if (msg.includes("narrator") || msg.includes("Steven")) console.log("LOG", msg);
});

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

// Wait for boot to complete
await p.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 10000 });

// Add logging to dialogue system
await p.evaluate(() => {
  window.origShowNarrator = window.__game.dialogue.showNarrator;
  window.__game.dialogue.showNarrator = function(text) {
    console.log("NARRATOR SHOWN:", text.substring(0, 100));
    return window.origShowNarrator.call(this, text);
  };
});

// Check initial dialogue state
const initialDia = await p.evaluate(() => {
  const narrator = document.querySelector(".vn-narrator");
  const box = document.querySelector(".vn-box");
  return {
    narratorExists: !!narrator,
    boxExists: !!box,
    narratorHidden: narrator?.classList.contains("hidden"),
    versionCheck: window.__game ? "game loaded" : "game not loaded"
  };
});

console.log("Initial state:", JSON.stringify(initialDia, null, 2));

// Start the day
console.log("Starting day...");
await p.evaluate(() => { window.__game.engine.startDay(0); });

// Wait a bit for dialogue to start
await p.waitForTimeout(1000);

// Check state after starting
const afterStart = await p.evaluate(() => {
  const narrator = document.querySelector(".vn-narrator");
  const narratorText = document.querySelector(".vn-narrator-text");
  const box = document.querySelector(".vn-box");
  const boxText = document.querySelector(".vn-text");
  return {
    narratorHidden: narrator?.classList.contains("hidden"),
    narratorText: narratorText?.textContent?.substring(0, 100),
    boxHidden: box?.classList.contains("hidden"),
    boxText: boxText?.textContent?.substring(0, 100),
  };
});

console.log("After start:", JSON.stringify(afterStart, null, 2));

await p.screenshot({ path: "shots/narrator-debug.png" });
console.log("Screenshot saved");

await ctx.close();
await b.close();
