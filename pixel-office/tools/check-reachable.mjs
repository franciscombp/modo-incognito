// Asks the in-game navmesh whether every gameplay position (activity
// station, hiding spot, distraction, patrol waypoint, zone centre) can be
// walked to from the lifts. Catches the "I get stuck / can't get in there"
// class of level bug before it ships.
//
// Usage: node tools/check-reachable.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/modo-incognito/";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
});

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

const report = await page.evaluate(() => {
  const { navmesh } = window.__game;
  const fp = window.__floorplan;
  const from = fp.spawn;

  const targets = [
    ...fp.activityStations.map((s) => ({ kind: "actividad", name: s.label, x: s.x, z: s.z })),
    ...fp.hidingSpots.map((h, i) => ({ kind: "escondite", name: `#${i + 1}`, x: h.x, z: h.z })),
    ...fp.distractions.map((d) => ({ kind: "distracción", name: d.label, x: d.x, z: d.z })),
    ...fp.patrolRoute.map((p, i) => ({ kind: "patrulla", name: `wp${i}`, x: p.x, z: p.z })),
    ...fp.areas
      .filter((a) => a.kind === "open-office" || a.kind === "meeting")
      .map((a) => ({
        kind: "zona",
        name: a.name,
        // Aim just outside the table, where the chairs are.
        x: a.x,
        z: a.z + a.d / 2 - 0.35,
      })),
  ];

  const unreachable = targets.filter((t) => !navmesh.reachable(from, t));
  return { total: targets.length, unreachable, grid: { cols: navmesh.cols, rows: navmesh.rows } };
});

await browser.close();

console.log(
  `navmesh ${report.grid.cols}x${report.grid.rows} · ${report.total} puntos comprobados`
);
if (errors.length) {
  console.error("Errores de consola:");
  errors.forEach((e) => console.error(" ", e));
}
if (report.unreachable.length) {
  console.error(`INALCANZABLES (${report.unreachable.length}):`);
  report.unreachable.forEach((t) =>
    console.error(`  [${t.kind}] ${t.name} (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`)
  );
}
process.exit(errors.length || report.unreachable.length ? 1 : 0);
