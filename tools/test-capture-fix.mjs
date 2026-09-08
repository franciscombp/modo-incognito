// Quick verification that the Gabo capture fix works
import { chromium } from "playwright";

const url = "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });

// Clear intro
for (let i = 0; i < 40; i++) {
  const open = await page.evaluate(() => window.__game.engine.dialogue.isOpen);
  if (!open) break;
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
}
await page.waitForTimeout(5000);
for (let i = 0; i < 40; i++) {
  const open = await page.evaluate(() => window.__game.engine.dialogue.isOpen);
  if (!open) break;
  await page.keyboard.press("Space");
  await page.waitForTimeout(100);
}

const result = await page.evaluate(() => {
  const game = window.__game.engine.game;
  game.setPaused(false);
  game.clearGate();
  game.saltarEscolta();
  game.minions.forEach(m => m.setActive(false));

  // Set high suspicion
  game.suspicion = game.boss.chaseSuspicionFloor + 10;
  game.boss.suspicion = game.suspicion;
  game.rules.explore = false;
  game._caughtCooldown = 0;
  game.inSafeSpot = false;

  // Make sure boss is not hunting
  if (game.boss.state === "CHASE" || game.boss.state === "SEARCH") {
    game.boss.resetToPatrol();
  }

  // Put Gabo at same position as player
  game.boss.position.x = game.player.position.x;
  game.boss.position.z = game.player.position.z;

  const warningsBefore = game.warnings;
  game.update(1/30);
  const warningsAfter = game.warnings;

  return {
    suspicionAboveFloor: game.suspicion >= game.boss.chaseSuspicionFloor,
    bossNotHunting: !(game.boss.state === "CHASE" || game.boss.state === "SEARCH"),
    captureWasTriggered: warningsAfter > warningsBefore,
    // Success if: capture triggered while boss is not hunting
    // (suspicion can get reset after capture, so we just check the result)
    success: !(game.boss.state === "CHASE" || game.boss.state === "SEARCH") &&
             (warningsAfter > warningsBefore),
  };
});

console.log("✓ TEST RESULT:");
console.log(`  Suspicion >= chaseSuspicionFloor: ${result.suspicionAboveFloor}`);
console.log(`  Boss not in CHASE state: ${result.bossNotHunting}`);
console.log(`  Capture triggered: ${result.captureWasTriggered}`);
console.log(result.success ? "\n✅ FIX WORKS!" : "\n❌ FIX FAILED!");

await browser.close();
process.exit(result.success ? 0 : 1);
