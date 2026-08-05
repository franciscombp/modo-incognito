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
  engine.startDay(0, { skipMinigame: true });
  await new Promise((r) => setTimeout(r, 50));
  const game = engine.game;
  game.setPaused(false);
  // Skip the prologue/intro dialogue instantly rather than clicking through.
  engine.dialogue.close?.();
  // These checks force-update the game in a tight synchronous loop; an
  // unsolicited minion approach would call setPaused(true) mid-loop and
  // freeze every assertion after it on an unanswered dialogue.
  game.minions.forEach((m) => m.setActive(false));
  // Estos checks son sobre mecánicas ya en marcha (lugar seguro, fingir,
  // captura), no sobre la puerta del día 1 — sin esto la sospecha se
  // congela en 0 pase lo que pase (ver rules.gate) y varias de las
  // aserciones de abajo pasarían por el motivo equivocado.
  game.metGabo = true;

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

  // ---- Once the boss actively hunts (CHASE/SEARCH), pretending no longer
  // saves you — only a real safe spot does now. (Pretending still prevents
  // a chase from starting in the first place; it just can't end one.) ----
  game.player.position.x = fp.spawn.x;
  game.player.position.z = fp.spawn.z;
  // El jefe ya NO arranca una caza con la sospecha baja: por debajo de
  // `chaseSuspicionFloor` hace su ronda (el respiro que hace jugable el dia
  // 1, ver docs/MOTOR.md 3.1). Este caso prueba que FINGIR no corta una caza
  // YA EN MARCHA, asi que primero tiene que haber una: se calienta el
  // medidor lo justo para que arranque. En las dos copias, que el jefe lleva
  // la suya y game.js la sincroniza una vez por cuadro.
  game.suspicion = game.boss.chaseSuspicionFloor + 10;
  game.boss.suspicion = game.suspicion;
  game.player.keys.add("f");
  game.boss.startChase();
  const origCatches = game.boss.catches;
  game.boss.catches = () => true; // force a would-be catch every frame
  const warningsBefore = game.warnings;
  game._caughtCooldown = 0;
  game.update(1 / 30);
  out.pretendNoLongerStopsActiveChase = game.warnings === warningsBefore + 1;
  game.player.keys.delete("f");

  // ---- A safe spot is still the one real escape from an active chase ----
  const safeSpot2 = fp.safeSpots[0];
  game.player.position.x = safeSpot2.x;
  game.player.position.z = safeSpot2.z;
  game.suspicion = 80;
  game.boss.startChase();
  const warningsBefore2 = game.warnings;
  game._caughtCooldown = 0;
  game.update(1 / 30);
  out.safeSpotStillEscapesActiveChase = game.warnings === warningsBefore2;
  game.boss.catches = origCatches;

  // ---- Kiara explore mode: suspicion/warnings never happen ----
  engine.startDay(0, { skipMinigame: true });
  await new Promise((r) => setTimeout(r, 50));
  const save = engine.save;
  save.setCharacter("kiara");
  engine.startDay(0, { skipMinigame: true });
  await new Promise((r) => setTimeout(r, 50));
  const gameK = engine.game;
  gameK.setPaused(false);
  gameK.minions.forEach((m) => m.setActive(false));
  gameK.metGabo = true; // que sea explore mode lo que ponga la sospecha a 0, no la puerta
  gameK.suspicion = 999; // try to force it, explore mode should zero it next frame
  gameK.boss.catches = () => true;
  gameK.boss.isHunting = true;
  gameK.update(1 / 30);
  out.exploreIgnoresSuspicion = gameK.suspicion === 0 && gameK.warnings === 0;
  save.setCharacter(null);

  // ---- Seen idle: the boss watching you do nothing must raise suspicion ----
  // This was the reported bug — before the fix, redAlert (and so any
  // suspicion gain) required an in-progress forbidden activity, so standing
  // in his cone doing nothing never moved the meter at all.
  engine.startDay(0, { skipMinigame: true });
  await new Promise((r) => setTimeout(r, 50));
  const game2 = engine.game;
  game2.setPaused(false);
  game2.minions.forEach((m) => m.setActive(false));
  // La sospecha no sube mientras la puerta del día 1 siga sin superar (ver
  // rules.gate) — este test es sobre la mecánica ya en marcha, no sobre esa
  // puerta.
  game2.metGabo = true;
  game2.player.position.x = fp.spawn.x;
  game2.player.position.z = fp.spawn.z;
  game2.player.isDoingActivity = false;
  game2.player.keys.delete("f");
  game2.suspicion = 20;
  game2.boss.state = "PATROL";
  // update() recomputes playerVisible/redAlert from real raycasting every
  // frame (the boss is nowhere near spawn); stub it so "seen, doing nothing"
  // holds for the whole loop without having to stage a real sightline.
  const origUpdateVision = game2.boss._updateVision.bind(game2.boss);
  game2.boss._updateVision = () => {
    game2.boss.playerVisible = true;
    game2.boss.redAlert = false;
  };
  const before2 = game2.suspicion;
  for (let i = 0; i < 30; i++) game2.update(1 / 30);
  out.seenIdleRaisesSuspicion = game2.suspicion > before2;
  game2.boss._updateVision = origUpdateVision;

  return out;
});

await browser.close();
console.log(JSON.stringify(report, null, 1));

const checks = [
  ["safeSpotHeldSuspicion", "safe spot suppresses suspicion while boss hunts"],
  ["pretendNoLongerStopsActiveChase", "pretending no longer stops an active chase"],
  ["safeSpotStillEscapesActiveChase", "a safe spot still escapes an active chase"],
  ["exploreIgnoresSuspicion", "Kiara's explore mode ignores suspicion/warnings"],
  ["seenIdleRaisesSuspicion", "boss watching you do nothing still raises suspicion"],
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
