// Verifies the two new "caught" mechanics: a minion's redAlert edge
// triggers its interrogation dialogue (instead of a silent suspicion tick),
// and the boss catching the player shows a dialogue + grants a grace
// window where he can't see her again immediately.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.engine.startDay(0); });
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 10000 });

// Drives whatever dialogue is currently open to completion (mashing space,
// picking the first option when one is offered) so any awaited
// dialogue.play() promise actually resolves.
async function clearDialogue(page, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) {
    const open = await page.evaluate(() => window.__game.engine.dialogue.isOpen);
    if (!open) return true;
    const hasOptions = await page.evaluate(
      () => !document.querySelector(".vn-options")?.classList.contains("hidden")
    );
    if (hasOptions) await page.evaluate(() => document.querySelector(".vn-option")?.click());
    else await page.keyboard.press("Space");
    await page.waitForTimeout(120);
  }
  return page.evaluate(() => window.__game.engine.dialogue.isOpen) === false;
}

await clearDialogue(page); // past the day-1 intro

const out = await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  game.setPaused(false);
  game.minions.forEach((m) => m.setActive(false));
  return { dialogueOpenBefore: engine.dialogue.isOpen };
});

// ---- Minion catch triggers interrogation dialogue, but only once it has
// physically reached the player (not just from redAlert alone) ----
const minionSetup = await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  const crispo = game.minions.find((m) => m.cast === "crispo");
  if (!crispo) return { found: false };
  crispo.setActive(true);
  crispo.redAlert = false;
  game.talkCooldowns.delete(crispo.id ?? crispo.cast);
  // update() recomputes playerVisible/redAlert from real raycasting every
  // frame, which would immediately clobber a hand-set redAlert — stub it
  // like check-modes.mjs does, so the false->true edge actually holds for
  // the frame _updateMinionCatch() reads it on.
  crispo._updateVision = () => {
    crispo.playerVisible = true;
    crispo.redAlert = true;
  };

  // Far away first: redAlert alone must not be enough.
  crispo.position.x = game.player.position.x + 6 * S;
  crispo.position.z = game.player.position.z;
  game.update(1 / 30);
  return { found: true };
});
out.dialogueOpenWhileFar = await page.evaluate(() => window.__game.engine.dialogue.isOpen);

// Now put it right next to the player: only proximity should unlock it.
await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  const crispo = game.minions.find((m) => m.cast === "crispo");
  crispo.position.x = game.player.position.x;
  crispo.position.z = game.player.position.z;
  game.update(1 / 30);
});
await page.waitForTimeout(150);
out.dialogueOpenAfterCatch = await page.evaluate(() => window.__game.engine.dialogue.isOpen);
out.noCrispoOnDuty = !minionSetup.found;
await clearDialogue(page);

// ---- Boss catch: warning fires, then a grace window follows ----
const bossSetup = await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  game.setPaused(false);
  game.rules.explore = false;
  game.warnings = 0;
  game.boss.startChase();
  game.boss.position.x = game.player.position.x;
  game.boss.position.z = game.player.position.z;
  window.__origCatches = game.boss.catches;
  game.boss.catches = () => true;
  game._caughtCooldown = 0;
  game.inSafeSpot = false;
  const graceBefore = game.boss.inGrace;
  game.update(1 / 30);
  return { graceBefore, warnedOnce: game.warnings === 1 };
});
Object.assign(out, bossSetup);
await page.waitForTimeout(150);
// handleWarn() plays the "jefe" scolding dialogue before granting grace.
await clearDialogue(page);
await page.waitForTimeout(150);
out.graceAfter = await page.evaluate(() => {
  window.__game.engine.game.boss.catches = window.__origCatches;
  return window.__game.engine.game.boss.inGrace;
});

console.log(JSON.stringify(out, null, 1));

const checks = [
  ["!dialogueOpenWhileFar", "redAlert alone (far away) does not open the dialogue", !out.dialogueOpenWhileFar],
  ["dialogueOpenAfterCatch", "dialogue opens once the minion physically reaches the player", out.dialogueOpenAfterCatch],
  ["warnedOnce", "boss catch registers exactly one warning", out.warnedOnce],
  ["graceAfter", "boss grants a grace window after warning", out.graceAfter],
];
let ok = true;
for (const [key, label, value] of checks) {
  const pass = !!value;
  ok = ok && pass;
  console.log(pass ? "PASS" : "FAIL", " ", label);
}
if (out.noCrispoOnDuty) console.log("NOTE: crispo not on duty today, minion check skipped structurally");
if (errors.length) {
  console.error("Errores de consola:");
  errors.forEach((e) => console.error(" ", e));
}
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
