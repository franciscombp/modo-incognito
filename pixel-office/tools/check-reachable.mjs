// Flood-fills the collision world from the player's spawn and reports any
// gameplay position (activity station, hiding spot, distraction, patrol
// waypoint) that the player physically cannot reach. Catches the "I get
// stuck / can't get in there" class of level bug before it ships.
//
// Usage: node tools/check-reachable.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/modo-incognito/";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 15000 });

const report = await page.evaluate(async () => {
  const { world, player } = window.__game;

  const R = player.radius;
  const STEP = 0.25;
  const MIN_X = -17;
  const MAX_X = 17;
  const MIN_Z = -12;
  const MAX_Z = 14;
  const cols = Math.round((MAX_X - MIN_X) / STEP) + 1;
  const rows = Math.round((MAX_Z - MIN_Z) / STEP) + 1;

  const toX = (i) => MIN_X + i * STEP;
  const toZ = (j) => MIN_Z + j * STEP;

  // A cell is walkable if a player-sized circle placed there is not pushed
  // out by the collision solver.
  const free = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const p = { x: toX(i), z: toZ(j) };
      world.resolveCircle(p, R);
      const moved = Math.hypot(p.x - toX(i), p.z - toZ(j));
      free[j * cols + i] = moved < 1e-6 ? 1 : 0;
    }
  }

  const idx = (i, j) => j * cols + i;
  const nearestFree = (x, z) => {
    let best = null;
    let bestD = Infinity;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (!free[idx(i, j)]) continue;
        const d = Math.hypot(toX(i) - x, toZ(j) - z);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    return { cell: best, dist: bestD };
  };

  // Flood fill from spawn.
  const start = nearestFree(player.position.x, player.position.z);
  const seen = new Uint8Array(cols * rows);
  const queue = [start.cell];
  seen[idx(start.cell[0], start.cell[1])] = 1;
  let reachedCount = 0;
  while (queue.length) {
    const [i, j] = queue.pop();
    reachedCount++;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const k = idx(ni, nj);
      if (seen[k] || !free[k]) continue;
      seen[k] = 1;
      queue.push([ni, nj]);
    }
  }

  const reachable = (x, z, tolerance) => {
    // Any reachable free cell within `tolerance` of the point counts as
    // "the player can stand close enough to interact".
    const maxCells = Math.ceil(tolerance / STEP);
    const ci = Math.round((x - MIN_X) / STEP);
    const cj = Math.round((z - MIN_Z) / STEP);
    for (let dj = -maxCells; dj <= maxCells; dj++) {
      for (let di = -maxCells; di <= maxCells; di++) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        if (!seen[idx(ni, nj)]) continue;
        if (Math.hypot(toX(ni) - x, toZ(nj) - z) <= tolerance) return true;
      }
    }
    return false;
  };

  return {
    cols,
    rows,
    reachedCount,
    freeCount: free.reduce((a, b) => a + b, 0),
    spawnSnapDist: start.dist,
    points: (() => {
      const out = [];
      const fp = window.__floorplan;
      if (!fp) return out;
      for (const s of fp.activityStations) out.push({ kind: "actividad", id: s.id, x: s.x, z: s.z, tol: 1.3, ok: reachable(s.x, s.z, 1.3) });
      for (const [n, h] of fp.hidingSpots.entries()) out.push({ kind: "escondite", id: `#${n + 1}`, x: h.x, z: h.z, tol: h.r, ok: reachable(h.x, h.z, h.r) });
      for (const d of fp.distractions) out.push({ kind: "distraccion", id: d.id, x: d.x, z: d.z, tol: 1.3, ok: reachable(d.x, d.z, 1.3) });
      for (const [n, p] of fp.patrolRoute.entries()) out.push({ kind: "patrulla", id: `wp${n}`, x: p.x, z: p.z, tol: 0.6, ok: reachable(p.x, p.z, 0.6) });
      return out;
    })(),
  };
});

console.log(`grid ${report.cols}x${report.rows}  free=${report.freeCount}  reachable=${report.reachedCount}`);
const bad = (report.points ?? []).filter((p) => !p.ok);
if (!report.points || report.points.length === 0) {
  console.log("!! floorplan not exposed on window.__floorplan — cannot check points");
} else {
  console.log(`checked ${report.points.length} gameplay points, ${bad.length} unreachable`);
  for (const p of bad) console.log(`  UNREACHABLE ${p.kind} ${p.id} at (${p.x}, ${p.z})`);
}
if (errors.length) {
  console.log("page errors:");
  errors.forEach((e) => console.log("  " + e));
}

await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);
