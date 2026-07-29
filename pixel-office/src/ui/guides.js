import { createTracker } from "./tracker.js";
import { WORLD_SCALE as S } from "../scene/config.js";

// Las dos guías de la partida, hechas con el mismo componente:
//   · abajo derecha, cian  -> a dónde vas
//   · abajo izquierda, roja -> dónde está el jefe
// Antes esto era un minimapa con puntitos, que obliga a traducir del plano a
// lo que ves. Una guía con flecha y metros se lee sin traducir.

const WING = { sur: "ALA SUR", norte: "ALA NORTE", centro: "CENTRO" };

const BOSS_STATE = {
  PATROL: { label: "De ronda", tone: 0 },
  INVESTIGATE: { label: "Distraído", tone: 0.2 },
  SEARCH: { label: "Te está buscando", tone: 0.75 },
  CHASE: { label: "¡Te persigue!", tone: 1 },
};

export function createGuides(root, camera) {
  const task = createTracker(root, camera, { id: "task", side: "right", accent: "cyan" });
  const boss = createTracker(root, camera, { id: "boss", side: "left", accent: "red" });

  function update(state) {
    if (!state || state.gameOver) {
      task.update(null);
      boss.update(null);
      return;
    }

    const px = state.playerPos.x;
    const pz = state.playerPos.z;

    // ---- Tarea activa ----
    const target = state.focusStation;
    if (target) {
      const distance = Math.hypot(target.x - px, target.z - pz) / S;
      const area = state.area;
      // Lo expuesto que está la tarea depende de lo cerca que ande el jefe
      // *de ella*, no de ti: eso es lo que decide si conviene ir ahora.
      const bossToTarget =
        Math.hypot(state.bossPos.x - target.x, state.bossPos.z - target.z) / S;
      task.update({
        x: target.x,
        z: target.z,
        icon: target.icon ?? "•",
        top: area ? `${WING[area.wing] ?? "PISO 7"} · ${area.name}` : "PISO 7",
        label: target.label,
        meta:
          state.nearStation && state.nearStation.id === target.id
            ? "EN CURSO"
            : `${Math.round(distance)} m`,
        short: `${Math.round(distance)} m`,
        urgency: Math.max(0, 1 - bossToTarget / 16),
      });
    } else {
      task.update(null);
    }

    // ---- El jefe ----
    const bossDist = state.bossDistance / S;
    const info = BOSS_STATE[state.bossState] ?? BOSS_STATE.PATROL;
    // Urgencia = lo cerca que está de ti, elevada por su estado: a 4 m de
    // ronda no es lo mismo que a 4 m persiguiéndote.
    const proximity = Math.max(0, 1 - bossDist / 22);
    boss.update({
      x: state.bossPos.x,
      z: state.bossPos.z,
      y: 2.2,
      icon: state.bossState === "CHASE" ? "🚨" : "🕴️",
      top: `JEFE · NIVEL ${state.heat}`,
      label: info.label,
      meta: `${Math.round(bossDist)} m`,
      short: `${Math.round(bossDist)} m`,
      urgency: Math.max(proximity, info.tone),
    });
  }

  return { update };
}
