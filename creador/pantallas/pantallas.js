// Modo Incógnito — Comprehensive Design System Storybook
// Sistema de diseño unificado para el juego y herramientas (builders)

// Structured components following atomic design principles
const SECTIONS = {
  // ═══════════════════════════════════════════════════════════════
  // FOUNDATIONS
  // ═══════════════════════════════════════════════════════════════

  branding: {
    category: 'Foundations',
    index: '01',
    title: 'Colors & Tokens',
    items: [
      {
        label: 'Brand Accent Red',
        html: `<div style="display: flex; gap: 20px; align-items: center;">
          <div style="width: 80px; height: 80px; background: hsl(var(--accent-main)); border-radius: 16px; box-shadow: 0 12px 24px hsl(var(--accent-main) / 0.2);"></div>
          <div>
            <div style="font-weight: 800; font-size: 18px; color: hsl(var(--text-000));">Accent Main</div>
            <code style="font-size: 12px; opacity: 0.6;">hsl(var(--accent-main))</code>
            <div style="font-size: 12px; opacity: 0.5; margin-top: 4px;">355° 66.67% 33.3%</div>
          </div>
        </div>`,
        css: `/* Brand Accent */
--accent-main: 355 66.67% 33.3%;  /* Vibrant Red */
--accent-primary: hsl(var(--accent-main));`
      },
      {
        label: 'Accent Blue',
        html: `<div style="display: flex; gap: 20px; align-items: center;">
          <div style="width: 80px; height: 80px; background: hsl(var(--accent-blue)); border-radius: 16px; box-shadow: 0 12px 24px hsl(var(--accent-blue) / 0.2);"></div>
          <div>
            <div style="font-weight: 800; font-size: 18px; color: hsl(var(--text-000));">Accent Secondary</div>
            <code style="font-size: 12px; opacity: 0.6;">hsl(var(--accent-blue))</code>
            <div style="font-size: 12px; opacity: 0.5; margin-top: 4px;">235° 85% 50%</div>
          </div>
        </div>`,
        css: `/* Secondary Accent */
--accent-blue: 235 85% 50%;  /* Bright Blue */`
      },
      {
        label: 'Surface Colors',
        html: `<div style="display: flex; gap: 16px;">
          <div style="flex: 1; aspect-ratio: 1; background: hsl(var(--bg-000)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; font-size: 10px; font-weight: 600;">BG-000</div>
          <div style="flex: 1; aspect-ratio: 1; background: hsl(var(--bg-050)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; font-size: 10px; font-weight: 600;">BG-050</div>
          <div style="flex: 1; aspect-ratio: 1; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; font-size: 10px; font-weight: 600;">BG-100</div>
        </div>`,
        css: `/* Surface Colors */
--bg-000: 45 30% 96%;   /* Paper Cream */
--bg-050: 45 28% 95%;   /* Light Cream */
--bg-100: 45 25% 94%;   /* Darker Cream */`
      },
      {
        label: 'Text Colors',
        html: `<div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="color: hsl(var(--text-000)); font-weight: 700;">Text 000 - Pitch Black</div>
          <div style="color: hsl(var(--text-100)); font-weight: 600;">Text 100 - Dark Ink</div>
          <div style="color: hsl(var(--text-200));">Text 200 - Medium Gray</div>
          <div style="color: hsl(var(--text-faint)); font-size: 13px;">Text Faint - Light Gray</div>
        </div>`,
        css: `/* Text Colors */
--text-000: 0 0% 5%;      /* Pitch Black */
--text-100: 0 0% 15%;     /* Dark Ink */
--text-200: 0 0% 35%;     /* Medium Gray */
--text-faint: 0 0% 55%;   /* Light Gray */`
      }
    ]
  },

  typography: {
    category: 'Foundations',
    index: '02',
    title: 'Typography Hierarchy',
    items: [
      {
        label: 'H1 - Display',
        html: '<h1 style="font-size: 56px; line-height: 1; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Modo Incógnito</h1>',
        css: `h1 {
  font-family: var(--font-display);
  font-size: 56px;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
}`
      },
      {
        label: 'H2 - Interface',
        html: '<h2 style="font-size: 48px; font-weight: 800; letter-spacing: -0.04em; margin: 0;">Día 1 - El Ascensor</h2>',
        css: `h2 {
  font-family: var(--font-sans);
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.04em;
}`
      },
      {
        label: 'H3 - Section Title',
        html: '<h3 style="font-size: 32px; font-weight: 700; margin: 0;">Selecciona tu personaje</h3>',
        css: `h3 {
  font-size: 32px;
  font-weight: 700;
}`
      },
      {
        label: 'Body Text',
        html: '<p style="font-size: 14px; line-height: 1.6; max-width: 600px; margin: 0;">Este es un párrafo de contenido regular con información importante. Utiliza la familia sans para legibilidad óptima en interfaces.</p>',
        css: `body, p {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  color: hsl(var(--text-000));
}`
      },
      {
        label: 'Monospace Code',
        html: '<code style="font-family: var(--font-mono); font-size: 13px; background: hsl(var(--bg-050)); padding: 4px 8px; border-radius: 4px;">const character = "giuli";</code>',
        css: `code {
  font-family: var(--font-mono);
  font-size: 13px;
  background: hsl(var(--bg-050));
  padding: 4px 8px;
  border-radius: 4px;
}`
      },
      {
        label: 'Muted / Secondary',
        html: '<p class="text-muted" style="font-size: 14px; margin: 0;">Descripción secundaria o información menos importante.</p>',
        css: `.text-muted {
  color: hsl(var(--text-200));
}`
      }
    ]
  },

  surfaces: {
    category: 'Foundations',
    index: '03',
    title: 'Surfaces & Textures',
    items: [
      {
        label: 'Glass Panel',
        html: `<div class="glass-card" style="width: 300px; padding: 20px; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 16px;">
          <h4 style="margin-top: 0; margin-bottom: 8px;">Glass Morphism</h4>
          <p style="margin: 0; font-size: 13px; opacity: 0.8;">Efecto de cristal translúcido con blur effect.</p>
        </div>`,
        css: `.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
}`
      },
      {
        label: 'Panel Regular',
        html: `<div class="panel" style="width: 300px; padding: 20px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 16px;">
          <h4 style="margin-top: 0; margin-bottom: 8px;">Panel Base</h4>
          <p style="margin: 0; font-size: 13px;">Superficie estándar con borde sutil.</p>
        </div>`,
        css: `.panel {
  background: hsl(var(--bg-100));
  border: 1px solid hsl(var(--border-100));
  border-radius: 16px;
  padding: 20px;
}`
      },
      {
        label: 'Dotted Background',
        html: `<div class="bg-dotted" style="width: 100%; height: 160px; background-image: radial-gradient(hsl(var(--text-000) / 0.12) 1.2px, transparent 0); background-size: 24px 24px; border-radius: 12px; display: grid; place-items: center;">
          <span style="background: hsl(var(--bg-000)); padding: 12px 24px; border-radius: 8px; font-weight: 600; border: 1px solid hsl(var(--border-100));">.bg-dotted</span>
        </div>`,
        css: `.bg-dotted {
  background-image: radial-gradient(hsl(var(--text-000) / 0.12) 1.2px, transparent 0);
  background-size: 24px 24px;
}`
      },
      {
        label: 'Elevated Shadow',
        html: `<div style="width: 200px; height: 120px; background: hsl(var(--bg-050)); border-radius: 16px; box-shadow: var(--shadow-md); display: grid; place-items: center; font-weight: 600;">
          box-shadow: var(--shadow-md)
        </div>`,
        css: `.elevated {
  box-shadow: var(--shadow-md);
  /* or --shadow-lg for stronger effect */
}`
      }
    ]
  },

  spacing: {
    category: 'Foundations',
    index: '04',
    title: 'Spacing & Grid',
    items: [
      {
        label: 'Spacing Scale',
        html: `<div style="display: flex; flex-direction: column; gap: 24px;">
          <div><div style="width: 32px; height: 32px; background: hsl(var(--accent-main)); border-radius: 4px;"></div><code style="font-size: 11px;">xs: 4px</code></div>
          <div><div style="width: 48px; height: 32px; background: hsl(var(--accent-main)); border-radius: 4px;"></div><code style="font-size: 11px;">sm: 8px</code></div>
          <div><div style="width: 80px; height: 32px; background: hsl(var(--accent-main)); border-radius: 4px;"></div><code style="font-size: 11px;">md: 16px</code></div>
          <div><div style="width: 128px; height: 32px; background: hsl(var(--accent-main)); border-radius: 4px;"></div><code style="font-size: 11px;">lg: 24px</code></div>
        </div>`,
        css: `--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 40px;
--space-2xl: 64px;
--space-3xl: 100px;`
      },
      {
        label: 'Border Radius',
        html: `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
          <div style="width: 100%; aspect-ratio: 1; background: hsl(var(--accent-main)); border-radius: var(--radius-sm); display: grid; place-items: center; font-size: 11px;">sm</div>
          <div style="width: 100%; aspect-ratio: 1; background: hsl(var(--accent-main)); border-radius: var(--radius-md); display: grid; place-items: center; font-size: 11px;">md</div>
          <div style="width: 100%; aspect-ratio: 1; background: hsl(var(--accent-main)); border-radius: var(--radius-lg); display: grid; place-items: center; font-size: 11px;">lg</div>
          <div style="width: 100%; aspect-ratio: 1; background: hsl(var(--accent-main)); border-radius: var(--radius-full); display: grid; place-items: center; font-size: 11px;">full</div>
        </div>`,
        css: `--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 20px;
--radius-full: 9999px;`
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // ATOMS
  // ═══════════════════════════════════════════════════════════════

  buttons: {
    category: 'Atoms',
    index: '05',
    title: 'Buttons & Actions',
    items: [
      {
        label: 'Primary Button',
        html: '<button class="btn">Aceptar</button>',
        css: `.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-lg);
  background: hsl(var(--accent-main));
  color: white;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-fast);
}`
      },
      {
        label: 'Secondary Button',
        html: '<button class="btn secondary">Cancelar</button>',
        css: `.btn.secondary {
  background: white;
  color: hsl(var(--text-000));
  border: 1px solid hsl(var(--border-100));
}`
      },
      {
        label: 'Button Group',
        html: `<div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn">Aceptar</button>
          <button class="btn secondary">Cancelar</button>
          <button class="btn" disabled>Deshabilitado</button>
        </div>`,
        css: `.btn {
  /* Apply to button groups */
  transition: var(--transition-fast);
}

.btn:hover {
  box-shadow: var(--shadow-md);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}`
      },
      {
        label: 'Button with Icon',
        html: '<button class="btn">✓ Confirmar</button>',
        css: `.btn {
  gap: var(--space-sm);
  display: inline-flex;
  align-items: center;
}`
      }
    ]
  },

  tags: {
    category: 'Atoms',
    index: '06',
    title: 'Tags & Indicators',
    items: [
      {
        label: 'Tag Basic',
        html: '<span class="chip">Trabajo</span>',
        css: `.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: hsl(var(--bg-050));
  border: 1px solid hsl(var(--border-100));
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}`
      },
      {
        label: 'Badge Status',
        html: `<div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <span class="badge">3</span>
          <span class="badge secondary">5</span>
          <span class="badge success">✓</span>
        </div>`,
        css: `.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-full);
  background: hsl(var(--accent-main));
  color: white;
  font-size: 12px;
  font-weight: 600;
}`
      },
      {
        label: 'Multiple Tags',
        html: `<div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span class="chip">Día 1</span>
          <span class="chip">Ascensor</span>
          <span class="chip">Sigilo</span>
          <span class="chip">Completado ✓</span>
        </div>`,
        css: `.chip {
  padding: 6px 12px;
  gap: 6px;
  font-size: 12px;
}`
      }
    ]
  },

  forms: {
    category: 'Atoms',
    index: '07',
    title: 'Form Elements',
    items: [
      {
        label: 'Text Input',
        html: '<input type="text" placeholder="Escribe tu nombre..." style="padding: 10px 16px; border: 1px solid hsl(var(--border-100)); border-radius: var(--radius-md); font-size: 14px; width: 100%; max-width: 300px; font-family: inherit;" />',
        css: `input[type="text"],
input[type="email"],
input[type="password"] {
  padding: 10px 16px;
  border: 1px solid hsl(var(--border-100));
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
}`
      },
      {
        label: 'Select Dropdown',
        html: `<select style="padding: 10px 16px; border: 1px solid hsl(var(--border-100)); border-radius: var(--radius-md); font-size: 14px; width: 100%; max-width: 300px; font-family: inherit;">
          <option>Personaje 1</option>
          <option>Personaje 2</option>
          <option>Personaje 3</option>
        </select>`,
        css: `select {
  padding: 10px 16px;
  border: 1px solid hsl(var(--border-100));
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: inherit;
}`
      },
      {
        label: 'Checkbox & Radio',
        html: `<div style="display: flex; flex-direction: column; gap: 12px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" checked /> Aceptar términos
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="opt" /> Opción A
          </label>
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="radio" name="opt" checked /> Opción B
          </label>
        </div>`,
        css: `input[type="checkbox"],
input[type="radio"] {
  cursor: pointer;
  accent-color: hsl(var(--accent-main));
}`
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // MOLECULES
  // ═══════════════════════════════════════════════════════════════

  cards: {
    category: 'Molecules',
    index: '08',
    title: 'Cards & Panels',
    items: [
      {
        label: 'Simple Card',
        html: `<div class="panel" style="width: 300px; padding: 20px;">
          <h4 style="margin-top: 0; margin-bottom: 12px;">Título de Tarjeta</h4>
          <p class="text-muted" style="margin: 0; font-size: 14px;">Descripción o contenido de la tarjeta con información relevante.</p>
        </div>`,
        css: `.panel {
  background: hsl(var(--bg-100));
  border: 1px solid hsl(var(--border-100));
  border-radius: 16px;
  padding: 20px;
}`
      },
      {
        label: 'Glass Card',
        html: `<div class="glass-card" style="width: 300px; padding: 20px;">
          <h4 style="margin-top: 0; margin-bottom: 12px;">Glass Morphism</h4>
          <p style="margin: 0; font-size: 14px; opacity: 0.8;">Con backdrop filter y borde translúcido.</p>
        </div>`,
        css: `.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 20px;
}`
      },
      {
        label: 'Interactive Card',
        html: `<div class="panel" style="width: 300px; padding: 20px; cursor: pointer; transition: var(--transition-fast);" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='none'">
          <h4 style="margin-top: 0; margin-bottom: 8px;">Tarjeta Interactiva</h4>
          <p class="text-muted" style="margin: 0 0 16px 0; font-size: 14px;">Hover para ver efecto de elevación.</p>
          <button class="btn" style="width: 100%; font-size: 12px;">Acción</button>
        </div>`,
        css: `.panel {
  transition: var(--transition-base);
}

.panel:hover {
  box-shadow: var(--shadow-md);
  background: hsl(var(--bg-050));
}`
      }
    ]
  },

  logic: {
    category: 'Molecules',
    index: '09',
    title: 'Logic Elements (Tabs, Accordions)',
    items: [
      {
        label: 'Tabs Control',
        html: `<div class="tabs-control" style="display: flex; gap: 4px; background: hsl(var(--bg-050)); border: 1px solid hsl(var(--border-100)); padding: 6px; border-radius: var(--radius-md); width: fit-content;">
          <button class="tab-trigger active" style="padding: 8px 16px; border-radius: var(--radius-sm); background: hsl(var(--text-000)); color: hsl(var(--bg-000)); border: none; font-weight: 600; cursor: pointer;">Día 1</button>
          <button class="tab-trigger" style="padding: 8px 16px; border-radius: var(--radius-sm); background: transparent; border: none; cursor: pointer;">Día 2</button>
          <button class="tab-trigger" style="padding: 8px 16px; border-radius: var(--radius-sm); background: transparent; border: none; cursor: pointer;">Día 3</button>
        </div>`,
        css: `.tabs-control {
  display: flex;
  gap: 4px;
  background: hsl(var(--bg-050));
  border: 1px solid hsl(var(--border-100));
  padding: 6px;
  border-radius: var(--radius-md);
}

.tab-trigger.active {
  background: hsl(var(--text-000));
  color: hsl(var(--bg-000));
}`
      },
      {
        label: 'Accordion Item',
        html: `<div style="border-bottom: 1px solid hsl(var(--border-100));">
          <button class="accordion-header" style="width: 100%; padding: 20px 0; display: flex; justify-content: space-between; align-items: center; background: none; border: none; cursor: pointer; text-align: left; font-weight: 600;">
            ¿Cómo ocultar que trabajas?
            <span style="font-weight: 400;">▼</span>
          </button>
          <div class="accordion-content" style="padding: 0 0 20px 0; display: none;">
            <p style="margin: 0; opacity: 0.8;">Siéntate en un lugar seguro y pretende trabajar. El jefe pasará y creerá que estás siendo productivo.</p>
          </div>
        </div>`,
        css: `.accordion-header {
  width: 100%;
  padding: 20px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-weight: 600;
  transition: var(--transition-fast);
}

.accordion-header:hover {
  color: hsl(var(--accent-main));
}`
      }
    ]
  },

  gameui: {
    category: 'Molecules',
    index: '10',
    title: 'Game UI Components',
    items: [
      {
        label: 'Time Display (HUD)',
        html: `<div style="display: flex; align-items: center; gap: 12px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; padding: 12px 16px; width: fit-content;">
          <span style="font-size: 11px; color: hsl(var(--text-faint)); text-transform: uppercase; font-weight: 600;">TIEMPO</span>
          <span style="font-family: var(--font-mono); font-size: 18px; font-weight: 800; color: hsl(var(--accent-main));">23:45</span>
        </div>`,
        css: `/* Time Display */
.hud-timer {
  display: flex;
  align-items: center;
  gap: 12px;
  background: hsl(var(--bg-100));
  border: 1px solid hsl(var(--border-100));
  padding: 12px 16px;
  border-radius: 12px;
  font-family: var(--font-mono);
}`
      },
      {
        label: 'Suspicion Meter',
        html: `<div style="width: 280px;">
          <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; color: hsl(var(--text-faint));">Sospecha</div>
          <div style="width: 100%; height: 8px; background: hsl(var(--bg-050)); border-radius: 4px; overflow: hidden; border: 1px solid hsl(var(--border-100));">
            <div style="width: 65%; height: 100%; background: linear-gradient(90deg, hsl(120, 70%, 50%), hsl(0, 84%, 60%)); border-radius: 4px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px; color: hsl(var(--text-faint));">
            <span>Baja</span>
            <span>Media</span>
            <span>Crítica</span>
          </div>
        </div>`,
        css: `/* Meter Bar */
.meter-bar {
  width: 100%;
  height: 8px;
  background: hsl(var(--bg-050));
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid hsl(var(--border-100));
}

.meter-fill {
  height: 100%;
  background: linear-gradient(90deg, hsl(120, 70%, 50%), hsl(0, 84%, 60%));
  transition: width 0.3s ease;
}`
      },
      {
        label: 'Activity Button',
        html: `<button class="btn" style="width: 100%; max-width: 240px; height: 64px; font-size: 14px; flex-direction: column;">
          <span style="font-size: 11px; opacity: 0.8; text-transform: uppercase;">Café</span>
          <span style="font-weight: 800; font-size: 16px;">Sala de Café</span>
          <span style="font-size: 10px; opacity: 0.6;">5 min | +5 min</span>
        </button>`,
        css: `/* Activity Button */
.activity-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 64px;
  gap: 4px;
}

.activity-name {
  font-weight: 800;
  font-size: 16px;
}

.activity-meta {
  font-size: 10px;
  opacity: 0.6;
}`
      }
    ]
  },

  layouts: {
    category: 'Molecules',
    index: '11',
    title: 'Layout Patterns',
    items: [
      {
        label: 'Flex Row',
        html: `<div style="display: flex; gap: 16px; width: 100%; max-width: 400px;">
          <button class="btn" style="flex: 1; font-size: 12px;">Elemento 1</button>
          <button class="btn" style="flex: 1; font-size: 12px;">Elemento 2</button>
          <button class="btn" style="flex: 1; font-size: 12px;">Elemento 3</button>
        </div>`,
        css: `.flex-row {
  display: flex;
  gap: 16px;
}

.flex-row > * {
  flex: 1;
}`
      },
      {
        label: 'Flex Column',
        html: `<div style="display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px;">
          <button class="btn" style="width: 100%; font-size: 12px;">Elemento 1</button>
          <button class="btn" style="width: 100%; font-size: 12px;">Elemento 2</button>
          <button class="btn" style="width: 100%; font-size: 12px;">Elemento 3</button>
        </div>`,
        css: `.flex-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
}`
      },
      {
        label: 'Space Between',
        html: `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%; max-width: 400px; padding: 16px; background: hsl(var(--bg-100)); border-radius: 12px;">
          <span style="font-weight: 600;">Izquierda</span>
          <span style="font-weight: 600;">Derecha</span>
        </div>`,
        css: `.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}`
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // ORGANISMS
  // ═══════════════════════════════════════════════════════════════

  dialogs: {
    category: 'Organisms',
    index: '12',
    title: 'Dialogs & Modals',
    items: [
      {
        label: 'Confirmation Dialog',
        html: `<div class="panel" style="width: 400px; padding: 32px;">
          <h2 style="margin-top: 0; margin-bottom: 16px; font-size: 20px;">Confirmación</h2>
          <p style="margin: 0 0 24px 0; color: hsl(var(--text-100)); font-size: 14px;">¿Está seguro de que desea ir a esta actividad?</p>
          <div style="display: flex; gap: 12px;">
            <button class="btn" style="flex: 1; font-size: 13px;">Sí, continuar</button>
            <button class="btn secondary" style="flex: 1; font-size: 13px;">Cancelar</button>
          </div>
        </div>`,
        css: `/* Dialog Box */
.dialog {
  background: hsl(var(--bg-100));
  border: 1px solid hsl(var(--border-100));
  border-radius: 20px;
  padding: 32px;
  box-shadow: var(--shadow-lg);
}`
      },
      {
        label: 'Alert Success',
        html: `<div class="panel" style="width: 350px; padding: 20px; border-left: 4px solid hsl(120, 70%, 50%);">
          <h4 style="margin-top: 0; margin-bottom: 8px; color: hsl(120, 70%, 50%); font-size: 16px;">✓ Éxito</h4>
          <p style="margin: 0; font-size: 13px; color: hsl(var(--text-100));">La operación se completó correctamente.</p>
        </div>`,
        css: `/* Alert Success */
.alert-success {
  border-left: 4px solid hsl(120, 70%, 50%);
  color: hsl(120, 70%, 50%);
}`
      },
      {
        label: 'Alert Error',
        html: `<div class="panel" style="width: 350px; padding: 20px; border-left: 4px solid hsl(0, 84%, 60%);">
          <h4 style="margin-top: 0; margin-bottom: 8px; color: hsl(0, 84%, 60%); font-size: 16px;">⚠ Error</h4>
          <p style="margin: 0; font-size: 13px; color: hsl(var(--text-100));">Ocurrió un problema. Por favor intente de nuevo.</p>
        </div>`,
        css: `/* Alert Error */
.alert-error {
  border-left: 4px solid hsl(0, 84%, 60%);
  color: hsl(0, 84%, 60%);
}`
      }
    ]
  },

  chat: {
    category: 'Organisms',
    index: '13',
    title: 'Chat & Messages',
    items: [
      {
        label: 'Chat Message (Player)',
        html: `<div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
          <div style="max-width: 300px; background: hsl(var(--accent-main)); color: white; padding: 12px 16px; border-radius: 16px; border-bottom-right-radius: 4px; font-size: 13px;">
            Hola Gabo, ¿dónde estabas?
          </div>
        </div>`,
        css: `/* Player Message */
.chat-message.player {
  display: flex;
  justify-content: flex-end;
}

.chat-message.player .bubble {
  background: hsl(var(--accent-main));
  color: white;
}`
      },
      {
        label: 'Chat Message (NPC)',
        html: `<div style="display: flex; justify-content: flex-start; margin-bottom: 12px;">
          <div style="max-width: 300px; background: hsl(var(--bg-100)); color: hsl(var(--text-000)); border: 1px solid hsl(var(--border-100)); padding: 12px 16px; border-radius: 16px; border-bottom-left-radius: 4px; font-size: 13px;">
            En la sala de café, obvio. ¿Y vos?
          </div>
        </div>`,
        css: `/* NPC Message */
.chat-message.npc {
  display: flex;
  justify-content: flex-start;
}

.chat-message.npc .bubble {
  background: hsl(var(--bg-100));
  border: 1px solid hsl(var(--border-100));
}`
      }
    ]
  },

  // ═══════════════════════════════════════════════════════════════
  // IDENTITY
  // ═══════════════════════════════════════════════════════════════

  branding2: {
    category: 'Identity',
    index: '14',
    title: 'Branding & Voice',
    items: [
      {
        label: 'Logo & Branding',
        html: `<div style="text-align: center; padding: 40px 20px;">
          <h1 style="font-size: 48px; font-weight: 800; letter-spacing: -0.04em; margin: 0; color: hsl(var(--accent-main));">MODO</h1>
          <h2 style="font-size: 36px; font-weight: 800; letter-spacing: -0.04em; margin: 0; color: hsl(var(--text-000));">INCÓGNITO</h2>
          <p style="margin-top: 16px; font-size: 13px; color: hsl(var(--text-faint)); text-transform: uppercase; letter-spacing: 0.15em;">Fingir que trabajas es un arte</p>
        </div>`,
        css: `/* Logo Branding */
.brand-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: hsl(var(--accent-main));
}`
      },
      {
        label: 'Icon Set Reference',
        html: `<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; padding: 20px 0;">
          <div style="text-align: center;">
            <div style="width: 48px; height: 48px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; margin: 0 auto 12px; font-size: 24px;">☕</div>
            <span style="font-size: 12px; font-weight: 600;">Café</span>
          </div>
          <div style="text-align: center;">
            <div style="width: 48px; height: 48px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; margin: 0 auto 12px; font-size: 24px;">🎬</div>
            <span style="font-size: 12px; font-weight: 600;">Película</span>
          </div>
          <div style="text-align: center;">
            <div style="width: 48px; height: 48px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; margin: 0 auto 12px; font-size: 24px;">🍽️</div>
            <span style="font-size: 12px; font-weight: 600;">Comer</span>
          </div>
          <div style="text-align: center;">
            <div style="width: 48px; height: 48px; background: hsl(var(--bg-100)); border: 1px solid hsl(var(--border-100)); border-radius: 12px; display: grid; place-items: center; margin: 0 auto 12px; font-size: 24px;">👀</div>
            <span style="font-size: 12px; font-weight: 600;">Vigilante</span>
          </div>
        </div>
        <p style="margin-top: 20px; padding: 16px; background: rgba(200, 30, 52, 0.1); border-left: 4px solid hsl(var(--accent-main)); border-radius: 8px; font-size: 12px;">
          <strong>Nota:</strong> Para una interfaz profesional, usar <code>Phosphore Icon Library</code> en lugar de emojis.
        </p>`,
        css: `/* Use Phosphore Icons */
/* @import url('https://phosphoricons.com'); */
.icon {
  width: 24px;
  height: 24px;
  color: currentColor;
}`
      }
    ]
  }
};

// Initialize app
let currentSection = 'branding';

function renderSidebar() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';

  const categories = {};

  // Group sections by category
  Object.entries(SECTIONS).forEach(([key, section]) => {
    if (!categories[section.category]) {
      categories[section.category] = [];
    }
    categories[section.category].push({ key, ...section });
  });

  // Render groups
  Object.entries(categories).forEach(([categoryName, items]) => {
    const group = document.createElement('div');
    group.className = 'sb-nav-group';

    const title = document.createElement('div');
    title.className = 'sb-nav-title';
    title.textContent = categoryName;
    group.appendChild(title);

    items.forEach(item => {
      const link = document.createElement('a');
      link.className = `sb-nav-link ${currentSection === item.key ? 'active' : ''}`;
      link.href = `#${item.key}`;
      link.textContent = item.title;
      link.onclick = (e) => {
        e.preventDefault();
        currentSection = item.key;
        renderSidebar();
        renderContent();
      };
      group.appendChild(link);
    });

    nav.appendChild(group);
  });
}

function renderContent() {
  const main = document.getElementById('main-content');
  const section = SECTIONS[currentSection];

  if (!section) return;

  let html = `
    <section class="sb-section">
      <h2 class="sb-section-title">
        <span>${section.index}</span> ${section.title}
      </h2>
      <div class="sb-grid">
  `;

  section.items.forEach(item => {
    html += `
      <div class="sb-box">
        <span class="sb-label">${item.label}</span>
        <div style="margin-bottom: 20px;">
          ${item.html}
        </div>
        ${item.css ? `<div class="sb-code-block"><pre>${escapeHtml(item.css)}</pre></div>` : ''}
      </div>
    `;
  });

  html += `</div></section>`;
  main.innerHTML = html;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Theme toggle
document.addEventListener('DOMContentLoaded', () => {
  renderSidebar();
  renderContent();

  const themeToggle = document.getElementById('theme-toggle');
  themeToggle?.addEventListener('click', () => {
    document.documentElement.setAttribute(
      'data-theme',
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
    );
  });
});
