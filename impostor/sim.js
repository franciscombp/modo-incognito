/**
 * LA PARTIDA, y es AUTORITATIVA: solo corre en el anfitrión.
 *
 * Los demás aparatos mandan entradas (hacia dónde andan, si usan, a quién
 * votan) y reciben una VISTA por jugador (`vistaPara`). No hay servidor: el
 * anfitrión ES el servidor, y por eso todo esto es puro — sin DOM, sin red,
 * sin reloj de pared. El tiempo lo pone quien llama a `paso(dt)`.
 *
 * Eso es lo que deja probarlo desde node (`tools/check-impostor.mjs`) con una
 * mesa entera de bots, sin abrir un navegador.
 *
 * El reparto de Among Us, traducido al Piso 10:
 *   - la CÉLULA hace sus escaqueos (las estaciones del plano son las tareas);
 *   - el SOPLÓN de Gabo los va mandando a RRHH uno a uno;
 *   - quien encuentra el GAFETE tirado convoca una JUNTA, y en la junta se
 *     vota a quién se manda a RRHH por soplón.
 */
export const REGLAS = {
  velocidad: 4.2,
  vision: 6.5,
  visionSoplon: 8.5,
  rangoMatar: 1.3,
  enfriamiento: 20,
  enfriamientoInicial: 10,
  rangoReportar: 2.2,
  rangoUsar: 1.5,
  rangoCampana: 2,
  tiempoTarea: 6,
  tareasPorJugador: 5,
  duracionJunta: 40,
  duracionExpulsion: 4.5,
};

export const COLORES = [
  "#e5484d", "#3e9bff", "#30a46c", "#f5d90a", "#f76b15", "#8e4ec6",
  "#e93d82", "#12a594", "#ffffff", "#8d8d8d", "#a18072", "#5eb1ef",
];

export function rngDe(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * @param {object} o
 * @param {ReturnType<import("./mapa.js").crearMapa>} o.mapa
 * @param {{id: string, nombre: string, bot?: boolean}[]} o.jugadores
 * @param {number} [o.semilla]
 * @param {number} [o.soplones] por defecto 1, y 2 desde siete jugadores
 */
export function crearPartida({ mapa, jugadores, semilla = Date.now(), soplones, reglas = {} }) {
  const R = { ...REGLAS, ...reglas };
  const rng = rngDe(semilla);
  const barajar = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const nSoplones = soplones ?? (jugadores.length >= 7 ? 2 : 1);
  const soplonIds = new Set(barajar(jugadores.map((j) => j.id)).slice(0, nSoplones));

  const s = {
    t: 0,
    fase: "juego",
    jugadores: jugadores.map((j, i) => ({
      id: j.id,
      nombre: j.nombre,
      bot: !!j.bot,
      cara: j.cara ?? null, // qué muñeco 3D lleva (id de characters3d.json)
      color: COLORES[i % COLORES.length],
      x: 0, z: 0, mira: 1,
      vivo: true,
      rol: soplonIds.has(j.id) ? "soplon" : "celula",
      // El soplón también lleva lista: es su coartada, y la pinta igual.
      tareas: barajar(mapa.tareas).slice(0, R.tareasPorJugador).map((t) => ({ id: t.id, prog: 0, hecha: false })),
      campanas: 1,
      matarEn: R.enfriamientoInicial,
      entrada: { mx: 0, mz: 0, usar: false },
      usando: null,
    })),
    cuerpos: [],
    muertes: [],
    junta: null,
    expulsion: null,
    fin: null,
    eventos: [],
    seq: 0,
  };

  const porId = (id) => s.jugadores.find((j) => j.id === id);
  const tareaDe = (id) => mapa.tareas.find((t) => t.id === id);
  const evento = (e) => {
    s.eventos.push({ seq: ++s.seq, t: s.t, ...e });
    if (s.eventos.length > 60) s.eventos.shift();
  };

  // Todos a la cafetería, en corro: así empieza y así vuelve tras cada junta.
  const reunir = () => {
    const n = s.jugadores.length;
    s.jugadores.forEach((j, i) => {
      const a = (i / n) * Math.PI * 2;
      const p = mapa.pegar(mapa.salida.x + Math.cos(a) * 1.6, mapa.salida.z + Math.sin(a) * 1.6);
      j.x = p.x; j.z = p.z;
      j.entrada = { mx: 0, mz: 0, usar: false };
      j.usando = null;
    });
  };
  reunir();

  const vivos = () => s.jugadores.filter((j) => j.vivo);
  const visionDe = (j) => (j.rol === "soplon" ? R.visionSoplon : R.vision);

  const progresoGlobal = () => {
    let total = 0, hechas = 0;
    for (const j of s.jugadores) {
      if (j.rol !== "celula") continue;
      for (const t of j.tareas) { total++; if (t.hecha) hechas++; }
    }
    return total ? hechas / total : 1;
  };

  const comprobarFin = () => {
    if (s.fin) return;
    const v = vivos();
    const nSop = v.filter((j) => j.rol === "soplon").length;
    const nCel = v.length - nSop;
    let gana = null, motivo = "";
    if (nSop === 0) { gana = "celula"; motivo = "No queda ningún soplón en el piso."; }
    else if (nSop >= nCel) { gana = "soplon"; motivo = "Ya son más los soplones que la Célula. Gabo lo sabe todo."; }
    else if (progresoGlobal() >= 1) { gana = "celula"; motivo = "La Célula terminó todos sus escaqueos sin que nadie la pillara."; }
    if (gana) {
      s.fase = "fin";
      s.fin = { gana, motivo };
      evento({ tipo: "fin", gana, texto: motivo });
    }
  };

  const abrirJunta = (convoca, motivo, cuerpo = null) => {
    s.fase = "junta";
    s.junta = { convoca, motivo, cuerpo, hasta: s.t + R.duracionJunta, votos: {}, chat: [], inicio: s.t };
    const c = porId(convoca);
    const quien = cuerpo ? porId(cuerpo) : null;
    const texto = motivo === "cuerpo"
      ? `${c.nombre} encontró el gafete de ${quien.nombre} en ${mapa.zonaDe(s.cuerpos.find((b) => b.id === cuerpo)?.x ?? 0, s.cuerpos.find((b) => b.id === cuerpo)?.z ?? 0)}.`
      : `${c.nombre} tocó la campana de la cafetería.`;
    evento({ tipo: "junta", texto });
    s.junta.chat.push({ de: null, texto, t: s.t });
    for (const j of s.jugadores) { j.entrada = { mx: 0, mz: 0, usar: false }; j.usando = null; }
  };

  const cerrarJunta = () => {
    const cuenta = {};
    for (const v of Object.values(s.junta.votos)) cuenta[v] = (cuenta[v] ?? 0) + 1;
    let max = 0, elegido = null, empate = false;
    for (const [k, n] of Object.entries(cuenta)) {
      if (n > max) { max = n; elegido = k; empate = false; } else if (n === max) empate = true;
    }
    if (empate || elegido === "nadie") elegido = null;
    const j = elegido ? porId(elegido) : null;
    if (j) j.vivo = false;
    s.expulsion = {
      id: j?.id ?? null,
      nombre: j?.nombre ?? null,
      eraSoplon: j ? j.rol === "soplon" : null,
      cuenta,
      hasta: s.t + R.duracionExpulsion,
    };
    const texto = j
      ? `${j.nombre} se va a RRHH. ${j.rol === "soplon" ? "ERA el soplón." : "No era el soplón."}`
      : empate ? "Empate: nadie se va a RRHH." : "Nadie se va a RRHH.";
    evento({ tipo: "expulsion", texto });
    s.cuerpos = [];
    s.junta = null;
    s.fase = "expulsion";
  };

  /* ---------------- entradas ---------------- */

  const entrada = (id, e) => {
    const j = porId(id);
    if (!j || s.fase !== "juego") return;
    let mx = +e.mx || 0, mz = +e.mz || 0;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    j.entrada = { mx, mz, usar: !!e.usar };
  };

  const accion = (id, a) => {
    const j = porId(id);
    if (!j) return false;
    if (a.tipo === "votar") {
      if (s.fase !== "junta" || !j.vivo || s.junta.votos[id]) return false;
      const obj = a.objetivo === "nadie" ? "nadie" : porId(a.objetivo)?.vivo ? a.objetivo : null;
      if (!obj) return false;
      s.junta.votos[id] = obj;
      if (vivos().every((v) => s.junta.votos[v.id])) s.junta.hasta = Math.min(s.junta.hasta, s.t + 1.5);
      return true;
    }
    if (s.fase !== "juego" || !j.vivo) return false;
    if (a.tipo === "matar") {
      if (j.rol !== "soplon" || j.matarEn > 0) return false;
      const v = objetivoMatar(j);
      if (!v) return false;
      v.vivo = false;
      v.usando = null;
      s.cuerpos.push({ id: v.id, x: v.x, z: v.z, color: v.color, cara: v.cara, mira: v.mira });
      s.muertes.push({ victima: v.id, asesino: j.id, x: v.x, z: v.z, t: s.t });
      j.matarEn = R.enfriamiento;
      evento({ tipo: "muerte", para: j.id, texto: `Mandaste a ${v.nombre} a RRHH.` });
      evento({ tipo: "muerte", para: v.id, texto: `${j.nombre} te mandó a RRHH. Ahora eres un fantasma: sigue con tus tareas.` });
      comprobarFin();
      return true;
    }
    if (a.tipo === "reportar") {
      const b = s.cuerpos.find((c) => dist(c, j) <= R.rangoReportar);
      if (!b) return false;
      abrirJunta(j.id, "cuerpo", b.id);
      return true;
    }
    if (a.tipo === "campana") {
      if (j.campanas <= 0 || dist(j, mapa.campana) > R.rangoCampana) return false;
      j.campanas--;
      abrirJunta(j.id, "campana");
      return true;
    }
    return false;
  };

  const decir = (id, texto, extra = {}) => {
    const j = porId(id);
    if (!j || !j.vivo || s.fase !== "junta") return;
    texto = String(texto).slice(0, 160).trim();
    if (!texto) return;
    s.junta.chat.push({ de: id, texto, t: s.t, ...extra });
    if (s.junta.chat.length > 80) s.junta.chat.shift();
  };

  const objetivoMatar = (j) => {
    let mejor = null;
    for (const o of s.jugadores) {
      if (!o.vivo || o.rol === "soplon" || o.id === j.id) continue;
      const d = dist(o, j);
      if (d <= R.rangoMatar && (!mejor || d < mejor.d)) mejor = { o, d };
    }
    return mejor?.o ?? null;
  };

  const tareaCerca = (j) => {
    for (const t of j.tareas) {
      if (t.hecha) continue;
      const p = tareaDe(t.id);
      if (p && dist(p, j) <= R.rangoUsar) return t;
    }
    return null;
  };

  /* ---------------- paso ---------------- */

  const paso = (dt) => {
    s.t += dt;
    if (s.fase === "junta") {
      if (s.t >= s.junta.hasta) cerrarJunta();
      return;
    }
    if (s.fase === "expulsion") {
      if (s.t >= s.expulsion.hasta) {
        s.expulsion = null;
        s.fase = "juego";
        reunir();
        for (const j of s.jugadores) if (j.rol === "soplon") j.matarEn = Math.max(j.matarEn, R.enfriamientoInicial);
        comprobarFin();
      }
      return;
    }
    if (s.fase !== "juego") return;

    for (const j of s.jugadores) {
      if (j.matarEn > 0) j.matarEn = Math.max(0, j.matarEn - dt);
      const { mx, mz, usar } = j.entrada;
      // Usar te planta: una tarea se hace quieta, como en el juego grande.
      const t = usar && j.rol === "celula" ? tareaCerca(j) : null;
      if (t) {
        j.usando = t.id;
        t.prog = Math.min(1, t.prog + dt / R.tiempoTarea);
        if (t.prog >= 1 && !t.hecha) {
          t.hecha = true;
          j.usando = null;
          evento({ tipo: "tarea", para: j.id, texto: `Hecho: ${tareaDe(t.id).label}.` });
          comprobarFin();
        }
        continue;
      }
      j.usando = null;
      if (!mx && !mz) continue;
      const v = R.velocidad * dt;
      const nx = j.x + mx * v, nz = j.z + mz * v;
      if (!j.vivo) {
        // los fantasmas atraviesan todo, pero no se salen del edificio
        j.x = Math.min(mapa.maxX, Math.max(mapa.minX, nx));
        j.z = Math.min(mapa.maxZ, Math.max(mapa.minZ, nz));
      } else if (mapa.empujar) {
        // con muebles: se avanza y el mundo de colisiones del 3D te saca de
        // lo que pises — así te deslizas por el canto de una mesa en vez de
        // clavarte en la rejilla.
        const p = { x: nx, z: nz };
        mapa.empujar(p, 0.28);
        if (mapa.dentro(p.x, p.z)) { j.x = p.x; j.z = p.z; }
      } else {
        if (mapa.pisable(nx, j.z)) j.x = nx;
        if (mapa.pisable(j.x, nz)) j.z = nz;
      }
      if (mx) j.mira = Math.sign(mx);
    }
    if (s.fase === "juego") comprobarFin();
  };

  /* ---------------- lo que ve cada uno ---------------- */

  /** Quién ve `id` ahora mismo: vivos dentro de su radio (los fantasmas ven todo). */
  const visibles = (id) => {
    const j = porId(id);
    if (!j) return [];
    return s.jugadores.filter((o) => o.id !== id && (o.vivo || !j.vivo) && (!j.vivo || dist(o, j) <= visionDe(j)));
  };

  const vistaPara = (id) => {
    const yo = porId(id);
    const fin = !!s.fin;
    const veoRol = (o) => fin || o.id === id || (yo?.rol === "soplon" && o.rol === "soplon");
    const otros = s.fase === "juego" && yo ? new Set(visibles(id).map((o) => o.id)) : null;
    return {
      t: s.t,
      fase: s.fase,
      yo: yo && {
        id: yo.id, rol: yo.rol, vivo: yo.vivo, campanas: yo.campanas,
        matarEn: yo.matarEn, usando: yo.usando,
        tareas: yo.tareas.map((t) => ({ ...t, falsa: yo.rol === "soplon" })),
        puedeMatar: yo.rol === "soplon" && yo.vivo && yo.matarEn <= 0 && !!objetivoMatar(yo),
        puedeReportar: yo.vivo && s.cuerpos.some((c) => dist(c, yo) <= R.rangoReportar),
        puedeCampana: yo.vivo && yo.campanas > 0 && dist(yo, mapa.campana) <= R.rangoCampana,
        puedeUsar: yo.rol === "celula" && !!tareaCerca(yo),
        vision: visionDe(yo),
      },
      jugadores: s.jugadores
        .filter((o) => o.id === id || s.fase !== "juego" || !otros || otros.has(o.id))
        .map((o) => ({
          id: o.id, nombre: o.nombre, color: o.color, bot: o.bot, cara: o.cara,
          x: o.x, z: o.z, mira: o.mira, vivo: o.vivo, usando: !!o.usando,
          rol: veoRol(o) ? o.rol : undefined,
        })),
      // la lista de la junta necesita a todos, vivos y no
      censo: s.jugadores.map((o) => ({ id: o.id, nombre: o.nombre, color: o.color, vivo: o.vivo, rol: veoRol(o) ? o.rol : undefined })),
      cuerpos: s.cuerpos.filter((c) => !otros || !yo?.vivo || dist(c, yo) <= visionDe(yo) + 1),
      progreso: progresoGlobal(),
      junta: s.junta && {
        convoca: s.junta.convoca, motivo: s.junta.motivo, cuerpo: s.junta.cuerpo,
        quedan: Math.max(0, s.junta.hasta - s.t),
        votaron: Object.keys(s.junta.votos),
        miVoto: s.junta.votos[id] ?? null,
        chat: s.junta.chat.slice(-40),
      },
      expulsion: s.expulsion,
      fin: s.fin,
      eventos: s.eventos.filter((e) => !e.para || e.para === id).slice(-12),
    };
  };

  return {
    estado: s, reglas: R, mapa,
    porId, tareaDe, vivos, visibles, visionDe, progresoGlobal, objetivoMatar,
    entrada, accion, decir, paso, vistaPara,
  };
}
