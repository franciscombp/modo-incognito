// Music Builder - Reproductor simple sin Tone.js
let currentTheme = null;
let currentThemeName = null;
let isPlaying = false;
let audioContext = null;
let stepIndex = 0;
let stepTimer = null;

// Layers que son "notas" (se leen del sequencer nota a nota). "perc" no está
// aquí: es un golpe fijo de percusión que solo sube o baja de volumen, igual
// que en el soundtrack real del juego (src/game/soundtrack.js).
const NOTE_LAYERS = ["bass", "lead", "pad", "brass"];

const THEMES = {
  // Progresión pop-rock bien conocida (I-V-vi-IV, "la de las cuatro
  // canciones") en Do mayor: C - G - Am - F, un compás por acorde. Antes era
  // un riff en Sib menor con bajo caminante serio — esto es más rápido, en
  // mayor, sincopado y pensado para bailar, no para sonar a videojuego de
  // sigilo.
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
    // Trompetas de fanfarria en el contratiempo: el "¡pa-pa!" festivo de una
    // banda de pop-rock rematando cada compás, no una melodía propia.
    brass: [
      ["C5", "E5", "G5"], null, null, "G5", null, null, null, null,
      ["G4", "B4", "D5"], null, null, "D5", null, null, null, null,
      ["A4", "C5", "E5"], null, null, "E5", null, null, null, null,
      ["F4", "A4", "C5"], null, null, "C5", null, null, null, null
    ],
    mix: { bass: 0.85, lead: 0.8, pad: 0.35, perc: 0.6, brass: 0.65 },
  },
  title: {
    bpm: 110,
    steps: 8,
    bass: ["C2", null, "G2", null, "A2", null, "F2", null],
    lead: ["E4", "G4", null, "C5", "B4", null, "G4", null, "A4", "C5", null, "E5", "D5", null, "C5", null],
    pad: [["C3", "E3", "G3"], null, null, null, ["A2", "C3", "E3"], null, null, null],
    brass: [null, null, null, null, null, null, null, null],
    mix: { bass: 0.6, lead: 0.65, pad: 0.25, perc: 0, brass: 0 },
  },
  calm: {
    bpm: 118,
    steps: 8,
    bass: ["C2", null, "E2", null, "G2", null, "E2", null],
    lead: ["C5", null, "E5", "D5", null, "C5", null, "G4", "A4", null, "C5", "B4", null, "A4", null, "G4"],
    pad: [],
    brass: [],
    mix: { bass: 0.55, lead: 0.6, pad: 0, perc: 0, brass: 0 },
  },
  tense: {
    bpm: 118,
    steps: 8,
    bass: ["C2", "C2", "Eb2", null, "G2", "G2", "Ab2", null],
    lead: ["C5", null, "Eb5", "D5", null, "C5", null, "G4", "Ab4", null, "C5", "B4", null, "Bb4", null, "G4"],
    pad: [["C3", "Eb3", "G3"], null, null, null, null, null, null, null],
    brass: [],
    mix: { bass: 0.6, lead: 0.55, pad: 0.4, perc: 0.2, brass: 0 },
  },
  chase: {
    bpm: 150,
    steps: 8,
    bass: ["C2", "C2", "C2", "C2", "Bb1", "Bb1", "G1", "G1"],
    lead: ["C5", "Eb5", "F5", "G5", "F5", "Eb5", "C5", "D5", "Bb4", "D5", "Eb5", "F5", "Eb5", "D5", "Bb4", "C5"],
    pad: [["C3", "Eb3", "G3"], null, null, null, ["Bb2", "D3", "F3"], null, null, null],
    // La persecución también se gana a fanfarrias: golpes de metal marcando
    // cada mitad del compás, más densos que en "main".
    brass: [
      ["C5", "Eb5", "G5"], null, null, null, ["Bb4", "D5", "F5"], null, null, null,
      ["C5", "Eb5", "G5"], null, null, null, ["Bb4", "D5", "F5"], null, null, null,
    ],
    mix: { bass: 0.85, lead: 0.85, pad: 0.35, perc: 0.65, brass: 0.55 },
  },
  crossing: {
    bpm: 132,
    steps: 8,
    bass: ["C2", null, "C2", null, "F2", null, "G2", null],
    lead: ["C5", "C5", null, "Eb5", "D5", "D5", null, "C5", "F5", "F5", null, "Eb5", "D5", null, "G4", null],
    pad: [],
    brass: [],
    mix: { bass: 0.65, lead: 0.7, pad: 0, perc: 0.35, brass: 0 },
  },
};

// Escala cromática con la misma ortografía (sostenidos/bemoles) que usan los
// patrones de arriba, en orden — el índice ES el semitono dentro de la
// octava. Sirve tanto para las flechitas de semitono como para calcular la
// frecuencia sin depender de una tabla fija por nota.
const NOTE_ORDER = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

function parseNote(note) {
  const m = /^([A-G](?:#|b)?)(-?\d+)$/.exec(note);
  if (!m) return null;
  const [, name, octave] = m;
  const idx = NOTE_ORDER.indexOf(name);
  if (idx < 0) return null;
  return { idx, octave: parseInt(octave, 10) };
}

/** C0 = 16.3516 Hz (afinación estándar, A4 = 440); de ahí sale cualquier nota
 * por fórmula, así que subir/bajar de semitono nunca necesita una tabla. */
function noteToFreq(note) {
  const parsed = parseNote(note);
  if (!parsed) return null;
  const semitoneFromC0 = parsed.octave * 12 + parsed.idx;
  return 16.3516 * Math.pow(2, semitoneFromC0 / 12);
}

/** Sube (delta=1) o baja (delta=-1) una nota o acorde un semitono. */
function shiftSemitone(note, delta) {
  if (Array.isArray(note)) return note.map((n) => shiftSemitone(n, delta));
  const parsed = parseNote(note);
  if (!parsed) return note;
  const abs = parsed.octave * 12 + parsed.idx + delta;
  const octave = Math.floor(abs / 12);
  const idx = ((abs % 12) + 12) % 12;
  return `${NOTE_ORDER[idx]}${octave}`;
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// Un timbre por capa, no un tono sinusoidal genérico para todo: el bajo es
// triangular y grave, el lead más brillante, el pad se sostiene, y las
// trompetas usan diente de sierra con un ataque duro — lo que de verdad
// distingue una fanfarria de un pitido.
const TIMBRES = {
  bass: { type: "triangle", attack: 0.005, decay: 0.15, gain: 0.22 },
  lead: { type: "square", attack: 0.005, decay: 0.22, gain: 0.14 },
  pad: { type: "sine", attack: 0.08, decay: 0.5, gain: 0.1 },
  brass: { type: "sawtooth", attack: 0.008, decay: 0.28, gain: 0.16 },
};

function playNote(freq, duration, layer, volume) {
  if (!freq || volume <= 0) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const timbre = TIMBRES[layer] ?? TIMBRES.lead;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  osc.type = timbre.type;
  const peak = timbre.gain * volume;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), now + timbre.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, timbre.decay + timbre.attack));

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.05);
}

function playPercussion(volume) {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 0.05;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25 * volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  noise.connect(gain);
  gain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + 0.06);
}

/** Un paso del bucle: toca la nota de cada capa activa en este instante y
 * marca visualmente en qué columna del secuenciador va la reproducción. */
function tick() {
  if (!currentTheme) return;
  const maxLen = Math.max(
    ...NOTE_LAYERS.map((l) => currentTheme[l]?.length || 0),
    currentTheme.steps || 8
  );
  const i = stepIndex % maxLen;
  const stepDuration = (60 / currentTheme.bpm) * 0.5; // corchea

  NOTE_LAYERS.forEach((layer) => {
    const enabled = document.getElementById(`layer-${layer}`)?.checked;
    if (!enabled) return;
    const pattern = currentTheme[layer];
    if (!pattern || !pattern.length) return;
    const note = pattern[i % pattern.length];
    if (note == null) return;
    const volume = currentTheme.mix?.[layer] ?? 0.5;
    if (Array.isArray(note)) {
      note.forEach((n) => playNote(noteToFreq(n), stepDuration, layer, volume));
    } else {
      playNote(noteToFreq(note), stepDuration, layer, volume);
    }
  });

  if (document.getElementById("layer-perc")?.checked) {
    playPercussion(currentTheme.mix?.perc ?? 0);
  }

  highlightStep(i);
  stepIndex++;
}

function highlightStep(i) {
  document.querySelectorAll(".step").forEach((el) => {
    el.classList.toggle("playing", Number(el.dataset.index) === i);
  });
}

function clearHighlight() {
  document.querySelectorAll(".step.playing").forEach((el) => el.classList.remove("playing"));
}

function startLoop() {
  if (!currentTheme) return;
  stopTimerOnly();
  stepIndex = 0;
  isPlaying = true;
  const stepMs = (60 / currentTheme.bpm) * 0.5 * 1000;
  tick();
  stepTimer = setInterval(tick, stepMs);
  updateUI();
  toast("▶ Reproduciendo en bucle…");
  document.getElementById("playing-indicator").classList.remove("hidden");
}

function stopTimerOnly() {
  if (stepTimer) {
    clearInterval(stepTimer);
    stepTimer = null;
  }
}

function stopPlayback() {
  isPlaying = false;
  stopTimerOnly();
  clearHighlight();
  document.getElementById("playing-indicator").classList.add("hidden");
  updateUI();
}

function renderSequencer() {
  const seq = document.getElementById("sequencer");
  seq.innerHTML = "";

  if (!currentTheme) return;

  NOTE_LAYERS.forEach((layer) => {
    const pattern = currentTheme[layer];
    if (!pattern || !pattern.length) return;

    const div = document.createElement("div");
    div.className = "layer-track";

    const name = document.createElement("div");
    name.className = "layer-name";
    name.textContent = layer.toUpperCase();
    div.appendChild(name);

    const grid = document.createElement("div");
    grid.className = "step-grid";

    pattern.forEach((note, i) => {
      const step = document.createElement("div");
      step.className = "step";
      step.dataset.index = String(i);

      const label = document.createElement("div");
      label.className = "step-label";

      if (note === null) {
        step.classList.add("null");
        label.textContent = "∅";
      } else if (Array.isArray(note)) {
        step.classList.add("chord");
        label.textContent = note.join(" ");
      } else {
        label.textContent = note;
      }
      step.appendChild(label);

      // Flechitas de semitono: solo tienen sentido si hay una nota o acorde
      // que subir/bajar, no sobre un silencio.
      if (note !== null) {
        const arrows = document.createElement("div");
        arrows.className = "step-arrows";
        const up = document.createElement("button");
        up.className = "step-arrow";
        up.type = "button";
        up.textContent = "▲";
        up.title = "Subir un semitono";
        up.addEventListener("click", (e) => {
          e.stopPropagation();
          currentTheme[layer][i] = shiftSemitone(currentTheme[layer][i], 1);
          renderSequencer();
        });
        const down = document.createElement("button");
        down.className = "step-arrow";
        down.type = "button";
        down.textContent = "▼";
        down.title = "Bajar un semitono";
        down.addEventListener("click", (e) => {
          e.stopPropagation();
          currentTheme[layer][i] = shiftSemitone(currentTheme[layer][i], -1);
          renderSequencer();
        });
        arrows.appendChild(up);
        arrows.appendChild(down);
        step.appendChild(arrows);
      }

      label.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = label.textContent === "∅" ? "" : label.textContent;
        input.maxLength = 20;

        input.onblur = () => {
          const val = input.value.trim();
          if (val === "") {
            currentTheme[layer][i] = null;
          } else if (val.startsWith("[") && val.endsWith("]")) {
            try {
              currentTheme[layer][i] = JSON.parse(val);
            } catch {
              /* deja la nota como estaba si el JSON del acorde es inválido */
            }
          } else {
            currentTheme[layer][i] = val;
          }
          renderSequencer();
        };

        input.onkeydown = (e) => {
          if (e.key === "Enter") input.blur();
          if (e.key === "Escape") renderSequencer();
        };

        label.textContent = "";
        label.appendChild(input);
        input.focus();
        input.select();
      });

      grid.appendChild(step);
    });

    div.appendChild(grid);
    seq.appendChild(div);
  });
}

function updateUI() {
  const hasTheme = !!currentThemeName;
  document.getElementById("play-theme").disabled = !hasTheme || isPlaying;
  document.getElementById("export-theme").disabled = !hasTheme;
  document.getElementById("stop-play").disabled = !isPlaying;
  document.getElementById("clear-theme").disabled = !hasTheme;

  document.getElementById("bpm").disabled = !hasTheme;
  document.getElementById("steps").disabled = !hasTheme;

  ["bass", "lead", "pad", "perc", "brass"].forEach((layer) => {
    document.getElementById(`layer-${layer}`).disabled = !hasTheme;
    document.getElementById(`mix-${layer}`).disabled = !hasTheme;
  });

  if (hasTheme) {
    document.getElementById("bpm").value = currentTheme.bpm || 120;
    document.getElementById("steps").value = currentTheme.steps || 8;

    ["bass", "lead", "pad", "perc", "brass"].forEach((layer) => {
      const val = currentTheme.mix?.[layer] || 0;
      document.getElementById(`mix-${layer}`).value = val;
      document.getElementById(`mix-${layer}-val`).textContent = val.toFixed(2);
    });

    renderSequencer();
  }
}

function loadTheme(name) {
  const theme = THEMES[name];
  if (!theme) return;

  // Si ya estaba sonando un tema, cambiar de selector NO debe cortar el
  // audio: el juego real cambia de ánimo (calm/tense/chase...) sin silencio
  // de por medio, y este builder tiene que poder simular justo eso — el
  // bucle sigue, solo cambian bpm y patrones al vuelo.
  const wasPlaying = isPlaying;

  currentThemeName = name;
  currentTheme = JSON.parse(JSON.stringify(theme));

  document.getElementById("info-title").textContent = `Tema: ${name}`;
  document.getElementById("info-content").innerHTML = `
    <strong>BPM:</strong> ${theme.bpm}<br/>
    <strong>Pasos:</strong> ${theme.steps}<br/>
    <strong>Capas:</strong> ${[
      theme.bass?.length ? "Bass" : null,
      theme.lead?.length ? "Lead" : null,
      theme.pad?.length ? "Pad" : null,
      theme.brass?.length ? "Brass" : null,
    ]
      .filter(Boolean)
      .join(", ")}<br/>
    <br/>
    Haz clic en los pasos para editar notas. Las flechitas ▲▼ suben o bajan
    de semitono sin tener que reescribir la nota.
  `;

  updateUI();
  if (wasPlaying) startLoop();
  else stopPlayback();
}

function exportJSON() {
  if (!currentTheme || !currentThemeName) return;

  const payload = {
    name: currentThemeName,
    ...currentTheme,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `theme-${currentThemeName}.json`;
  a.click();
  URL.revokeObjectURL(url);

  toast(`Tema "${currentThemeName}" exportado`);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const { name, ...rest } = data;

      if (!rest.bpm || !rest.bass) {
        toast("JSON inválido");
        return;
      }

      currentThemeName = name || "imported";
      currentTheme = rest;
      document.getElementById("theme-select").value = "";

      updateUI();
      stopPlayback();
      toast(`Tema "${name}" importado`);
    } catch (err) {
      toast(`Error: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}

// Event listeners
document.getElementById("theme-select").addEventListener("change", (e) => {
  if (e.target.value) loadTheme(e.target.value);
});

document.getElementById("import-theme").addEventListener("change", (e) => {
  if (e.target.files[0]) importJSON(e.target.files[0]);
  e.target.value = "";
});

document.getElementById("play-theme").addEventListener("click", () => {
  if (!currentTheme) {
    toast("Selecciona un tema primero");
    return;
  }
  startLoop();
});

document.getElementById("stop-play").addEventListener("click", () => {
  stopPlayback();
  toast("⏹ Detenido");
});

document.getElementById("export-theme").addEventListener("click", exportJSON);

document.getElementById("clear-theme").addEventListener("click", () => {
  if (confirm("¿Borrar tema actual?")) {
    currentTheme = null;
    currentThemeName = null;
    stopPlayback();
    updateUI();
    document.getElementById("sequencer").innerHTML = "";
    document.getElementById("info-content").innerHTML = "";
    toast("🗑 Tema limpiado");
  }
});

["bpm", "steps"].forEach((id) => {
  document.getElementById(id).addEventListener("change", (e) => {
    if (currentTheme) {
      currentTheme[id] = parseInt(e.target.value, 10);
      // El tempo cambió: si está sonando, el bucle debe reprogramarse con el
      // intervalo nuevo en vez de seguir al ritmo viejo.
      if (isPlaying) startLoop();
    }
  });
});

["bass", "lead", "pad", "perc", "brass"].forEach((layer) => {
  document.getElementById(`mix-${layer}`).addEventListener("input", (e) => {
    if (currentTheme?.mix) {
      currentTheme.mix[layer] = parseFloat(e.target.value);
      document.getElementById(`mix-${layer}-val`).textContent = parseFloat(e.target.value).toFixed(2);
    }
  });
});

// Startup
updateUI();
