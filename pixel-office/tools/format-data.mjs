// Pretty-prints the JSON under public/data so it stays hand-editable:
// small objects and coordinate pairs stay on one line instead of exploding
// into one number per row. Run it after any script touches those files.
//
// Usage: node tools/format-data.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const INLINE_LIMIT = 96;

function format(value, indent = 0) {
  const pad = "  ".repeat(indent);
  const padIn = "  ".repeat(indent + 1);

  if (value === null || typeof value !== "object") return JSON.stringify(value);

  const inline = JSON.stringify(value);
  const isLeaf =
    Array.isArray(value)
      ? value.every((v) => v === null || typeof v !== "object")
      : Object.values(value).every((v) => v === null || typeof v !== "object");
  if (isLeaf && inline.length <= INLINE_LIMIT) return inline;

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const items = value.map((v) => padIn + format(v, indent + 1));
    return `[\n${items.join(",\n")}\n${pad}]`;
  }

  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  const items = entries.map(([k, v]) => `${padIn}${JSON.stringify(k)}: ${format(v, indent + 1)}`);
  return `{\n${items.join(",\n")}\n${pad}}`;
}

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.name.endsWith(".json")) {
      const parsed = JSON.parse(await readFile(full, "utf8"));
      await writeFile(full, `${format(parsed)}\n`);
      console.log("formateado", path.relative(dataDir, full));
    }
  }
}

await walk(dataDir);
