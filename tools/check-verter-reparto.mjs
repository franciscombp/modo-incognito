// EL REPARTO DE LOS VASOS SIEMPRE SE PUEDE JUGAR.
//
// `check:verter` hace un clic de ratón de verdad sobre UN reparto. Esto mira
// la otra mitad: miles de repartos seguidos, cada uno resuelto con una
// búsqueda propia (no la del módulo — una prueba que reutiliza el código que
// vigila acaba dándole la razón). Dos cosas que tienen que ser ciertas:
//
//   · tiene SALIDA: un puzle imposible con el jefe acercándose es injusto;
//   · NO NACE RESUELTO: el progreso sube al resolver un vaso MÁS, así que un
//     reparto ya hecho de salida dejaba la tarea sin nada que tocar y sin
//     forma de terminarla. Pasaba ~3 de cada mil veces, sin un solo error.
//
// No abre el navegador: el módulo es lógica pura.
// Uso: node tools/check-verter-reparto.mjs
import { createPourGame } from "../src/game/pourGame.js";

const scene = JSON.parse(
  (await import("node:fs")).readFileSync(new URL("../public/data/scenes/piso7.json", import.meta.url))
);
const conVerter = (scene.activities ?? []).filter((a) => a.verter);

function tieneSalida(vasos, cap, meta) {
  const clave = (v) => v.map((x) => x.join(",")).sort().join("|");
  const hecho = (v) => v.filter((x) => x.length === cap && x.every((c) => c === x[0])).length >= meta;
  const vistos = new Set([clave(vasos)]);
  const cola = [vasos];
  while (cola.length) {
    const v = cola.shift();
    if (hecho(v)) return true;
    for (let a = 0; a < v.length; a++) {
      if (!v[a].length) continue;
      const c = v[a].at(-1);
      for (let b = 0; b < v.length; b++) {
        if (a === b || v[b].length >= cap || (v[b].length && v[b].at(-1) !== c)) continue;
        const n = v.map((x) => [...x]);
        while (n[a].length && n[a].at(-1) === c && n[b].length < cap) n[b].push(n[a].pop());
        const k = clave(n);
        if (!vistos.has(k)) {
          vistos.add(k);
          cola.push(n);
        }
      }
    }
  }
  return false;
}

let fallos = 0;
const pass = (ok, msg) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  if (!ok) fallos++;
};

pass(conVerter.length > 0, `hay actividades que juegan a VERTER en el piso (${conVerter.length})`);

const N = 3000;
for (const act of conVerter) {
  let sinSalida = 0;
  let resueltos = 0;
  for (let i = 0; i < N; i++) {
    const juego = createPourGame();
    juego.begin({ ...act, progress: 0 });
    const s = juego.snapshot();
    if (s.resueltos >= s.objetivo) resueltos++;
    if (!tieneSalida(s.vasos, s.capacidad, s.objetivo)) sinSalida++;
  }
  pass(sinSalida === 0, `${act.id}: ${N} repartos, todos con salida (sin salida: ${sinSalida})`);
  pass(resueltos === 0, `${act.id}: ninguno nace ya resuelto (resueltos de salida: ${resueltos})`);
}

process.exit(fallos ? 1 : 0);
