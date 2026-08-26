import { footprint } from "./floorplan.js";
import { WORLD_SCALE as S } from "./config.js";
import { segmentIntersectsBox, segmentsIntersect, segmentDistSq } from "./collision.js";

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

/**
 * @param {Array} opts.excluir  Rectángulos {x,z,w,d} (en unidades de mundo)
 *   que NO se pueden pisar, aunque físicamente quepa un cuerpo. Es lo que
 *   deja a los vigilantes fuera de las salas: un tabique no puede hacerlo
 *   —la puerta tiene que seguir abierta para ti— y una regla suelta en el
 *   motor tampoco, porque el A* seguiría trazando la ruta POR DENTRO y el
 *   jefe se pasaría el día empujando la pared de una sala.
 */
/** ¿Cae el punto dentro del rectángulo? Compartido con `boss.js`. */
export function enRect(x, z, r) {
  return (
    x >= r.x - r.w / 2 && x <= r.x + r.w / 2 && z >= r.z - r.d / 2 && z <= r.z + r.d / 2
  );
}

export function buildNavmesh(world, { radius = 0.4 * S, excluir = [] } = {}) {
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
      if (excluir.some((e) => enRect(x, z, e))) continue;
      // A cell is walkable if a body of `radius` placed there is not pushed
      // out by any collider — exactly the test the player will experience.
      probe.x = x;
      probe.z = z;
      world.resolveCircle(probe, radius);
      if (Math.hypot(probe.x - x, probe.z - z) < 0.01 * S) walkable[idx(c, r)] = 1;
    }
  }

  // ── LAS ARISTAS TAMBIÉN SE COMPRUEBAN, y este era EL agujero del mapa ──
  //
  // Una celda transitable dice que un cuerpo cabe EN SU CENTRO. Pero el A*
  // conectaba centros vecinos sin preguntar por el TRAMO entre ellos, y un
  // objeto más chico que la celda cabe entero en medio: la maceta mide
  // 0,6·S, los centros están a 0,5·S — los dos centros quedan limpios y la
  // maceta en el pasillo entre ambos. La ruta salía «legal», el personaje
  // caminaba su plan perfecto… directo contra el objeto, y de ahí todo lo
  // demás: el forcejeo, el paso lateral, el vaivén. El anti-atasco estaba
  // curando lo que el mapa causaba.
  //
  // Se precomputa UNA VEZ al hornear: para cada celda, una máscara de qué
  // vecinas se alcanzan DE VERDAD con el ancho del cuerpo — la misma
  // geometría que `world.pathBlocked`, solo que contra una LISTA CORTA.
  //
  // OJO: la primera versión preguntaba `pathBlocked` a pelo: ~134k tramos
  // (dos planos) × TODOS los colliders del piso, y el arranque de la página
  // se fue a segundos enteros — en un teléfono, a muchos. Un tramo mide
  // media celda: preguntarle por el mueble de la otra punta del piso es
  // trabajo tirado. Se indexa primero QUÉ colliders viven cerca de cada
  // celda (una pasada por collider, barata) y cada arista consulta solo a
  // sus vecinos: de millones de pruebas a unas pocas por arista.
  const pass = new Uint8Array(cols * rows);
  const NEIGHBOURS = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];
  {
    // El margen de registro: una arista sale del centro de la celda y llega
    // como mucho a CELL·√2; un collider puede estorbarla desde `radius` (más
    // su grosor). Todo lo que quede más lejos no puede tocar esa arista.
    const margen = CELL * Math.SQRT2 + radius;
    const cerca = new Array(cols * rows);
    const registra = (minX_, maxX_, minZ_, maxZ_, item) => {
      const c0 = Math.max(0, Math.floor((minX_ - margen - minX) / CELL));
      const c1 = Math.min(cols - 1, Math.ceil((maxX_ + margen - minX) / CELL));
      const r0 = Math.max(0, Math.floor((minZ_ - margen - minZ) / CELL));
      const r1 = Math.min(rows - 1, Math.ceil((maxZ_ + margen - minZ) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          (cerca[idx(c, r)] ??= []).push(item);
        }
      }
    };
    for (const b of world.boxes) registra(b.minX, b.maxX, b.minZ, b.maxZ, { caja: b });
    for (const s of world.segments) {
      registra(
        Math.min(s.x1, s.x2),
        Math.max(s.x1, s.x2),
        Math.min(s.z1, s.z2),
        Math.max(s.z1, s.z2),
        { seg: s }
      );
    }

    // La misma pregunta que `pathBlocked`, contra los candidatos de la celda.
    const inflada = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const tramoLibre = (a, b, candidatos) => {
      if (!candidatos) return true;
      for (const cand of candidatos) {
        if (cand.caja) {
          const caja = cand.caja;
          inflada.minX = caja.minX - radius;
          inflada.maxX = caja.maxX + radius;
          inflada.minZ = caja.minZ - radius;
          inflada.maxZ = caja.maxZ + radius;
          if (segmentIntersectsBox(a, b, inflada)) return false;
        } else {
          const s = cand.seg;
          if (segmentsIntersect(a.x, a.z, b.x, b.z, s.x1, s.z1, s.x2, s.z2)) return false;
          const holgura = radius + (s.thickness ?? 0) / 2;
          if (segmentDistSq(a, b, s) <= holgura * holgura) return false;
        }
      }
      return true;
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = idx(c, r);
        if (!walkable[i]) continue;
        const a = toWorld(c, r);
        const candidatos = cerca[i];
        let mask = 0;
        for (let k = 0; k < NEIGHBOURS.length; k++) {
          const nc = c + NEIGHBOURS[k][0];
          const nr = r + NEIGHBOURS[k][1];
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          if (!walkable[idx(nc, nr)]) continue;
          if (tramoLibre(a, toWorld(nc, nr), candidatos)) mask |= 1 << k;
        }
        pass[i] = mask;
      }
    }
  }

  function nearestWalkable(x, z) {
    // Se prefiere una celda CONECTADA (alguna arista limpia): una transitable
    // sin salidas es un bolsillo entre objetos, y arrimar ahí un destino es
    // arrimarlo a una trampa. Solo si no hay ninguna conectada cerca se
    // acepta la que sea — mejor un plan corto que ninguno.
    const { c, r } = toCell(x, z);
    let sueltas = null;
    const considera = (nc, nr) => {
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return null;
      const i = idx(nc, nr);
      if (!walkable[i]) return null;
      if (pass[i]) return { c: nc, r: nr };
      sueltas ??= { c: nc, r: nr };
      return null;
    };
    const propia = considera(c, r);
    if (propia) return propia;
    for (let ring = 1; ring < 14; ring++) {
      for (let dc = -ring; dc <= ring; dc++) {
        for (let dr = -ring; dr <= ring; dr++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const hit = considera(c + dc, r + dr);
          if (hit) return hit;
        }
      }
    }
    return sueltas;
  }

  /** A* over the grid. Returns world-space waypoints, or null if unreachable. */
  // Reutilizados entre llamadas: con hasta 4 perseguidores repreguntando
  // varias veces por segundo, asignar un Float32Array + Int32Array del
  // tamaño de toda la rejilla en cada `path()` era el grueso de la basura
  // que el recolector tenía que barrer — un `.fill()` sobre el mismo buffer
  // es prácticamente gratis en comparación.
  const g = new Float32Array(cols * rows);
  const cameFrom = new Int32Array(cols * rows);

  function path(from, to) {
    const start = nearestWalkable(from.x, from.z);
    const goal = nearestWalkable(to.x, to.z);
    if (!start || !goal) return null;

    const startI = idx(start.c, start.r);
    const goalI = idx(goal.c, goal.r);
    if (startI === goalI) return [{ x: to.x, z: to.z }];

    g.fill(Infinity);
    cameFrom.fill(-1);
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
      // LA TRAMPILLA DE ESCAPE, y solo para quien está EMBOLSADO de verdad:
      // una casilla de salida sin NINGUNA arista limpia (un cuerpo empujado
      // hasta quedar rodeado) puede salir por donde sea — negárselo lo
      // dejaría sin ruta ninguna, y la colisión en vivo negocia ese primer
      // paso como siempre. Pero SOLO entonces: la primera versión daba la
      // trampilla a toda casilla de salida, y el A* la usaba para arrancar
      // por una arista sucia TENIENDO limpias al lado — cuatro de cada cien
      // rutas nacían pisando un objeto, que es justo lo que este mapa
      // existe para impedir.
      const canPass = current === startI && pass[current] === 0 ? 0xff : pass[current];
      for (let k = 0; k < NEIGHBOURS.length; k++) {
        // La máscara de aristas manda: si el tramo hasta esa vecina no lo
        // cruza un cuerpo (un objeto menor que la celda en medio), aquí no
        // hay conexión aunque las dos celdas sean transitables.
        if (!(canPass & (1 << k))) continue;
        const [dc, dr] = NEIGHBOURS[k];
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

  /**
   * Nearest point a body can actually stand on. Hand-authored JSON puts the
   * odd waypoint inside a table or a wall, and a patrol target you can never
   * reach is indistinguishable from a boss who has stopped caring — so every
   * route is snapped through here at load.
   */
  function snap(x, z) {
    const cell = nearestWalkable(x, z);
    if (!cell) return { x, z };
    const { x: wx, z: wz } = toWorld(cell.c, cell.r);
    return { x: wx, z: wz };
  }

  return { path, isWalkable, reachable, snap, cols, rows, cell: CELL };
}
