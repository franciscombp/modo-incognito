// Los temas del soundtrack procedural (ver soundtrack.js), en un solo lugar
// editable sin tocar el motor de audio. Cada tema es un riff corto que se
// repite en bucle — inspirado en Muse/Panic Station: groovy, sincopado,
// nunca solemne. Bajo movible, armonía rica con extensiones (7mas, 9nas).
//
// Formato de patrón: un array de pasos de octava nota. Cada paso es una nota
// ("C3", "Eb4"...), un array de notas para un acorde, o null para silencio.
// `steps` marca cuántos pasos hay por compás (normalmente 8 = corcheas en 4/4).
//
// mix: volumen relativo (0-1) de cada capa cuando este tema está activo — así
// un mismo tema puede sonar "más lleno" (persecución) o "más desnudo" (calma)
// sin tener que escribir patrones distintos para el bajo.

export const THEMES = {
  // Tema principal: funky pop-rock estilo Muse en Do mayor. Bajo sincopado
  // tipo Panic Station (no linear, con saltos), progresión Cmaj7-G6-Am7-Fmaj7
  // para más grooves. Lead melodía traviesa de pizzicato con sincopaciones.
  // Sube tempo a 145 BPM para más energía y agrega más brass puntando los breaks.
  main: {
    bpm: 145,
    steps: 8,
    bass: [
      // Cmaj7: bajo sincopado, no directo
      "C2", null, "E2", "C2", null, "G2", null, "E3",
      // G6: bajo saltarín tipo Panic Station
      "G1", "D2", null, "G2", null, "B2", "D2", null,
      // Am7: bajo oscilante
      "A1", null, "E2", "A2", null, "C2", "E2", "A2",
      // Fmaj7: bajo arpegiado suave
      "F1", "A1", null, "F2", null, "C2", "A1", "F2"
    ],
    lead: [
      // Cmaj7 melody: traviesa, sincopada
      "E4", "G4", null, "C5", null, "B4", "G4", null,
      // G6 melody: más alta, más rápida
      "D5", "B4", "G4", "D5", null, "B4", null, "G4",
      // Am7 melody: media, oscilante
      "E5", null, "A4", "C5", "E5", null, "A4", null,
      // Fmaj7 melody: desciende
      "A4", null, "F5", "C5", null, "A4", "F4", null
    ],
    pad: [
      // Acordes con septimas para más color
      ["C4", "E4", "G4", "B4"], null, null, null, null, null, null, null,
      ["G3", "B3", "D4", "F#4"], null, null, null, null, null, null, null,
      ["A3", "C4", "E4", "G4"], null, null, null, null, null, null, null,
      ["F3", "A3", "C4", "E4"], null, null, null, null, null, null, null
    ],
    brass: [
      // Puntos de brass más sincopados
      ["C5", "E5", "G5"], null, "G5", null, null, "E5", null, null,
      ["G4", "B4", "D5"], "D5", null, null, "B4", null, null, "D5",
      ["A4", "C5", "E5"], null, null, "E5", null, "C5", null, null,
      ["F4", "A4", "C5"], null, "C5", null, null, "A4", "F4", null
    ],
    string: [
      ["C3", "E3", "G3"], null, null, null, null, null, null, null,
      ["G2", "B2", "D3"], null, null, null, null, null, null, null,
      ["A2", "C3", "E3"], null, null, null, null, null, null, null,
      ["F2", "A2", "C3"], null, null, null, null, null, null, null
    ],
    guitar: [
      null, "D4", null, "A3", null, "D4", null, "A3",
      null, "G3", null, "B3", null, "G3", null, "B3"
    ],
    fx: [null, null, "C6", null, null, null, "E6", null],
    piano: [
      ["C5", "E5", "G5"], null, ["E5", "G5", "B5"], null, ["F5", "A5", "C6"], null, ["G5", "B5", "D6"], null
    ],
    organ: [
      null, "C4", null, "E4", null, "G4", null, "A4"
    ],
    choir: [["C5", "E5", "G5"], null, null, null, ["F5", "A5", "C6"], null, null, null],
    mix: { bass: 0.9, lead: 0.85, pad: 0.4, perc: 0.7, brass: 0.7, string: 0.25, guitar: 0.3, fx: 0.2, piano: 0.28, organ: 0.24, choir: 0.16 },
  },

  festive: {
    bpm: 152,
    steps: 8,
    bass: ["C2", null, "E2", null, "G2", null, "A2", null],
    lead: ["C5", "E5", "G5", "A5", "G5", "E5", "D5", "C5"],
    pad: [["C4", "E4", "G4"], null, ["A3", "C4", "E4"], null, ["F3", "A3", "C4"], null, ["G3", "B3", "D4"], null],
    brass: [["C5", "E5", "G5"], null, null, "G5", null, "E5", null, null],
    guitar: ["C4", null, "E4", null, "G4", null, "A4", null],
    string: [["C3", "E3", "G3"], null, null, null, ["F3", "A3", "C4"], null, null, null],
    fx: [null, null, "E6", null, null, null, "G6", null],
    piano: [["C4", "E4", "G4"], null, ["F4", "A4", "C5"], null, ["G4", "B4", "D5"], null, ["A4", "C5", "E5"], null],
    organ: ["C3", null, "E3", null, "G3", null, "A3", null],
    choir: [["C4", "E4", "G4"], null, null, null, ["F4", "A4", "C5"], null, null, null],
    mix: { bass: 0.8, lead: 0.75, pad: 0.35, perc: 0.55, brass: 0.7, string: 0.35, guitar: 0.4, fx: 0.3, piano: 0.34, organ: 0.22, choir: 0.18 },
  },

  // Menú de título: relajado, de sobremesa, pero con más calidez armónica.
  // Progresión Cmaj7-Am7 suave, bajo mínimo. Lead delicado tipo jazz chillout.
  // Agregamos pad para dar cuerpo sin ser denso.
  title: {
    bpm: 108,
    steps: 8,
    bass: [
      "C1", null, "E1", null, "G1", null, null, "G2",
      "A1", null, "C2", null, "E1", null, null, "A2"
    ],
    lead: [
      "E4", "G4", "C5", null, "B4", "G4", null, "E4",
      "C5", "E5", "A4", null, "G4", "E4", "D4", null,
    ],
    pad: [
      ["C3", "E3", "G3", "B3"], null, null, null, null, null, null, null,
      ["A2", "C3", "E3", "G3"], null, null, null, null, null, null, null
    ],
    string: [
      ["C2", "E2", "G2"], null, null, null, null, null, null, null,
      ["A1", "C2", "E2"], null, null, null, null, null, null, null
    ],
    mix: { bass: 0.5, lead: 0.7, pad: 0.35, perc: 0, string: 0.2 },
  },

  // Un día normal, jefe patrullando lejos: loop minimalista pero con más
  // groove. Progresión Cmaj7-Amin7 suave. Bajo con pausas, lead sobrio.
  // Pad simple para llenar sin tensar.
  calm: {
    bpm: 120,
    steps: 8,
    bass: [
      "C2", null, "E2", "C2", null, "G1", null, null,
      "A1", null, "E2", "A2", null, "C2", null, null
    ],
    lead: [
      "C5", "E4", "G4", "E5", null, "C5", "G4", null,
      "A4", "C5", "E5", null, "A4", null, "E4", null,
    ],
    pad: [["C3", "E3", "G3"], null, null, null, null, null, null, null],
    string: [["C2", "E2", "G2"], null, null, null, null, null, null, null],
    perc: [null, "perc", null, null, "perc", null, null, null],
    mix: { bass: 0.6, lead: 0.65, pad: 0.15, perc: 0.15, string: 0.15 },
  },

  // El jefe anda cerca o la sospecha sube: tenso pero groovy. Acordes menores
  // (Cm7, Ebmaj7, Gm7) con bajo sincopado que mantiene el groove. Lead
  // nervioso con saltos. Pad sostenido para crear tensión.
  tense: {
    bpm: 122,
    steps: 8,
    bass: [
      // Cm7: bajo sincopado, tenso pero movible
      "C2", "Eb2", null, "G2", "C2", null, "Bb1", null,
      // Gm7: bajo oscilante
      "G2", "Bb2", null, "D2", "G1", null, "F2", null
    ],
    lead: [
      // Cm7: lead nervioso
      "C5", "Eb5", "G4", null, "C5", "Bb4", null, "G4",
      // Gm7: lead inquieto
      "G4", "Bb4", "D5", null, "G4", "F5", null, "Bb4",
    ],
    pad: [
      ["C3", "Eb3", "G3", "Bb3"], null, null, null, null, null, null, null,
      ["G2", "Bb2", "D3", "F3"], null, null, null, null, null, null, null
    ],
    string: [
      ["C2", "Eb2", "G2"], null, null, null, null, null, null, null,
      ["G1", "Bb1", "D2"], null, null, null, null, null, null, null
    ],
    perc: [
      "perc", null, "perc", null, "perc", null, "perc", null,
      "perc", null, "perc", null, "perc", null, null, null
    ],
    mix: { bass: 0.75, lead: 0.65, pad: 0.5, perc: 0.35, string: 0.35 },
  },

  // Cruzar la avenida: staccato y saltarina tipo videojuego pero con groove.
  // El semáforo lleva el pulso. Lead rápido y saltarín, bajo sincopado,
  // mucha percusión para el efecto del tráfico.
  crossing: {
    bpm: 138,
    steps: 8,
    bass: [
      "C2", "C2", null, "Eb2", "F2", "F2", null, "G2",
      "C2", "C2", null, "Eb2", "F2", null, "G2", null
    ],
    lead: [
      "C5", "C5", "Eb5", null, "D5", "D5", "C5", null,
      "F5", "F5", "Eb5", null, "D5", null, "G4", "G4",
    ],
    pad: [["C3", "Eb3", "G3"], null, null, null, null, null, null, null],
    string: [["C2", "Eb2", "G2"], null, null, null, null, null, null, null],
    perc: [
      "perc", "perc", null, "perc", "perc", "perc", null, "perc",
      "perc", "perc", null, "perc", "perc", null, "perc", "perc"
    ],
    mix: { bass: 0.7, lead: 0.8, pad: 0.2, perc: 0.65, string: 0.25 },
  },

  // Persecución activa: FULL PANIC STATION. Tempo 160 BPM, bajo sincopado
  // tipo Muse con mucha energía, lead rápido y errático, pad sostenido,
  // percusión en cada beat. La energía de un sitcom llegando al clímax pero
  // con groove real, no pánico de terror.
  chase: {
    bpm: 160,
    steps: 8,
    bass: [
      // Cm: bajo loco y sincopado
      "C2", "C2", "Eb2", null, "G1", "C2", null, "Bb1",
      // Bbmaj7: bajo errático
      "Bb1", "Bb1", "D2", null, "F2", "Bb2", null, "G1"
    ],
    lead: [
      // Cm: lead frenético
      "C5", "Eb5", "G5", "Eb5", "C5", "G4", "Eb5", "C5",
      // Bbmaj7: lead alto y rápido
      "Bb5", "D5", "F5", "D5", "Bb5", "F4", "D5", "Bb4",
    ],
    pad: [
      ["C3", "Eb3", "G3", "Bb3"], null, null, null, null, null, null, null,
      ["Bb2", "D3", "F3", "A3"], null, null, null, null, null, null, null
    ],
    string: [
      ["C2", "Eb2", "G2"], null, null, null, null, null, null, null,
      ["Bb1", "D2", "F2"], null, null, null, null, null, null, null
    ],
    perc: [
      "perc", "perc", "perc", null, "perc", "perc", null, "perc",
      "perc", "perc", "perc", null, "perc", "perc", "perc", null
    ],
    brass: [
      "C5", null, null, "G5", null, "C5", null, null,
      "Bb4", null, null, "F5", null, "Bb4", null, null
    ],
    mix: { bass: 0.95, lead: 0.9, pad: 0.5, perc: 0.8, brass: 0.6, string: 0.4 },
  },

  // Stinger de victoria/derrota: secuencias rápidas y impactantes.
  // Victoria: resolución mayor brillante. Derrota: caída oscura y definitiva.
  victory: {
    notes: ["C5", "E5", "G5", "E5", "C6", "G5", "E5", "C6"],
    noteDuration: 0.12,
    gap: 0.06
  },
  defeat: {
    notes: ["C4", "B3", "Bb3", "A3", "G3", "F3", "Eb3", "C3"],
    noteDuration: 0.18,
    gap: 0.1
  },
};
