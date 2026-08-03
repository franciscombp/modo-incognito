import * as THREE from "three";

/**
 * LA CARA, PINTADA.
 *
 * En este estilo de muñeco la cara NO se modela: se pinta. La geometría pone
 * la silueta — el mentón, que es lo que le da el carácter — y los ojos, las
 * pestañas y la boca van en una textura. Es como está hecho el chibi de
 * referencia, y tiene tres ventajas sobre pegarle bultos a la cabeza:
 *
 *  · Se dibuja en 2D, donde una curva bonita es una curva bonita y no
 *    veinte elipsoides peleándose.
 *  · Cuesta cero triángulos. La versión con bultos gastaba unos 6.000 por
 *    cabeza solo en la cara.
 *  · CAMBIAR DE EXPRESIÓN ES REDIBUJAR. Parpadear, hablar o poner mala cara
 *    son otro trazo, no otra malla — que es justo lo que hace falta cuando
 *    los personajes se ven de cerca al conversar.
 */

/** Las expresiones que sabe dibujar. `talk` es la boca abierta al hablar. */
export const EXPRESSIONS = ["neutral", "blink", "happy", "sad", "surprised", "annoyed", "talk"];

const SIZE = 512;

/** Dónde cae cada rasgo, en fracción del lienzo. Tocar esto los mueve todos. */
const L = {
  eyeY: 0.5,
  eyeX: 0.185, // separación desde el centro
  eyeW: 0.088,
  eyeH: 0.115,
  browY: 0.375,
  mouthY: 0.665,
  blushY: 0.585,
  blushX: 0.3,
};

function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(cx * SIZE, cy * SIZE, rx * SIZE, ry * SIZE, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Un ojo grande, con iris, brillo y línea de pestañas encima. */
function drawEye(ctx, dir, { eyes, lash, open = 1, lift = 0 }) {
  const cx = 0.5 + dir * L.eyeX;
  const cy = L.eyeY + lift;

  if (open < 0.15) {
    // Cerrado: una curva hacia abajo, que es lo que lee como "contento" o
    // como parpadeo según cuánto dure.
    ctx.strokeStyle = lash;
    ctx.lineWidth = SIZE * 0.018;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx * SIZE, (cy + 0.02) * SIZE, L.eyeW * SIZE, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    return;
  }

  const h = L.eyeH * open;
  ellipse(ctx, cx, cy, L.eyeW, h, "#ffffff");
  ellipse(ctx, cx, cy + h * 0.08, L.eyeW * 0.78, h * 0.82, eyes);
  ellipse(ctx, cx - dir * L.eyeW * 0.3, cy - h * 0.38, L.eyeW * 0.26, h * 0.24, "#ffffff");
  ellipse(ctx, cx + dir * L.eyeW * 0.3, cy + h * 0.35, L.eyeW * 0.13, h * 0.12, "rgba(255,255,255,0.65)");

  // Pestaña: remata el ojo por arriba y es la mitad del encanto.
  ctx.strokeStyle = lash;
  ctx.lineWidth = SIZE * 0.026;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx * SIZE, cy * SIZE, L.eyeW * SIZE * 1.02, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
}

function drawBrow(ctx, dir, { lash, y = 0, tilt = 0 }) {
  const cx = (0.5 + dir * L.eyeX) * SIZE;
  const cy = (L.browY + y) * SIZE;
  const w = L.eyeW * SIZE * 0.95;
  ctx.strokeStyle = lash;
  ctx.lineWidth = SIZE * 0.019;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + dir * tilt * SIZE);
  ctx.quadraticCurveTo(cx, cy - SIZE * 0.022 + dir * tilt * SIZE * 0.5, cx + w, cy - dir * tilt * SIZE);
  ctx.stroke();
}

function drawMouth(ctx, { kind, mouth }) {
  const cx = 0.5 * SIZE;
  const cy = L.mouthY * SIZE;
  ctx.strokeStyle = mouth;
  ctx.fillStyle = mouth;
  ctx.lineWidth = SIZE * 0.022;
  ctx.lineCap = "round";

  if (kind === "open") {
    ellipse(ctx, 0.5, L.mouthY + 0.012, 0.045, 0.052, mouth);
    return;
  }
  if (kind === "flat") {
    ctx.beginPath();
    ctx.moveTo(cx - SIZE * 0.042, cy);
    ctx.lineTo(cx + SIZE * 0.042, cy);
    ctx.stroke();
    return;
  }
  if (kind === "frown") {
    ctx.beginPath();
    ctx.arc(cx, cy + SIZE * 0.05, SIZE * 0.05, Math.PI * 1.2, Math.PI * 1.8);
    ctx.stroke();
    return;
  }
  // Sonrisa por defecto.
  ctx.beginPath();
  ctx.arc(cx, cy - SIZE * 0.022, SIZE * 0.05, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
}

const MOODS = {
  neutral: { open: 1, mouth: "smile", brow: 0, tilt: 0 },
  blink: { open: 0, mouth: "smile", brow: 0, tilt: 0 },
  happy: { open: 0, mouth: "smile", brow: -0.012, tilt: 0 },
  sad: { open: 0.75, mouth: "frown", brow: 0.016, tilt: -0.014 },
  surprised: { open: 1.28, mouth: "open", brow: -0.03, tilt: 0 },
  annoyed: { open: 0.72, mouth: "flat", brow: 0.012, tilt: 0.02 },
  talk: { open: 1, mouth: "open", brow: -0.004, tilt: 0 },
};

/**
 * Dibuja la cara de una receta con una expresión, y devuelve la textura.
 *
 * El lienzo se rellena entero del color de la piel: la proyección planar
 * (ver `projectFaceUVs`) manda toda la parte de atrás de la cabeza a una
 * esquina, y esa esquina tiene que ser piel lisa o saldría la cara estampada
 * también en la nuca.
 */
export function faceTexture(recipe, expression = "neutral") {
  const mood = MOODS[expression] ?? MOODS.neutral;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  const skin = recipe.skin ?? "#f0c9a8";
  ctx.fillStyle = skin;
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (recipe.blush) {
    ctx.globalAlpha = 0.7;
    for (const dir of [-1, 1]) {
      ellipse(ctx, 0.5 + dir * L.blushX, L.blushY, 0.088, 0.052, recipe.blush);
    }
    ctx.globalAlpha = 1;
  }

  const lash = recipe.lash ?? shade(recipe.hair?.color ?? "#3a2c26", -0.05);
  for (const dir of [-1, 1]) {
    drawBrow(ctx, dir, { lash, y: mood.brow, tilt: mood.tilt });
    drawEye(ctx, dir, { eyes: recipe.eyes ?? "#2a2118", lash, open: mood.open });
  }
  drawMouth(ctx, { kind: mood.mouth, mouth: recipe.mouth ?? "#b5645e" });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function shade(hex, amount) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

/**
 * La TIRA de gestos completa, con fondo TRANSPARENTE.
 *
 * Es la versión "calcomanía" de `faceTexture`: mismos trazos, pero sin
 * rellenar la piel, porque esta tira no envuelve una cabeza — se PEGA DELANTE
 * de una ya pintada (ver faceSheet.js), al estilo Animal Crossing. La usan
 * los cuerpos base desnudos, que no tienen textura donde dibujar: sin esto
 * eran maniquíes sin cara. Sale en el orden de `EXPRESSIONS`, que es el que
 * espera `attachFaceSheet`.
 */
export function faceStripTexture(recipe, { cell = 256 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = cell * EXPRESSIONS.length;
  canvas.height = cell;
  const ctx = canvas.getContext("2d");
  const k = cell / SIZE;

  const lash = recipe.lash ?? shade(recipe.hair?.color ?? "#3a2c26", -0.05);
  EXPRESSIONS.forEach((expression, i) => {
    const mood = MOODS[expression] ?? MOODS.neutral;
    ctx.save();
    ctx.translate(i * cell, 0);
    ctx.scale(k, k);
    if (recipe.blush) {
      ctx.globalAlpha = 0.55;
      for (const dir of [-1, 1]) {
        ellipse(ctx, 0.5 + dir * L.blushX, L.blushY, 0.088, 0.052, recipe.blush);
      }
      ctx.globalAlpha = 1;
    }
    for (const dir of [-1, 1]) {
      drawBrow(ctx, dir, { lash, y: mood.brow, tilt: mood.tilt });
      drawEye(ctx, dir, { eyes: recipe.eyes ?? "#2a2118", lash, open: mood.open });
    }
    drawMouth(ctx, { kind: mood.mouth, mouth: recipe.mouth ?? "#b5645e" });
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Reproyecta las UV de una cabeza como una vista de frente.
 *
 * Las UV que trae un modelo base son un desplegado genérico para esculpir, no
 * un sitio donde pintar una cara: no hay forma de saber qué píxel cae en el
 * ojo. Se recalculan aquí, mirando la cabeza de frente, y así la textura se
 * dibuja en coordenadas que entendemos ("el ojo va a 0.5 de alto").
 *
 * Los vértices que miran hacia atrás se mandan todos a una esquina del
 * lienzo, que es piel lisa: si no, la cara saldría estampada en la nuca.
 */
export function projectFaceUVs(geometry, { padding = 0.06, drop = 0.04 } = {}) {
  // Se desindexa PRIMERO. Con vértices compartidos, un triángulo que cruza el
  // borde entre la cara y la nuca tiene UV de los dos lados y estira la
  // textura por toda la cabeza: una costura vertical que se ve enseguida.
  // Sin compartir, cada triángulo se resuelve entero de un lado o del otro.
  // Las normales se resuelven ANTES de desindexar, y solo si faltan. Al
  // desindexar, cada triángulo deja de compartir vértices: recalcularlas
  // después da una normal por cara y la cabeza sale facetada, con todos los
  // polígonos marcados. El modelo ya trae las suyas, suaves.
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.computeBoundingBox();

  const box = geo.boundingBox;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const w = box.max.x - box.min.x || 1;
  const h = box.max.y - box.min.y || 1;
  const uv = new Float32Array(pos.count * 2);

  const blank = (i) => {
    uv[i * 2] = 0.02;
    uv[i * 2 + 1] = 0.02;
  };

  for (let t = 0; t < pos.count; t += 3) {
    // Si CUALQUIER vértice del triángulo mira hacia atrás, el triángulo
    // entero se va a la esquina de piel lisa. Vale más perder un anillo de
    // triángulos en el borde de la cara que arrastrar la costura.
    let front = true;
    for (let k = 0; k < 3; k++) if (nor.getZ(t + k) < 0.12) front = false;

    for (let k = 0; k < 3; k++) {
      const i = t + k;
      if (!front) {
        blank(i);
        continue;
      }
      const u = (pos.getX(i) - box.min.x) / w;
      // `drop` baja la cara: proyectada sobre la caja entera de la cabeza, los
      // rasgos caen a la altura del cráneo y no de la cara.
      const v = (pos.getY(i) - box.min.y) / h + drop;
      // Un margen deja el borde de la cara dentro del lienzo, sin que los
      // rasgos toquen el filo donde el muestreo se repite.
      uv[i * 2] = padding + u * (1 - padding * 2);
      uv[i * 2 + 1] = padding + v * (1 - padding * 2);
    }
  }

  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}
