/**
 * LOS CHOCONES · la partida, pura y autoritativa.
 *
 * El «team building obligatorio» de Gabo: carritos chocones en una pista
 * redonda, al estilo de los minijuegos de Mario Party. Te echan de la pista
 * a golpes; el último que queda dentro se lleva la ESTRELLA de la ronda.
 * Gana la partida quien llega antes a `ESTRELLAS_PARA_GANAR`, y si se acaban
 * las rondas, quien tenga más estrellas (y, a igualdad, más monedas).
 *
 * Igual que `impostor/sim.js`: sin DOM, sin reloj propio y sin `Math.random`
 * suelto. El anfitrión llama a `paso(dt)` a ritmo fijo, los invitados mandan
 * su ENTRADA y reciben `vistaPara(id)`. Por eso `check:chocones` juega
 * partidas enteras de bots en node, sin navegador.
 *
 * Unidades: metros de pista. El 3D (escena3d.js) pinta lo mismo, sin escalar.
 */

export const RADIO_INICIAL = 11;
export const RADIO_MINIMO = 4.2;
export const RADIO_CARRO = 0.95;
export const MAX_JUGADORES = 8;
export const ESTRELLAS_PARA_GANAR = 3;
export const RONDAS_MAX = 5;

const T_INTRO = 3.2; // «3, 2, 1, ¡YA!»: los carros no se mueven
const T_ENCOGE = 12; // a partir de aquí la pista se encoge
const T_MINIMO = 36; // y llega a su radio mínimo aquí
const T_LIMITE = 48; // tiempo máximo de ronda
const T_FIN_RONDA = 3.2; // cartel del ganador de la ronda
const T_CAIDA = 1.6; // lo que dura la caída antes de desaparecer

const ACELERACION = 15; // m/s² con el mando a tope
const ROZAMIENTO = 1.7; // tope ≈ ACELERACION / ROZAMIENTO ≈ 8,8 m/s
const GIRO = 7; // rad/s con que el morro sigue al mando
const REBOTE = 1.15; // > 1: el chocón devuelve más de lo que recibe, es el chiste
const TURBO_EMPUJE = 10; // m/s de golpe hacia donde mira el morro
const TURBO_DURA = 0.45; // mientras dura, pesa más
const TURBO_MASA = 1.8;
const TURBO_ESPERA = 2.6;
const MEMORIA_GOLPE = 3; // segundos que un golpe cuenta como «te echó X»

const MONEDA_CADA = 2.6;
const MONEDAS_MAX = 4;
const RADIO_MONEDA = 0.55;
const MONEDAS_POR_KO = 2;

export const COLORES = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#f97316"];

/** Un generador pequeño y repetible (mulberry32): la misma semilla, la misma partida. */
export function rngDe(semilla) {
  let a = semilla >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDif = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * @param {object} o
 * @param {Array<{id,nombre,cara,bot?}>} o.jugadores  2 a 8
 * @param {number} [o.semilla]
 * @param {number} [o.estrellasParaGanar]
 * @param {number} [o.rondasMax]
 */
export function crearPartida({ jugadores, semilla = 1, estrellasParaGanar = ESTRELLAS_PARA_GANAR, rondasMax = RONDAS_MAX }) {
  if (jugadores.length < 2) throw new Error("Hacen falta al menos 2 carros.");
  const rng = rngDe(semilla);
  const js = jugadores.slice(0, MAX_JUGADORES).map((j, i) => ({
    id: j.id,
    nombre: j.nombre,
    cara: j.cara,
    bot: !!j.bot,
    color: COLORES[i % COLORES.length],
    estrellas: 0,
    monedas: 0,
    // estado del carro (se rearma cada ronda)
    x: 0, z: 0, vx: 0, vz: 0, ang: 0,
    vivo: true, cayendo: 0, fuera: false,
    turbo: 0, turboEspera: 0,
    golpe: null, // { id, t } último que te dio
    entrada: { mx: 0, mz: 0, turbo: false },
    turboPrevio: false,
    eliminadoEn: 0,
  }));
  const porId = new Map(js.map((j) => [j.id, j]));

  const s = {
    fase: "intro", // intro | ronda | finRonda | podio
    t: 0, // tiempo dentro de la fase
    tRonda: 0, // tiempo jugado de la ronda
    ronda: 1,
    radio: RADIO_INICIAL,
    monedas: [],
    siguienteMoneda: MONEDA_CADA,
    nMoneda: 0,
    eventos: [], // { n, tipo, texto, id? }
    nEvento: 0,
    ganadorRonda: null,
    podio: null,
    reloj: 0, // tiempo total, para los eventos
  };

  function evento(tipo, texto, extra = {}) {
    s.eventos.push({ n: ++s.nEvento, tipo, texto, t: s.reloj, ...extra });
    if (s.eventos.length > 30) s.eventos.shift();
  }

  function colocar() {
    // En corro, mirando al centro: nadie empieza con ventaja.
    const n = js.length;
    const r = RADIO_INICIAL * 0.62;
    const giro = rng() * Math.PI * 2;
    js.forEach((j, i) => {
      const a = giro + (i / n) * Math.PI * 2;
      j.x = Math.cos(a) * r;
      j.z = Math.sin(a) * r;
      j.vx = j.vz = 0;
      j.ang = Math.atan2(-j.x, -j.z);
      j.vivo = true;
      j.cayendo = 0;
      j.fuera = false;
      j.turbo = 0;
      j.turboEspera = 0;
      j.golpe = null;
      j.eliminadoEn = 0;
      j.turboPrevio = false;
    });
    s.radio = RADIO_INICIAL;
    s.monedas = [];
    s.siguienteMoneda = MONEDA_CADA;
    s.tRonda = 0;
    s.ganadorRonda = null;
  }

  function vivos() {
    return js.filter((j) => j.vivo);
  }

  function radioEn(t) {
    if (t <= T_ENCOGE) return RADIO_INICIAL;
    const f = clamp((t - T_ENCOGE) / (T_MINIMO - T_ENCOGE), 0, 1);
    return RADIO_INICIAL + (RADIO_MINIMO - RADIO_INICIAL) * f;
  }

  function mover(dt) {
    for (const j of js) {
      if (!j.vivo) {
        // cayendo sigue su inercia; ya FUERA se queda quieto (si no, el
        // carro eliminado se desliza para siempre y viaja en cada vista)
        if (j.cayendo > 0 && !j.fuera) {
          j.cayendo += dt;
          // sigue la inercia mientras cae: sale volando por donde lo echaron
          j.x += j.vx * dt;
          j.z += j.vz * dt;
          if (j.cayendo > T_CAIDA) j.fuera = true;
        }
        continue;
      }
      const e = j.entrada;
      let mx = Number(e.mx) || 0, mz = Number(e.mz) || 0;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      // el morro sigue al mando (si hay mando)
      if (m > 0.15) j.ang += clamp(angDif(j.ang, Math.atan2(mx, mz)), -GIRO * dt, GIRO * dt);
      j.vx += mx * ACELERACION * dt;
      j.vz += mz * ACELERACION * dt;
      // turbo: en el FLANCO de pulsar, no mientras se mantiene
      const pide = !!e.turbo;
      if (pide && !j.turboPrevio && j.turboEspera <= 0) {
        j.vx += Math.sin(j.ang) * TURBO_EMPUJE;
        j.vz += Math.cos(j.ang) * TURBO_EMPUJE;
        j.turbo = TURBO_DURA;
        j.turboEspera = TURBO_ESPERA;
        evento("turbo", "", { id: j.id });
      }
      j.turboPrevio = pide;
      j.turbo = Math.max(0, j.turbo - dt);
      j.turboEspera = Math.max(0, j.turboEspera - dt);
      const roce = Math.exp(-ROZAMIENTO * dt);
      j.vx *= roce;
      j.vz *= roce;
      j.x += j.vx * dt;
      j.z += j.vz * dt;
    }
  }

  function chocar() {
    const al = vivos();
    for (let i = 0; i < al.length; i++) {
      for (let k = i + 1; k < al.length; k++) {
        const a = al[i], b = al[k];
        let nx = b.x - a.x, nz = b.z - a.z;
        const d = Math.hypot(nx, nz);
        const min = RADIO_CARRO * 2;
        if (d >= min) continue;
        if (d < 1e-6) { nx = 1; nz = 0; } else { nx /= d; nz /= d; }
        const ma = a.turbo > 0 ? TURBO_MASA : 1;
        const mb = b.turbo > 0 ? TURBO_MASA : 1;
        // separar sin solaparse
        const sol = min - Math.max(d, 1e-6);
        a.x -= nx * sol * (mb / (ma + mb));
        a.z -= nz * sol * (mb / (ma + mb));
        b.x += nx * sol * (ma / (ma + mb));
        b.z += nz * sol * (ma / (ma + mb));
        // impulso a lo largo de la normal
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel >= 0) continue; // ya se alejan
        const imp = (-(1 + REBOTE) * rel) / (1 / ma + 1 / mb);
        a.vx -= (imp / ma) * nx;
        a.vz -= (imp / ma) * nz;
        b.vx += (imp / mb) * nx;
        b.vz += (imp / mb) * nz;
        a.golpe = { id: b.id, t: s.reloj };
        b.golpe = { id: a.id, t: s.reloj };
        if (-rel > 6) evento("choque", "", { a: a.id, b: b.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, fuerza: -rel });
      }
    }
  }

  function bordes() {
    for (const j of vivos()) {
      if (Math.hypot(j.x, j.z) <= s.radio) continue;
      j.vivo = false;
      j.cayendo = 1e-3;
      j.eliminadoEn = s.tRonda;
      const g = j.golpe && s.reloj - j.golpe.t <= MEMORIA_GOLPE ? porId.get(j.golpe.id) : null;
      if (g && g.vivo) {
        g.monedas += MONEDAS_POR_KO;
        evento("ko", `${g.nombre} echó a ${j.nombre}`, { id: j.id, por: g.id });
      } else {
        evento("ko", `${j.nombre} se cayó solo`, { id: j.id });
      }
    }
  }

  function monedas(dt) {
    s.siguienteMoneda -= dt;
    if (s.siguienteMoneda <= 0 && s.monedas.length < MONEDAS_MAX) {
      s.siguienteMoneda = MONEDA_CADA;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * s.radio * 0.7;
      s.monedas.push({ id: ++s.nMoneda, x: Math.cos(a) * r, z: Math.sin(a) * r });
    }
    // las que se quedan fuera al encoger, se caen
    s.monedas = s.monedas.filter((m) => Math.hypot(m.x, m.z) < s.radio - 0.3);
    for (const j of vivos()) {
      for (let i = s.monedas.length - 1; i >= 0; i--) {
        const m = s.monedas[i];
        if (Math.hypot(m.x - j.x, m.z - j.z) > RADIO_CARRO + RADIO_MONEDA) continue;
        s.monedas.splice(i, 1);
        j.monedas += 1;
        evento("moneda", "", { id: j.id });
      }
    }
  }

  function cerrarRonda() {
    const al = vivos();
    let g = null;
    if (al.length === 1) g = al[0];
    else if (al.length > 1) {
      // se acabó el tiempo: gana quien está más al centro
      g = al.reduce((m, j) => (Math.hypot(j.x, j.z) < Math.hypot(m.x, m.z) ? j : m));
    } else {
      // se cayeron todos a la vez: el último en caer
      g = js.reduce((m, j) => (j.eliminadoEn > m.eliminadoEn ? j : m));
    }
    g.estrellas += 1;
    s.ganadorRonda = g.id;
    evento("estrella", `¡${g.nombre} se lleva la estrella!`, { id: g.id });
    s.fase = "finRonda";
    s.t = 0;
  }

  function ranking() {
    return [...js].sort((a, b) => b.estrellas - a.estrellas || b.monedas - a.monedas || a.nombre.localeCompare(b.nombre));
  }

  function siguiente() {
    const lider = ranking()[0];
    if (lider.estrellas >= estrellasParaGanar || s.ronda >= rondasMax) {
      s.fase = "podio";
      s.t = 0;
      s.podio = ranking().map((j) => j.id);
      evento("podio", `¡${lider.nombre} gana el team building!`, { id: lider.id });
      return;
    }
    s.ronda += 1;
    colocar();
    s.fase = "intro";
    s.t = 0;
  }

  colocar();

  return {
    get fase() { return s.fase; },
    get ronda() { return s.ronda; },
    get radio() { return s.radio; },
    get terminada() { return s.fase === "podio"; },
    jugadores: js,
    porId: (id) => porId.get(id) ?? null,
    ranking,
    monedasEnPista: () => s.monedas,

    /** La entrada de un jugador: `{ mx, mz }` en ejes del suelo (−1..1) y `turbo`. */
    entrada(id, e) {
      const j = porId.get(id);
      if (!j || !e) return;
      j.entrada = { mx: clamp(Number(e.mx) || 0, -1, 1), mz: clamp(Number(e.mz) || 0, -1, 1), turbo: !!e.turbo };
    },

    paso(dt) {
      s.reloj += dt;
      s.t += dt;
      if (s.fase === "intro") {
        if (s.t >= T_INTRO) { s.fase = "ronda"; s.t = 0; evento("ya", "¡YA!"); }
        return;
      }
      if (s.fase === "finRonda") {
        // los que caían terminan de caer
        for (const j of js) if (j.cayendo > 0 && !j.fuera) { j.cayendo += dt; if (j.cayendo > T_CAIDA) j.fuera = true; }
        if (s.t >= T_FIN_RONDA) siguiente();
        return;
      }
      if (s.fase === "podio") return;
      s.tRonda += dt;
      s.radio = radioEn(s.tRonda);
      mover(dt);
      chocar();
      bordes();
      monedas(dt);
      if (vivos().length <= 1 || s.tRonda >= T_LIMITE) cerrarRonda();
    },

    vistaPara(id) {
      const yo = porId.get(id);
      return {
        fase: s.fase,
        reloj: +s.reloj.toFixed(3), // para ordenar vistas que llegan por la red
        t: s.t,
        tRonda: s.tRonda,
        tLimite: T_LIMITE,
        tIntro: T_INTRO,
        ronda: s.ronda,
        rondasMax,
        estrellasParaGanar,
        radio: s.radio,
        radioInicial: RADIO_INICIAL,
        ganadorRonda: s.ganadorRonda,
        podio: s.podio,
        monedas: s.monedas.map((m) => ({ id: m.id, x: +m.x.toFixed(2), z: +m.z.toFixed(2) })),
        eventos: s.eventos.slice(-12),
        jugadores: js.map((j) => ({
          id: j.id,
          nombre: j.nombre,
          cara: j.cara,
          bot: j.bot,
          color: j.color,
          x: +j.x.toFixed(3),
          z: +j.z.toFixed(3),
          ang: +j.ang.toFixed(3),
          v: +Math.hypot(j.vx, j.vz).toFixed(2),
          vivo: j.vivo,
          cayendo: +j.cayendo.toFixed(2),
          fuera: j.fuera,
          turbo: j.turbo > 0,
          estrellas: j.estrellas,
          monedas: j.monedas,
        })),
        yo: yo ? { id: yo.id, vivo: yo.vivo, turboListo: yo.turboEspera <= 0, turboEspera: +yo.turboEspera.toFixed(2), turboTotal: TURBO_ESPERA } : null,
      };
    },
  };
}
