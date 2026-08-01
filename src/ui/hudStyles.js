/**
 * Estilos centralizados de la HUD usando Design System
 * Todos los componentes de la interfaz usan estos estilos
 */

export const HUD_STYLES = {
  // Contenedores principales
  hudRoot: {
    position: 'absolute',
    inset: '0',
    zIndex: '8',
    pointerEvents: 'none',
    userSelect: 'none',
    color: 'hsl(var(--text-000))',
    fontFamily: 'var(--font-mono)',
  },

  // Paneles base
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 6px 18px rgba(var(--ink-rgb), 0.14)',
    backdropFilter: 'blur(6px)',
  },

  // Títulos de panel
  panelTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-sm)',
    marginBottom: 'var(--space-sm)',
    fontSize: '12px',
    fontWeight: '900',
    letterSpacing: '0.2em',
    color: 'hsl(var(--accent-main))',
  },

  // Botones
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-sm)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: '600',
    padding: 'var(--space-sm) var(--space-lg)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
    background: 'hsl(var(--accent-main))',
    color: 'white',
    boxShadow: 'var(--shadow-sm)',
  },

  buttonHover: {
    background: 'hsl(var(--accent-main) / 0.9)',
    boxShadow: 'var(--shadow-md)',
  },

  buttonActive: {
    transform: 'scale(0.98)',
    boxShadow: 'var(--shadow-sm)',
  },

  buttonSecondary: {
    background: 'white',
    color: 'hsl(var(--text-000))',
    border: '1px solid hsl(var(--border-100))',
  },

  // Tarjetas de información
  infoCard: {
    padding: 'var(--space-lg)',
    background: 'hsl(var(--bg-100))',
    border: '1px solid hsl(var(--border-100))',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-sm)',
  },

  // Inputs y controles
  input: {
    width: '100%',
    padding: 'var(--space-sm) var(--space-md)',
    background: 'white',
    border: '1px solid hsl(var(--border-100))',
    borderRadius: 'var(--radius-md)',
    color: 'hsl(var(--text-000))',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'var(--transition-fast)',
  },

  inputFocus: {
    borderColor: 'hsl(var(--accent-main))',
    boxShadow: '0 0 0 2px hsl(var(--accent-main) / 0.1)',
    outline: 'none',
  },

  // Medidores y barras de progreso
  meterBar: {
    width: '100%',
    height: '8px',
    background: 'hsl(var(--bg-050))',
    borderRadius: 'var(--radius-full)',
    overflow: 'hidden',
    border: '1px solid hsl(var(--border-100))',
  },

  meterFill: {
    height: '100%',
    background: 'linear-gradient(90deg, hsl(120, 70%, 50%), hsl(0, 84%, 60%))',
    transition: 'width 0.3s ease',
  },

  // Badges y etiquetas
  badge: {
    display: 'inline-block',
    padding: 'var(--space-xs) var(--space-sm)',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-full)',
    letterSpacing: '0.05em',
  },

  badgePrimary: {
    background: 'hsl(var(--accent-main))',
    color: 'white',
  },

  badgeSuccess: {
    background: 'hsl(120, 70%, 50%)',
    color: 'white',
  },

  badgeWarning: {
    background: 'hsl(45, 90%, 50%)',
    color: 'black',
  },

  badgeDanger: {
    background: 'hsl(0, 84%, 60%)',
    color: 'white',
  },

  // Textos
  textSmall: {
    fontSize: '11px',
    color: 'hsl(var(--text-faint))',
    textTransform: 'uppercase',
  },

  textMuted: {
    fontSize: '13px',
    color: 'hsl(var(--text-100))',
  },

  // Diálogos y modales
  dialogBackdrop: {
    position: 'fixed',
    inset: '0',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: '1000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  dialog: {
    background: 'hsl(var(--bg-000))',
    border: '2px solid hsl(var(--border-100))',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-2xl)',
    boxShadow: 'var(--shadow-xl)',
    maxWidth: '600px',
    width: '90%',
  },

  // Espaciado
  spacing: {
    xs: 'var(--space-xs)',   // 4px
    sm: 'var(--space-sm)',   // 8px
    md: 'var(--space-md)',   // 16px
    lg: 'var(--space-lg)',   // 24px
    xl: 'var(--space-xl)',   // 40px
  },

  // Transiciones
  transitions: {
    fast: 'var(--transition-fast)',     // 0.15s
    base: 'var(--transition-base)',     // 0.3s
    slow: 'var(--transition-slow)',     // 0.5s
  },
};

/**
 * Aplica estilos a un elemento
 */
export function applyStyles(element, styles) {
  if (!element) return;
  Object.assign(element.style, styles);
}

/**
 * Crea un elemento con estilos del DS
 */
export function createStyledElement(tag, styleKey, className = '') {
  const element = document.createElement(tag);
  if (HUD_STYLES[styleKey]) {
    applyStyles(element, HUD_STYLES[styleKey]);
  }
  if (className) {
    element.className = className;
  }
  return element;
}

/**
 * Aplica múltiples estilos del DS a un elemento
 */
export function applyMultipleStyles(element, ...styleKeys) {
  if (!element) return;
  styleKeys.forEach(key => {
    if (HUD_STYLES[key]) {
      applyStyles(element, HUD_STYLES[key]);
    }
  });
}
