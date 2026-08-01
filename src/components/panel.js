/**
 * PANEL CENTRALIZADO
 * Usado en: Juego, Builders, Storybook
 */

export function createPanel(variant = 'default') {
  const panel = document.createElement('div');

  const baseStyles = {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-lg)',
    boxShadow: 'var(--shadow-sm)',
    border: '1px solid hsl(var(--border-100))',
  };

  const variants = {
    default: {
      background: 'white',
    },
    glass: {
      background: 'var(--glass-light)',
      backdropFilter: 'var(--glass-blur-md)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    dark: {
      background: 'hsl(var(--bg-100))',
      border: '1px solid hsl(var(--border-100))',
      color: 'hsl(var(--text-000))',
    },
  };

  Object.assign(panel.style, baseStyles, variants[variant] || variants.default);

  return panel;
}
