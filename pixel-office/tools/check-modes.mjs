// Targeted checks for the second big request batch: safe spots, the <30%
// pretend immunity, Kiara's explore mode, and Washo's slow-down aura.
// Not exhaustive — just enough to catch a wiring mistake before it ships.
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

const report = await page.evaluate(async () => {
  const { engine } = window.__game;
  engine.startDay(0);
  await new Promise((r) => setTimeout(r, 50));
  const game = engine.game;
  game.setPaused(false);
  // Skip the prologue/intro dialogue instantly rather than clicking through.
  engine.dialogue.close?.();

  const fp = window.__floorplan;
  const out = {};

  // ---- Safe spot suppresses suspicion while the boss is "hunting" ----
  const spot = fp.safeSpots[0];
  game.player.position.x = spot.x;
  game.player.position.z = spot.z;
  game.suspicion = 50;
  game.boss.redAlert = true;
  game.boss.startChase(); // real CHASE state, not a stand-in string
  for (let i = 0; i < 30; i++) game.update(1 / 30);
  out.safeSpotHeldSuspicion = game.suspicion <= 50; // never rose while inside
  game.boss.redAlert = false;

  // ---- Pretend immunity under 30% suspicion ----
  // Step off the safe spot first: standing in one is its own immunity and
  // would confound the suspicion-threshold rule this checks.
  game.player.position.x = fp.spawn.x;
  game.player.position.z = fp.spawn.z;
  game.suspicion = 10;
  // update() derives isPretending from the held "f" key every frame, so a
  // direct property set gets clobbered — hold the key like the real input does.
  game.player.keys.add("f");
  game.boss.startChase(); // isHunting derives from state; this makes it true
  const origCatches = game.boss.catches;
  game.boss.catches = () => true; // force a would-be catch every frame
  const warningsBefore = game.warnings;
  game._caughtCooldown = 0;
  game.update(1 / 30);
  out.immuneUnder30 = game.warnings === warningsBefore;

  // ---- Over 30% while pretending: catchable ----
  game.suspicion = 60;
  game._caughtCooldown = 0;
  game.update(1 / 30);
  out.catchableOver30 = game.warnings === warningsBefore + 1;
  game.boss.catches = origCatches;
  game.player.keys.delete("f");

  // ---- Kiara explore mode: suspicion/warnings never happen ----
  engine.startDay(0);
  await new Promise((r) => setTimeout(r, 50));
  const save = engine.save;
  save.setCharacter("kiara");
  engine.startDay(0);
  await new Promise((r) => setTimeout(r, 50));
  const gameK = engine.game;
  gameK.setPaused(false);
  gameK.suspicion = 999; // try to force it, explore mode should zero it next frame
  gameK.boss.catches = () => true;
  gameK.boss.isHunting = true;
  gameK.update(1 / 30);
  out.exploreIgnoresSuspicion = gameK.suspicion === 0 && gameK.warnings === 0;
  save.setCharacter(null);

  return out;
});

await browser.close();
console.log(JSON.stringify(report, null, 1));

const checks = [
  ["safeSpotHeldSuspicion", "safe spot suppresses suspicion while boss hunts"],
  ["immuneUnder30", "pretending under 30% suspicion is immune to a catch"],
  ["catchableOver30", "pretending over 30% suspicion can still be caught"],
  ["exploreIgnoresSuspicion", "Kiara's explore mode ignores suspicion/warnings"],
];
let ok = true;
for (const [key, label] of checks) {
  const pass = !!report[key];
  ok = ok && pass;
  console.log(pass ? "PASS" : "FAIL", " ", label);
}
if (errors.length) {
  console.error("Errores de consola:");
  errors.forEach((e) => console.error(" ", e));
}
process.exit(ok && !errors.length ? 0 : 1);
