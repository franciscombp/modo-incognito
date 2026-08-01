/**
 * DIALOG CENTRALIZADO
 * Usado en: Juego, Builders, Storybook
 */

export function createDialog(title, content, buttons = []) {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const dialog = document.createElement('div');
  dialog.style.cssText = `
    background: hsl(var(--bg-000));
    border: 2px solid hsl(var(--border-100));
    border-radius: var(--radius-lg);
    padding: var(--space-2xl);
    box-shadow: var(--shadow-xl);
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  `;

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  titleEl.style.cssText = `
    margin-top: 0;
    margin-bottom: var(--space-lg);
    font-size: 24px;
    color: hsl(var(--text-000));
  `;
  dialog.appendChild(titleEl);

  const contentEl = document.createElement('p');
  contentEl.textContent = content;
  contentEl.style.cssText = `
    margin: 0 0 var(--space-lg) 0;
    color: hsl(var(--text-100));
    line-height: 1.6;
  `;
  dialog.appendChild(contentEl);

  if (buttons.length > 0) {
    const actions = document.createElement('div');
    actions.style.cssText = `
      display: flex;
      gap: var(--space-md);
      margin-top: var(--space-xl);
    `;

    buttons.forEach(btn => {
      const button = document.createElement('button');
      button.textContent = btn.label;
      button.style.cssText = `
        flex: 1;
        padding: var(--space-sm) var(--space-lg);
        font-size: 14px;
        font-weight: 600;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: var(--transition-fast);
      `;

      if (btn.variant === 'primary') {
        button.style.background = 'hsl(var(--accent-main))';
        button.style.color = 'white';
        button.addEventListener('mouseenter', () => {
          button.style.background = 'hsl(var(--accent-main) / 0.9)';
          button.style.boxShadow = 'var(--shadow-md)';
        });
        button.addEventListener('mouseleave', () => {
          button.style.background = 'hsl(var(--accent-main))';
          button.style.boxShadow = 'var(--shadow-sm)';
        });
      } else {
        button.style.background = 'white';
        button.style.color = 'hsl(var(--text-000))';
        button.style.border = '1px solid hsl(var(--border-100))';
      }

      actions.appendChild(button);
    });

    dialog.appendChild(actions);
  }

  backdrop.appendChild(dialog);

  return backdrop;
}
