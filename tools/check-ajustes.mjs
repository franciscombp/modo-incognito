/**
 * AJUSTES: TODO SE ALCANZA, Y TODO ACCIONA.
 *
 * ── El fallo ──
 *
 * Ajustes medía 1208 px de alto dentro de un lienzo de 1080. Los controles de
 * abajo quedaban cortados y NO había forma de llegar a ellos: el panel traía
 * `max-height: 100%` con `overflow: auto`, pero ese `100%` se resuelve contra
 * un padre sin altura definida, así que no limitaba nada. La pantalla crecía y
 * la recortaba el LIENZO, no su propio scroll — y una caja que desborda a su
 * padre no se desplaza, porque no tiene nada que desplazar (`scrollHeight` era
 * exactamente igual a `height`).
 *
 * Es un fallo que una captura no delata: se ve un panel de ajustes normal, con
 * unas opciones abajo un poco cortadas. Por eso esto MIDE y PULSA.
 *
 * Uso: npm run check:ajustes   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.waitForTimeout(1500);
await p.locator(".inc-menu button", { hasText: "AJUSTES" }).first().click();
await p.waitForTimeout(700);

const caja = await p.evaluate(() => {
  const stage = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-h"));
  const pantalla = document.querySelector(".inc-menu-screen");
  const panes = document.querySelector(".inc-menu-panes");
  const r = pantalla.getBoundingClientRect();
  return {
    lienzo: stage,
    alto: Math.round(r.height),
    abajo: Math.round(r.bottom),
    // La zona de opciones tiene que poder DESPLAZARSE de verdad: alto menor
    // que su contenido. Si son iguales, no hay scroll — hay recorte.
    paneAlto: Math.round(panes.getBoundingClientRect().height),
    paneContenido: panes.scrollHeight,
  };
});
check(
  "el panel CABE en el lienzo: no lo recorta el borde de la pantalla",
  caja.abajo <= caja.lienzo,
  JSON.stringify(caja)
);
check(
  "y su zona de opciones SE DESPLAZA de verdad (no está simplemente recortada)",
  caja.paneContenido > caja.paneAlto,
  JSON.stringify(caja)
);

// EL PIE SE VE SIEMPRE. Si rodara todo, «Volver» se iría de la pantalla justo
// cuando hace falta — y entonces no habría forma de salir de Ajustes.
const volver = await p.evaluate(() => {
  const b = [...document.querySelectorAll(".inc-menu-screen button")].find((e) =>
    /volver/i.test(e.textContent)
  );
  if (!b) return { falta: true };
  const r = b.getBoundingClientRect();
  const stage = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-h"));
  return { dentro: r.bottom <= stage && r.top >= 0, y: Math.round(r.top) };
});
check("«Volver» se ve sin tener que rodar", volver.dentro === true, JSON.stringify(volver));

// ── Y ACCIONAN ──
// Lo de arriba mide geometría; esto comprueba que pulsar cambia algo de
// verdad, que es lo que se reportó roto.
const temaAntes = await p.evaluate(() => document.documentElement.dataset.theme);
await p.locator(".inc-menu-pane:not(.inc-hidden) button", { hasText: "COZY" }).first().click();
await p.waitForTimeout(300);
const temaDespues = await p.evaluate(() => document.documentElement.dataset.theme);
check(
  "pulsar una opción de arriba CAMBIA el ajuste",
  temaDespues === "cozy" && temaDespues !== temaAntes,
  `${temaAntes} → ${temaDespues}`
);

// La de ABAJO del todo, que es la que no se alcanzaba. Se busca el último
// control de la lista y se pulsa: si hace falta rodar, que ruede.
const ultimo = await p.evaluate(() => {
  const botones = [...document.querySelectorAll(".inc-menu-pane:not(.inc-hidden) button")];
  const b = botones[botones.length - 1];
  b?.scrollIntoView({ block: "center" });
  return { texto: b?.textContent?.trim().slice(0, 20) ?? null, total: botones.length };
});
await p.waitForTimeout(200);
const alcanzable = await p.evaluate(() => {
  const botones = [...document.querySelectorAll(".inc-menu-pane:not(.inc-hidden) button")];
  const b = botones[botones.length - 1];
  const r = b.getBoundingClientRect();
  const stage = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--stage-h"));
  // ¿Está donde un dedo o un ratón puede tocarlo, y es él quien recibe?
  const enPunto = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { dentro: r.top >= 0 && r.bottom <= stage, loRecibe: b.contains(enPunto) || b === enPunto };
});
check(
  "y la ÚLTIMA opción de la lista se puede alcanzar y recibe el clic",
  alcanzable.dentro && alcanzable.loRecibe,
  JSON.stringify({ ...ultimo, ...alcanzable })
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nAjustes cabe, se desplaza por dentro y todas sus opciones accionan"
    : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
