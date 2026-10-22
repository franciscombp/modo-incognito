// Lightweight 2D (XZ-plane) collision world: axis-aligned boxes for desks,
// furniture and glass meeting-room walls, plus line segments for the
// chamfered perimeter walls. Also doubles as the line-of-sight occlusion
// test for the boss's vision cone ("paredes, cubículos y plantas bloquean
// la línea de visión").

function ccw(ax, az, bx, bz, cx, cz) {
  return (cz - az) * (bx - ax) > (bz - az) * (cx - ax);
}

export function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

function pointInBox(x, z, b) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Exportadas para el horneado de aristas del navmesh (ver navmesh.js): son
// LA MISMA pregunta que hace `pathBlocked`, solo que contra una lista corta
// de colliders cercanos en vez de contra todos — duplicar la geometría allí
// habría sido dos matemáticas que se separan al primer cambio.
export function segmentIntersectsBox(a, b, box) {
  return segmentHitsRect(a.x, a.z, b.x, b.z, box.minX, box.maxX, box.minZ, box.maxZ);
}

/**
 * El núcleo de `segmentIntersectsBox`, con números sueltos y SIN reservar
 * memoria. Es la pregunta más repetida del juego —la hacen la vista y el
 * paso de veinte personajes, contra cada mueble del piso, varias veces por
 * cuadro— y antes creaba cinco arrays por llamada y comprobaba las cuatro
 * aristas de cajas que estaban en la otra punta del plano. El descarte por
 * caja envolvente da la MISMA respuesta: si los rectángulos que envuelven al
 * segmento y a la caja no se tocan, no puede haber cruce ni punta dentro.
 */
function segmentHitsRect(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
  if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX) return false;
  if (Math.max(az, bz) < minZ || Math.min(az, bz) > maxZ) return false;
  if (ax >= minX && ax <= maxX && az >= minZ && az <= maxZ) return true;
  if (bx >= minX && bx <= maxX && bz >= minZ && bz <= maxZ) return true;
  return (
    segmentsIntersect(ax, az, bx, bz, minX, minZ, maxX, minZ) ||
    segmentsIntersect(ax, az, bx, bz, maxX, minZ, maxX, maxZ) ||
    segmentsIntersect(ax, az, bx, bz, maxX, maxZ, minX, maxZ) ||
    segmentsIntersect(ax, az, bx, bz, minX, maxZ, minX, minZ)
  );
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

/**
 * Distancia² mínima entre el segmento a→b y el segmento del muro `s`, para
 * los casos en que NO se cruzan (si se cruzan, la distancia es 0 y quien
 * llama ya lo ha comprobado con `segmentsIntersect`). Basta con el mínimo
 * de las cuatro distancias punta-a-segmento: sin cruce, el punto más
 * cercano entre dos segmentos siempre cae en un extremo de alguno.
 */
export function segmentDistSq(a, b, s) {
  return Math.min(
    distToSegmentSq(a.x, a.z, s.x1, s.z1, s.x2, s.z2),
    distToSegmentSq(b.x, b.z, s.x1, s.z1, s.x2, s.z2),
    distToSegmentSq(s.x1, s.z1, a.x, a.z, b.x, b.z),
    distToSegmentSq(s.x2, s.z2, a.x, a.z, b.x, b.z)
  );
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

  /**
   * ¿Cabe un CUERPO de radio `r` yendo en línea recta de `a` a `b`?
   *
   * ── Por qué no vale `lineBlocked` para esto ──────────────────────────
   * Son dos preguntas distintas y se estuvieron confundiendo:
   *   · `lineBlocked` = «¿me VE?» — mira solo colliders con `sight` y traza
   *     una línea de grosor CERO, que es exactamente lo que hace un rayo de
   *     visión.
   *   · esto = «¿PASO?» — tiene que mirar TODOS los colliders (un escritorio
   *     no tapa la vista pero sí el paso) y contar con el ANCHO del cuerpo.
   *
   * El jefe decidía si podía ir recto con la primera, así que veía «camino
   * libre» a través de una fila de escritorios, se lanzaba en línea recta y
   * se estampaba: rozaba, `resolveCircle` lo frenaba, el anti-atasco le daba
   * un empujón aleatorio… y la persecución se volvía un baile de tropezones
   * justo cuando tenía que ser una carrera limpia.
   *
   * Las cajas se INFLAN por el radio en vez de trazar tres líneas paralelas:
   * es la suma de Minkowski de la caja con el círculo (redondeando de más en
   * las esquinas, lo cual es conservador — antes rodea un pelín que raspar).
   */
  function pathBlocked(a, b, r = 0) {
    for (const box of boxes) {
      // Inflada en el sitio, sin crear un objeto por caja y por llamada.
      if (segmentHitsRect(a.x, a.z, b.x, b.z, box.minX - r, box.maxX + r, box.minZ - r, box.maxZ + r)) {
        return true;
      }
    }
    const loX = Math.min(a.x, b.x);
    const hiX = Math.max(a.x, b.x);
    const loZ = Math.min(a.z, b.z);
    const hiZ = Math.max(a.z, b.z);
    for (const s of segments) {
      const holgura = r + (s.thickness ?? 0) / 2;
      // Descarte barato: si las cajas envolventes de los dos segmentos están
      // separadas más que la holgura en algún eje, su distancia también.
      if (Math.min(s.x1, s.x2) - hiX > holgura || loX - Math.max(s.x1, s.x2) > holgura) continue;
      if (Math.min(s.z1, s.z2) - hiZ > holgura || loZ - Math.max(s.z1, s.z2) > holgura) continue;
      // Dos segmentos con grosor chocan si sus ejes se acercan menos que la
      // suma de sus radios; el caso de cruce lo cubre segmentsIntersect.
      if (segmentsIntersect(a.x, a.z, b.x, b.z, s.x1, s.z1, s.x2, s.z2)) return true;
      if (segmentDistSq(a, b, s) <= holgura * holgura) return true;
    }
    return false;
  }

  return { addBox, addSegment, resolveCircle, lineBlocked, pathBlocked, boxes, segments };
}
