// Pantallas - Storybook y Constructor de UI

const COMPONENTS = {
  buttons: {
    title: "Botones",
    items: [
      { label: "Primario", html: '<button class="btn">Acción</button>' },
      { label: "Primario - Hover", html: '<button class="btn" style="background: #d4846a;">Acción</button>' },
      { label: "Secundario", html: '<button class="btn secondary">Acción</button>' },
      { label: "Deshabilitado", html: '<button class="btn" disabled>Acción</button>' },
    ],
  },
  inputs: {
    title: "Inputs",
    items: [
      { label: "Texto", html: '<input type="text" placeholder="Escribe aquí..." />' },
      { label: "Número", html: '<input type="number" placeholder="0" />' },
      { label: "Select", html: '<select><option>Opción 1</option><option>Opción 2</option></select>' },
      {
        label: "Textarea",
        html: '<textarea placeholder="Texto largo..." style="width: 200px; height: 80px;"></textarea>',
      },
    ],
  },
  panels: {
    title: "Paneles",
    items: [
      {
        label: "Panel base",
        html: '<div class="panel" style="width: 200px;"><p>Contenido del panel</p></div>',
      },
      {
        label: "Panel con elementos",
        html: `<div class="panel" style="width: 300px;">
          <h3 style="margin-top: 0;">Título</h3>
          <p class="text-muted">Descripción secundaria</p>
          <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
            <button class="btn">Aceptar</button>
            <button class="btn secondary">Cancelar</button>
          </div>
        </div>`,
      },
    ],
  },
  dialogs: {
    title: "Diálogos",
    items: [
      {
        label: "Caja de diálogo",
        html: `<div class="panel" style="width: 400px;">
          <h2 style="margin-top: 0;">Título del diálogo</h2>
          <p>Texto del diálogo con información importante que el jugador debe leer.</p>
          <div style="display: flex; gap: 0.5rem; margin-top: 1.5rem;">
            <button class="btn">Continuar</button>
          </div>
        </div>`,
      },
    ],
  },
  hud: {
    title: "Elementos HUD",
    items: [
      {
        label: "Barra de estado",
        html: `<div style="width: 300px; background: white; border: 1px solid var(--line); border-radius: var(--cut); padding: 1rem;">
          <div style="font-size: 0.75rem; color: var(--ink-soft); margin-bottom: 0.5rem;">TAREA ACTIVA</div>
          <div style="font-weight: 500; margin-bottom: 1rem;">Café en la sala 3</div>
          <div style="background: var(--paper); border-radius: 4px; height: 6px; overflow: hidden;">
            <div style="background: var(--cyan); height: 100%; width: 60%;"></div>
          </div>
        </div>`,
      },
    ],
  },
  menus: {
    title: "Menús",
    items: [
      {
        label: "Elemento de lista",
        html: `<div style="width: 300px; background: white; border: 1px solid var(--line); border-radius: var(--cut); padding: 1rem; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 500;">Opción 1</div>
            <div style="font-size: 0.875rem; color: var(--ink-soft);">Descripción</div>
          </div>
          <div style="color: var(--cyan);">→</div>
        </div>`,
      },
    ],
  },
};

// DOM
const componentsContainer = document.querySelector(".components");
const cssEditor = document.getElementById("css-editor");
const applyBtn = document.getElementById("apply-btn");
const copyBtn = document.getElementById("copy-btn");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");
const statusMessage = document.getElementById("status-message");
const navLinks = document.querySelectorAll(".nav-link");

// Estado
let currentCss = "";
const originalCss = getCSSFromDesignSystem();

function getCSSFromDesignSystem() {
  const link = document.querySelector('link[href="../../src/style/design-system.css"]');
  return link ? link.textContent || "" : "";
}

function renderComponents() {
  componentsContainer.innerHTML = "";

  Object.entries(COMPONENTS).forEach(([key, section]) => {
    const sectionEl = document.createElement("div");
    sectionEl.className = "component-section";
    sectionEl.id = `component-${key}`;

    const title = document.createElement("h3");
    title.textContent = section.title;

    const group = document.createElement("div");
    group.className = "component-group";

    section.items.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = "component-item";

      const label = document.createElement("div");
      label.className = "component-label";
      label.textContent = item.label;

      const preview = document.createElement("div");
      preview.className = "component-preview";
      preview.innerHTML = item.html;

      itemEl.appendChild(label);
      itemEl.appendChild(preview);
      group.appendChild(itemEl);
    });

    sectionEl.appendChild(title);
    sectionEl.appendChild(group);
    componentsContainer.appendChild(sectionEl);
  });
}

function applyCustomCSS() {
  const css = cssEditor.value;

  // Crear un <style> temporal
  let styleTag = document.getElementById("custom-css");
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "custom-css";
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = css;
  currentCss = css;

  showStatus("CSS aplicado", "success");
}

function showStatus(message, type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;

  if (type !== "info") {
    setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.className = "status-message";
    }, 3000);
  }
}

function copyToClipboard() {
  const css = cssEditor.value;
  navigator.clipboard.writeText(css).then(() => {
    showStatus("Copiado al portapapeles", "success");
  });
}

function resetCSS() {
  cssEditor.value = "";
  currentCss = "";

  const styleTag = document.getElementById("custom-css");
  if (styleTag) styleTag.remove();

  showStatus("CSS reseteado", "success");
}

function exportCSS() {
  const css = cssEditor.value;
  if (!css) {
    showStatus("No hay CSS para exportar", "error");
    return;
  }

  // Crear un blob y descargarlo
  const blob = new Blob([css], { type: "text/css" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "custom-styles.css";
  a.click();
  URL.revokeObjectURL(url);

  showStatus("CSS descargado", "success");
}

function handleNavClick(e) {
  if (e.target.classList.contains("nav-link")) {
    e.preventDefault();

    navLinks.forEach((link) => link.classList.remove("active"));
    e.target.classList.add("active");

    const href = e.target.getAttribute("href");
    const id = href.substring(1);
    const el = document.getElementById(id);

    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }
}

// EVENT LISTENERS
applyBtn.addEventListener("click", applyCustomCSS);
copyBtn.addEventListener("click", copyToClipboard);
resetBtn.addEventListener("click", resetCSS);
exportBtn.addEventListener("click", exportCSS);
document.addEventListener("click", handleNavClick);

// INIT
renderComponents();
showStatus("Bienvenido al constructor de UI", "info");
