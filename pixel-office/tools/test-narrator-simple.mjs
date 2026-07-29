import { chromium } from "playwright";

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();

p.on("pageerror", (e) => console.log("PAGE ERROR:", String(e)));
p.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) console.log("CONSOLE ERROR:", m.text());
});

await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });

// Wait for game to be fully initialized
await p.waitForFunction(() => {
  return window.__game && window.__game.engine && typeof window.__game.engine.startDay === 'function';
}, null, { timeout: 30000 });

console.log("Game initialized");

// Wait for boot screen to disappear
await p.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 10000 });

console.log("Boot screen gone");

// Check dialogue element exists
const dialogueExists = await p.evaluate(() => {
  const narrator = document.querySelector(".vn-narrator");
  const box = document.querySelector(".vn-box");
  return {
    hasNarrator: !!narrator,
    hasBox: !!box,
  };
});

console.log("Dialogue elements exist:", JSON.stringify(dialogueExists));

// Start day
console.log("Starting day 0...");
await p.evaluate(() => window.__game.engine.startDay(0));

// Wait for any dialogue to appear
await p.waitForTimeout(2000);

// Check what's visible
const state = await p.evaluate(() => {
  const narrator = document.querySelector(".vn-narrator");
  const box = document.querySelector(".vn-box");
  const narratorText = document.querySelector(".vn-narrator-text");
  const boxText = document.querySelector(".vn-text");
  const speakerText = document.querySelector(".vn-speaker-text");

  return {
    narratorVisible: narrator && !narrator.classList.contains("hidden"),
    narratorText: narratorText?.textContent?.substring(0, 80),
    boxVisible: box && !box.classList.contains("hidden"),
    boxText: boxText?.textContent?.substring(0, 80),
    speaker: speakerText?.textContent,
  };
});

console.log("Current state:", JSON.stringify(state, null, 2));

await p.screenshot({ path: "shots/narrator-simple.png" });
console.log("Screenshot saved to shots/narrator-simple.png");

await ctx.close();
await b.close();
