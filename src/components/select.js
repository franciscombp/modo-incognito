/**
 * SELECT CENTRALIZADO
 */

export function createSelect(options = []) {
  const select = document.createElement('select');
  select.style.cssText = `
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: white;
    border: 1px solid hsl(var(--border-100));
    border-radius: var(--radius-md);
    color: hsl(var(--text-000));
    font-size: 14px;
    font-family: inherit;
    transition: var(--transition-fast);
    cursor: pointer;
  `;

  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });

  select.addEventListener('focus', () => {
    select.style.borderColor = 'hsl(var(--accent-main))';
    select.style.boxShadow = '0 0 0 2px hsl(var(--accent-main) / 0.1)';
  });

  select.addEventListener('blur', () => {
    select.style.borderColor = 'hsl(var(--border-100))';
    select.style.boxShadow = 'none';
  });

  return select;
}
