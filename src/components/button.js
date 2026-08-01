/**
 * BOTÓN CENTRALIZADO
 * Usado en: Juego, Builders, Storybook
 */

export function createButton(label, { variant = 'primary', icon = '', size = 'md', onClick = null } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';

  // Estilos base
  const baseStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-sm)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    transition: 'var(--transition-fast)',
    padding: 'var(--space-sm) var(--space-lg)',
  };

  // Variantes
  const variants = {
    primary: {
      background: 'hsl(var(--accent-main))',
      color: 'white',
      boxShadow: 'var(--shadow-sm)',
      ':hover': {
        background: 'hsl(var(--accent-main) / 0.9)',
        boxShadow: 'var(--shadow-md)',
      },
    },
    secondary: {
      background: 'white',
      color: 'hsl(var(--text-000))',
      border: '1px solid hsl(var(--border-100))',
      boxShadow: 'var(--shadow-sm)',
      ':hover': {
        background: 'hsl(var(--bg-050))',
        borderColor: 'var(--accent-primary)',
        color: 'var(--accent-primary)',
        boxShadow: 'var(--shadow-md)',
      },
    },
    ghost: {
      background: 'transparent',
      color: 'hsl(var(--text-000))',
      boxShadow: 'none',
      ':hover': {
        background: 'hsl(var(--bg-100))',
      },
    },
    danger: {
      background: 'hsl(var(--state-error))',
      color: 'white',
      boxShadow: 'var(--shadow-sm)',
      ':hover': {
        background: 'hsl(var(--state-error) / 0.9)',
        boxShadow: 'var(--shadow-md)',
      },
    },
  };

  // Tamaños
  const sizes = {
    sm: { padding: 'var(--space-xs) var(--space-sm)', fontSize: '12px' },
    md: { padding: 'var(--space-sm) var(--space-lg)', fontSize: '14px' },
    lg: { padding: 'var(--space-md) var(--space-xl)', fontSize: '16px' },
  };

  // Aplicar estilos
  Object.assign(btn.style, baseStyles, variants[variant] || variants.primary, sizes[size] || sizes.md);

  // Contenido
  if (icon) {
    const iconSpan = document.createElement('span');
    iconSpan.innerHTML = icon;
    btn.appendChild(iconSpan);
  }

  const labelSpan = document.createElement('span');
  labelSpan.textContent = label;
  btn.appendChild(labelSpan);

  // Estados hover y active
  btn.addEventListener('mouseenter', () => {
    if (variants[variant]?.[':hover']) {
      Object.assign(btn.style, variants[variant][':hover']);
    }
  });

  btn.addEventListener('mouseleave', () => {
    Object.assign(btn.style, variants[variant] || variants.primary);
  });

  btn.addEventListener('mousedown', () => {
    btn.style.transform = 'scale(0.98)';
  });

  btn.addEventListener('mouseup', () => {
    btn.style.transform = 'scale(1)';
  });

  if (onClick) {
    btn.addEventListener('click', onClick);
  }

  return btn;
}
