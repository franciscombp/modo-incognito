// Behavioural check for the boss AI: he must spot the player slacking off,
// break off his patrol to chase her, close the distance, lose her when she
// hides, and be pullable off-route by a distraction.
//
// Usage: node tools/check-chase.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

// The title menu is up on boot; start day 1 before poking at the AI.
// Note the braces: startDay's promise only settles once the intro dialogue
// is dismissed, and returning it here would hang the test forever.
await page.evaluate(() => {
  window.__game.engine.startDay(0);
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 10000 });

const log = await page.evaluate(async () => {
  const { boss, player, engine, world } = window.__game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = {};

  // The intro scene freezes the level; drop straight into play for the test.
  const game = engine.game;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");
  // This test is about the boss, not the sidekicks: an on-duty minion could
  // walk up and start an unsolicited chat, which pauses the level and would
  // otherwise stall every assertion below on a dialogue nobody answers.
  game.minions.forEach((m) => m.setActive(false));

  // A clear stretch of the front corridor, boss looking east at the player.
  const S = window.__floorplan.WORLD_SCALE;
  const bx = 0 * S;
  const px = 3.4 * S;
  const z = 10.8 * S;
  out.sightLineClear = !world.lineBlocked({ x: bx, z }, { x: px, z }, []);

  player.position.x = px;
  player.position.z = z;
  player.isHiding = false;
  boss.position.x = bx;
  boss.position.z = z;
  boss.route = [{ x: bx, z }]; // pin the route so he holds position until he sees her
  boss.routeIndex = 0;
  boss.facingDir = { x: 1, z: 0 };
  boss.state = "PATROL";

  // Put a forbidden activity right where she is standing.
  // Day 1 only enables a couple of activities, so take whichever is first.
  const station = game.objectives[0];
  station.x = px;
  station.z = z;
  station.done = false;
  station.progress = 0;
  player.keys.add("e");

  await sleep(350);
  out.seesPlayer = boss.playerVisible;
  out.redAlert = boss.redAlert;
  out.stateAfterSpotted = boss.state;

  const d0 = Math.hypot(boss.position.x - player.position.x, boss.position.z - player.position.z);
  const s0 = game.suspicion;
  // Sample the meter early: give the chase a full second and he reaches her,
  // which resets suspicion to zero as a warning and hides the rise.
  await sleep(250);
  out.suspicionRose = game.suspicion > s0;
  await sleep(450);
  const d1 = Math.hypot(boss.position.x - player.position.x, boss.position.z - player.position.z);
  out.closedDistance = +(d0 - d1).toFixed(2);

  // Pretending to work must break the red alert even in plain sight.
  player.keys.add("f");
  await sleep(200);
  out.redAlertWhilePretending = boss.redAlert;
  player.keys.delete("f");
  player.keys.delete("e");

  // Losing her must end the direct pursuit. `isHiding` is recomputed from the
  // hiding spots every frame, so the test moves her out of range instead —
  // otherwise the flag is overwritten and the boss keeps seeing her.
  player.position.x = px + 40 * S;
  // Generous: headless throttles frames, and the boss only accumulates
  // "lost sight" time on frames that actually run. A single long sleep(3000)
  // measurably starves requestAnimationFrame in headless Chromium (fewer
  // frames actually execute than with the same total wait chunked into
  // several shorter sleeps), so this polls instead of waiting once.
  for (let i = 0; i < 15; i++) await sleep(200);
  out.stateWhenHidden = boss.state;
  out.gameOverWhenHidden = game.gameOver;
  out.loseSightTimer = +boss.loseSightTimer.toFixed(2);
  out.warningsSoFar = game.warnings;

  // A distraction pulls him off patrol.
  player.isHiding = false;
  boss.resetToPatrol();
  await sleep(80);
  const spot = window.__floorplan.distractions[0];
  out.distractAccepted = boss.distract({ x: spot.x, z: spot.z }, 5);
  await sleep(150);
  out.stateAfterDistract = boss.state;

  return out;
});

console.log(JSON.stringify(log, null, 1));

const checks = [
  ["line of sight is clear for the test setup", log.sightLineClear],
  ["boss sees the player", log.seesPlayer],
  ["red alert on a forbidden activity", log.redAlert],
  ["boss switches to CHASE", log.stateAfterSpotted === "CHASE"],
  ["boss closes the distance", log.closedDistance > 0.3],
  ["suspicion rises while seen", log.suspicionRose],
  ["pretending to work clears the red alert", log.redAlertWhilePretending === false],
  ["boss searches after losing sight", log.stateWhenHidden === "SEARCH" || log.stateWhenHidden === "PATROL"],
  ["distraction is accepted", log.distractAccepted === true],
  ["distraction switches to INVESTIGATE", log.stateAfterDistract === "INVESTIGATE"],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
if (errors.length) {
  console.log("page errors:");
  errors.forEach((e) => console.log("  " + e));
}

await browser.close();
process.exit(failed || errors.length ? 1 : 0);
