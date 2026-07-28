import * as THREE from "three";

// Cheap billboard text label rendered onto a canvas texture, so we can tag
// rooms without pulling in a font/CSS-renderer dependency yet.
export function createLabel(text, { bg = "#1c1e24", fg = "#f4f1ea", accent = "#8b5cf6" } = {}) {
  const lines = text.split("\n");
  const padding = 18;
  const fontSize = 26;
  const lineHeight = fontSize * 1.15;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = `700 ${fontSize}px 'Segoe UI', sans-serif`;

  const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
  canvas.width = Math.ceil(textWidth + padding * 2);
  canvas.height = Math.ceil(lineHeight * lines.length + padding * 1.4);

  ctx.font = `700 ${fontSize}px 'Segoe UI', sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  roundRect(ctx, 0, 0, canvas.width, canvas.height, 10);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 6, canvas.height);

  ctx.fillStyle = fg;
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width / 2 + 4, padding * 0.9 + lineHeight * (i + 0.5));
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.028;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);
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
