import { chromium } from "playwright";

const url = "http://localhost:5174/modo-incognito/";
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  console.log("Opening game with isometric view...");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });

  console.log("Game loaded, taking screenshot...");
  await page.screenshot({ path: "/tmp/iso-view-new.png" });

  const info = await page.evaluate(() => {
    const { player, boss, camera } = window.__game;
    const { rooms } = window.__floorplan;
    return {
      playerPos: player.position,
      bossPos: boss.position,
      cameraPos: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      numRooms: rooms.length,
      playerFacing: player.facing,
    };
  });

  console.log("Game state:");
  console.log(JSON.stringify(info, null, 2));

  if (errors.length) {
    console.log("Errors:", errors);
  } else {
    console.log("No errors!");
  }
} finally {
  await browser.close();
}
