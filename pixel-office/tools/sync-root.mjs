// Mirrors the production build into the repository root.
//
// GitHub Pages can be configured two ways, and the repo owner can flip the
// setting at any time:
//   · "GitHub Actions"          -> serves the uploaded artifact (pixel-office/dist)
//   · "Deploy from a branch"    -> serves the root of main, which without an
//                                  index.html renders README.md instead
// Keeping a copy of the build at the root makes the second case work too, so
// the game shows up whichever way Pages is pointed. The build uses a relative
// base, so the same files are valid at either mount point.
//
// Usage: node tools/sync-root.mjs

import { cp, rm, mkdir, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "..", "dist");
const repoRoot = path.resolve(here, "..", "..");

if (!existsSync(dist)) {
  console.error("No hay build en pixel-office/dist — ejecuta `npm run build` primero.");
  process.exit(1);
}

// Only these live at the root; everything else there is source we must not touch.
const MANAGED = ["assets", "sprites", "data", "index.html", "favicon.png"];

for (const entry of MANAGED) {
  await rm(path.join(repoRoot, entry), { recursive: true, force: true });
}

for (const entry of await readdir(dist)) {
  await cp(path.join(dist, entry), path.join(repoRoot, entry), { recursive: true });
}

// Stops Pages from running the copy through Jekyll, which would drop any
// file or folder starting with an underscore.
await mkdir(repoRoot, { recursive: true });
await writeFile(path.join(repoRoot, ".nojekyll"), "");

console.log(`Build copiado a la raíz del repo (${MANAGED.join(", ")}).`);
