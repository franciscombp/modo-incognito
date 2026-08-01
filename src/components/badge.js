/**
 * BADGE CENTRALIZADO
 * Usado en: Juego, Builders, Storybook
 */

export function createBadge(label, variant = 'primary') {
  const badge = document.createElement('span');
  badge.textContent = label;

  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-xs) var(--space-sm)',
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    borderRadius: 'var(--radius-full)',
    letterSpacing: '0.05em',
  };

  const variants = {
    primary: {
      background: 'hsl(var(--accent-main))',
      color: 'white',
    },
    success: {
      background: 'hsl(120, 70%, 50%)',
      color: 'white',
    },
    warning: {
      background: 'hsl(45, 90%, 50%)',
      color: 'black',
    },
    error: {
      background: 'hsl(0, 84%, 60%)',
      color: 'white',
    },
    secondary: {
      background: 'hsl(var(--bg-100))',
      color: 'hsl(var(--text-000))',
      border: '1px solid hsl(var(--border-100))',
    },
  };

  Object.assign(badge.style, baseStyles, variants[variant] || variants.primary);

  return badge;
}
