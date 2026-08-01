/**
 * COMPONENTES CENTRALIZADOS
 *
 * Única fuente de verdad para ALL UI del juego, builders y storybook.
 * Cada componente es una función que devuelve un HTMLElement.
 * Todos usan exclusivamente variables del design-system.css
 */

import { createButton } from './button.js';
import { createPanel } from './panel.js';
import { createBadge } from './badge.js';
import { createDialog } from './dialog.js';
import { createAudioControl } from './audio-control.js';
import { createInput } from './input.js';
import { createSelect } from './select.js';
import { createTabs } from './tabs.js';
import { createCard } from './card.js';
import { createMeter } from './meter.js';

export {
  createButton,
  createPanel,
  createBadge,
  createDialog,
  createAudioControl,
  createInput,
  createSelect,
  createTabs,
  createCard,
  createMeter,
};

// Catálogo automático para el storybook
export const COMPONENTS_CATALOG = [
  {
    id: 'button-primary',
    name: 'Button Primary',
    category: 'atoms',
    description: 'Botón principal del sistema',
    create: () => createButton('Aceptar', { variant: 'primary' }),
    variants: [
      { label: 'Primary', create: () => createButton('Aceptar', { variant: 'primary' }) },
      { label: 'Secondary', create: () => createButton('Cancelar', { variant: 'secondary' }) },
      { label: 'Ghost', create: () => createButton('Ayuda', { variant: 'ghost' }) },
      { label: 'Danger', create: () => createButton('Eliminar', { variant: 'danger' }) },
    ],
  },
  {
    id: 'badge',
    name: 'Badge Status',
    category: 'atoms',
    description: 'Indicadores de estado',
    create: () => createBadge('Active', 'success'),
    variants: [
      { label: 'Success', create: () => createBadge('Success', 'success') },
      { label: 'Warning', create: () => createBadge('Warning', 'warning') },
      { label: 'Error', create: () => createBadge('Error', 'error') },
    ],
  },
  {
    id: 'panel',
    name: 'Panel',
    category: 'molecules',
    description: 'Contenedor base con borde y sombra',
    create: () => {
      const p = createPanel();
      p.innerHTML = '<h3 style="margin-top: 0;">Contenido del panel</h3><p>Esto es un panel reutilizable.</p>';
      return p;
    },
  },
  {
    id: 'card',
    name: 'Card',
    category: 'molecules',
    description: 'Tarjeta con glass morphism',
    create: () => {
      const c = createCard();
      c.innerHTML = '<h4>Tarjeta moderna</h4><p>Con efectos de vidrio.</p>';
      return c;
    },
  },
  {
    id: 'dialog',
    name: 'Dialog Modal',
    category: 'organisms',
    description: 'Diálogo modal del sistema',
    create: () => createDialog('Confirmación', '¿Estás seguro?', [
      { label: 'Cancelar', variant: 'secondary' },
      { label: 'Aceptar', variant: 'primary' },
    ]),
  },
  {
    id: 'audio-control',
    name: 'Audio Control',
    category: 'organisms',
    description: 'Control de audio y volumen',
    create: () => createAudioControl(),
  },
  {
    id: 'input',
    name: 'Text Input',
    category: 'atoms',
    description: 'Campo de entrada de texto',
    create: () => {
      const input = createInput('text');
      input.placeholder = 'Escribe algo...';
      return input;
    },
  },
  {
    id: 'select',
    name: 'Select Dropdown',
    category: 'atoms',
    description: 'Selector desplegable',
    create: () => createSelect([
      { label: 'Opción 1', value: '1' },
      { label: 'Opción 2', value: '2' },
      { label: 'Opción 3', value: '3' },
    ]),
  },
  {
    id: 'tabs',
    name: 'Tabs Navigation',
    category: 'molecules',
    description: 'Pestañas de navegación',
    create: () => createTabs([
      { label: 'Tab 1', content: '<p>Contenido 1</p>' },
      { label: 'Tab 2', content: '<p>Contenido 2</p>' },
    ]),
  },
  {
    id: 'meter',
    name: 'Progress Meter',
    category: 'atoms',
    description: 'Barra de progreso',
    create: () => {
      const m = createMeter(65);
      m.style.maxWidth = '300px';
      return m;
    },
  },
];
