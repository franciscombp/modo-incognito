/**
 * INPUT CENTRALIZADO
 */

export function createInput(type = 'text') {
  const input = document.createElement('input');
  input.type = type;
  input.style.cssText = `
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: white;
    border: 1px solid hsl(var(--border-100));
    border-radius: var(--radius-md);
    color: hsl(var(--text-000));
    font-size: 14px;
    font-family: inherit;
    transition: var(--transition-fast);
  `;

  input.addEventListener('focus', () => {
    input.style.borderColor = 'hsl(var(--accent-main))';
    input.style.boxShadow = '0 0 0 2px hsl(var(--accent-main) / 0.1)';
    input.style.outline = 'none';
  });

  input.addEventListener('blur', () => {
    input.style.borderColor = 'hsl(var(--border-100))';
    input.style.boxShadow = 'none';
  });

  return input;
}
