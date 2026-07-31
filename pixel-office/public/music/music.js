// Music Builder - Reproductor simple sin Tone.js
let currentTheme = null;
let currentThemeName = null;
let isPlaying = false;
let audioContext = null;
let oscillators = [];

const THEMES = {
  main: {
    bpm: 135,
    steps: 8,
    bass: [
      "Bb1", "Bb2", "Bb1", "Bb2", "Bb1", "Bb2", "Bb1", "Bb2",
      "C2", "C3", "C2", "C3", "C2", "C3", "C2", "C3",
      "Bb1", "Bb2", "Bb1", "Bb2", "Bb1", "Bb2", "Bb1", "Bb2",
      "Ab1", "Ab2", "Ab1", "Ab2", "Ab1", "Ab2", "Ab1", "Ab2"
    ],
    lead: [
      null, "F4", null, "F4", "F4", null, "F4", null,
      null, "G4", null, "G4", "G4", null, "G4", null,
      null, "F4", null, "F4", "F4", null, "F4", null,
      null, "Eb4", null, "Eb4", "Eb4", null, "Eb4", null
    ],
    pad: [
      ["Bb3", "D4", "F4"], null, null, null, null, null, null, null,
      ["C4", "Eb4", "G4"], null, null, null, null, null, null, null,
      ["Bb3", "D4", "F4"], null, null, null, null, null, null, null,
      ["Ab3", "C4", "Eb4"], null, null, null, null, null, null, null
    ],
    mix: { bass: 0.8, lead: 0.75, pad: 0.4, perc: 0.5 },
  },
  title: {
    bpm: 104,
    steps: 8,
    bass: ["C2", null, "G2", null, "A2", null, "F2", null],
    lead: ["E4", "G4", null, "C5", "B4", null, "G4", null, "A4", "C5", null, "E5", "D5", null, "C5", null],
    pad: [["C3", "E3", "G3"], null, null, null, ["A2", "C3", "E3"], null, null, null],
    mix: { bass: 0.6, lead: 0.65, pad: 0.25, perc: 0 },
  },
  calm: {
    bpm: 112,
    steps: 8,
    bass: ["C2", null, "E2", null, "G2", null, "E2", null],
    lead: ["C5", null, "E5", "D5", null, "C5", null, "G4", "A4", null, "C5", "B4", null, "A4", null, "G4"],
    pad: [],
    mix: { bass: 0.55, lead: 0.6, pad: 0, perc: 0 },
  },
  tense: {
    bpm: 118,
    steps: 8,
    bass: ["C2", "C2", "Eb2", null, "G2", "G2", "Ab2", null],
    lead: ["C5", null, "Eb5", "D5", null, "C5", null, "G4", "Ab4", null, "C5", "B4", null, "Bb4", null, "G4"],
    pad: [["C3", "Eb3", "G3"], null, null, null, null, null, null, null],
    mix: { bass: 0.6, lead: 0.55, pad: 0.4, perc: 0.2 },
  },
  chase: {
    bpm: 150,
    steps: 8,
    bass: ["C2", "C2", "C2", "C2", "Bb1", "Bb1", "G1", "G1"],
    lead: ["C5", "Eb5", "F5", "G5", "F5", "Eb5", "C5", "D5", "Bb4", "D5", "Eb5", "F5", "Eb5", "D5", "Bb4", "C5"],
    pad: [["C3", "Eb3", "G3"], null, null, null, ["Bb2", "D3", "F3"], null, null, null],
    mix: { bass: 0.85, lead: 0.85, pad: 0.35, perc: 0.65 },
  },
  crossing: {
    bpm: 132,
    steps: 8,
    bass: ["C2", null, "C2", null, "F2", null, "G2", null],
    lead: ["C5", "C5", null, "Eb5", "D5", "D5", null, "C5", "F5", "F5", null, "Eb5", "D5", null, "G4", null],
    pad: [],
    mix: { bass: 0.65, lead: 0.7, pad: 0, perc: 0.35 },
  },
};

// Notas MIDI
const NOTE_FREQS = {
  "C1": 32.70, "C#1": 34.65, "D1": 36.71, "Eb1": 38.89, "E1": 41.20, "F1": 43.65,
  "F#1": 46.25, "G1": 49.00, "Ab1": 51.91, "A1": 55.00, "Bb1": 58.27, "B1": 61.74,
  "C2": 65.41, "C#2": 69.30, "D2": 73.42, "Eb2": 77.78, "E2": 82.41, "F2": 87.31,
  "F#2": 92.50, "G2": 98.00, "Ab2": 103.83, "A2": 110.00, "Bb2": 116.54, "B2": 123.47,
  "C3": 130.81, "C#3": 138.59, "D3": 146.83, "Eb3": 155.56, "E3": 164.81, "F3": 174.61,
  "F#3": 185.00, "G3": 196.00, "Ab3": 207.65, "A3": 220.00, "Bb3": 246.94, "B3": 246.94,
  "C4": 261.63, "C#4": 277.18, "D4": 293.66, "Eb4": 311.13, "E4": 329.63, "F4": 349.23,
  "F#4": 369.99, "G4": 392.00, "Ab4": 415.30, "A4": 440.00, "Bb4": 466.16, "B4": 493.88,
  "C5": 523.25, "C#5": 554.37, "D5": 587.33, "Eb5": 622.25, "E5": 659.25, "F5": 698.46,
  "F#5": 739.99, "G5": 783.99, "Ab5": 830.61, "A5": 880.00, "Bb5": 932.33, "B5": 987.77,
  "C6": 1046.50,
};

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playNote(freq, duration = 0.5) {
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function playTheme(theme) {
  if (!theme || !theme.bass) return;

  toast("▶ Reproduciendo tema…");
  isPlaying = true;

  // Duración por nota en segundos (basado en BPM)
  const beatDuration = (60 / theme.bpm) * 0.5; // semicorchea

  // Reproducir simplificado: solo bass
  if (theme.bass && theme.bass.length) {
    theme.bass.forEach((note, i) => {
      if (note && NOTE_FREQS[note]) {
        setTimeout(() => {
          if (isPlaying) playNote(NOTE_FREQS[note], beatDuration);
        }, i * beatDuration * 1000);
      }
    });
  }

  isPlaying = true;
  updateUI();
}

function stopPlayback() {
  isPlaying = false;
  const ctx = getAudioContext();
  if (ctx) {
    ctx.close();
    audioContext = null;
  }
  updateUI();
  toast("⏹ Detenido");
}

function renderSequencer() {
  const seq = document.getElementById("sequencer");
  seq.innerHTML = "";

  if (!currentTheme) return;

  ["bass", "lead", "pad"].forEach(layer => {
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

      if (note === null) {
        step.classList.add("null");
        step.textContent = "∅";
      } else if (Array.isArray(note)) {
        step.classList.add("chord");
        step.textContent = note.join(" ");
      } else {
        step.textContent = note;
      }

      step.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "text";
        input.value = step.textContent === "∅" ? "" : step.textContent;
        input.maxLength = 20;

        input.onblur = () => {
          const val = input.value.trim();
          if (val === "") {
            currentTheme[layer][i] = null;
          } else if (val.startsWith("[") && val.endsWith("]")) {
            try {
              currentTheme[layer][i] = JSON.parse(val);
            } catch {}
          } else {
            currentTheme[layer][i] = val;
          }
          renderSequencer();
        };

        input.onkeydown = (e) => {
          if (e.key === "Enter") input.blur();
          if (e.key === "Escape") renderSequencer();
        };

        step.textContent = "";
        step.appendChild(input);
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

  ["bass", "lead", "pad", "perc"].forEach(layer => {
    document.getElementById(`layer-${layer}`).disabled = !hasTheme;
    document.getElementById(`mix-${layer}`).disabled = !hasTheme;
  });

  if (hasTheme) {
    document.getElementById("bpm").value = currentTheme.bpm || 120;
    document.getElementById("steps").value = currentTheme.steps || 8;

    ["bass", "lead", "pad", "perc"].forEach(layer => {
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
    ]
      .filter(Boolean)
      .join(", ")}<br/>
    <br/>
    Haz clic en los pasos para editar notas.
  `;

  updateUI();
  stopPlayback();
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

  toast(`✓ Tema "${currentThemeName}" exportado`);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      const { name, ...rest } = data;

      if (!rest.bpm || !rest.bass) {
        toast("❌ JSON inválido");
        return;
      }

      currentThemeName = name || "imported";
      currentTheme = rest;
      document.getElementById("theme-select").value = "";

      updateUI();
      stopPlayback();
      toast(`✓ Tema "${name}" importado`);
    } catch (err) {
      toast(`❌ Error: ${err.message}`);
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
    toast("❌ Selecciona un tema primero");
    return;
  }
  playTheme(currentTheme);
});

document.getElementById("stop-play").addEventListener("click", stopPlayback);

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

["bpm", "steps"].forEach(id => {
  document.getElementById(id).addEventListener("change", (e) => {
    if (currentTheme) {
      currentTheme[id] = parseInt(e.target.value);
    }
  });
});

["bass", "lead", "pad", "perc"].forEach(layer => {
  document.getElementById(`mix-${layer}`).addEventListener("input", (e) => {
    if (currentTheme?.mix) {
      currentTheme.mix[layer] = parseFloat(e.target.value);
      document.getElementById(`mix-${layer}-val`).textContent = parseFloat(e.target.value).toFixed(2);
    }
  });
});

// Startup
updateUI();
