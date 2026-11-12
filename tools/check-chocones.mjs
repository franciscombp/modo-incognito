/**
 * LOS CHOCONES, en node y sin navegador: partidas enteras solo entre bots.
 *
 * Mira lo que rompería el juego sin que nada lo cantara a la vista:
 * - que las partidas TERMINEN (podio) y en un tiempo razonable;
 * - que las rondas no se acaben siempre por tiempo (si nadie echa a nadie,
 *   no hay juego, hay un aparcamiento);
 * - que ganen jugadores distintos (si gana siempre el mismo hueco, la
 *   colocación inicial da ventaja);
 * - que ningún número se vuelva NaN y nadie vivo esté fuera de la pista;
 * - que las monedas se recojan y los KO paguen.
 *
 * Uso: node tools/check-chocones.mjs [partidas]
 */
import { crearPartida, rngDe, RADIO_CARRO } from "../chocones/sim.js";
import { crearBot } from "../chocones/bots.js";

const N = Number(process.argv[2] ?? 30);
const HZ = 20;
const PASO = 1 / HZ;
let fallos = 0;
const check = (ok, label, detalle = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
};

const CARAS = ["giuli", "fran", "manu", "cesar", "crispo", "chispita", "washo", "parce"];
const ganadoresHueco = new Map();
let rondas = 0, porTiempo = 0, duracionMax = 0, nan = false, fueraVivo = 0, monedas = 0, kos = 0, terminadas = 0;
let duracionRondas = 0;

for (let p = 0; p < N; p++) {
  const n = 2 + (p % 7); // de 2 a 8 carros
  const jugadores = CARAS.slice(0, n).map((cara, i) => ({ id: `b${i}`, nombre: cara, cara, bot: true }));
  const sim = crearPartida({ jugadores, semilla: 1000 + p });
  const rng = rngDe(77 + p);
  const bots = jugadores.map((j) => crearBot(sim, j.id, rng));
  let t = 0, rondaAntes = 1, tRonda = 0;
  while (!sim.terminada && t < 60 * 12) {
    for (const b of bots) b.pensar(PASO);
    const faseAntes = sim.fase;
    sim.paso(PASO);
    t += PASO;
    if (faseAntes === "ronda") tRonda += PASO;
    if (faseAntes === "ronda" && sim.fase === "finRonda") {
      rondas++;
      duracionRondas += tRonda;
      if (tRonda >= 47.9) porTiempo++;
      tRonda = 0;
    }
    for (const j of sim.jugadores) {
      if (![j.x, j.z, j.vx, j.vz, j.ang].every(Number.isFinite)) nan = true;
      if (j.vivo && Math.hypot(j.x, j.z) > sim.radio + RADIO_CARRO * 0.01 && sim.fase === "ronda") fueraVivo++;
    }
    rondaAntes = sim.ronda;
  }
  duracionMax = Math.max(duracionMax, t);
  if (sim.terminada) {
    terminadas++;
    const g = sim.ranking()[0];
    ganadoresHueco.set(g.id, (ganadoresHueco.get(g.id) ?? 0) + 1);
  }
  const v = sim.vistaPara("b0");
  for (const j of sim.jugadores) monedas += j.monedas;
  kos += v.eventos.filter((e) => e.tipo === "ko" && e.por).length;
}

check(terminadas === N, "todas las partidas llegan al podio", `${terminadas}/${N}`);
check(duracionMax < 60 * 8, "y ninguna se eterniza", `${Math.round(duracionMax)} s la más larga`);
check(porTiempo / Math.max(1, rondas) < 0.35, "la mayoría de rondas se deciden a golpes, no por tiempo", `${porTiempo}/${rondas} por tiempo · media ${(duracionRondas / Math.max(1, rondas)).toFixed(1)} s`);
check(ganadoresHueco.size >= 3, "ganan carros distintos (la salida no da ventaja)", JSON.stringify(Object.fromEntries(ganadoresHueco)));
check(!nan, "ningún número se vuelve NaN");
check(fueraVivo === 0, "nadie sigue vivo fuera de la pista", `${fueraVivo} cuadros`);
check(monedas > N, "se recogen monedas", `${monedas} en ${N} partidas`);
check(kos > 0, "los KO se atribuyen a quien empujó", `${kos} en los últimos eventos`);

// Un humano que no toca nada no puede ganar la ronda quedándose quieto en el centro
{
  const jugadores = [{ id: "h", nombre: "Yo", cara: "giuli" }, ...CARAS.slice(1, 5).map((c, i) => ({ id: `b${i}`, nombre: c, cara: c, bot: true }))];
  const sim = crearPartida({ jugadores, semilla: 5 });
  const rng = rngDe(9);
  const bots = jugadores.filter((j) => j.bot).map((j) => crearBot(sim, j.id, rng));
  let echado = false;
  for (let i = 0; i < HZ * 60 && sim.ronda === 1; i++) {
    for (const b of bots) b.pensar(PASO);
    sim.entrada("h", { mx: 0, mz: 0 });
    sim.paso(PASO);
    if (!sim.porId("h").vivo) echado = true;
  }
  check(echado, "quedarse quieta no es estrategia: los bots te echan");
}

console.log(fallos ? `\n${fallos} comprobación(es) fallan` : "\nLos chocones se juegan solos, de principio a podio");
process.exit(fallos ? 1 : 0);
