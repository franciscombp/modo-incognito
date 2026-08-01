import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

async function screenshot(width, height, name) {
  const page = await browser.newPage({ 
    viewport: { width, height } 
  });
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

  await page.evaluate(() => {
    window.__game.engine.menus.close();
    window.__game.engine.startDay(0, { skipMinigame: true });
  });
  await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 15000 });

  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/portrait-${name}.png`, fullPage: false });
  await page.close();
}

console.log("Taking screenshots...");
await screenshot(1920, 1080, "1920x1080");
console.log("✓ 1920x1080");
await screenshot(1280, 720, "1280x720");
console.log("✓ 1280x720");
await screenshot(800, 600, "800x600");
console.log("✓ 800x600");

await browser.close();
console.log("Screenshots saved to /tmp/portrait-*.png");
