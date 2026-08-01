/**
 * CARD CENTRALIZADO
 */

export function createCard(variant = 'glass') {
  const card = document.createElement('div');

  const baseStyles = {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-lg)',
    boxShadow: 'var(--shadow-md)',
  };

  const variants = {
    glass: {
      background: 'var(--glass-light)',
      backdropFilter: 'var(--glass-blur-md)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
    },
    solid: {
      background: 'white',
      border: '1px solid hsl(var(--border-100))',
    },
  };

  Object.assign(card.style, baseStyles, variants[variant] || variants.glass);

  return card;
}
