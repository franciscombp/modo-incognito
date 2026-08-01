/**
 * STORYBOOK AUTOMÁTICO
 * Visor de componentes centralizados desde src/components/
 * SIN DUPLICACIÓN: todo viene de la misma fuente
 */

import { COMPONENTS_CATALOG } from '../../src/components/index.js';

const COLORS = {
  light: {
    bg: '#faf8f5',
    text: '#050505',
    border: '#e5e5e5',
    accent: '#c21e34',
  },
  dark: {
    bg: '#0a0a0d',
    text: '#f8f8f8',
    border: '#333333',
    accent: '#ff5577',
  },
};

let currentTheme = 'light';

export function initStorybook(rootElement) {
  rootElement.innerHTML = '';

  // Sidebar
  const sidebar = document.createElement('aside');
  sidebar.style.cssText = `
    width: 280px;
    height: 100vh;
    background: ${COLORS[currentTheme].bg};
    border-right: 1px solid ${COLORS[currentTheme].border};
    padding: 24px;
    overflow-y: auto;
    font-family: system-ui;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    margin-bottom: 32px;
  `;

  const logo = document.createElement('h1');
  logo.textContent = 'Modo Incógnito';
  logo.style.cssText = `
    font-size: 18px;
    font-weight: 900;
    margin: 0 0 8px 0;
    color: ${COLORS[currentTheme].text};
  `;
  header.appendChild(logo);

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Component Library';
  subtitle.style.cssText = `
    font-size: 12px;
    color: #888;
    margin: 0;
  `;
  header.appendChild(subtitle);

  sidebar.appendChild(header);

  // Theme toggle
  const themeToggle = document.createElement('button');
  themeToggle.textContent = currentTheme === 'light' ? '🌙' : '☀️';
  themeToggle.style.cssText = `
    width: 100%;
    padding: 8px;
    border: 1px solid ${COLORS[currentTheme].border};
    background: transparent;
    cursor: pointer;
    border-radius: 6px;
    font-size: 14px;
    margin-bottom: 24px;
  `;
  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    location.reload();
  });
  sidebar.appendChild(themeToggle);

  // Category groups
  const categories = {};
  COMPONENTS_CATALOG.forEach(comp => {
    if (!categories[comp.category]) {
      categories[comp.category] = [];
    }
    categories[comp.category].push(comp);
  });

  // Render categories
  Object.entries(categories).forEach(([cat, comps]) => {
    const catLabel = document.createElement('h3');
    catLabel.textContent = cat.toUpperCase();
    catLabel.style.cssText = `
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #888;
      margin: 16px 0 8px 0;
      text-transform: uppercase;
    `;
    sidebar.appendChild(catLabel);

    comps.forEach(comp => {
      const link = document.createElement('a');
      link.textContent = comp.name;
      link.href = '#';
      link.style.cssText = `
        display: block;
        padding: 8px 12px;
        color: ${COLORS[currentTheme].text};
        text-decoration: none;
        border-radius: 4px;
        font-size: 13px;
        margin-bottom: 4px;
        cursor: pointer;
        transition: background 0.15s;
      `;
      link.addEventListener('mouseenter', () => {
        link.style.background = COLORS[currentTheme].accent;
        link.style.color = 'white';
      });
      link.addEventListener('mouseleave', () => {
        link.style.background = 'transparent';
        link.style.color = COLORS[currentTheme].text;
      });
      link.addEventListener('click', (e) => {
        e.preventDefault();
        renderComponent(comp);
      });
      sidebar.appendChild(link);
    });
  });

  // Main content
  const main = document.createElement('main');
  main.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 40px;
    background: ${COLORS[currentTheme].bg};
  `;

  rootElement.style.cssText = `
    display: flex;
    height: 100vh;
    background: ${COLORS[currentTheme].bg};
    color: ${COLORS[currentTheme].text};
    font-family: system-ui;
  `;
  rootElement.appendChild(sidebar);
  rootElement.appendChild(main);

  // Render first component by default
  if (COMPONENTS_CATALOG.length > 0) {
    renderComponent(COMPONENTS_CATALOG[0]);
  }

  function renderComponent(comp) {
    main.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = comp.name;
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 28px;
    `;
    main.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = comp.description;
    desc.style.cssText = `
      margin: 0 0 32px 0;
      color: #888;
      font-size: 14px;
    `;
    main.appendChild(desc);

    // Variants
    if (comp.variants && comp.variants.length > 0) {
      const variantsSection = document.createElement('div');
      variantsSection.style.cssText = `
        margin-bottom: 40px;
      `;

      const variantsTitle = document.createElement('h3');
      variantsTitle.textContent = 'Variants';
      variantsTitle.style.cssText = `
        font-size: 16px;
        margin: 0 0 16px 0;
        color: #888;
      `;
      variantsSection.appendChild(variantsTitle);

      const variantsGrid = document.createElement('div');
      variantsGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 24px;
      `;

      comp.variants.forEach(variant => {
        const card = document.createElement('div');
        card.style.cssText = `
          padding: 20px;
          border: 1px solid ${COLORS[currentTheme].border};
          border-radius: 8px;
          background: ${currentTheme === 'light' ? 'white' : '#1a1a1e'};
        `;

        const varLabel = document.createElement('p');
        varLabel.textContent = variant.label;
        varLabel.style.cssText = `
          font-size: 12px;
          font-weight: 600;
          margin: 0 0 12px 0;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        `;
        card.appendChild(varLabel);

        const element = variant.create();
        card.appendChild(element);

        variantsGrid.appendChild(card);
      });

      variantsSection.appendChild(variantsGrid);
      main.appendChild(variantsSection);
    } else {
      // Single preview
      const previewSection = document.createElement('div');
      previewSection.style.cssText = `
        padding: 40px;
        border: 1px solid ${COLORS[currentTheme].border};
        border-radius: 8px;
        background: ${currentTheme === 'light' ? 'white' : '#1a1a1e'};
        margin-bottom: 40px;
      `;

      const element = comp.create();
      previewSection.appendChild(element);
      main.appendChild(previewSection);
    }
  }
}
