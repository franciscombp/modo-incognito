/**
 * LOS BOTS: compañeros de IA para que la mesa se llene con dos personas.
 *
 * No son un LLM: son reglas, y a propósito. Corren en el anfitrión sesenta
 * veces por segundo, sin red ni clave, y lo que importa para la prueba de
 * concepto es que JUEGUEN — que hagan sus tareas, que el soplón busque a
 * alguien solo, que quien encuentra el gafete lo cante y que en la junta
 * haya acusaciones con fundamento (y alguna sin él).
 *
 * Un bot solo sabe lo que VE: lee `sim.visibles(id)`, el mismo radio que
 * pinta la niebla de un humano. No hace trampas con el estado completo,
 * salvo su propio rol, que también lo sabría una persona.
 *
 * Interfaz: `crearBot(sim, id, rng)` → `{ pensar(dt) }`. Habla con la
 * partida por la MISMA puerta que un humano (`entrada`, `accion`, `decir`).
 */

const FRASES = {
  testigo: [
    "¡Vi a {x} mandar a {v} a RRHH en {z}! No era penal, era roja directa.",
    "Fue {x}. Lo vi con estos ojitos en {z}. Vamo a calmarno, pero fue {x}.",
    "{x} fue. Yo estaba ahí, en {z}. No contaban con mi astucia.",
  ],
  encontre: [
    "El gafete de {v} estaba tirado en {z}.",
    "Encontré lo de {v} en {z}. Qué feo, en plena cultura de familia.",
  ],
  sospecha: [
    "{x} andaba por {z} hace nada. Raro.",
    "Yo vi a {x} cerquita de {z}. Solo digo.",
    "{x} no estaba haciendo nada en {z}, ni fingiendo.",
  ],
  coartada: [
    "Yo estaba en {z} con lo mío.",
    "Yo andaba en {z}, haciendo {t}.",
    "Yo en {z}, ni me enteré.",
  ],
  nada: [
    "No vi nada. Skip.",
    "Ni idea, yo estaba en mi mundo. Skip.",
    "Sin pruebas no voto. Esto no es la oficina.",
  ],
  defensa: [
    "¿Yo? Fue sin querer queriendo… no, en serio, yo no fui.",
    "{a}, estás proyectando. Yo estaba en {z}.",
    "Las mujeres ya no lloran, facturan, y yo no soplo. No fui.",
  ],
  apoyo: [
    "Le creo a {a}. Voto {x}.",
    "Cuadra con lo que vi. {x}.",
  ],
};

const elegir = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const rellenar = (txt, d) => txt.replace(/\{(\w)\}/g, (_, k) => d[k] ?? "");
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function crearBot(sim, id, rng) {
  const { mapa } = sim;
  const R = sim.reglas;
  const yo = () => sim.porId(id);

  let ruta = null;      // puntos por recorrer
  let destino = null;   // {x,z,tipo,tarea?}
  let espera = 0;       // segundos "fingiendo" quieto
  let pensarEn = 0;
  const vistos = new Map(); // id → {x, z, t}
  const sospecha = new Map(); // id → puntos
  let testigo = null;   // {asesino, victima, zona}
  let muertesVistas = 0;
  let juntaVista = null; // para preparar el guion de cada junta una vez
  let guion = [];        // [{en, fn}]
  let leidoChat = 0;
  let ultimaZona = null, ultimaTarea = null;

  const sumar = (otro, p) => sospecha.set(otro, (sospecha.get(otro) ?? 0) + p);

  const irA = (x, z, tipo, extra = {}) => {
    const j = yo();
    ruta = mapa.ruta(j.x, j.z, x, z) ?? [{ x, z }];
    destino = { x, z, tipo, ...extra };
  };

  const siguienteTarea = () => {
    const j = yo();
    const pend = j.tareas.filter((t) => !t.hecha);
    if (j.rol === "celula" && pend.length) {
      // la más cercana, con algo de azar para que no vayan todos en fila
      const orden = pend
        .map((t) => ({ t, d: dist(sim.tareaDe(t.id), j) + rng() * 8 }))
        .sort((a, b) => a.d - b.d);
      const t = sim.tareaDe(orden[0].t.id);
      irA(t.x, t.z, "tarea", { tarea: t.id });
      return;
    }
    // el soplón (y quien ya acabó) FINGE: va de estación en estación
    const t = elegir(rng, mapa.tareas);
    irA(t.x, t.z, "fingir", { tarea: t.id });
  };

  const andar = () => {
    const j = yo();
    while (ruta?.length && dist(ruta[0], j) < 0.35) ruta.shift();
    if (!ruta?.length) return { mx: 0, mz: 0 };
    const p = ruta[0];
    const d = dist(p, j) || 1;
    return { mx: (p.x - j.x) / d, mz: (p.z - j.z) / d };
  };

  /* ------------------ observar ------------------ */
  const observar = () => {
    const j = yo();
    for (const o of sim.visibles(id)) vistos.set(o.id, { x: o.x, z: o.z, t: sim.estado.t });
    const m = sim.estado.muertes;
    for (; muertesVistas < m.length; muertesVistas++) {
      const k = m[muertesVistas];
      if (k.asesino === id || !j.vivo) continue;
      if (dist(k, j) <= sim.visionDe(j)) {
        testigo = { asesino: k.asesino, victima: k.victima, zona: mapa.zonaDe(k.x, k.z) };
      }
    }
  };

  /* ------------------ jugar ------------------ */
  const jugar = (dt) => {
    const j = yo();
    if (j.vivo) {
      // un gafete a la vista se canta (el soplón lo pisa y se va, salvo farol)
      const cuerpo = sim.estado.cuerpos.find((c) => dist(c, j) <= sim.visionDe(j));
      if (cuerpo && j.rol === "celula") {
        if (dist(cuerpo, j) <= R.rangoReportar * 0.9) {
          sim.accion(id, { tipo: "reportar" });
          return;
        }
        if (destino?.tipo !== "cuerpo") irA(cuerpo.x, cuerpo.z, "cuerpo");
      }
      if (cuerpo && j.rol === "soplon" && destino?.tipo !== "huir" && rng() < 0.02) {
        const lejos = mapa.tareas.slice().sort((a, b) => dist(b, j) - dist(a, j))[0];
        irA(lejos.x, lejos.z, "huir");
      }

      if (j.rol === "soplon" && j.matarEn <= 0) {
        // la regla del soplón: solo cuando NADIE más mira
        const vis = sim.visibles(id);
        const presas = vis.filter((o) => o.vivo && o.rol === "celula");
        for (const p of presas) {
          const testigos = sim.vivos().filter((o) => o.id !== id && o.id !== p.id
            && (dist(o, p) <= R.vision || dist(o, j) <= R.vision));
          if (testigos.length) continue;
          if (dist(p, j) <= R.rangoMatar * 0.9) {
            if (sim.accion(id, { tipo: "matar" })) {
              const lejos = mapa.tareas.slice().sort((a, b) => dist(b, j) - dist(a, j))[0];
              irA(lejos.x, lejos.z, "huir");
              return;
            }
          }
          ruta = [{ x: p.x, z: p.z }];
          destino = { x: p.x, z: p.z, tipo: "acecho" };
          break;
        }
      }
    }

    if (espera > 0) {
      espera -= dt;
      sim.entrada(id, { mx: 0, mz: 0, usar: destino?.tipo === "tarea" });
      if (espera <= 0) destino = null;
      return;
    }

    if (!destino) siguienteTarea();
    const llegado = dist(destino, j) <= R.rangoUsar * 0.7 || !ruta?.length;
    if (llegado) {
      if (destino.tipo === "tarea") {
        const t = j.tareas.find((x) => x.id === destino.tarea);
        if (t && !t.hecha) {
          ultimaTarea = sim.tareaDe(t.id).label;
          sim.entrada(id, { mx: 0, mz: 0, usar: true });
          return;
        }
        destino = null;
      } else if (destino.tipo === "fingir") {
        ultimaTarea = sim.tareaDe(destino.tarea).label;
        espera = 2 + rng() * 3;
      } else {
        destino = null;
      }
      sim.entrada(id, { mx: 0, mz: 0, usar: false });
      return;
    }
    ultimaZona = mapa.zonaDe(j.x, j.z);
    sim.entrada(id, { ...andar(), usar: false });
  };

  /* ------------------ la junta ------------------ */
  const prepararJunta = () => {
    const s = sim.estado;
    const j = yo();
    guion = [];
    leidoChat = 0;
    if (!j.vivo) return;
    const zonaYo = ultimaZona ?? mapa.zonaDe(j.x, j.z);
    const en = (seg, fn) => guion.push({ en: s.t + seg, fn });
    const hablar = (txt, extra) => sim.decir(id, txt, extra);
    const cuerpo = s.junta.cuerpo ? s.muertes.find((m) => m.victima === s.junta.cuerpo) : null;
    const zonaCuerpo = cuerpo ? mapa.zonaDe(cuerpo.x, cuerpo.z) : null;
    const nombre = (x) => sim.porId(x)?.nombre ?? "?";

    if (j.rol === "soplon") {
      // coartada, y a veces un dedo señalando a otro
      en(2 + rng() * 4, () => hablar(rellenar(elegir(rng, FRASES.coartada), { z: zonaYo, t: ultimaTarea ?? "lo mío" })));
      const cabezaDeTurco = elegir(rng, sim.vivos().filter((o) => o.rol !== "soplon"));
      if (cabezaDeTurco && rng() < 0.55) {
        sumar(cabezaDeTurco.id, 3);
        const fuerte = rng() < 0.3;
        en(6 + rng() * 6, () => hablar(
          rellenar(elegir(rng, fuerte ? FRASES.testigo : FRASES.sospecha), {
            x: cabezaDeTurco.nombre, v: cuerpo ? nombre(cuerpo.victima) : "alguien", z: zonaCuerpo ?? zonaYo,
          }),
          { acusa: cabezaDeTurco.id, fuerte },
        ));
      }
    } else {
      if (s.junta.convoca === id && cuerpo) {
        en(1 + rng() * 2, () => hablar(rellenar(elegir(rng, FRASES.encontre), { v: nombre(cuerpo.victima), z: zonaCuerpo })));
      }
      if (testigo && sim.porId(testigo.asesino)?.vivo) {
        const t = testigo;
        sumar(t.asesino, 10);
        en(2 + rng() * 3, () => hablar(rellenar(elegir(rng, FRASES.testigo), {
          x: nombre(t.asesino), v: nombre(t.victima), z: t.zona,
        }), { acusa: t.asesino, fuerte: true }));
      } else if (cuerpo) {
        // quién andaba cerca del gafete poco antes
        let mejor = null;
        for (const [oid, v] of vistos) {
          const o = sim.porId(oid);
          if (!o?.vivo || oid === id) continue;
          if (s.t - v.t > 25) continue;
          const d = dist(v, cuerpo);
          if (d < 9 && (!mejor || d < mejor.d)) mejor = { oid, d };
        }
        if (mejor) {
          sumar(mejor.oid, 2);
          en(4 + rng() * 6, () => hablar(rellenar(elegir(rng, FRASES.sospecha), { x: nombre(mejor.oid), z: zonaCuerpo }), { acusa: mejor.oid }));
        } else {
          en(4 + rng() * 6, () => hablar(rellenar(elegir(rng, FRASES.coartada), { z: zonaYo, t: ultimaTarea ?? "lo mío" })));
        }
      } else {
        en(3 + rng() * 6, () => hablar(rellenar(elegir(rng, FRASES.coartada), { z: zonaYo, t: ultimaTarea ?? "lo mío" })));
      }
      testigo = null;
    }
    // votar al final, cuando ya se oyó algo
    en(14 + rng() * 10, votar);
  };

  const escuchar = () => {
    const chat = sim.estado.junta.chat;
    for (; leidoChat < chat.length; leidoChat++) {
      const m = chat[leidoChat];
      if (!m.de || m.de === id) continue;
      let acusa = m.acusa;
      // un humano no manda `acusa`: se mira si nombra a alguien
      if (!acusa) {
        const t = m.texto.toLowerCase();
        acusa = sim.estado.jugadores.find((o) => o.id !== m.de && t.includes(o.nombre.toLowerCase()))?.id;
      }
      if (!acusa) continue;
      if (acusa === id) {
        sumar(m.de, 2);
        const z = ultimaZona ?? "mi puesto";
        guion.push({ en: sim.estado.t + 1.5 + rng() * 2, fn: () => sim.decir(id, rellenar(elegir(rng, FRASES.defensa), { a: sim.porId(m.de).nombre, z }), { acusa: m.de }) });
      } else if (yo().rol === "celula") {
        sumar(acusa, m.fuerte ? 3 : 1);
      } else if (yo().rol === "soplon" && sim.porId(acusa)?.rol !== "soplon") {
        // el soplón se sube al carro de quien acusa a otro
        sumar(acusa, 2);
      }
    }
  };

  const votar = () => {
    const j = yo();
    if (!j.vivo || sim.estado.fase !== "junta") return;
    let mejor = null;
    for (const [oid, p] of sospecha) {
      const o = sim.porId(oid);
      if (!o?.vivo || oid === id) continue;
      if (j.rol === "soplon" && o.rol === "soplon") continue;
      if (!mejor || p > mejor.p) mejor = { oid, p };
    }
    const umbral = j.rol === "soplon" ? 1 : 2.5;
    const objetivo = mejor && mejor.p >= umbral ? mejor.oid : "nadie";
    if (objetivo !== "nadie" && j.rol === "celula" && rng() < 0.6) {
      const autor = sim.estado.junta.chat.find((c) => c.acusa === objetivo && c.de && c.de !== id);
      if (autor) sim.decir(id, rellenar(elegir(rng, FRASES.apoyo), { a: sim.porId(autor.de).nombre, x: sim.porId(objetivo).nombre }));
    }
    sim.accion(id, { tipo: "votar", objetivo });
  };

  const pensar = (dt) => {
    const s = sim.estado;
    if (s.fase === "juego") {
      juntaVista = null;
      observar();
      pensarEn -= dt;
      jugar(dt);
      return;
    }
    if (s.fase === "junta") {
      if (juntaVista !== s.junta) {
        juntaVista = s.junta;
        // lo de antes de la junta ya no cuenta como "reciente"
        for (const k of sospecha.keys()) sospecha.set(k, sospecha.get(k) * 0.5);
        ruta = null; destino = null; espera = 0;
        prepararJunta();
      }
      escuchar();
      const ahora = s.t;
      const listos = guion.filter((g) => g.en <= ahora);
      guion = guion.filter((g) => g.en > ahora);
      for (const g of listos) g.fn();
      // si se acaba el tiempo y no votó, que vote ya
      if (s.junta && s.junta.hasta - ahora < 2 && yo().vivo && !s.junta.votos[id]) votar();
    }
  };

  return { id, pensar };
}
