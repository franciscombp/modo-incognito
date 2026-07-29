// Easter eggs: hidden spots on the floor and hidden inputs. Each one fires
// once per save and pops a short visual-novel beat, so finding them feels
// like finding story rather than a toast.

import { WORLD_SCALE as S } from "../scene/config.js";

const at = (x, z) => ({ x: x * S, z: z * S });

/** Stand inside the radius for `dwell` seconds to trigger. */
export const locationEggs = [
  {
    id: "egg_sala6",
    ...at(38.6, -6.4),
    radius: 2 * S,
    dwell: 2.5,
    scene: [
      {
        speaker: "Nota en la pizarra",
        portrait: "📝",
        text: "«Sala 6 reservada indefinidamente por Gaps 1.» Lleva tres años reservada. Nadie ha entrado.",
      },
    ],
  },
  {
    id: "egg_escaleras",
    ...at(-10.5, 3.8),
    radius: 1.8 * S,
    dwell: 3,
    scene: [
      {
        speaker: "Puerta de escaleras",
        portrait: "🪜",
        text: "Alguien pegó un post-it: «Si el jefe pregunta, estoy en el piso 8».",
      },
      { speaker: "Tú", portrait: "🙂", text: "Voy a robarme esta excusa." },
    ],
  },
  {
    id: "egg_atms",
    ...at(17.4, 4.4),
    radius: 2 * S,
    dwell: 3,
    scene: [
      {
        speaker: "Cajero de pruebas",
        portrait: "🏧",
        text: "SALDO DISPONIBLE: 999.999.999. Ambiente de QA. No te emociones.",
      },
    ],
  },
  {
    id: "egg_auditorio",
    ...at(12.6, 5.4),
    radius: 2 * S,
    dwell: 4,
    scene: [
      {
        speaker: "Proyector",
        portrait: "📽️",
        text: "Sigue proyectando el mismo deck del kickoff de hace dos años. Diapositiva 4: «Quick wins».",
      },
    ],
  },
  {
    id: "egg_cafetera",
    ...at(-3.4, 6.2),
    radius: 1.6 * S,
    dwell: 4,
    scene: [
      {
        speaker: "Cafetera",
        portrait: "☕",
        text: "Cartel: «Fuera de servicio». Debajo, en lápiz: «mentira, dale dos golpes».",
      },
    ],
  },
];

/** Typed sequences. The classic one, plus a themed one. */
export const codeEggs = [
  {
    id: "egg_konami",
    keys: [
      "arrowup", "arrowup", "arrowdown", "arrowdown",
      "arrowleft", "arrowright", "arrowleft", "arrowright",
      "b", "a",
    ],
    scene: [
      {
        speaker: "???",
        portrait: "🎮",
        text: "Has despertado el modo leyenda. El jefe no sabrá por qué hoy caminas tan segura.",
      },
    ],
    effect: (ctx) => ctx.grantSlowMotionBoss?.(),
  },
  {
    id: "egg_nomina",
    keys: ["n", "o", "m", "i", "n", "a"],
    scene: [
      {
        speaker: "Sistema",
        portrait: "💸",
        text: "Consulta de nómina denegada. Vuelva a intentarlo el día 30, como todos.",
      },
    ],
  },
];

export const allEggIds = [...locationEggs, ...codeEggs].map((e) => e.id);
