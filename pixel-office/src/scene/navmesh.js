import { footprint } from "./floorplan.js";
import { WORLD_SCALE as S } from "./config.js";

// Grid navmesh baked from the collision world after the office is built.
//
// It exists for two reasons: the boss needs to walk *around* the big tables
// and the restroom cores instead of grinding into them, and the build check
// needs to prove every activity station is actually reachable from the lifts.

const CELL = 0.5 * S;

function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const hit = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

export function buildNavmesh(world, { radius = 0.4 * S } = {}) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of footprint) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  const cols = Math.ceil((maxX - minX) / CELL) + 1;
  const rows = Math.ceil((maxZ - minZ) / CELL) + 1;
  const walkable = new Uint8Array(cols * rows);

  const toWorld = (c, r) => ({ x: minX + c * CELL, z: minZ + r * CELL });
  const toCell = (x, z) => ({
    c: Math.round((x - minX) / CELL),
    r: Math.round((z - minZ) / CELL),
  });
  const idx = (c, r) => r * cols + c;

  const probe = { x: 0, z: 0 };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const { x, z } = toWorld(c, r);
      if (!pointInPolygon(x, z, footprint)) continue;
      // A cell is walkable if a body of `radius` placed there is not pushed
      // out by any collider — exactly the test the player will experience.
      probe.x = x;
      probe.z = z;
      world.resolveCircle(probe, radius);
      if (Math.hypot(probe.x - x, probe.z - z) < 0.01 * S) walkable[idx(c, r)] = 1;
    }
  }

  const NEIGHBOURS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  function nearestWalkable(x, z) {
    const { c, r } = toCell(x, z);
    if (c >= 0 && c < cols && r >= 0 && r < rows && walkable[idx(c, r)]) return { c, r };
    for (let ring = 1; ring < 14; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (walkable[idx(nc, nr)]) return { c: nc, r: nr };
        }
      }
    }
    return null;
  }

  /** A* over the grid. Returns world-space waypoints, or null if unreachable. */
  function path(from, to) {
    const start = nearestWalkable(from.x, from.z);
    const goal = nearestWalkable(to.x, to.z);
    if (!start || !goal) return null;

    const startI = idx(start.c, start.r);
    const goalI = idx(goal.c, goal.r);
    if (startI === goalI) return [{ x: to.x, z: to.z }];

    const g = new Float32Array(cols * rows).fill(Infinity);
    const cameFrom = new Int32Array(cols * rows).fill(-1);
    const open = [{ i: startI, f: 0 }];
    g[startI] = 0;
    const h = (i) =>
      Math.hypot((i % cols) - goal.c, Math.floor(i / cols) - goal.r) * CELL;

    while (open.length) {
      // Small maps: a linear scan beats the bookkeeping of a real heap.
      let bestAt = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[bestAt].f) bestAt = k;
      const { i: current } = open.splice(bestAt, 1)[0];
      if (current === goalI) break;

      const cc = current % cols;
      const cr = Math.floor(current / cols);
      for (const [dc, dr] of NEIGHBOURS) {
        const nc = cc + dc;
        const nr = cr + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (!walkable[ni]) continue;
        // No cutting diagonally through a corner gap.
        if (dc && dr && (!walkable[idx(cc + dc, cr)] || !walkable[idx(cc, cr + dr)])) continue;
        const step = CELL * (dc && dr ? Math.SQRT2 : 1);
        const tentative = g[current] + step;
        if (tentative >= g[ni]) continue;
        g[ni] = tentative;
        cameFrom[ni] = current;
        open.push({ i: ni, f: tentative + h(ni) });
      }
    }

    if (cameFrom[goalI] === -1 && startI !== goalI) return null;

    const out = [];
    let node = goalI;
    while (node !== -1 && node !== startI) {
      out.push(toWorld(node % cols, Math.floor(node / cols)));
      node = cameFrom[node];
    }
    out.reverse();
    if (out.length) out[out.length - 1] = { x: to.x, z: to.z };
    return out;
  }

  function isWalkable(x, z) {
    const { c, r } = toCell(x, z);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    return !!walkable[idx(c, r)];
  }

  function reachable(from, to) {
    return path(from, to) !== null;
  }

  return { path, isWalkable, reachable, cols, rows, cell: CELL };
}
