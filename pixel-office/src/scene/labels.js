import * as THREE from "three";

// Cheap billboard text label rendered onto a canvas texture, so we can tag
// rooms without pulling in a font/CSS-renderer dependency yet.
//
// Two visual styles, matching the reference image:
//  - "solid": a bold color-filled pill for team/department areas (Canales,
//    Segmentos, AdTech...), optionally with a dark instead of light label.
//  - default: a light pill with a colored accent bar, used for meeting
//    rooms / utility spaces (Sala 2, Baños, Elevadores...).
//
// El fondo era casi negro con borde duro: sobre un piso claro y cálido esos
// rótulos se leían como notificaciones de una app pegadas encima del juego.
// Ahora son pastillas de papel crema con texto oscuro, que es lo que hace que
// pertenezcan al mismo mundo que el resto del decorado.
export function createLabel(
  text,
  { bg = "#f6efe2", fg = "#4a3f33", accent = "#c98b6b", solid = false, dark = false, icon = "" } = {},
  scaleMul = 1
) {
  const lines = text.split("\n");
  const padding = 20;
  const fontSize = 27;
  const lineHeight = fontSize * 1.18;
  const iconSize = fontSize * 1.15;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `800 ${fontSize}px 'Segoe UI', sans-serif`;

  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const iconGap = icon ? iconSize + 10 : 0;
  canvas.width = Math.ceil(textWidth + padding * 2 + iconGap);
  canvas.height = Math.ceil(lineHeight * lines.length + padding * 1.4);

  const fillColor = solid ? accent : bg;
  const textColor = solid ? (dark ? "#3a2c1d" : "#ffffff") : fg;

  roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.fillStyle = fillColor;
  ctx.fill();

  // Subtle 3D "pill button" shading: a lighter top sliver and darker
  // bottom sliver instead of a flat fill.
  ctx.save();
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 12);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, "rgba(255,255,255,0.35)");
  grad.addColorStop(0.22, "rgba(255,255,255,0)");
  grad.addColorStop(0.85, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(90,70,50,0.14)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  if (!solid) {
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 6, canvas.height);
  }

  // Crisp outline for legibility against any floor color behind it.
  ctx.strokeStyle = solid ? "rgba(90,70,50,0.25)" : "rgba(120,98,74,0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, 11);
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = `800 ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.fillStyle = textColor;
  ctx.shadowColor = "rgba(255,255,255,0.5)";
  ctx.shadowBlur = 2;
  const textCenterX = canvas.width / 2 + iconGap / 2 + 3;
  lines.forEach((line, i) => {
    ctx.fillText(line, textCenterX, padding * 0.9 + lineHeight * (i + 0.5));
  });
  ctx.shadowBlur = 0;

  if (icon) {
    ctx.font = `${iconSize}px 'Segoe UI Emoji', 'Segoe UI', sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(icon, padding - 4, canvas.height / 2 + 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.028 * scaleMul;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
  sprite.userData.baseScale = { x: sprite.scale.x, y: sprite.scale.y };
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
