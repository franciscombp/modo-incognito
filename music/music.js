import * as Tone from "https://cdn.jsdelivr.net/npm/tone@14/build/Tone.js";

const BASE = import.meta.env.BASE_URL ?? "/";

// Tema actual cargado en el editor
let currentTheme = null;
let currentThemeName = null;
let isPlaying = false;
let currentSequences = { bass: null, lead: null, pad: null };
let synths = {};

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

async function initSynths() {
  synths.bass = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.2, release: 0.2 },
  }).toDestination();

  synths.lead = new Tone.PluckSynth({ attackNoise: 0.6, dampening: 3200, resonance: 0.82 }).toDestination();

  synths.pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 0.4, decay: 0.3, sustain: 0.6, release: 1.2 },
  }).toDestination();
}

async function startAudio() {
  if (Tone.Synth.maxPolyphony) return; // ya inició
  await Tone.start();
  await initSynths();
  if (Tone.Transport.state !== "started") Tone.Transport.start();
}

function stopSequences() {
  Object.values(currentSequences).forEach(seq => seq?.dispose());
  currentSequences = { bass: null, lead: null, pad: null };
  Tone.Transport.cancel();
}

function makeSequence(pattern, steps, synth) {
  if (!pattern || !pattern.length) return null;
  return new Tone.Loop((time) => {
    pattern.forEach((note, i) => {
      if (note == null) return;
      const stepTime = time + (i / pattern.length) * 0.5; // duración del patrón
      synth.triggerAttackRelease(note, "8n", stepTime);
    });
  }, "4n").start(0);
}

function playTheme(theme) {
  stopSequences();
  if (!theme) return;

  Tone.Transport.bpm.rampTo(theme.bpm, 0.6);

  if (theme.bass?.length) {
    currentSequences.bass = makeSequence(theme.bass, theme.steps, synths.bass);
  }
  if (theme.lead?.length) {
    currentSequences.lead = makeSequence(theme.lead, theme.steps, synths.lead);
  }
  if (theme.pad?.length) {
    currentSequences.pad = makeSequence(theme.pad, theme.steps, synths.pad);
  }

  isPlaying = true;
  updateUI();
}

function stopPlayback() {
  stopSequences();
  isPlaying = false;
  updateUI();
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
            } catch {
              // ignorar JSON inválido
            }
          } else {
            currentTheme[layer][i] = val;
          }
          renderSequencer();
          if (isPlaying) playTheme(currentTheme);
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
  currentTheme = JSON.parse(JSON.stringify(theme)); // deep clone

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
    Haz clic en los pasos para editar notas. Usa null para silencio, o ["Bb3", "D4"] para acordes.
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
        toast("❌ JSON inválido: necesita bpm, bass, lead, pad");
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
  e.target.value = ""; // reset
});

document.getElementById("play-theme").addEventListener("click", async () => {
  await startAudio();
  playTheme(currentTheme);
  toast("▶ Reproduciendo…");
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
document.addEventListener("click", startAudio, { once: true });
document.addEventListener("keydown", startAudio, { once: true });
updateUI();
