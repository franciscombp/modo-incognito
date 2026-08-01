import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("ERR", String(e)));
p.on("console", (m) => { if (m.type()==="error" && !m.text().includes("favicon")) console.log("CERR", m.text()); });
await p.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await p.waitForTimeout(600);
await p.screenshot({ path: "shots/dialogue-line.png" });
console.log("line ok");

// Mash space until options actually appear (typing animations vary in length).
async function advanceToOptions(maxTries = 20) {
  for (let i = 0; i < maxTries; i++) {
    const hasOptions = await p.evaluate(
      () => !document.querySelector(".vn-options")?.classList.contains("hidden")
    );
    if (hasOptions) return true;
    await p.keyboard.press("Space");
    await p.waitForTimeout(300);
  }
  return false;
}

const reachedOptions = await advanceToOptions();
console.log("reached options:", reachedOptions);
await p.screenshot({ path: "shots/dialogue-choice.png" });
const focused = await p.evaluate(() => document.querySelector(".vn-option.focused")?.textContent);
console.log("focused option:", focused);

await p.keyboard.press("ArrowDown");
await p.waitForTimeout(150);
const focused2 = await p.evaluate(() => document.querySelector(".vn-option.focused")?.textContent);
console.log("after ArrowDown:", focused2);
await p.screenshot({ path: "shots/dialogue-choice-nav.png" });

await p.keyboard.press("Space");
await p.waitForTimeout(600);
await p.screenshot({ path: "shots/dialogue-after-select.png" });
console.log("select via space ok");

await ctx.close();
await b.close();
