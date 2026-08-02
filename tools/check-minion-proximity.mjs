// A minion's interrogation must wait for real physical proximity — being in
// its "halo" (redAlert) is not enough on its own if it hasn't actually
// caught up to the player yet.
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 10000 });

async function clearDialogue(page, maxSteps = 40) {
  for (let i = 0; i < maxSteps; i++) {
    const open = await page.evaluate(() => window.__game.engine.dialogue.isOpen);
    if (!open) return;
    const hasOptions = await page.evaluate(() => !document.querySelector(".inc-dialogue-options")?.classList.contains("hidden"));
    if (hasOptions) await page.evaluate(() => document.querySelector(".inc-dialogue-option")?.click());
    else await page.keyboard.press("Space");
    await page.waitForTimeout(120);
  }
}
await clearDialogue(page);
// The day-start cinematic (lobby doors + one intro card per on-duty
// minion) sits silently between the prologue and the arrival dialogue —
// dialogue.isOpen is briefly false in that gap, so give it room to finish
// and then clear whatever dialogue opens after it too.
await page.waitForTimeout(4500);
await clearDialogue(page);

const out = await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  const S = window.__floorplan.WORLD_SCALE;
  game.setPaused(false);
  game.minions.forEach((m) => m.setActive(false));
  // Este test es sobre la proximidad de los secuaces, no sobre la puerta del
  // día 1 (encontrar a Gabo primero) — se salta directo a la vigilancia ya
  // activada, o los secuaces no hablan aunque te toquen.
  game.metGabo = true;

  const crispo = game.minions.find((m) => m.cast === "crispo");
  if (!crispo) return { error: "no crispo on duty today" };

  crispo.setActive(true);
  game.talkCooldowns.delete(crispo.id ?? crispo.cast);
  // Force "sees you" regardless of real raycasting/distance — this isolates
  // the proximity gate from vision itself.
  crispo._updateVision = () => {
    crispo.playerVisible = true;
    crispo.redAlert = true;
  };

  // Far away: 6 world units clears the ~0.9-unit adjacency threshold easily.
  crispo.position.x = game.player.position.x + 6 * S;
  crispo.position.z = game.player.position.z;
  return { setup: true };
});

let dialogueWhileFar = false;
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(150);
  dialogueWhileFar = dialogueWhileFar || (await page.evaluate(() => window.__game.engine.dialogue.isOpen));
}

const afterMovingClose = await page.evaluate(() => {
  const { engine } = window.__game;
  const game = engine.game;
  const crispo = game.minions.find((m) => m.cast === "crispo");
  crispo.position.x = game.player.position.x;
  crispo.position.z = game.player.position.z;
  return true;
});

let dialogueOnceAdjacent = false;
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(100);
  dialogueOnceAdjacent = dialogueOnceAdjacent || (await page.evaluate(() => window.__game.engine.dialogue.isOpen));
  if (dialogueOnceAdjacent) break;
}

// ---- La OTRA vía por la que un secuaz te habla: la cháchara sin alerta
// roja (_updateMinionApproach). Esta era la que abría el diálogo a más de
// dos unidades de plano, y es la que se sentía como "Crispo me aborda sin
// haberse acercado". Tiene que exigir contacto igual que la anterior.
await clearDialogue(page);
await page.evaluate(() => {
  const game = window.__game.engine.game;
  const crispo = game.minions.find((m) => m.cast === "crispo");
  // Sin alerta: pura charla casual.
  crispo._updateVision = () => {
    crispo.playerVisible = false;
    crispo.redAlert = false;
  };
  crispo.lockedOn = false;
  crispo.resetToPatrol();
  game.talkCooldowns.delete(crispo.id ?? crispo.cast);
});

/**
 * Planta a Crispo a `units` unidades de plano y mira si TE HABLA ÉL. Se mira
 * su enfriamiento de charla, no `dialogue.isOpen`: quedarse quieta junto a un
 * secreto del plano también abre un diálogo, y eso daba un falso positivo.
 */
async function talksAt(units) {
  // Recolocar y limpiar el enfriamiento TIENEN que ir en la misma evaluación:
  // si se limpia primero y se mueve después, entre las dos corren frames con
  // Crispo todavía encima de la jugadora y vuelve a hablar — un falso
  // positivo que costó un rato entender.
  await page.evaluate((u) => {
    const game = window.__game.engine.game;
    const crispo = game.minions.find((m) => m.cast === "crispo");
    const S = window.__floorplan.WORLD_SCALE;
    crispo.position.x = game.player.position.x + u * S;
    crispo.position.z = game.player.position.z;
    crispo._pickTarget = () => ({ x: crispo.position.x, z: crispo.position.z }); // que no se mueva
    game.talkCooldowns.delete(crispo.id ?? crispo.cast);
  }, units);
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(120);
    const talked = await page.evaluate(() => {
      const game = window.__game.engine.game;
      const crispo = game.minions.find((m) => m.cast === "crispo");
      return (game.talkCooldowns.get(crispo.id ?? crispo.cast) ?? 0) > 0;
    });
    if (talked) return true;
  }
  return false;
}

// Dos unidades de plano es "en el mismo pasillo", no "encima". Antes bastaba.
const chatsFromAcrossTheRoom = await talksAt(2);
await clearDialogue(page);
const chatsOnContact = await talksAt(0);

console.log(
  JSON.stringify(
    { ...out, dialogueWhileFar, afterMovingClose, dialogueOnceAdjacent, chatsFromAcrossTheRoom, chatsOnContact },
    null,
    1
  )
);

const checks = [
  ["!dialogueWhileFar", "no dialogue while the minion is still far away", !dialogueWhileFar],
  ["dialogueOnceAdjacent", "dialogue fires once the minion actually reaches you", dialogueOnceAdjacent],
  ["!chatsFromAcrossTheRoom", "un secuaz NO te da charla desde dos unidades de plano", !chatsFromAcrossTheRoom],
  ["chatsOnContact", "un secuaz te da charla cuando te toca", chatsOnContact],
];
let ok = true;
for (const [key, label, value] of checks) {
  const pass = !!value;
  ok = ok && pass;
  console.log(pass ? "PASS" : "FAIL", " ", label);
}
if (errors.length) {
  console.error("Errores de consola:");
  errors.forEach((e) => console.error(" ", e));
}
await browser.close();
process.exit(ok && !errors.length ? 0 : 1);
