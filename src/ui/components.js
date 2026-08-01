/**
 * Componentes UI reutilizables para builders
 * Usa Design System CSS (variables + clases base)
 * Estética cozy consistente en toda la interfaz
 */

// Phosphor icon mapping (solo necesitamos el SVG, no la librería)
const PHOSPHOR_ICONS = {
  play: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240 128a15.87 15.87 0 0 1-10.14 14.9l-144 72A16 16 0 0 1 48 199.9V56.1a16 16 0 0 1 24.36-14.9l144 72A15.87 15.87 0 0 1 240 128Z"/></svg>',
  stop: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><rect x="48" y="48" width="160" height="160" rx="15.99"/></svg>',
  export: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224 144v64a16 16 0 0 1-16 16H48a16 16 0 0 1-16-16v-64" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><polyline points="72 104 128 160 184 104" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><line x1="128" y1="32" x2="128" y2="160" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216 48h-40V36a28 28 0 0 0-28-28h-40a28 28 0 0 0-28 28v12H40a12 12 0 0 0 0 24h8l12.35 168.12A28 28 0 0 0 88.35 228h79.3a28 28 0 0 0 27.65-27.88L208 72h8a12 12 0 0 0 0-24ZM96 36a4 4 0 0 1 4-4h40a4 4 0 0 1 4 4v12H96Zm100.22 180.12a4 4 0 0 1-3.95 3.88H88.35a4 4 0 0 1-3.95-3.88L72.26 72h111.48Z"/></svg>',
  plus: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8Z"/></svg>',
  check: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M229.66 77.66l-128 128a8 8 0 0 1-11.32 0l-64-64a8 8 0 0 1 11.32-11.32L96 188.69l122.34-122.35a8 8 0 0 1 11.32 11.32Z"/></svg>',
  x: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z"/></svg>',
  chevronDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z"/></svg>',
  arrowUp: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66 165.66a8 8 0 0 1-11.32 0L128 100.69l-66.34 64.97a8 8 0 0 1-11.32-11.32l72-72a8 8 0 0 1 11.32 0l72 72a8 8 0 0 1 0 11.32Z"/></svg>',
  arrowDown: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M50.34 90.34a8 8 0 0 1 11.32 0L128 155.31l66.34-64.97a8 8 0 0 1 11.32 11.32l-72 72a8 8 0 0 1-11.32 0l-72-72a8 8 0 0 1 0-11.32Z"/></svg>',
};

/**
 * Renderiza un icono Phosphor con CSS variables
 * @param {string} name - Nombre del icono
 * @param {object} options - {size: 16, className: ""}
 */
export function icon(name, options = {}) {
  const { size = 16, className = "" } = options;
  const svg = PHOSPHOR_ICONS[name] || PHOSPHOR_ICONS.plus;
  const wrapper = document.createElement('span');
  wrapper.innerHTML = svg;
  wrapper.style.width = size + 'px';
  wrapper.style.height = size + 'px';
  wrapper.style.display = 'inline-flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.className = `icon icon-${name} ${className}`;
  wrapper.style.color = 'currentColor';
  return wrapper;
}

/**
 * Botón reutilizable con Design System
 */
export function createButton(label, options = {}) {
  const {
    variant = 'primary', // primary, secondary, ghost, danger
    size = 'md', // sm, md, lg
    icon: iconName = null,
    onClick = null,
    disabled = false,
    className = '',
  } = options;

  const btn = document.createElement('button');
  btn.disabled = disabled;
  btn.className = `btn btn-${variant} btn-${size} ${className}`;

  // Estilos base con CSS variables
  btn.style.display = 'inline-flex';
  btn.style.alignItems = 'center';
  btn.style.justifyContent = 'center';
  btn.style.gap = 'var(--space-sm)';
  btn.style.fontFamily = 'inherit';
  btn.style.fontSize = '14px';
  btn.style.fontWeight = '600';
  btn.style.border = 'none';
  btn.style.borderRadius = 'var(--radius-md)';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'var(--transition-fast)';
  btn.style.letterSpacing = '0.01em';

  // Variantes de color
  if (variant === 'primary') {
    btn.style.background = 'hsl(var(--accent-main))';
    btn.style.color = 'white';
    btn.style.boxShadow = 'var(--shadow-sm)';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'hsl(var(--accent-main) / 0.9)';
      btn.style.boxShadow = 'var(--shadow-md)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'hsl(var(--accent-main))';
      btn.style.boxShadow = 'var(--shadow-sm)';
    });
  } else if (variant === 'secondary') {
    btn.style.background = 'white';
    btn.style.color = 'hsl(var(--text-000))';
    btn.style.border = '1px solid hsl(var(--border-100))';
    btn.style.boxShadow = 'var(--shadow-sm)';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'hsl(var(--bg-050))';
      btn.style.borderColor = 'var(--accent-primary)';
      btn.style.color = 'var(--accent-primary)';
      btn.style.boxShadow = 'var(--shadow-md)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'white';
      btn.style.borderColor = 'hsl(var(--border-100))';
      btn.style.color = 'hsl(var(--text-000))';
      btn.style.boxShadow = 'var(--shadow-sm)';
    });
  } else if (variant === 'ghost') {
    btn.style.background = 'transparent';
    btn.style.color = 'hsl(var(--text-000))';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'hsl(var(--bg-100))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
  } else if (variant === 'danger') {
    btn.style.background = 'hsl(var(--state-error))';
    btn.style.color = 'white';
    btn.style.boxShadow = 'var(--shadow-sm)';
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = 'var(--shadow-md)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = 'var(--shadow-sm)';
    });
  }

  // Tamaños
  if (size === 'sm') {
    btn.style.padding = 'var(--space-xs) var(--space-sm)';
    btn.style.fontSize = '12px';
  } else if (size === 'md') {
    btn.style.padding = 'var(--space-sm) var(--space-lg)';
  } else if (size === 'lg') {
    btn.style.padding = 'var(--space-md) var(--space-xl)';
    btn.style.fontSize = '16px';
  }

  // Estado deshabilitado
  if (disabled) {
    btn.style.opacity = '0.5';
    btn.style.cursor = 'not-allowed';
  }

  if (iconName) {
    btn.appendChild(icon(iconName, { size: size === 'sm' ? 14 : 16 }));
  }

  const textSpan = document.createElement('span');
  textSpan.textContent = label;
  btn.appendChild(textSpan);

  if (onClick) {
    btn.addEventListener('click', onClick);
  }

  return btn;
}

/**
 * Panel reutilizable con Design System
 */
export function createPanel(content, options = {}) {
  const {
    title = null,
    className = '',
  } = options;

  const panel = document.createElement('div');
  panel.className = `panel ${className}`;
  panel.style.background = 'white';
  panel.style.border = '1px solid hsl(var(--border-100))';
  panel.style.borderRadius = 'var(--radius-lg)';
  panel.style.padding = 'var(--space-lg)';
  panel.style.boxShadow = 'var(--shadow-sm)';

  if (title) {
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.style.fontSize = '18px';
    titleEl.style.fontWeight = 'bold';
    titleEl.style.color = 'hsl(var(--text-000))';
    titleEl.style.paddingBottom = 'var(--space-md)';
    titleEl.style.borderBottom = '1px solid hsl(var(--border-100))';
    titleEl.style.marginBottom = 'var(--space-lg)';
    panel.appendChild(titleEl);
  }

  if (typeof content === 'string') {
    const div = document.createElement('div');
    div.innerHTML = content;
    panel.appendChild(div);
  } else if (content instanceof HTMLElement) {
    panel.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(el => {
      if (typeof el === 'string') {
        const div = document.createElement('div');
        div.innerHTML = el;
        panel.appendChild(div);
      } else {
        panel.appendChild(el);
      }
    });
  }

  return panel;
}

/**
 * Tabs reutilizable con Design System
 */
export function createTabs(tabs, options = {}) {
  const {
    onTabChange = null,
    className = '',
  } = options;

  const container = document.createElement('div');
  container.className = `tabs-container ${className}`;

  const tabButtons = document.createElement('div');
  tabButtons.style.display = 'flex';
  tabButtons.style.gap = 'var(--space-sm)';
  tabButtons.style.borderBottom = '1px solid hsl(var(--border-100))';
  tabButtons.style.marginBottom = 'var(--space-lg)';

  const tabContents = document.createElement('div');
  tabContents.className = 'tab-contents';

  tabs.forEach((tab, idx) => {
    const btn = document.createElement('button');
    btn.style.padding = 'var(--space-sm) var(--space-lg)';
    btn.style.fontSize = '14px';
    btn.style.fontWeight = '500';
    btn.style.borderBottom = '2px solid transparent';
    btn.style.transition = 'var(--transition-fast)';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';

    const isActive = idx === 0;
    if (isActive) {
      btn.style.borderBottomColor = 'hsl(var(--accent-main))';
      btn.style.color = 'hsl(var(--accent-main))';
    } else {
      btn.style.borderBottomColor = 'transparent';
      btn.style.color = 'hsl(var(--text-faint))';
      btn.addEventListener('mouseenter', () => {
        btn.style.color = 'hsl(var(--text-000))';
      });
      btn.addEventListener('mouseleave', () => {
        if (!btn.classList.contains('active')) {
          btn.style.color = 'hsl(var(--text-faint))';
        }
      });
    }

    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      // Actualizar botones
      tabButtons.querySelectorAll('button').forEach(b => {
        b.style.borderBottomColor = 'transparent';
        b.style.color = 'hsl(var(--text-faint))';
        b.classList.remove('active');
      });
      btn.style.borderBottomColor = 'hsl(var(--accent-main))';
      btn.style.color = 'hsl(var(--accent-main))';
      btn.classList.add('active');

      // Actualizar contenidos
      tabContents.querySelectorAll('.tab-pane').forEach(p => {
        p.style.display = 'none';
      });
      if (pane) pane.style.display = 'block';

      if (onTabChange) onTabChange(idx, tab);
    });

    if (isActive) btn.classList.add('active');
    tabButtons.appendChild(btn);

    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.style.display = isActive ? 'block' : 'none';
    if (typeof tab.content === 'string') {
      pane.innerHTML = tab.content;
    } else {
      pane.appendChild(tab.content);
    }

    tabContents.appendChild(pane);
  });

  container.appendChild(tabButtons);
  container.appendChild(tabContents);
  return container;
}

/**
 * Input con Design System
 */
export function createInput(type = 'text', options = {}) {
  const {
    placeholder = '',
    value = '',
    label = null,
    onChange = null,
    className = '',
  } = options;

  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = 'var(--space-xs)';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.display = 'block';
    labelEl.style.fontSize = '14px';
    labelEl.style.fontWeight = '500';
    labelEl.style.color = 'hsl(var(--text-000))';
    container.appendChild(labelEl);
  }

  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  input.className = `input ${className}`;
  input.style.width = '100%';
  input.style.padding = 'var(--space-sm) var(--space-md)';
  input.style.background = 'white';
  input.style.border = '1px solid hsl(var(--border-100))';
  input.style.borderRadius = 'var(--radius-md)';
  input.style.color = 'hsl(var(--text-000))';
  input.style.fontSize = '14px';
  input.style.fontFamily = 'inherit';
  input.style.transition = 'var(--transition-fast)';

  input.addEventListener('focus', () => {
    input.style.borderColor = 'hsl(var(--accent-main))';
    input.style.boxShadow = '0 0 0 2px hsl(var(--accent-main) / 0.1)';
    input.style.outline = 'none';
  });

  input.addEventListener('blur', () => {
    input.style.borderColor = 'hsl(var(--border-100))';
    input.style.boxShadow = 'none';
  });

  if (onChange) {
    input.addEventListener('change', onChange);
    input.addEventListener('input', onChange);
  }

  container.appendChild(input);
  return { container, input };
}

/**
 * Select con Design System
 */
export function createSelect(options, selectOptions = {}) {
  const {
    label = null,
    onChange = null,
    className = '',
  } = selectOptions;

  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = 'var(--space-xs)';

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.display = 'block';
    labelEl.style.fontSize = '14px';
    labelEl.style.fontWeight = '500';
    labelEl.style.color = 'hsl(var(--text-000))';
    container.appendChild(labelEl);
  }

  const select = document.createElement('select');
  select.className = `select ${className}`;
  select.style.width = '100%';
  select.style.padding = 'var(--space-sm) var(--space-md)';
  select.style.background = 'white';
  select.style.border = '1px solid hsl(var(--border-100))';
  select.style.borderRadius = 'var(--radius-md)';
  select.style.color = 'hsl(var(--text-000))';
  select.style.fontSize = '14px';
  select.style.fontFamily = 'inherit';
  select.style.cursor = 'pointer';
  select.style.transition = 'var(--transition-fast)';
  select.style.appearance = 'none';
  select.style.backgroundImage = `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`;
  select.style.backgroundRepeat = 'no-repeat';
  select.style.backgroundPosition = 'right var(--space-md) center';
  select.style.backgroundSize = '20px';
  select.style.paddingRight = 'var(--space-3xl)';

  select.addEventListener('focus', () => {
    select.style.borderColor = 'hsl(var(--accent-main))';
    select.style.boxShadow = '0 0 0 2px hsl(var(--accent-main) / 0.1)';
    select.style.outline = 'none';
  });

  select.addEventListener('blur', () => {
    select.style.borderColor = 'hsl(var(--border-100))';
    select.style.boxShadow = 'none';
  });

  options.forEach(opt => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    select.appendChild(optionEl);
  });

  if (onChange) {
    select.addEventListener('change', onChange);
  }

  container.appendChild(select);
  return { container, select };
}

/**
 * Tooltip reutilizable con Design System
 */
export function createTooltip(content, text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.style.position = 'relative';
  tooltip.style.display = 'inline-block';

  const inner = document.createElement('div');
  if (typeof content === 'string') {
    inner.innerHTML = content;
  } else {
    inner.appendChild(content);
  }
  tooltip.appendChild(inner);

  const tooltipText = document.createElement('div');
  tooltipText.textContent = text;
  tooltipText.style.position = 'absolute';
  tooltipText.style.bottom = 'calc(100% + var(--space-sm))';
  tooltipText.style.left = '50%';
  tooltipText.style.transform = 'translateX(-50%)';
  tooltipText.style.padding = 'var(--space-xs) var(--space-sm)';
  tooltipText.style.fontSize = '12px';
  tooltipText.style.fontWeight = '500';
  tooltipText.style.background = 'hsl(var(--text-000))';
  tooltipText.style.color = 'white';
  tooltipText.style.borderRadius = 'var(--radius-md)';
  tooltipText.style.whiteSpace = 'nowrap';
  tooltipText.style.opacity = '0';
  tooltipText.style.pointerEvents = 'none';
  tooltipText.style.transition = 'var(--transition-fast)';
  tooltipText.style.boxShadow = 'var(--shadow-md)';
  tooltipText.style.zIndex = 'var(--z-tooltip)';

  tooltip.addEventListener('mouseenter', () => {
    tooltipText.style.opacity = '1';
    tooltipText.style.pointerEvents = 'auto';
  });

  tooltip.addEventListener('mouseleave', () => {
    tooltipText.style.opacity = '0';
    tooltipText.style.pointerEvents = 'none';
  });

  tooltip.appendChild(tooltipText);
  return tooltip;
}

export default {
  icon,
  createButton,
  createPanel,
  createTabs,
  createInput,
  createSelect,
  createTooltip,
};
