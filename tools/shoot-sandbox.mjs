/**
 * CAPTURAS DEL BANCO DE PRUEBAS (creador/pruebas).
 *
 * Lo que antes costaba una partida entera —arrancar el día, saltar el
 * ascensor, limpiar la puerta, vaciar la energía, esperar a dormirse— aquí
 * es un `goto` con parámetros. Sirve para MIRAR lo que se acaba de tocar
 * sin montar un escenario que puede mentir por su cuenta.
 *
 * Uso:
 *   node tools/shoot-sandbox.mjs                       # la tanda por defecto
 *   node tools/shoot-sandbox.mjs "pose=doze&globo=zzz" # una sola, a medida
 *
 * Las imágenes salen en /tmp/sandbox-*.png.
 */
import { chromium } from "playwright";

const base = process.env.URL ?? "http://localhost:4173/creador/pruebas/";
const TANDA = process.argv[2]
  ? [{ nombre: "custom", q: process.argv[2] }]
  : [
      { nombre: "doze-zzz", q: "cast=giu&pose=doze&globo=zzz" },
      { nombre: "sleep-cama", q: "cast=giu&pose=sleep" },
      { nombre: "alerta-roja", q: "cast=gabo&globo=rojo" },
      { nombre: "coffee", q: "cast=giu&pose=coffee" },
      { nombre: "sitwork", q: "cast=giu&pose=sitWork" },
      { nombre: "anuncio-atrapada", q: "cast=giu&anuncio=%C2%A1GABO%20TE%20ATRAP%C3%93!%20(1%2F3)" },
      { nombre: "hud-caza", q: "cast=giu&hud=caza" },
    ];

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

for (const { nombre, q } of TANDA) {
  await p.goto(`${base}?${q}`, { waitUntil: "networkidle", timeout: 60000 });
  await p.waitForFunction(() => window.__pruebas?.listo, null, { timeout: 30000 });
  // Un momento para que corra la animación (las Z suben en ciclo, la pose
  // interpola): una captura en el frame 0 no enseña nada.
  await p.waitForTimeout(900);
  const out = `/tmp/sandbox-${nombre}.png`;
  await p.screenshot({ path: out });
  console.log(`✓ ${nombre.padEnd(18)} → ${out}`);
}

if (errores.length) {
  console.log(`\n⚠ ${errores.length} error(es) de página:\n  ${errores.slice(0, 3).join("\n  ")}`);
}
await b.close();
process.exit(errores.length ? 1 : 0);
