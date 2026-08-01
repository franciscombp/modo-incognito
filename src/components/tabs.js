/**
 * TABS CENTRALIZADO
 */

export function createTabs(tabs = []) {
  const container = document.createElement('div');

  const tabButtons = document.createElement('div');
  tabButtons.style.cssText = `
    display: flex;
    gap: var(--space-sm);
    border-bottom: 1px solid hsl(var(--border-100));
    margin-bottom: var(--space-lg);
  `;

  const tabContents = document.createElement('div');

  tabs.forEach((tab, idx) => {
    const button = document.createElement('button');
    button.textContent = tab.label;
    button.style.cssText = `
      padding: var(--space-sm) var(--space-md);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: var(--transition-fast);
      color: hsl(var(--text-100));
      font-weight: 600;
    `;

    const content = document.createElement('div');
    content.innerHTML = tab.content;
    content.style.display = idx === 0 ? 'block' : 'none';

    button.addEventListener('click', () => {
      Array.from(tabContents.children).forEach(el => el.style.display = 'none');
      Array.from(tabButtons.children).forEach(el => {
        el.style.borderBottomColor = 'transparent';
        el.style.color = 'hsl(var(--text-100))';
      });

      content.style.display = 'block';
      button.style.borderBottomColor = 'hsl(var(--accent-main))';
      button.style.color = 'hsl(var(--text-000))';
    });

    if (idx === 0) {
      button.style.borderBottomColor = 'hsl(var(--accent-main))';
      button.style.color = 'hsl(var(--text-000))';
    }

    tabButtons.appendChild(button);
    tabContents.appendChild(content);
  });

  container.appendChild(tabButtons);
  container.appendChild(tabContents);

  return container;
}
