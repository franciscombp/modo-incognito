// Storybook + Componentes Interactivos
// Sistema de diseño unificado para el juego y builders

// Estado global
let currentCategory = 'typography';
let selectedComponent = 0;

const COMPONENTS = {
  typography: {
    title: "Tipografía",
    items: [
      { label: "H1 - Encabezado principal", html: '<h1>Modo Incógnito</h1>' },
      { label: "H2 - Encabezado secundario", html: '<h2>Día 1 - El Ascensor</h2>' },
      { label: "H3 - Encabezado terciario", html: '<h3>Selecciona tu personaje</h3>' },
      { label: "Párrafo normal", html: '<p>Este es un párrafo de contenido regular con información importante.</p>' },
      { label: "Texto suave (muted)", html: '<p class="text-muted">Descripción secundaria o información menos importante.</p>' },
      { label: "Texto en monoespaciado", html: '<code>const character = "giuli";</code>' },
    ],
  },

  buttons: {
    title: "Botones",
    items: [
      { label: "Botón primario", html: '<button class="btn">Aceptar</button>' },
      { label: "Botón primario - Hover", html: '<button class="btn" style="opacity: 0.9;">Aceptar</button>' },
      { label: "Botón secundario", html: '<button class="btn secondary">Cancelar</button>' },
      { label: "Botón deshabilitado", html: '<button class="btn" disabled>No disponible</button>' },
      { label: "Botón con ícono", html: '<button class="btn"><span>✓</span> Confirmar</button>' },
      { label: "Botón ancho", html: '<button class="btn" style="width: 100%;">Acción a pantalla completa</button>' },
    ],
  },

  forms: {
    title: "Formularios",
    items: [
      { label: "Input de texto", html: '<input type="text" placeholder="Escribe aquí..." />' },
      { label: "Input con valor", html: '<input type="text" value="Contenido ingresado" />' },
      { label: "Input numérico", html: '<input type="number" placeholder="0" min="0" max="100" />' },
      { label: "Select", html: '<select><option>Opción 1</option><option>Opción 2</option><option>Opción 3</option></select>' },
      { label: "Textarea", html: '<textarea placeholder="Escriba su mensaje aquí..." style="width: 100%; height: 80px;"></textarea>' },
      { label: "Checkbox", html: '<label style="display: flex; gap: 8px; align-items: center;"><input type="checkbox" checked /> Aceptar términos</label>' },
      { label: "Radio buttons", html: '<div style="display: flex; gap: 16px;"><label><input type="radio" name="opt" /> Opción A</label><label><input type="radio" name="opt" checked /> Opción B</label></div>' },
    ],
  },

  cards: {
    title: "Tarjetas (Cards)",
    items: [
      {
        label: "Card simple",
        html: '<div class="panel" style="width: 300px; padding: 20px;"><h3 style="margin-top: 0;">Título de tarjeta</h3><p class="text-muted">Descripción o contenido de la tarjeta.</p></div>',
      },
      {
        label: "Card con glass",
        html: '<div class="glass-card" style="width: 300px; position: relative;"><h4 style="margin-top: 0;">Cristal moderno</h4><p style="margin: 8px 0 0; font-size: 14px;">Con backdrop filter y borde translúcido.</p></div>',
      },
      {
        label: "Card con acción",
        html: `<div class="panel" style="width: 300px; padding: 20px;">
          <h4 style="margin-top: 0;">Tarjeta interactiva</h4>
          <p class="text-muted">Contiene un botón de acción.</p>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="btn" style="flex: 1; font-size: 12px;">Aceptar</button>
            <button class="btn secondary" style="flex: 1; font-size: 12px;">Cancelar</button>
          </div>
        </div>`,
      },
    ],
  },

  chips: {
    title: "Chips & Badges",
    items: [
      { label: "Chip básico", html: '<span class="chip">Etiqueta</span>' },
      { label: "Chip con icono", html: '<span class="chip">✓ Completado</span>' },
      { label: "Múltiples chips", html: '<div style="display: flex; gap: 8px; flex-wrap: wrap;"><span class="chip">Trabajo</span><span class="chip">Café</span><span class="chip">Cine</span></div>' },
      { label: "Badge primario", html: '<span class="badge">3</span>' },
      { label: "Badge secundario", html: '<span class="badge secondary">5</span>' },
      { label: "Badge success", html: '<span class="badge success">✓</span>' },
      { label: "Badge error", html: '<span class="badge error">!</span>' },
    ],
  },

  dialogs: {
    title: "Diálogos & Alertas",
    items: [
      {
        label: "Diálogo simple",
        html: `<div class="panel" style="width: 400px;">
          <h2 style="margin-top: 0;">Confirmación</h2>
          <p>¿Está seguro de que desea continuar con esta acción?</p>
          <div style="display: flex; gap: 8px; margin-top: 16px;">
            <button class="btn">Sí, continuar</button>
            <button class="btn secondary">Cancelar</button>
          </div>
        </div>`,
      },
      {
        label: "Alerta de éxito",
        html: '<div class="panel" style="width: 350px; border-left: 4px solid hsl(120, 70%, 50%);"><h4 style="margin-top: 0; color: hsl(120, 70%, 50%);">✓ Éxito</h4><p style="margin: 8px 0 0;">La operación se completó correctamente.</p></div>',
      },
      {
        label: "Alerta de error",
        html: '<div class="panel" style="width: 350px; border-left: 4px solid hsl(0, 84%, 60%);"><h4 style="margin-top: 0; color: hsl(0, 84%, 60%);">✕ Error</h4><p style="margin: 8px 0 0;">Ocurrió un problema. Por favor intente de nuevo.</p></div>',
      },
    ],
  },

  layout: {
    title: "Layouts",
    items: [
      {
        label: "Flex Row",
        html: '<div class="row" style="width: 100%; max-width: 400px;"><button class="btn">Elemento 1</button><button class="btn">Elemento 2</button></div>',
      },
      {
        label: "Flex Column",
        html: '<div class="col" style="width: 100%; max-width: 300px;"><button class="btn">Elemento 1</button><button class="btn">Elemento 2</button><button class="btn">Elemento 3</button></div>',
      },
      {
        label: "Flex Between",
        html: '<div class="flex-between" style="width: 100%; max-width: 400px; padding: 16px; background: rgba(255,255,255,0.5); border-radius: 10px;"><span>Izquierda</span><span>Derecha</span></div>',
      },
      {
        label: "Grid 2 columnas",
        html: '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 100%; max-width: 400px;"><div class="panel">Columna 1</div><div class="panel">Columna 2</div></div>',
      },
    ],
  },

  animations: {
    title: "Animaciones",
    items: [
      { label: "Fade In", html: '<div class="animate-fade-in" style="padding: 16px; background: hsl(var(--bg-050)); border-radius: 10px;">Aparición suave</div>' },
      { label: "Slide In Right", html: '<div class="animate-slide-in-right" style="padding: 16px; background: hsl(var(--bg-050)); border-radius: 10px;">Desliza desde la derecha</div>' },
      { label: "Pulse", html: '<div class="animate-pulse" style="padding: 16px; background: var(--accent-primary); color: white; border-radius: 10px; font-weight: bold;">Efecto de pulso</div>' },
    ],
  },
};

// Inicializar
function init() {
  renderCategories();
  selectCategory('typography');
}

// Renderizar categorías (navegación lateral)
function renderCategories() {
  const nav = document.querySelector('.categories');
  nav.innerHTML = '';

  Object.keys(COMPONENTS).forEach(key => {
    const btn = document.createElement('button');
    btn.className = `cat-btn ${key === currentCategory ? 'active' : ''}`;
    btn.textContent = COMPONENTS[key].title;
    btn.onclick = () => selectCategory(key);
    nav.appendChild(btn);
  });
}

// Seleccionar categoría
function selectCategory(key) {
  currentCategory = key;
  selectedComponent = 0;

  // Actualizar título
  document.getElementById('current-category').textContent = COMPONENTS[key].title;

  renderCategories();
  renderComponents();
}

// Renderizar componentes de la categoría actual
function renderComponents() {
  const container = document.querySelector('.components-list');
  const category = COMPONENTS[currentCategory];

  container.innerHTML = '';

  category.items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `component-item ${idx === selectedComponent ? 'selected' : ''}`;
    div.innerHTML = `<button class="comp-btn">${item.label}</button>`;
    div.onclick = () => {
      selectedComponent = idx;
      renderComponents();
      renderPreview();
    };
    container.appendChild(div);
  });

  // Renderizar preview inicial
  if (category.items.length > 0) {
    renderPreview();
  }
}

// Renderizar preview del componente seleccionado
function renderPreview() {
  const category = COMPONENTS[currentCategory];
  const item = category.items[selectedComponent];

  if (!item) return;

  const preview = document.querySelector('.preview-canvas');
  preview.innerHTML = item.html;
  updateStylePanel(item);
}

// Panel de estilos CSS editable
function updateStylePanel(item) {
  const cssPanel = document.querySelector('.css-editor');

  // Extraer clases del componente
  const parser = new DOMParser();
  const doc = parser.parseFromString(item.html, 'text/html');
  const firstElement = doc.body.firstElementChild;

  let cssCode = `/* ${item.label} */\n`;
  let classes = [];

  if (firstElement) {
    const classStr = firstElement.className || '';
    if (classStr) {
      classes = classStr.split(' ').filter(c => c && !c.startsWith('animate-'));
      classes.forEach(cls => {
        cssCode += `\n.${cls} {\n  /* Ver src/style/design-system.css */\n}\n`;
      });
    }
  }

  if (classes.length === 0) {
    cssCode += '\n/* Aplica clases del design system */\n';
  }

  cssPanel.innerHTML = `<pre><code>${cssCode}</code></pre>`;
}

// Copiar HTML al portapapeles
window.copyHTML = function() {
  const category = COMPONENTS[currentCategory];
  const item = category.items[selectedComponent];

  if (!item) return;

  navigator.clipboard.writeText(item.html).then(() => {
    alert('HTML copiado al portapapeles');
  });
};

// Copiar CSS al portapapeles
window.copyCSS = function() {
  const category = COMPONENTS[currentCategory];
  const item = category.items[selectedComponent];
  const cssPanel = document.querySelector('.css-editor');

  if (!cssPanel) return;

  const css = cssPanel.textContent;
  navigator.clipboard.writeText(css).then(() => {
    alert('CSS copiado al portapapeles');
  });
};

// Ejecutar al cargar
document.addEventListener('DOMContentLoaded', init);
