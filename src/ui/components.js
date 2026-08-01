/**
 * Componentes UI reutilizables para builders
 * Usa Tailwind CSS + Phosphor Icons
 * Estética cozy consistente en toda la interfaz
 */

// Phosphor icon mapping (solo necesitamos el SVG, no la librería)
// Preload iconos comunes como data URIs
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
 * Renderiza un icono Phosphor
 * @param {string} name - Nombre del icono (play, stop, export, etc)
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
 * Botón reutilizable con Tailwind
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

  // Clases Tailwind base
  btn.classList.add(
    'inline-flex',
    'items-center',
    'justify-center',
    'gap-2',
    'font-semibold',
    'transition-all',
    'duration-200',
    'rounded-cozy',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-offset-0',
    'focus:ring-accent',
    'disabled:opacity-50',
    'disabled:cursor-not-allowed'
  );

  // Variantes de color
  if (variant === 'primary') {
    btn.classList.add(
      'bg-accent',
      'text-accent-foreground',
      'hover:shadow-cozy-md',
      'active:shadow-sm'
    );
  } else if (variant === 'secondary') {
    btn.classList.add(
      'bg-secondary',
      'text-secondary-foreground',
      'hover:shadow-cozy',
      'active:shadow-sm'
    );
  } else if (variant === 'ghost') {
    btn.classList.add(
      'text-foreground',
      'hover:bg-muted',
      'active:bg-border'
    );
  } else if (variant === 'danger') {
    btn.classList.add(
      'bg-destructive',
      'text-destructive-foreground',
      'hover:shadow-cozy-md',
      'active:shadow-sm'
    );
  }

  // Tamaños
  if (size === 'sm') {
    btn.classList.add('px-2', 'py-1', 'text-xs');
  } else if (size === 'md') {
    btn.classList.add('px-4', 'py-2', 'text-sm');
  } else if (size === 'lg') {
    btn.classList.add('px-6', 'py-3', 'text-base');
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
 * Panel reutilizable
 */
export function createPanel(content, options = {}) {
  const {
    title = null,
    className = '',
  } = options;

  const panel = document.createElement('div');
  panel.className = `panel ${className}`;
  panel.classList.add(
    'bg-card',
    'border',
    'border-border',
    'rounded-cozy',
    'p-4',
    'shadow-cozy',
    'space-y-4'
  );

  if (title) {
    const titleEl = document.createElement('h2');
    titleEl.textContent = title;
    titleEl.classList.add(
      'text-lg',
      'font-bold',
      'text-foreground',
      'pb-2',
      'border-b',
      'border-border'
    );
    panel.appendChild(titleEl);
  }

  if (typeof content === 'string') {
    panel.innerHTML += content;
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
 * Tabs reutilizable
 */
export function createTabs(tabs, options = {}) {
  const {
    onTabChange = null,
    className = '',
  } = options;

  const container = document.createElement('div');
  container.className = `tabs-container ${className}`;

  const tabButtons = document.createElement('div');
  tabButtons.classList.add(
    'flex',
    'gap-2',
    'border-b',
    'border-border',
    'mb-4'
  );

  const tabContents = document.createElement('div');
  tabContents.classList.add('tab-contents');

  tabs.forEach((tab, idx) => {
    const btn = document.createElement('button');
    btn.classList.add(
      'px-4',
      'py-2',
      'text-sm',
      'font-medium',
      'border-b-2',
      'transition-colors',
      'duration-200'
    );

    const isActive = idx === 0;
    if (isActive) {
      btn.classList.add('border-accent', 'text-accent');
    } else {
      btn.classList.add('border-transparent', 'text-muted-foreground', 'hover:text-foreground');
    }

    btn.textContent = tab.label;
    btn.addEventListener('click', () => {
      // Actualizar botones
      tabButtons.querySelectorAll('button').forEach(b => {
        b.classList.remove('border-accent', 'text-accent');
        b.classList.add('border-transparent', 'text-muted-foreground');
      });
      btn.classList.add('border-accent', 'text-accent');

      // Actualizar contenidos
      tabContents.querySelectorAll('.tab-pane').forEach(p => {
        p.style.display = 'none';
      });
      if (pane) pane.style.display = 'block';

      if (onTabChange) onTabChange(idx, tab);
    });

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
 * Input con estilos cozy
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
  container.classList.add('space-y-1');

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.classList.add(
      'block',
      'text-sm',
      'font-medium',
      'text-foreground'
    );
    container.appendChild(labelEl);
  }

  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  input.className = `input ${className}`;
  input.classList.add(
    'w-full',
    'px-3',
    'py-2',
    'bg-input',
    'border',
    'border-border',
    'rounded-cozy',
    'text-foreground',
    'placeholder-muted-foreground',
    'transition-all',
    'duration-200',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-accent',
    'focus:border-accent'
  );

  if (onChange) {
    input.addEventListener('change', onChange);
    input.addEventListener('input', onChange);
  }

  container.appendChild(input);
  return { container, input };
}

/**
 * Select con estilos cozy
 */
export function createSelect(options, selectOptions = {}) {
  const {
    label = null,
    onChange = null,
    className = '',
  } = selectOptions;

  const container = document.createElement('div');
  container.classList.add('space-y-1');

  if (label) {
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.classList.add(
      'block',
      'text-sm',
      'font-medium',
      'text-foreground'
    );
    container.appendChild(labelEl);
  }

  const select = document.createElement('select');
  select.className = `select ${className}`;
  select.classList.add(
    'w-full',
    'px-3',
    'py-2',
    'bg-input',
    'border',
    'border-border',
    'rounded-cozy',
    'text-foreground',
    'transition-all',
    'duration-200',
    'focus:outline-none',
    'focus:ring-2',
    'focus:ring-accent',
    'focus:border-accent',
    'cursor-pointer'
  );

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
 * Tooltip reutilizable
 */
export function createTooltip(content, text) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.classList.add(
    'relative',
    'group'
  );

  const inner = document.createElement('div');
  if (typeof content === 'string') {
    inner.innerHTML = content;
  } else {
    inner.appendChild(content);
  }
  tooltip.appendChild(inner);

  const tooltipText = document.createElement('div');
  tooltipText.textContent = text;
  tooltipText.classList.add(
    'absolute',
    'bottom-full',
    'left-1/2',
    '-translate-x-1/2',
    'mb-2',
    'px-2',
    'py-1',
    'text-xs',
    'bg-foreground',
    'text-background',
    'rounded-cozy',
    'whitespace-nowrap',
    'opacity-0',
    'pointer-events-none',
    'group-hover:opacity-100',
    'transition-opacity',
    'duration-200',
    'shadow-cozy'
  );

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
