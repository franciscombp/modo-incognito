/**
 * EL PLANO DEL SPIN-OFF sale del MISMO `scenes/piso7.json` que el juego.
 *
 * No hay un segundo plano que mantener: si alguien mueve la cafetería en el
 * builder de mapas, aquí también se mueve. Del JSON se leen tres cosas:
 *   - `footprint`, el polígono de la planta — lo que se puede pisar;
 *   - `areas` de tipo `core`/`elevator`, los bloques macizos — lo que no;
 *   - `activities`, las estaciones — aquí son las TAREAS.
 *
 * Es 2D y sin paredes de sala a propósito: es una prueba de concepto de la
 * RED y de los BOTS, no del decorado. Las salas se dibujan, pero se cruzan.
 *
 * Todo esto es puro (sin DOM): lo usa el navegador y lo usa
 * `tools/check-impostor.mjs` desde node.
 */
export const CELDA = 0.5;
const RADIO = 0.3; // margen del cuerpo contra los bordes

function dentroPoligono(x, z, poly) {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function crearMapa(escena) {
  const poly = escena.footprint;
  const bloques = escena.areas.filter((a) => a.kind === "core" || a.kind === "elevator");
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const cols = Math.ceil((maxX - minX) / CELDA) + 1;
  const filas = Math.ceil((maxZ - minZ) / CELDA) + 1;

  const libre = (x, z) => {
    for (const [dx, dz] of [[0, 0], [RADIO, 0], [-RADIO, 0], [0, RADIO], [0, -RADIO]]) {
      if (!dentroPoligono(x + dx, z + dz, poly)) return false;
    }
    for (const b of bloques) {
      if (Math.abs(x - b.x) < b.w / 2 + RADIO && Math.abs(z - b.z) < b.d / 2 + RADIO) return false;
    }
    return true;
  };

  const rejilla = new Uint8Array(cols * filas);
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < cols; c++) {
      rejilla[f * cols + c] = libre(minX + c * CELDA, minZ + f * CELDA) ? 1 : 0;
    }
  }
  const celda = (x, z) => [Math.round((x - minX) / CELDA), Math.round((z - minZ) / CELDA)];
  const pisable = (x, z) => {
    const [c, f] = celda(x, z);
    return c >= 0 && f >= 0 && c < cols && f < filas && rejilla[f * cols + c] === 1;
  };

  /** El punto pisable más cercano (una estación pegada a una pared, p. ej.). */
  const pegar = (x, z) => {
    if (pisable(x, z)) return { x, z };
    for (let r = 1; r < 20; r++) {
      let mejor = null;
      for (let dc = -r; dc <= r; dc++) {
        for (let df = -r; df <= r; df++) {
          const px = x + dc * CELDA, pz = z + df * CELDA;
          if (!pisable(px, pz)) continue;
          const d = dc * dc + df * df;
          if (!mejor || d < mejor.d) mejor = { x: px, z: pz, d };
        }
      }
      if (mejor) return { x: mejor.x, z: mejor.z };
    }
    return { x, z };
  };

  /** A* sobre la rejilla, 8 vecinos. Devuelve puntos de mundo, o null. */
  const ruta = (ax, az, bx, bz) => {
    const a = pegar(ax, az), b = pegar(bx, bz);
    const [c0, f0] = celda(a.x, a.z);
    const [c1, f1] = celda(b.x, b.z);
    const ini = f0 * cols + c0, fin = f1 * cols + c1;
    const g = new Float32Array(cols * filas).fill(Infinity);
    const de = new Int32Array(cols * filas).fill(-1);
    const cerrado = new Uint8Array(cols * filas);
    const abiertos = [ini];
    const h = (i) => Math.hypot((i % cols) - c1, Math.floor(i / cols) - f1);
    const fpunt = new Map([[ini, h(ini)]]);
    g[ini] = 0;
    while (abiertos.length) {
      let k = 0;
      for (let i = 1; i < abiertos.length; i++) if (fpunt.get(abiertos[i]) < fpunt.get(abiertos[k])) k = i;
      const act = abiertos[k];
      abiertos[k] = abiertos[abiertos.length - 1];
      abiertos.pop();
      if (act === fin) break;
      if (cerrado[act]) continue;
      cerrado[act] = 1;
      const c = act % cols, f = Math.floor(act / cols);
      for (let dc = -1; dc <= 1; dc++) {
        for (let df = -1; df <= 1; df++) {
          if (!dc && !df) continue;
          const nc = c + dc, nf = f + df;
          if (nc < 0 || nf < 0 || nc >= cols || nf >= filas) continue;
          const n = nf * cols + nc;
          if (!rejilla[n] || cerrado[n]) continue;
          // sin cortar esquinas: en diagonal tienen que estar libres los dos lados
          if (dc && df && (!rejilla[f * cols + nc] || !rejilla[nf * cols + c])) continue;
          const ng = g[act] + (dc && df ? Math.SQRT2 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            de[n] = act;
            fpunt.set(n, ng + h(n));
            abiertos.push(n);
          }
        }
      }
    }
    if (de[fin] === -1 && fin !== ini) return null;
    const camino = [];
    for (let i = fin; i !== -1; i = de[i]) {
      camino.push({ x: minX + (i % cols) * CELDA, z: minZ + Math.floor(i / cols) * CELDA });
      if (i === ini) break;
    }
    camino.reverse();
    camino.push(b);
    return suavizar(camino);
  };

  // Tirar de la cuerda: el A* de rejilla va en escalera.
  const recta = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELDA / 2));
    for (let i = 1; i < n; i++) {
      if (!pisable(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n)) return false;
    }
    return true;
  };
  const suavizar = (pts) => {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !recta(pts[i], pts[j])) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  };

  // Las estaciones del juego grande, y una más por cada zona de puestos con
  // nombre: «fingir en X». Con solo las ocho estaciones la Célula terminaba
  // en medio minuto y el soplón no llegaba a estrenarse.
  const tareas = escena.activities.map((a) => ({ id: a.id, label: a.label, icon: a.icon, ...pegar(a.x, a.z) }));
  const vistas = new Set();
  for (const a of escena.areas) {
    if (a.kind !== "open-office" || !a.name || vistas.has(a.name)) continue;
    vistas.add(a.name);
    tareas.push({ id: `fingir_${a.id}_${tareas.length}`, label: `Fingir en ${a.name}`, icon: "work", ...pegar(a.x, a.z) });
  }
  const cafeteria = escena.areas.find((a) => a.id === "cafeteria") ?? { x: 0, z: 0 };
  const salida = pegar(cafeteria.x, cafeteria.z);
  // LA CAMPANA de la junta de emergencia: el centro de la cafetería, que
  // es donde de verdad se juntan todos a quejarse.
  const campana = salida;

  const zonaDe = (x, z) => {
    for (const a of escena.areas) {
      if (a.kind === "core" || !a.name) continue;
      if (Math.abs(x - a.x) <= a.w / 2 && Math.abs(z - a.z) <= a.d / 2) return a.name;
    }
    return "el pasillo";
  };

  return {
    poly, bloques, areas: escena.areas, minX, maxX, minZ, maxZ,
    pisable, pegar, ruta, tareas, salida, campana, zonaDe, recta,
  };
}
