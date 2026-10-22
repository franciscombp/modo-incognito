// EL SPIN-OFF (impostor/) SE JUEGA SOLO, entre bots, y sin navegador.
//
// La simulación es pura —el anfitrión ES el servidor— así que se puede
// jugar una mesa entera desde node, cuadro a cuadro. Comprueba lo que haría
// falta para que la prueba de concepto valga algo:
//   1. que cada tarea del plano se pueda ALCANZAR desde la cafetería (el
//      plano es el de piso7.json: si alguien cierra un paso, aquí canta);
//   2. que nadie vivo pise nunca fuera del suelo;
//   3. que las partidas TERMINEN, con los dos bandos ganando alguna vez;
//   4. que haya juntas, votos y expulsiones — o sea, que los bots jueguen.
//
// No necesita el preview de :4173. `node tools/check-impostor.mjs [partidas]`
import { readFileSync } from "node:fs";
import { crearMapa } from "../impostor/mapa.js";
import { crearPartida, rngDe } from "../impostor/sim.js";
import { crearBot } from "../impostor/bots.js";

const escena = JSON.parse(readFileSync(new URL("../public/data/scenes/piso7.json", import.meta.url)));
const mapa = crearMapa(escena);
const fallos = [];

for (const t of mapa.tareas) {
  if (!mapa.pisable(t.x, t.z)) fallos.push(`la tarea ${t.id} cae fuera del suelo`);
  if (!mapa.ruta(mapa.salida.x, mapa.salida.z, t.x, t.z)) fallos.push(`la tarea ${t.id} no se alcanza desde la cafetería`);
}

const NOMBRES = ["Fran", "Manu", "Giuli", "Crispo", "Washo", "Chispita", "Steven", "Parce"];
const N = Number(process.argv[2] ?? 12);
const DT = 1 / 20;
const totales = { celula: 0, soplon: 0, colgadas: 0, juntas: 0, expulsiones: 0, aciertos: 0, muertes: 0 };

for (let p = 0; p < N; p++) {
  const nJug = 5 + (p % 4);
  const sim = crearPartida({
    mapa,
    semilla: 1000 + p,
    jugadores: NOMBRES.slice(0, nJug).map((n, i) => ({ id: `b${i}`, nombre: n, bot: true })),
  });
  const rng = rngDe(77 + p);
  const bots = sim.estado.jugadores.map((j) => crearBot(sim, j.id, rng));
  let juntaAnt = null, expAnt = null, fueraDelSuelo = 0;
  const limite = 15 * 60 / DT;
  for (let i = 0; i < limite && sim.estado.fase !== "fin"; i++) {
    for (const b of bots) b.pensar(DT);
    sim.paso(DT);
    for (const j of sim.estado.jugadores) if (j.vivo && !mapa.pisable(j.x, j.z)) fueraDelSuelo++;
    if (sim.estado.junta && sim.estado.junta !== juntaAnt) totales.juntas++;
    juntaAnt = sim.estado.junta;
    if (sim.estado.expulsion && sim.estado.expulsion !== expAnt && sim.estado.expulsion.id) {
      totales.expulsiones++;
      if (sim.estado.expulsion.eraSoplon) totales.aciertos++;
    }
    expAnt = sim.estado.expulsion;
  }
  if (fueraDelSuelo) fallos.push(`partida ${p}: ${fueraDelSuelo} cuadros con alguien vivo fuera del suelo`);
  totales.muertes += sim.estado.muertes.length;
  const fin = sim.estado.fin;
  if (!fin) { totales.colgadas++; fallos.push(`partida ${p} (${nJug} bots) no terminó en 15 min de juego (progreso ${(sim.progresoGlobal() * 100) | 0}%)`); continue; }
  totales[fin.gana]++;
  console.log(`partida ${p} · ${nJug} bots · ${Math.round(sim.estado.t)} s · gana ${fin.gana} · ${fin.motivo}`);
}

console.log("\n", totales);
if (totales.juntas === 0) fallos.push("ninguna partida tuvo una junta");
if (totales.muertes === 0) fallos.push("el soplón no mandó a nadie a RRHH en ninguna partida");
if (N >= 8 && (totales.celula === 0 || totales.soplon === 0)) fallos.push(`un bando no gana nunca (${JSON.stringify(totales)})`);

if (fallos.length) {
  console.error("\nFALLA:\n - " + fallos.join("\n - "));
  process.exit(1);
}
console.log("\nOK · el spin-off se juega solo de principio a fin.");
