// Los temas del soundtrack procedural (ver soundtrack.js), en un solo lugar
// editable sin tocar el motor de audio. Cada tema es un riff corto que se
// repite en bucle — el ánimo general es el de un mockumentary de oficina al
// estilo "The Office": bajo caminante + una melodía traviesa de pizzicato,
// nunca solemne.
//
// Formato de patrón: un array de pasos de octava nota. Cada paso es una nota
// ("C3", "Eb4"...), un array de notas para un acorde, o null para silencio.
// `steps` marca cuántos pasos hay por compás (normalmente 8 = corcheas en 4/4).
//
// mix: volumen relativo (0-1) de cada capa cuando este tema está activo — así
// un mismo tema puede sonar "más lleno" (persecución) o "más desnudo" (calma)
// sin tener que escribir patrones distintos para el bajo.

export const THEMES = {
  // Tema principal: pop-rock bailable en Do mayor, la progresión I-V-vi-IV
  // (C-G-Am-F) más reconocible del género, un compás por acorde. Antes era
  // un riff serio en Sib menor con bajo caminante — esto es más rápido
  // (140 BPM), en modo mayor, y con trompetas de fanfarria puntuando el
  // contratiempo para que suene a fiesta, no a sigilo.
  main: {
    bpm: 140,
    steps: 8,
    bass: [
      "C2", "C3", "C2", "C3", "C2", "C3", "C2", "C3",
      "G1", "G2", "G1", "G2", "G1", "G2", "G1", "G2",
      "A1", "A2", "A1", "A2", "A1", "A2", "A1", "A2",
      "F1", "F2", "F1", "F2", "F1", "F2", "F1", "F2"
    ],
    lead: [
      null, "G4", null, "E4", "G4", null, "E4", null,
      null, "D5", null, "B4", "D5", null, "B4", null,
      null, "E5", null, "C5", "E5", null, "C5", null,
      null, "C5", null, "A4", "C5", null, "A4", null
    ],
    pad: [
      ["C4", "E4", "G4"], null, null, null, null, null, null, null,
      ["G3", "B3", "D4"], null, null, null, null, null, null, null,
      ["A3", "C4", "E4"], null, null, null, null, null, null, null,
      ["F3", "A3", "C4"], null, null, null, null, null, null, null
    ],
    brass: [
      ["C5", "E5", "G5"], null, null, "G5", null, null, null, null,
      ["G4", "B4", "D5"], null, null, "D5", null, null, null, null,
      ["A4", "C5", "E5"], null, null, "E5", null, null, null, null,
      ["F4", "A4", "C5"], null, null, "C5", null, null, null, null
    ],
    mix: { bass: 0.85, lead: 0.8, pad: 0.35, perc: 0.6, brass: 0.65 },
  },

  // Menú de título: relajado, de sobremesa, pero con algo más de brío que
  // antes — sigue sin ser la fiesta del tema principal, pero tampoco es
  // elevador.
  title: {
    bpm: 110,
    steps: 8,
    bass: ["C2", null, "G2", null, "A2", null, "F2", null],
    lead: [
      "E4", "G4", null, "C5", "B4", null, "G4", null,
      "A4", "C5", null, "E5", "D5", null, "C5", null,
    ],
    pad: [["C3", "E3", "G3"], null, null, null, ["A2", "C3", "E3"], null, null, null],
    mix: { bass: 0.6, lead: 0.65, pad: 0.25, perc: 0 },
  },

  // Un día normal, jefe patrullando lejos: el riff base "de oficina", con
  // algo más de pulso que antes.
  calm: {
    bpm: 118,
    steps: 8,
    bass: ["C2", null, "E2", null, "G2", null, "E2", null],
    lead: [
      "C5", null, "E5", "D5", null, "C5", null, "G4",
      "A4", null, "C5", "B4", null, "A4", null, "G4",
    ],
    pad: [],
    mix: { bass: 0.55, lead: 0.6, pad: 0, perc: 0 },
  },

  // El jefe anda cerca o la sospecha sube: el mismo riff se tensa con un
  // colchón sostenido debajo y un poco de percusión discreta.
  tense: {
    bpm: 118,
    steps: 8,
    bass: ["C2", "C2", "Eb2", null, "G2", "G2", "Ab2", null],
    lead: [
      "C5", null, "Eb5", "D5", null, "C5", null, "G4",
      "Ab4", null, "C5", "B4", null, "Bb4", null, "G4",
    ],
    pad: [["C3", "Eb3", "G3"], null, null, null, null, null, null, null],
    mix: { bass: 0.6, lead: 0.55, pad: 0.4, perc: 0.2 },
  },

  // Cruzar la avenida: staccato y saltarina, como si el semáforo mismo
  // llevara el pulso — nerviosa pero todavía cómica, no de persecución.
  crossing: {
    bpm: 132,
    steps: 8,
    bass: ["C2", null, "C2", null, "F2", null, "G2", null],
    lead: [
      "C5", "C5", null, "Eb5", "D5", "D5", null, "C5",
      "F5", "F5", null, "Eb5", "D5", null, "G4", null,
    ],
    pad: [],
    mix: { bass: 0.65, lead: 0.7, pad: 0, perc: 0.35 },
  },

  // Persecución activa: tempo arriba, bajo insistente en corcheas, perc
  // marcando cada pulso — la energía de una sitcom llegando al clímax del
  // cold open, no una banda sonora de terror.
  chase: {
    bpm: 150,
    steps: 8,
    bass: ["C2", "C2", "C2", "C2", "Bb1", "Bb1", "G1", "G1"],
    lead: [
      "C5", "Eb5", "F5", "G5", "F5", "Eb5", "C5", "D5",
      "Bb4", "D5", "Eb5", "F5", "Eb5", "D5", "Bb4", "C5",
    ],
    pad: [["C3", "Eb3", "G3"], null, null, null, ["Bb2", "D3", "F3"], null, null, null],
    mix: { bass: 0.85, lead: 0.85, pad: 0.35, perc: 0.65 },
  },

  // Stinger de victoria/derrota: no son bucles, un puñado de notas sueltas
  // que toca playStinger() y ya. Se leen de arriba a abajo.
  victory: { notes: ["C5", "E5", "G5", "C6"], noteDuration: 0.16, gap: 0.1 },
  defeat: { notes: ["G4", "F4", "D4", "C4"], noteDuration: 0.22, gap: 0.14 },
};
