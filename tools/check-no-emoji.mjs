import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * QUE NO VUELVAN LOS EMOJIS A LA INTERFAZ.
 *
 * Un emoji lo dibuja la fuente del sistema: el mismo ☕ es una taza blanca en
 * un iPhone, marrón en Android y plana en Windows, y en algunas plataformas
 * sale un cuadro vacío. No se puede controlar desde el juego, así que todo
 * icono se dibuja en SVG (`src/ui/icons.js`).
 *
 * Esto vigila que no se cuele uno nuevo — es la clase de cosa que vuelve sola
 * en cuanto alguien escribe un `toast("☕ …")` sin pensarlo.
 *
 * LO QUE SÍ SE PERMITE, a propósito: emojis DENTRO del texto que escribe un
 * personaje. Que Gabo ponga 💅 en un mensaje de Teams es el chiste, y en un
 * chat de verdad la gente escribe emojis; ahí da igual que cada sistema lo
 * dibuje a su manera. Lo que no puede llevarlos es la interfaz.
 */

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");

// Rango de emoji y de símbolos con presentación gráfica.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;

/** Campos de datos donde un emoji sería un icono, no texto de nadie. */
const ICON_FIELDS = ["icon", "portrait", "sheet", "emoji"];

let failures = 0;
const fail = (msg) => {
  console.log(`FAIL  ${msg}`);
  failures++;
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// --- 1. El código de la interfaz, sin ninguno ---
const codeHits = [];
for (const p of walk(join(ROOT, "src"))) {
  if (!/\.(js|css)$/.test(p)) continue;
  // icons.js habla DE emojis para explicar por qué no los usa.
  if (p.endsWith(join("ui", "icons.js"))) continue;
  const lines = readFileSync(p, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (EMOJI.test(line)) codeHits.push(`${relative(ROOT, p)}:${i + 1}  ${line.trim().slice(0, 70)}`);
  });
}
if (codeHits.length) {
  fail(`hay ${codeHits.length} emoji(s) en el código de la interfaz`);
  codeHits.slice(0, 8).forEach((h) => console.log(`        ${h}`));
} else {
  console.log("PASS  sin emojis en src/ (todo icono sale de ui/icons.js)");
}

// --- 2. Los datos: en campos de icono, tampoco ---
const dataHits = [];
function scan(node, where) {
  if (Array.isArray(node)) return node.forEach((n, i) => scan(n, `${where}[${i}]`));
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === "string" && ICON_FIELDS.includes(k) && EMOJI.test(v)) {
      dataHits.push(`${where}.${k} = "${v}"`);
    }
    scan(v, `${where}.${k}`);
  }
}
for (const p of walk(join(ROOT, "public", "data"))) {
  if (!p.endsWith(".json")) continue;
  scan(JSON.parse(readFileSync(p, "utf8")), relative(ROOT, p));
}
if (dataHits.length) {
  fail(`hay ${dataHits.length} emoji(s) en campos de icono del contenido`);
  dataHits.slice(0, 8).forEach((h) => console.log(`        ${h}`));
} else {
  console.log("PASS  sin emojis en los campos de icono del contenido");
}

// --- 3. Y que los iconos que pide el contenido existan de verdad ---
const iconsSrc = readFileSync(join(ROOT, "src", "ui", "icons.js"), "utf8");
// Nombres conocidos = las claves del objeto `RAW` (los SVG de Phosphor
// importados arriba): tanto en propiedad abreviada (`coffee,`) como
// explícita (`window: windowIcon,` / `"volume-x": volumeX,`).
const rawBlock = iconsSrc.match(/const RAW = \{([\s\S]*?)\n\};/)?.[1] ?? "";
const known = new Set();
for (const m of rawBlock.matchAll(/^\s*(?:"([\w-]+)"|(\w+))(?:\s*:\s*\w+)?,/gm)) {
  known.add(m[1] ?? m[2]);
}
for (const m of iconsSrc.matchAll(/(\w+): "(\w+)"/g)) known.add(m[1]); // alias
const missing = new Set();
function scanNames(node) {
  if (Array.isArray(node)) return node.forEach(scanNames);
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (k === "icon" && typeof v === "string" && !known.has(v)) missing.add(v);
    scanNames(v);
  }
}
for (const p of walk(join(ROOT, "public", "data"))) {
  if (p.endsWith(".json")) scanNames(JSON.parse(readFileSync(p, "utf8")));
}
if (missing.size) {
  // Un icono que no existe sale como hueco vacío y no lo nota nadie hasta
  // que alguien mira esa pantalla concreta.
  fail(`el contenido pide iconos que nadie dibujó: ${[...missing].join(", ")}`);
} else {
  console.log("PASS  todos los iconos que pide el contenido existen");
}

console.log(failures ? `\n${failures} fallo(s)` : "\nLa interfaz no depende de la fuente de nadie");
process.exit(failures ? 1 : 0);
