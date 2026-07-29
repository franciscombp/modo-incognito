// Lightweight 2D (XZ-plane) collision world: axis-aligned boxes for desks,
// furniture and glass meeting-room walls, plus line segments for the
// chamfered perimeter walls. Also doubles as the line-of-sight occlusion
// test for the boss's vision cone ("paredes, cubículos y plantas bloquean
// la línea de visión").

function ccw(ax, az, bx, bz, cx, cz) {
  return (cz - az) * (bx - ax) > (bz - az) * (cx - ax);
}

function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

function segmentIntersectsBox(a, b, box) {
  if (pointInBox(a.x, a.z, box) || pointInBox(b.x, b.z, box)) return true;
  const c = [
    [box.minX, box.minZ],
    [box.maxX, box.minZ],
    [box.maxX, box.maxZ],
    [box.minX, box.maxZ],
  ];
  for (let i = 0; i < 4; i++) {
    const [x1, z1] = c[i];
    const [x2, z2] = c[(i + 1) % 4];
    if (segmentsIntersect(a.x, a.z, b.x, b.z, x1, z1, x2, z2)) return true;
  }
  return false;
}

function distToSegmentSq(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz || 1e-6;
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t;
  const cz = z1 + dz * t;
  const ex = px - cx;
  const ez = pz - cz;
  return ex * ex + ez * ez;
}

export function createCollisionWorld() {
  const boxes = [];
  const segments = [];

  function addBox(x, z, w, d, opts = {}) {
    const box = {
      minX: x - w / 2,
      maxX: x + w / 2,
      minZ: z - d / 2,
      maxZ: z + d / 2,
      sight: opts.sight !== false,
    };
    boxes.push(box);
    return box;
  }

  function addSegment(x1, z1, x2, z2, thickness = 0.3, opts = {}) {
    const seg = { x1, z1, x2, z2, thickness, sight: opts.sight !== false };
    segments.push(seg);
    return seg;
  }

  // Pushes `pos` (any object with .x/.z) out of every overlapping collider.
  function resolveCircle(pos, radius) {
    for (const b of boxes) {
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      }
    }
    for (const s of segments) {
      const dx = s.x2 - s.x1;
      const dz = s.z2 - s.z1;
      const lenSq = dx * dx + dz * dz || 1e-6;
      let t = ((pos.x - s.x1) * dx + (pos.z - s.z1) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = s.x1 + dx * t;
      const cz = s.z1 + dz * t;
      const ex = pos.x - cx;
      const ez = pos.z - cz;
      const distSq = ex * ex + ez * ez;
      const minDist = radius + s.thickness / 2;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const push = minDist - dist;
        pos.x += (ex / dist) * push;
        pos.z += (ez / dist) * push;
      }
    }
  }

  // True if the segment a->b is blocked by any sight-blocking collider, or
  // by one of the extra dynamic circle blockers (e.g. NPCs) passed in.
  function lineBlocked(a, b, extraCircles = []) {
    for (const box of boxes) {
      if (!box.sight) continue;
      if (segmentIntersectsBox(a, b, box)) return true;
    }
    for (const s of segments) {
      if (!s.sight) continue;
      if (segmentsIntersect(a.x, a.z, b.x, b.z, s.x1, s.z1, s.x2, s.z2)) return true;
    }
    for (const c of extraCircles) {
      if (distToSegmentSq(c.x, c.z, a.x, a.z, b.x, b.z) <= c.radius * c.radius) return true;
    }
    return false;
  }

  return { addBox, addSegment, resolveCircle, lineBlocked, boxes, segments };
}
