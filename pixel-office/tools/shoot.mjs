// Visual smoke test: boots the built game, dismisses the intro scene and
// captures the diorama at desktop, phone-portrait and phone-landscape sizes.
// Any page error fails the run, so a black screen can never ship unnoticed.
//
// Usage: node tools/shoot.mjs [url] [outDir]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.argv[2] ?? "http://localhost:4173/modo-incognito/";
const outDir = process.argv[3] ?? "shots";
await mkdir(outDir, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, framing: 0 },
  { name: "desktop-follow", width: 1440, height: 900, framing: 1 },
  { name: "phone-portrait", width: 390, height: 844, framing: 0.8, touch: true },
  { name: "phone-landscape", width: 844, height: 390, framing: 0.6, touch: true },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
let failed = false;

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: !!vp.touch,
    isMobile: !!vp.touch,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

  // Click through the intro dialogue so the shot shows the actual floor.
  for (let i = 0; i < 24; i++) {
    const open = await page.evaluate(() => !!document.querySelector(".vn-layer:not(.hidden)"));
    if (!open) break;
    const option = await page.$(".vn-option");
    if (option) await option.click();
    else await page.mouse.click(vp.width / 2, vp.height - 60);
    await page.waitForTimeout(220);
  }

  await page.evaluate((f) => window.__game.view.setFraming(f), vp.framing);
  await page.waitForTimeout(900);

  const shot = await page.screenshot({ path: `${outDir}/${vp.name}.png` });

  // A black screen is a flat image, and a flat image compresses to almost
  // nothing. Anything under ~40KB at these sizes means the floor never drew.
  const kb = Math.round(shot.length / 1024);
  const blank = kb < 40;
  const status = errors.length ? "ERROR" : blank ? "EN BLANCO" : "ok";
  console.log(`${vp.name.padEnd(16)} ${status}  png=${kb}KB`);
  errors.forEach((e) => console.error("   ", e));
  if (errors.length || blank) failed = true;
  await context.close();
}

await browser.close();
process.exit(failed ? 1 : 0);
