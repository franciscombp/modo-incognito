import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ÍNDICE DE LO QUE HAY EN public/models/.
 *
 * El navegador no puede listar una carpeta, así que para que "subo el archivo
 * y aparece en el juego" funcione hace falta que alguien mire la carpeta y
 * escriba la lista. Lo hace esto, y corre solo antes de cada build (`prebuild`
 * en package.json) — también en CI, que es donde se publica.
 *
 * Por eso NO hay que tocar ningún JSON para meter un personaje: basta con
 * dejar el archivo con el nombre correcto. El contrato está en
 * public/models/README.md y es este:
 *
 *   <id>.glb         el cuerpo
 *   <id>.faces.png   sus expresiones, en tira (opcional)
 *
 * donde <id> es el del personaje en characters3d.json (o uno de sus alias).
 */

const here = dirname(fileURLToPath(import.meta.url));
const MODELS = join(here, "..", "public", "models");
const OUT = join(here, "..", "public", "data", "models.json");

const files = existsSync(MODELS) ? readdirSync(MODELS) : [];

const bodies = {};
const faces = {};
for (const f of files) {
  // `.faces.png` primero: `giuli.faces.png` también acaba en `.png`, y si se
  // mira al revés entra como cuerpo de un personaje llamado "giuli.faces".
  if (f.endsWith(".faces.png")) faces[f.slice(0, -".faces.png".length)] = f;
  else if (f.endsWith(".glb")) bodies[f.slice(0, -".glb".length)] = f;
}

const out = {
  $comment: [
    "GENERADO POR tools/index-models.mjs — no se edita a mano.",
    "Se regenera solo antes de cada build (script `prebuild`).",
    "",
    "Es el índice de public/models/, que el navegador no puede listar por su",
    "cuenta. Para añadir un personaje NO hay que tocar ningún JSON: se deja",
    "  <id>.glb        su cuerpo",
    "  <id>.faces.png  sus expresiones (opcional)",
    "y en el siguiente build aparece aquí solo. Ver public/models/README.md.",
  ],
  bodies,
  faces,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

const n = Object.keys(bodies).length;
const m = Object.keys(faces).length;
console.log(`models.json: ${n} cuerpo(s)${n ? ` — ${Object.keys(bodies).join(", ")}` : ""}`);
console.log(`             ${m} juego(s) de expresiones${m ? ` — ${Object.keys(faces).join(", ")}` : ""}`);
