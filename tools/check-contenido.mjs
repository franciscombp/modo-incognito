/**
 * EL CONTENIDO SE REVISA SOLO.
 *
 * ── Por qué ──
 *
 * La historia y el juego viven en JSON repartidos: el manifiesto, los días,
 * la temporada, la escena, los diálogos, los chismes y la libreta. Se
 * referencian entre ellos POR ID Y POR NOMBRE, y ninguna de esas referencias
 * la comprueba nadie. Una misión que apunta a una estación que se renombró,
 * un día que espera a Gabo en un puesto que ya no existe, una actividad que
 * pide un objeto a un personaje que no está en el piso: nada de eso rompe el
 * juego al arrancar. Rompe DESPUÉS — con la misión imposible a mitad de
 * partida, o con un diálogo que no sale y nadie sabe por qué.
 *
 * Esta comprobación NO abre el navegador: lee los archivos y cruza las
 * referencias. Es la red que hace que se pueda tocar contenido sin miedo, y
 * la que dice EN QUÉ ARCHIVO Y EN QUÉ CLAVE está el typo.
 *
 * (`check:libreta` ya hace esto para sus pistas, y `check:no-emoji` para los
 * iconos. Esto es lo mismo para el resto del contenido.)
 *
 * Uso: npm run check:contenido   (no necesita servidor)
 */
import { readFileSync, existsSync } from "node:fs";
import { VERBOS, verbosDeclarados } from "../src/game/verbos.js";

const DATA = new URL("../public/data/", import.meta.url);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, DATA), "utf8"));
const hay = (rel) => existsSync(new URL(rel, DATA));

let fallos = 0;
const problemas = [];
function exige(ok, donde, queja) {
  if (ok) return;
  fallos++;
  problemas.push({ donde, queja });
}
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
}

const manifest = leer("manifest.json");
const escenas = new Map((manifest.scenes ?? []).map((id) => [id, leer(`scenes/${id}.json`)]));
const niveles = (manifest.levels ?? []).map((id) => ({ id, d: leer(`levels/${id}.json`) }));
const dialogos = leer("dialogues.json");
const chismes = leer("chismes.json");

// ── 1 · El manifiesto apunta a archivos que EXISTEN ──
const antes = fallos;
for (const id of manifest.scenes ?? []) {
  exige(hay(`scenes/${id}.json`), "manifest.scenes", `no existe scenes/${id}.json`);
}
for (const id of manifest.levels ?? []) {
  exige(hay(`levels/${id}.json`), "manifest.levels", `no existe levels/${id}.json`);
}
check("el manifiesto apunta a archivos que existen", fallos === antes);

// ── 2 · Cada día apunta a una escena real, y su puerta a un sitio real ──
const antes2 = fallos;
for (const { id, d } of niveles) {
  exige(escenas.has(d.scene), `levels/${id}.json → scene`, `la escena "${d.scene}" no está en el manifiesto`);
  const escena = escenas.get(d.scene);
  if (!escena) continue;
  const gate = d.rules?.gate;
  if (gate?.esperaEn || gate?.sentadoEn) {
    const ref = gate.esperaEn ?? gate.sentadoEn;
    const clave = gate.esperaEn ? "esperaEn" : "sentadoEn";
    const enPuestos = (escena.puestos ?? []).some((p) => p.id === ref);
    const enSafe = (escena.safeSpots ?? []).some((p) => p.id === ref);
    exige(
      enPuestos || enSafe,
      `levels/${id}.json → gate.${clave}`,
      `"${ref}" no es ningún puesto ni safeSpot de ${d.scene}`
    );
  }
  // Los objetivos sueltos del día (el modelo viejo, sin campaña).
  for (const oid of d.rules?.objectives ?? []) {
    exige(
      (escena.activities ?? []).some((a) => a.id === oid),
      `levels/${id}.json → rules.objectives`,
      `no hay actividad "${oid}" en ${d.scene}`
    );
  }
}
check("cada día apunta a una escena real, y su puerta a un sitio que existe", fallos === antes2);

// ── 3 · La temporada: sus misiones apuntan a estaciones y a gente reales ──
const antes3 = fallos;
const temporadas = [];
for (let n = 1; n <= 5; n++) {
  if (hay(`campaign/temporada-${n}.json`)) temporadas.push({ n, d: leer(`campaign/temporada-${n}.json`) });
}
const gente = new Set(Object.keys(dialogos.encounters ?? {}));
const escenaPrincipal = escenas.get(niveles[0]?.d.scene) ?? [...escenas.values()][0];
const estaciones = new Set((escenaPrincipal?.activities ?? []).map((a) => a.id));
const npcsEnPiso = new Set((escenaPrincipal?.npcs ?? []).map((n) => n.cast ?? n.id).filter(Boolean));

for (const { n, d } of temporadas) {
  const ids = new Set(d.misiones.map((m) => m.id));
  for (const m of d.misiones) {
    for (const req of m.requiere ?? []) {
      exige(ids.has(req), `temporada-${n}.json → ${m.id}.requiere`, `no existe la misión "${req}"`);
    }
    if (m.estacion) {
      exige(
        estaciones.has(m.estacion),
        `temporada-${n}.json → ${m.id}.estacion`,
        `no hay actividad "${m.estacion}" en la escena`
      );
    }
    if (m.personaje) {
      exige(
        gente.has(m.personaje),
        `temporada-${n}.json → ${m.id}.personaje`,
        `"${m.personaje}" no tiene diálogo en dialogues.json → encounters`
      );
    }
  }
  // Y NADIE SE QUEDA HUÉRFANO: una misión que nadie desbloquea y que no
  // arranca sola es contenido escrito que no se ve nunca.
  const desbloqueadas = new Set(d.misiones.flatMap((m) => m.requiere ?? []));
  for (const m of d.misiones) {
    const arranca = !m.requiere?.length;
    const laAbreAlguien = d.misiones.some((o) => (o.requiere ?? []).includes(m.id));
    exige(
      arranca || desbloqueadas.has(m.id) || laAbreAlguien || m.requiere?.every((r) => ids.has(r)),
      `temporada-${n}.json → ${m.id}`,
      "no arranca sola y nadie la desbloquea: nunca se vería"
    );
  }
}
check("las misiones de la temporada apuntan a estaciones y a gente que existen", fallos === antes3);

// ── 4 · Las actividades: un solo verbo, y sus recados alcanzables ──
const antes4 = fallos;
for (const [sid, escena] of escenas) {
  for (const a of escena.activities ?? []) {
    const declarados = verbosDeclarados(a);
    exige(
      declarados.length <= 1,
      `scenes/${sid}.json → ${a.id}`,
      `declara DOS verbos (${declarados.join(", ")}): solo se jugará "${declarados[0]}"`
    );
    // LA CUENTA ATRÁS SIEMPRE MAYOR QUE LA DURACIÓN. Al revés, la tarea no se
    // puede terminar y no hay nada a la vista que lo explique.
    if (a.limite != null && a.time != null) {
      exige(
        a.limite > a.time,
        `scenes/${sid}.json → ${a.id}`,
        `limite (${a.limite}) no es mayor que time (${a.time}): la tarea no se puede terminar`
      );
    }
    const ob = a.objeto;
    if (!ob) continue;
    if (ob.de) {
      exige(
        npcsEnPiso.has(ob.de) || gente.has(ob.de),
        `scenes/${sid}.json → ${a.id}.objeto.de`,
        `"${ob.de}" no está en el piso ni tiene diálogo: el objeto no se puede conseguir`
      );
    }
    if (ob.en?.sala) {
      exige(
        (escena.areas ?? []).some((r) => r.id === ob.en.sala) ||
          (escena.safeSpots ?? []).some((r) => r.id === ob.en.sala),
        `scenes/${sid}.json → ${a.id}.objeto.en.sala`,
        `no existe la sala "${ob.en.sala}"`
      );
    }
    exige(!!ob.pista, `scenes/${sid}.json → ${a.id}.objeto`, "sin `pista`: la tarea pide algo y no dice dónde está");
  }
}
check("cada actividad juega a UN verbo, y sus recados se pueden conseguir", fallos === antes4);

// ── 5 · Los diálogos: quien habla existe, y nadie se queda mudo ──
const antes5 = fallos;
for (const [quien, enc] of Object.entries(dialogos.encounters ?? {})) {
  const escenasDe = enc.scenes ?? enc;
  exige(
    Array.isArray(escenasDe) && escenasDe.length > 0,
    `dialogues.json → encounters.${quien}`,
    "no tiene ni una escena escrita"
  );
}
// Y las fichas de chisme, bien formadas: una `correcta` fuera de rango es una
// pregunta que no se puede acertar.
for (const f of chismes.fichas ?? chismes) {
  exige(
    Number.isInteger(f.correcta) && f.correcta >= 0 && f.correcta < (f.opciones?.length ?? 0),
    `chismes.json → ${f.id}`,
    `"correcta" (${f.correcta}) no señala ninguna de sus ${f.opciones?.length ?? 0} opciones`
  );
  exige(
    (f.opciones ?? []).every((o) => o.texto),
    `chismes.json → ${f.id}`,
    "alguna opción no tiene texto"
  );
}
check("los diálogos y las fichas de chisme están bien formados", fallos === antes5);

// ── 6 · El REGISTRO DE VERBOS y los datos, de acuerdo ──
// Si alguien añade una clave de verbo a una escena sin darla de alta en
// `verbos.js`, esa actividad cae al pulso en silencio.
const antes6 = fallos;
const conocidos = new Set(VERBOS.map((v) => v.campo).filter(Boolean));
const SOSPECHOSAS = ["pulso", "trivia", "cables", "puzzle", "minijuego"];
for (const [sid, escena] of escenas) {
  for (const a of escena.activities ?? []) {
    for (const clave of Object.keys(a)) {
      if (!SOSPECHOSAS.includes(clave)) continue;
      exige(
        conocidos.has(clave) || clave === "pulso",
        `scenes/${sid}.json → ${a.id}.${clave}`,
        `parece un verbo pero no está en el registro (src/game/verbos.js): la actividad caerá al pulso sin avisar`
      );
    }
  }
}
check("no hay verbos escritos en los datos que el registro no conozca", fallos === antes6);

if (problemas.length) {
  console.log("\n── Lo que hay que arreglar ──");
  for (const p of problemas) console.log(`  ${p.donde}\n     ${p.queja}`);
}
console.log(
  fallos === 0
    ? "\nEl contenido se referencia a sí mismo sin un solo cabo suelto"
    : `\n${fallos} referencia(s) rota(s)`
);
process.exit(fallos ? 1 : 0);
