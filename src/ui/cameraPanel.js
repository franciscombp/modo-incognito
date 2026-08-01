import {
  CAMERA_LIMITS,
  setCameraSettings,
  resetCameraSettings,
  subscribeCameraSettings,
  cameraSettingsToCode,
} from "../scene/cameraSettings.js";

// The camera workbench: sliders for every framing parameter, a live preview
// (the game keeps rendering behind the panel) and a copy button that puts a
// paste-ready CAMERA_PRESET block on the clipboard.
//
// The point is that the framing is yours to decide: move it until it looks
// right, copy the block, and it becomes the new default in config.js.

export function createCameraPanel() {
  const root = document.createElement("div");
  root.className = "cam-panel";

  const rows = new Map();

  const grid = document.createElement("div");
  grid.className = "cam-grid";
  root.appendChild(grid);

  for (const [key, lim] of Object.entries(CAMERA_LIMITS)) {
    const row = document.createElement("label");
    row.className = "cam-row";

    const head = document.createElement("div");
    head.className = "cam-row-head";
    const name = document.createElement("span");
    name.textContent = lim.label;
    const value = document.createElement("output");
    value.className = "cam-value";
    head.append(name, value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = lim.min;
    input.max = lim.max;
    input.step = lim.step;
    input.className = "cam-slider";
    input.addEventListener("input", () => setCameraSettings({ [key]: Number(input.value) }));

    row.append(head, input);
    grid.appendChild(row);
    rows.set(key, { input, value, lim });
  }

  const hint = document.createElement("p");
  hint.className = "cam-hint";
  hint.innerHTML =
    "Arrastra con el <b>botón derecho</b> (o con <b>dos dedos</b>) sobre el escenario para orbitar. " +
    "Cuando te guste, copia los parámetros y pégalos en <code>src/scene/config.js</code>.";
  root.appendChild(hint);

  const code = document.createElement("pre");
  code.className = "cam-code";
  root.appendChild(code);

  const actions = document.createElement("div");
  actions.className = "cam-actions";
  root.appendChild(actions);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "px-btn px-btn-primary";
  copyBtn.textContent = "Copiar parámetros";
  copyBtn.addEventListener("click", async () => {
    const text = cameraSettingsToCode();
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Clipboard API needs a secure context and permission; fall back to
      // selecting the block so the player can copy it by hand.
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    copyBtn.textContent = ok ? "¡Copiado!" : "Selecciona y copia ↑";
    setTimeout(() => (copyBtn.textContent = "Copiar parámetros"), 1800);
  });
  actions.appendChild(copyBtn);

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "px-btn";
  resetBtn.textContent = "Restablecer";
  resetBtn.addEventListener("click", () => resetCameraSettings());
  actions.appendChild(resetBtn);

  const unsubscribe = subscribeCameraSettings((s) => {
    for (const [key, { input, value, lim }] of rows) {
      if (document.activeElement !== input) input.value = s[key];
      const decimals = lim.step < 1 ? 2 : 0;
      value.textContent = `${s[key].toFixed(decimals)}${lim.unit}`;
    }
    code.textContent = cameraSettingsToCode();
  });

  return { root, dispose: unsubscribe };
}
