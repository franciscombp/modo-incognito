/**
 * METER/PROGRESS CENTRALIZADO
 */

export function createMeter(percentage = 50) {
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    height: 8px;
    background: hsl(var(--bg-050));
    border-radius: var(--radius-full);
    overflow: hidden;
    border: 1px solid hsl(var(--border-100));
  `;

  const fill = document.createElement('div');
  fill.style.cssText = `
    height: 100%;
    width: ${percentage}%;
    background: linear-gradient(90deg, hsl(120, 70%, 50%), hsl(0, 84%, 60%));
    transition: width 0.3s ease;
  `;

  container.appendChild(fill);

  // Método para actualizar el porcentaje
  container.setProgress = (newPercentage) => {
    fill.style.width = `${Math.min(100, Math.max(0, newPercentage))}%`;
  };

  return container;
}
