/**
 * Control de audio visual en el HUD
 * - Botón de mute/unmute
 * - Slider de volumen
 * - Indicador visual del estado de audio
 */

import { isMutedState, setMuted, setVolume, getVolume, unmute, subscribeAudio } from "../game/audioControl.js";
import { icon } from "./icons.js";

export function createAudioControl() {
  const container = document.createElement('div');
  container.className = 'audio-control';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = 'var(--space-sm)';
  container.style.padding = 'var(--space-sm) var(--space-md)';
  container.style.background = 'var(--glass)';
  container.style.border = '1px solid var(--line)';
  container.style.borderRadius = 'var(--radius-md)';
  container.style.backdropFilter = 'blur(8px)';

  // Botón de mute/unmute
  const muteButton = document.createElement('button');
  muteButton.className = 'audio-mute-btn';
  muteButton.type = 'button';
  muteButton.style.display = 'inline-flex';
  muteButton.style.alignItems = 'center';
  muteButton.style.justifyContent = 'center';
  muteButton.style.width = '32px';
  muteButton.style.height = '32px';
  muteButton.style.padding = '0';
  muteButton.style.border = 'none';
  muteButton.style.background = 'transparent';
  muteButton.style.cursor = 'pointer';
  muteButton.style.transition = 'var(--transition-fast)';
  muteButton.style.color = 'var(--ink)';

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

  // Slider de volumen
  const volumeSlider = document.createElement('input');
  volumeSlider.className = 'audio-volume-slider';
  volumeSlider.type = 'range';
  volumeSlider.min = '0';
  volumeSlider.max = '100';
  volumeSlider.value = String(Math.round(getVolume() * 100));
  volumeSlider.style.width = '120px';
  volumeSlider.style.height = '4px';
  volumeSlider.style.borderRadius = 'var(--radius-full)';
  volumeSlider.style.border = 'none';
  volumeSlider.style.outline = 'none';
  volumeSlider.style.cursor = 'pointer';
  volumeSlider.style.appearance = 'none';
  volumeSlider.style.background = 'linear-gradient(to right, hsl(var(--accent-main)) 0%, hsl(var(--accent-main)) ' +
    (Math.round(getVolume() * 100)) + '%, hsl(var(--text-faint) / 0.3) ' +
    (Math.round(getVolume() * 100)) + '%, hsl(var(--text-faint) / 0.3) 100%)';

  // Estilos del thumb del slider
  const sliderThumbStyle = `
    input[type="range"]::-webkit-slider-thumb {
      appearance: none;
      width: 14px;
      height: 14px;
      border-radius: var(--radius-full);
      background: hsl(var(--accent-main));
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: var(--transition-fast);
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      box-shadow: var(--shadow-md);
      transform: scale(1.1);
    }

    input[type="range"]::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border-radius: var(--radius-full);
      background: hsl(var(--accent-main));
      cursor: pointer;
      border: none;
      box-shadow: var(--shadow-sm);
      transition: var(--transition-fast);
    }

    input[type="range"]::-moz-range-thumb:hover {
      box-shadow: var(--shadow-md);
      transform: scale(1.1);
    }
  `;

  // Inyectar estilos del slider si no existen
  if (!document.getElementById('audio-slider-styles')) {
    const style = document.createElement('style');
    style.id = 'audio-slider-styles';
    style.textContent = sliderThumbStyle;
    document.head.appendChild(style);
  }

  // Solo visual: pinta el estado actual, sin tocarlo. El "mover el slider
  // desmutea" vive en el handler de input — cuando el que lo movió es un
  // dedo de verdad. Antes esto también desmuteaba al redibujarse, así que
  // cualquier refresco programático (la tecla V, el mute al perder foco)
  // se deshacía a sí mismo al instante.
  const updateVolumeSlider = () => {
    const newVal = Math.round(getVolume() * 100);
    volumeSlider.value = String(newVal);
    volumeSlider.style.background = 'linear-gradient(to right, hsl(var(--accent-main)) 0%, hsl(var(--accent-main)) ' +
      newVal + '%, hsl(var(--text-faint) / 0.3) ' + newVal + '%, hsl(var(--text-faint) / 0.3) 100%)';
  };

  volumeSlider.addEventListener('input', (e) => {
    const newVolume = parseInt(e.target.value) / 100;
    // Mover el volumen ES querer oír: desmutea si hacía falta.
    if (isMutedState()) unmute(newVolume);
    else setVolume(newVolume);
    updateVolumeSlider();
    updateMuteButton();
  });

  container.appendChild(muteButton);
  container.appendChild(volumeSlider);

  // Inicializar estado visual
  updateMuteButton();
  updateVolumeSlider();

  // Cambios hechos desde FUERA del widget (tecla V, mute por perder el
  // foco, otro control futuro): el widget se repinta para no mentir.
  subscribeAudio(() => {
    updateMuteButton();
    updateVolumeSlider();
  });

  return container;
}

/**
 * Obtiene el ícono de volumen apropiado
 */
function getVolumeIcon(volume) {
  if (volume === 0 || isMutedState()) return 'volume-x';
  if (volume < 0.5) return 'volume-1';
  return 'volume-2';
}
