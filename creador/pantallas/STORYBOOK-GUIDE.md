# Modo Incógnito Storybook & Design System Guide

## Overview

This is a comprehensive design system storybook organized by atomic design principles:
- **Foundations** (4 sections): Colors, Typography, Surfaces, Spacing
- **Atoms** (3 sections): Buttons, Tags, Forms
- **Molecules** (4 sections): Cards, Logic Elements, Game UI, Layouts
- **Organisms** (3 sections): Dialogs, Chat/Messages
- **Identity** (1 section): Branding

## Using Phosphore Icons

Instead of emojis (❌), we use **[Phosphore Icons](https://phosphoricons.com)** for a professional, consistent interface.

### Import Phosphore in Your Component

```html
<link rel="stylesheet" href="https://phosphoricons.com/phosphore.css">
```

### Basic Usage

```html
<!-- Phosphor Icon -->
<i class="ph ph-coffee"></i>

<!-- With custom size and color -->
<i class="ph ph-coffee" style="font-size: 24px; color: hsl(var(--accent-main));"></i>

<!-- In a button -->
<button class="btn">
  <i class="ph ph-check"></i>
  Confirmar
</button>
```

### Common Phosphore Icons for Modo Incógnito

| Activity | Icon | Code |
|----------|------|------|
| Café | `ph-coffee` | `<i class="ph ph-coffee"></i>` |
| Película | `ph-film-slate` | `<i class="ph ph-film-slate"></i>` |
| Comer | `ph-fork-knife` | `<i class="ph ph-fork-knife"></i>` |
| Vigilante | `ph-eye` | `<i class="ph ph-eye"></i>` |
| Mensaje | `ph-chat-circle` | `<i class="ph ph-chat-circle"></i>` |
| Reloj | `ph-clock` | `<i class="ph ph-clock"></i>` |
| Tema | `ph-moon` / `ph-sun` | `<i class="ph ph-moon"></i>` |
| Menú | `ph-list` | `<i class="ph ph-list"></i>` |
| Cerrar | `ph-x` | `<i class="ph ph-x"></i>` |
| Completado | `ph-check` | `<i class="ph ph-check"></i>` |

## Design System CSS Variables

All components use these CSS custom properties from `src/style/design-system.css`:

### Colors
```css
--accent-main: 355 66.67% 33.3%;    /* Vibrant Red */
--accent-blue: 235 85% 50%;          /* Bright Blue */
--bg-000: 45 30% 96%;                /* Paper Cream */
--bg-100: 45 25% 94%;                /* Darker Cream */
--text-000: 0 0% 5%;                 /* Pitch Black */
--text-faint: 0 0% 55%;              /* Light Gray */
```

### Spacing Scale
```css
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 40px;
```

### Radius
```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 20px;
--radius-full: 9999px;
```

### Transitions
```css
--transition-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

## Component Examples

### Primary Button
```html
<button class="btn">Aceptar</button>
```

### Secondary Button
```html
<button class="btn secondary">Cancelar</button>
```

### Glass Card (Modern)
```html
<div class="glass-card">
  <h4>Title</h4>
  <p>Content with glass morphism effect</p>
</div>
```

### Panel (Standard)
```html
<div class="panel">
  <h4>Title</h4>
  <p>Standard panel with border</p>
</div>
```

### Game HUD Timer
```html
<div class="hud-timer">
  <span class="hud-label">TIEMPO</span>
  <span class="hud-value">23:45</span>
</div>
```

## Dos and Don'ts

### ✅ DO

- Use Phosphore icons for all UI elements
- Follow the spacing scale (4px, 8px, 16px, 24px, etc.)
- Use semantic CSS variables (`--accent-main`, `--text-000`, etc.)
- Keep components reusable and modular
- Test responsiveness across screen sizes

### ❌ DON'T

- Use emojis in the interface (❌ ❌ ❌)
- Use hardcoded colors instead of CSS variables
- Create one-off components without adding to storybook
- Mix spacing scales (e.g., 15px, 22px)
- Assume a single screen size

## Adding New Components

1. Create the component in HTML/CSS
2. Add it to the storybook in `creador/pantallas/pantallas.js`
3. Include CSS code block with the component
4. Test in both light and dark modes
5. Document any special usage requirements

Example:
```javascript
{
  label: 'My Component',
  html: `<div class="my-component">Content</div>`,
  css: `.my-component {
  padding: var(--space-md);
  background: hsl(var(--bg-100));
}`
}
```

## Theme Switching

The storybook supports light and dark modes. Toggle via the theme button in the sidebar. All components should respect the color scheme using CSS custom properties.

## Navigation

- **Sidebar**: Click category names to filter by atomic design level
- **Sections**: Each section contains related components
- **Code Display**: View CSS for each component to copy and use

## Building for Production

```bash
npm run build
npm run preview
```

The storybook is served at `/creador/pantallas/` after build.

---

**Last Updated**: 2026-08-01  
**Design System Version**: 1.0 (MAL Approach)
