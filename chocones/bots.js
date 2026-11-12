/**
 * LOS BOTS DE LOS CHOCONES. Rellenan la pista cuando faltan humanos, y siguen
 * con el carro de quien se desconecta a mitad de partida.
 *
 * Saben lo mismo que ve cualquiera en la pista (posiciones, velocidades,
 * radio), y juegan con tres ideas:
 * 1. NO CAERSE: cerca del filo, lo primero es volver hacia el centro.
 * 2. EMPUJAR HACIA FUERA: eligen al rival que más cerca está de su filo y le
 *    entran DESDE DENTRO, apuntando a un punto un poco por detrás de él
 *    según se mira desde el centro — así el golpe lo saca de la pista.
 * 3. TURBO cuando están alineados y cerca, y la moneda si pilla de paso.
 *
 * Cada bot tiene su carácter (`agresivo`, `tiempo de reacción`) para que no
 * jueguen los ocho igual, y un poco de ruido para que no sean perfectos.
 * Puro: sin DOM ni reloj. Solo usa la API pública de la partida.
 */

export function crearBot(partida, id, rng) {
  const agresivo = 0.55 + rng() * 0.45;
  const reaccion = 0.08 + rng() * 0.18;
  let espera = 0;
  let decision = { mx: 0, mz: 0, turbo: false };
  let objetivoId = null;
  let cambioObjetivo = 0;

  function pensarAhora() {
    const yo = partida.porId(id);
    if (!yo || !yo.vivo) return { mx: 0, mz: 0, turbo: false };
    const R = partida.radio;
    const dc = Math.hypot(yo.x, yo.z);
    const rivales = partida.jugadores.filter((j) => j.vivo && j.id !== id);

    // 1 · el filo manda
    const margen = R - dc;
    if (margen < 2.2) {
      const fuerza = 1;
      return { mx: (-yo.x / (dc || 1)) * fuerza, mz: (-yo.z / (dc || 1)) * fuerza, turbo: margen < 1 && yo.turboEspera <= 0 && Math.cos(yo.ang - Math.atan2(-yo.x, -yo.z)) > 0.8 };
    }

    // 2 · elegir víctima (y no cambiarla cada cuadro)
    cambioObjetivo -= reaccion;
    let obj = rivales.find((r) => r.id === objetivoId);
    if (!obj || cambioObjetivo <= 0) {
      let mejor = null, nota = -Infinity;
      for (const r of rivales) {
        const d = Math.hypot(r.x - yo.x, r.z - yo.z);
        const filo = Math.hypot(r.x, r.z) / R; // 1 = en el borde
        const n = filo * 6 * agresivo - d * 0.35 + rng() * 0.8;
        if (n > nota) { nota = n; mejor = r; }
      }
      obj = mejor;
      objetivoId = obj?.id ?? null;
      cambioObjetivo = 1.5 + rng() * 1.5;
    }

    let tx = 0, tz = 0;
    if (obj) {
      const od = Math.hypot(obj.x, obj.z) || 1;
      // un punto POR DENTRO del rival: se le entra desde el centro hacia fuera
      const ax = obj.x - (obj.x / od) * 0.9;
      const az = obj.z - (obj.z / od) * 0.9;
      const dIn = Math.hypot(ax - yo.x, az - yo.z);
      // si ya estoy por dentro, a por él; si no, primero colocarme
      const yoMasDentro = dc < od - 0.4;
      tx = (yoMasDentro ? obj.x : ax) - yo.x;
      tz = (yoMasDentro ? obj.z : az) - yo.z;
      if (dIn < 0.5) { tx = obj.x - yo.x; tz = obj.z - yo.z; }
    }

    // 3 · la moneda, si está más cerca que la víctima
    let mejorMoneda = null, dm = Infinity;
    for (const m of partida.monedasEnPista?.() ?? []) {
      const d = Math.hypot(m.x - yo.x, m.z - yo.z);
      if (d < dm) { dm = d; mejorMoneda = m; }
    }
    const dObj = Math.hypot(tx, tz);
    if (mejorMoneda && (dm < dObj * 0.5 || !obj)) { tx = mejorMoneda.x - yo.x; tz = mejorMoneda.z - yo.z; }

    // el centro tira un poco siempre: estar en medio es estar a salvo
    tx += -yo.x * 0.06;
    tz += -yo.z * 0.06;
    const m = Math.hypot(tx, tz) || 1;
    let mx = tx / m, mz = tz / m;
    // ruido: no son perfectos
    mx += (rng() - 0.5) * 0.25;
    mz += (rng() - 0.5) * 0.25;

    let turbo = false;
    if (obj && yo.turboEspera <= 0) {
      const d = Math.hypot(obj.x - yo.x, obj.z - yo.z);
      const alineado = Math.cos(yo.ang - Math.atan2(obj.x - yo.x, obj.z - yo.z));
      turbo = d < 4.5 && alineado > 0.9 && dc < Math.hypot(obj.x, obj.z) && rng() < agresivo;
    }
    return { mx, mz, turbo };
  }

  return {
    id,
    pensar(dt) {
      espera -= dt;
      if (espera <= 0) {
        espera = reaccion;
        decision = pensarAhora();
      }
      partida.entrada(id, decision);
      // el turbo es de flanco: una vez pedido, se suelta en el siguiente paso
      if (decision.turbo) decision = { ...decision, turbo: false };
    },
  };
}
