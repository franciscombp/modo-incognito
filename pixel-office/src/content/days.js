// Every day of the campaign is pure data: the rules the level runs under,
// plus the visual-novel scenes that top and tail it. Adding a day is adding
// an object to this array — no engine changes required.
//
// `rules` fields (all optional, defaults in game.js):
//   duration        seconds of workday
//   maxWarnings     strikes before you are walked out
//   objectives      ids from activityStations; omit for "all of them"
//   bossSpeedMul    multiplies every boss speed
//   visionMul       multiplies the boss's cone range
//   decayMul        multiplies how fast suspicion cools down
//   distractionsOff disables the distraction props
//   theme           lighting/atmosphere preset (see themes.js)

export const days = [
  {
    id: "dia-1",
    number: 1,
    title: "Lunes · Inducción",
    subtitle: "Nadie te conoce todavía. Aprovecha.",
    theme: "morning",
    rules: {
      duration: 210,
      maxWarnings: 3,
      objectives: ["coffee", "chat"],
      bossSpeedMul: 0.85,
      visionMul: 0.9,
    },
    intro: [
      {
        speaker: "Recepción",
        portrait: "🛗",
        text: "Piso 7, Tribu Canales. Tu escritorio está por el ala sur… si es que lo encuentras.",
      },
      {
        speaker: "Tú",
        portrait: "🙂",
        text: "Primer día. Plan: parecer ocupada, lograr absolutamente nada.",
      },
      {
        speaker: "Jefe",
        portrait: "🕴️",
        mood: "tense",
        text: "¡Bienvenida! Yo soy quien camina por aquí todo el día. Casualidad, ¿no?",
      },
      {
        prompt: "Te pregunta qué vas a hacer primero.",
        portrait: "🕴️",
        options: [
          {
            label: "«Revisar el backlog, obvio.»",
            reply: "Revisar el backlog, obvio.",
            flag: "mentirosa",
          },
          {
            label: "«Buscar la cafetera.»",
            reply: "Buscar la cafetera. Es una prioridad estratégica.",
            flag: "sincera",
          },
        ],
      },
      {
        speaker: "Jefe",
        portrait: "🕴️",
        text: "Perfecto. Te estaré observando… de forma completamente normal.",
      },
    ],
    outroWin: [
      {
        speaker: "Tú",
        portrait: "😌",
        text: "Café tomado, chisme recolectado. Día uno: productividad cero, moral intacta.",
      },
    ],
    outroLose: [
      {
        speaker: "Jefe",
        portrait: "🕴️",
        mood: "angry",
        text: "En tu primer día. Increíble. Mañana empezamos de nuevo.",
      },
    ],
  },

  {
    id: "dia-2",
    number: 2,
    title: "Martes · Ritmo de crucero",
    subtitle: "Ya sabes dónde están las cámaras. Y las plantas.",
    theme: "morning",
    rules: {
      duration: 240,
      maxWarnings: 3,
      objectives: ["coffee", "chat", "sleep"],
      bossSpeedMul: 1,
      visionMul: 1,
    },
    intro: [
      {
        speaker: "Compañera",
        portrait: "💬",
        text: "Regla no escrita: si caminas con una laptop abierta, nadie te pregunta nada.",
      },
      {
        prompt: "¿Aceptas el consejo?",
        portrait: "💬",
        options: [
          { label: "«Anotado.»", reply: "Anotado. Laptop como escudo.", flag: "escudo" },
          { label: "«Prefiero improvisar.»", reply: "Prefiero improvisar.", flag: "improvisa" },
        ],
      },
    ],
    outroWin: [
      { speaker: "Tú", portrait: "😴", text: "Dormir en el escritorio es una habilidad. Y yo estoy escalando." },
    ],
    outroLose: [
      { speaker: "Jefe", portrait: "🕴️", mood: "angry", text: "Segundo día, segunda charla. Vamos mal." },
    ],
  },

  {
    id: "dia-3",
    number: 3,
    title: "Miércoles · Comité de seguimiento",
    subtitle: "El jefe anda nervioso: hay reunión de tribu.",
    theme: "overcast",
    rules: {
      duration: 240,
      maxWarnings: 2,
      objectives: ["coffee", "chat", "movie", "snack"],
      bossSpeedMul: 1.1,
      visionMul: 1.12,
      decayMul: 0.85,
    },
    intro: [
      {
        speaker: "Jefe",
        portrait: "🕴️",
        mood: "tense",
        text: "Hoy pasa el comité. Quiero ver a todo el mundo en su puesto. TODO el mundo.",
      },
      {
        speaker: "Tú",
        portrait: "😬",
        text: "Traducción: hoy camina más rápido y mira más lejos.",
      },
    ],
    outroWin: [
      { speaker: "Tú", portrait: "😎", text: "Vi media película en el auditorio durante el comité. Nadie lo sabrá." },
    ],
    outroLose: [
      { speaker: "Jefe", portrait: "🕴️", mood: "angry", text: "¡Justo hoy! ¡JUSTO HOY!" },
    ],
  },

  {
    id: "dia-4",
    number: 4,
    title: "Jueves · Modo incógnito",
    subtitle: "Se cayeron las distracciones. Solo quedan las paredes.",
    theme: "dusk",
    rules: {
      duration: 230,
      maxWarnings: 2,
      objectives: ["coffee", "chat", "movie", "snack", "sleep"],
      bossSpeedMul: 1.15,
      visionMul: 1.15,
      decayMul: 0.8,
      distractionsOff: true,
    },
    intro: [
      {
        speaker: "Sistemas",
        portrait: "🖨️",
        text: "Aviso: impresora, cafetera y televisor en mantenimiento. Sin trucos hoy.",
      },
      {
        prompt: "Sin distracciones disponibles, ¿cómo lo juegas?",
        portrait: "🤔",
        options: [
          { label: "Pegada a las paredes", reply: "Pegada a las paredes y a las plantas.", flag: "sigilo" },
          { label: "A toda velocidad", reply: "A toda velocidad. Que me alcance si puede.", flag: "temeraria" },
        ],
      },
    ],
    outroWin: [
      { speaker: "Tú", portrait: "🫥", text: "Cinco actividades prohibidas, cero pruebas. Modo incógnito activado." },
    ],
    outroLose: [
      { speaker: "Jefe", portrait: "🕴️", mood: "angry", text: "Sin impresora que culpar, ¿eh?" },
    ],
  },

  {
    id: "dia-5",
    number: 5,
    title: "Viernes · Evaluación de desempeño",
    subtitle: "Todo o nada. Él ya sospecha.",
    theme: "dusk",
    rules: {
      duration: 220,
      maxWarnings: 1,
      objectives: ["coffee", "chat", "movie", "snack", "sleep"],
      bossSpeedMul: 1.25,
      visionMul: 1.25,
      decayMul: 0.72,
    },
    intro: [
      {
        speaker: "Jefe",
        portrait: "🕴️",
        mood: "angry",
        text: "Llevo toda la semana observándote. Hoy firmo tu evaluación.",
      },
      {
        prompt: "Última palabra antes de que empiece la jornada.",
        portrait: "🕴️",
        options: [
          {
            label: "«Estoy en modo incógnito.»",
            reply: "Estoy en modo incógnito, jefe.",
            flag: "declaracion",
            then: [
              { speaker: "Jefe", portrait: "🕴️", mood: "angry", text: "…¿Eso qué significa?" },
              { speaker: "Tú", portrait: "😏", text: "Que no me va a ver." },
            ],
          },
          {
            label: "Sonreír y no decir nada",
            reply: "…",
            flag: "silencio",
          },
        ],
      },
    ],
    outroWin: [
      {
        speaker: "Jefe",
        portrait: "🕴️",
        text: "Semana impecable. No te vi ni una vez fuera de tu puesto. Te asciendo.",
      },
      { speaker: "Tú", portrait: "🏆", text: "Exactamente. No me vio ni una vez." },
    ],
    outroLose: [
      { speaker: "Jefe", portrait: "🕴️", mood: "angry", text: "Recursos Humanos te espera. Trae la credencial." },
    ],
  },
];

export const dayById = new Map(days.map((d) => [d.id, d]));
