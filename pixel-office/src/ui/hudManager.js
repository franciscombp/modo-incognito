export class HudManager {
  constructor(appElement) {
    this.appElement = appElement;
    this.currentArea = null;
    this.createHudElements();
  }

  createHudElements() {
    // Top-left: area info
    this.areaInfo = document.createElement("div");
    this.areaInfo.id = "area-info";
    this.areaInfo.style.cssText = `
      position: fixed;
      top: 12px;
      left: 12px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      min-width: 200px;
      z-index: 1000;
      border-left: 3px solid #4a9eff;
    `;
    this.areaInfo.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">Área Actual</div>
      <div style="font-size: 11px; color: #aaa;">Circulando...</div>
    `;
    this.appElement.appendChild(this.areaInfo);

    // Top-right: status/timer
    this.statusInfo = document.createElement("div");
    this.statusInfo.id = "status-info";
    this.statusInfo.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Segoe UI', monospace;
      font-size: 12px;
      text-align: right;
      z-index: 1000;
      border-right: 3px solid #ff6b6b;
      min-width: 150px;
    `;
    this.statusInfo.innerHTML = `
      <div style="color: #aaa;">SUSPENSIÓN</div>
      <div style="font-size: 18px; font-weight: 700; color: #ffaa00;">
        <span id="suspicion-bar">████░░░░░░</span> 0%
      </div>
    `;
    this.appElement.appendChild(this.statusInfo);

    // Bottom: controls
    this.controls = document.createElement("div");
    this.controls.id = "controls-info";
    this.controls.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.7);
      color: #aaa;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 11px;
      z-index: 1000;
      text-align: center;
      line-height: 1.4;
    `;
    this.controls.innerHTML = `
      <span style="margin: 0 8px;"><strong>WASD</strong> mover</span>
      <span style="margin: 0 8px;">|</span>
      <span style="margin: 0 8px;"><strong>E</strong> interactuar</span>
      <span style="margin: 0 8px;">|</span>
      <span style="margin: 0 8px;"><strong>F</strong> fingir trabajo</span>
      <span style="margin: 0 8px;">|</span>
      <span style="margin: 0 8px;"><strong>L</strong> etiquetas</span>
    `;
    this.appElement.appendChild(this.controls);

    // Objectives checklist (bottom-left, small)
    this.objectives = document.createElement("div");
    this.objectives.id = "objectives-panel";
    this.objectives.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 12px;
      background: rgba(0, 0, 0, 0.75);
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 11px;
      min-width: 160px;
      z-index: 1000;
      border-left: 3px solid #6fbf73;
      max-height: 150px;
      overflow-y: auto;
    `;
    this.objectives.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">OBJETIVOS</div>
      <div id="objectives-list"></div>
    `;
    this.appElement.appendChild(this.objectives);

    // Label mode indicator (bottom-right)
    this.labelMode = document.createElement("div");
    this.labelMode.id = "label-mode-indicator";
    this.labelMode.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      background: rgba(0, 0, 0, 0.75);
      color: #aaa;
      padding: 4px 8px;
      border-radius: 3px;
      font-family: 'Segoe UI', sans-serif;
      font-size: 10px;
      z-index: 1000;
      border-right: 2px solid #666;
    `;
    this.labelMode.textContent = "Etiquetas: Mínimas";
    this.appElement.appendChild(this.labelMode);
  }

  updateAreaInfo(areaName, areaType, capacity) {
    const typeLabel = {
      "open-office": "ZONA DE TRABAJO",
      "meeting-room": "SALA DE REUNIÓN",
      "core": "NÚCLEO",
      "utility": "SERVICIOS",
      "lobby": "ENTRADA"
    }[areaType] || "ÁREA";

    let capacityStr = "";
    if (capacity) {
      capacityStr = `<div style="font-size: 10px; color: #88dd88; margin-top: 2px;">
        Capacidad: ${capacity} puestos
      </div>`;
    }

    this.areaInfo.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 2px;">${areaName}</div>
      <div style="font-size: 11px; color: #88d0ff;">${typeLabel}</div>
      ${capacityStr}
    `;

    this.currentArea = areaName;
  }

  updateSuspicion(current, max) {
    const percentage = Math.round((current / max) * 100);
    const barLength = 10;
    const filledLength = Math.round((current / max) * barLength);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);

    const color = percentage < 30 ? "#88dd88" : percentage < 70 ? "#ffaa00" : "#ff6b6b";

    this.statusInfo.innerHTML = `
      <div style="color: #aaa;">SUSPENSIÓN</div>
      <div style="font-size: 16px; font-weight: 700; color: ${color};">
        <span id="suspicion-bar">${bar}</span> ${percentage}%
      </div>
    `;
  }

  updateObjectives(objectives) {
    const list = this.appElement.querySelector("#objectives-list");
    if (!list) return;

    list.innerHTML = objectives
      .map((obj, idx) => {
        const done = obj.done;
        const symbol = done ? "✓" : "○";
        const style = done ? "text-decoration: line-through; opacity: 0.5;" : "";
        return `
          <div style="margin: 2px 0; ${style}">
            <span style="color: ${done ? "#666" : "#ffd700"};">${symbol}</span>
            ${obj.label.split("\n")[0]}
          </div>
        `;
      })
      .join("");
  }

  updateLabelModeIndicator(mode) {
    const modeLabels = {
      "minimal": "Mínimas",
      "contextual": "Contextuales",
      "all": "Todas"
    };
    this.labelMode.textContent = `Etiquetas: ${modeLabels[mode] || "?"}`;
  }

  updateWarnings(warnings, maxWarnings) {
    if (this.statusInfo) {
      const statusContent = this.statusInfo.innerHTML;
      const warningsStr = warnings > 0
        ? `<div style="font-size: 10px; color: #ff6b6b; margin-top: 2px;">
             Advertencias: ${warnings}/${maxWarnings}
           </div>`
        : "";
      // Append warnings to status
      if (!statusContent.includes("Advertencias")) {
        this.statusInfo.innerHTML += warningsStr;
      }
    }
  }

  updateTimeLeft(timeLeft, totalTime) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, "0")}`;

    // Could be added to statusInfo if needed
  }

  dispose() {
    [this.areaInfo, this.statusInfo, this.controls, this.objectives, this.labelMode]
      .forEach(el => {
        if (el && el.parentElement) {
          el.parentElement.removeChild(el);
        }
      });
  }
}
