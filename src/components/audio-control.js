/**
 * AUDIO CONTROL CENTRALIZADO
 * Usado en: Juego, Builders, Storybook
 */

import { isMutedState, setMuted, setVolume, getVolume, unmute } from '../game/audioControl.js';
import { icon } from '../ui/icons.js';

export function createAudioControl() {
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: var(--glass);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    backdrop-filter: blur(8px);
  `;

  const muteButton = document.createElement('button');
  muteButton.type = 'button';
  muteButton.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: var(--transition-fast);
    color: var(--ink);
  `;

  const updateMuteButton = () => {
    const muted = isMutedState();
    if (muted) {
      muteButton.innerHTML = icon('volume-x', { size: 20 });
      muteButton.title = 'Activar sonido';
    } else {
      muteButton.innerHTML = icon('volume-2', { size: 20 });
      muteButton.title = 'Desactivar sonido';
    }
  };

  muteButton.addEventListener('click', () => {
    const muted = isMutedState();
    if (muted) {
      unmute(getVolume());
    } else {
      setMuted(true);
    }
    updateMuteButton();
    updateVolumeSlider();
  });

  muteButton.addEventListener('mouseenter', () => {
    muteButton.style.opacity = '0.8';
  });

  muteButton.addEventListener('mouseleave', () => {
    muteButton.style.opacity = '1';
  });

  const volumeSlider = document.createElement('input');
  volumeSlider.type = 'range';
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.value = String(Math.round(getVolume() * 100));
  volumeSlider.style.cssText = `
    width: 120px;
    height: 4px;
    border-radius: var(--radius-full);
    border: none;
    outline: none;
    cursor: pointer;
    appearance: none;
  `;

  const updateVolumeSlider = () => {
    const newVal = Math.round(getVolume() * 100);
    volumeSlider.value = String(newVal);
    volumeSlider.style.background = `linear-gradient(to right, hsl(var(--accent-main)) 0%, hsl(var(--accent-main)) ${newVal}%, hsl(var(--text-faint) / 0.3) ${newVal}%, hsl(var(--text-faint) / 0.3) 100%)`;

    if (isMutedState()) {
      setMuted(false);
      updateMuteButton();
    }
  };

  volumeSlider.addEventListener('input', (e) => {
    const newVolume = parseInt(e.target.value) / 100;
    setVolume(newVolume);
    updateVolumeSlider();
    updateMuteButton();
  });

  volumeSlider.addEventListener('change', () => {
    if (isMutedState()) {
      unmute(getVolume());
      updateMuteButton();
    }
  });

  container.appendChild(muteButton);
  container.appendChild(volumeSlider);

  updateMuteButton();
  updateVolumeSlider();

  return container;
}
