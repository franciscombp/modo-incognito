/**
 * LA AGUJA DE LA LISTA DE MISIONES apunta a donde dice.
 *
 * Una flecha de rumbo equivocada es el peor tipo de fallo de interfaz: se ve
 * «casi bien» y manda a la jugadora a la pared de al lado, así que nadie
 * reporta un bug — reporta que el juego es confuso. Y hay DOS desfases
 * fáciles de meter, los dos silenciosos:
 *
 *  1. La proyección. El rumbo se mide en coordenadas de PANTALLA
 *     (`groundToScreen`), no de mundo: con la cámara oblicua, «al norte del
 *     piso» no es «arriba en pantalla».
 *  2. La forma del icono. La aguja de Phosphor apunta al NOROESTE en su
 *     forma original, así que el HUD le suma 45°. Si alguien cambia el
 *     icono por otro, ese +45 pasa a mentir.
 *
 * Esto corre contra el BANCO DE PRUEBAS (creador/pruebas), no contra una
 * partida: los objetivos se colocan con `screenToGround`, la inversa exacta
 * de la proyección, así que el caso vale con cualquier cámara.
 *
 * Uso: npm run check:rumbo   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/creador/pruebas/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 160)));

let fallos = 0;
function check(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : ` — ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(`${url}?cast=giu&rumbo=1`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForFunction(() => window.__pruebas?.listo, null, { timeout: 30000 });
await p.waitForTimeout(500);

const filas = await p.evaluate(() =>
  [...document.querySelectorAll(".inc-quest")].map((n) => ({
    label: n.querySelector(".inc-quest-title")?.textContent ?? "",
    // El giro que el HUD acaba de escribir, en grados.
    giro: Number(
      (n.querySelector(".inc-quest-aguja")?.style.transform ?? "").match(/-?[\d.]+/)?.[0] ?? NaN
    ),
    visible: getComputedStyle(n.querySelector(".inc-quest-aguja")).opacity !== "0",
  }))
);

check("la lista trae las tres filas de rumbo", filas.length === 3, JSON.stringify(filas));

// La compensación del icono: la aguja apunta al noroeste en su forma
// original, así que un objetivo justo ARRIBA se pinta con 45°.
const COMPENSACION = 45;
const esperado = {
  "ARRIBA en pantalla": 0,
  "DERECHA en pantalla": 90,
  "ABAJO en pantalla": 180,
};

for (const fila of filas) {
  const quiero = esperado[fila.label];
  if (quiero == null) {
    check(`fila reconocida: ${fila.label}`, false);
    continue;
  }
  // Se compara EN CÍRCULO: 359° y 1° distan 2°, no 358. El truco del
  // +540/%360−180 devuelve la diferencia con signo dentro de [−180, 180].
  const delta = ((((fila.giro - COMPENSACION - quiero) % 360) + 540) % 360) - 180;
  check(
    `«${fila.label}» apunta a ${quiero}° (la aguja va a ${fila.giro}°)`,
    Math.abs(delta) < 6,
    `desviada ${delta.toFixed(1)}°`
  );
}

// Y la barra de progreso, que estuvo mintiendo: `progress` va en SEGUNDOS
// (0→`time`), no en fracción 0–1. Pintándolo como fracción, una tarea de
// 6 s marcaba el tope al primer segundo y la barra vivía llena — por eso
// nadie entendía qué era.
await p.goto(`${url}?cast=giu`, { waitUntil: "networkidle", timeout: 60000 });
await p.waitForFunction(() => window.__pruebas?.listo, null, { timeout: 30000 });
await p.waitForTimeout(400);
const barras = await p.evaluate(() =>
  [...document.querySelectorAll(".inc-quest")].map((n) => ({
    label: n.querySelector(".inc-quest-title")?.textContent ?? "",
    ancho: n.querySelector(".inc-quest-bar > i")?.style.width ?? "",
    encendida: n.querySelector(".inc-quest-bar")?.classList.contains("on") ?? false,
  }))
);
// El banco pone la primera a 2.4 s de 6 → 40 %.
const conProgreso = barras.find((x) => x.encendida);
check(
  "la barra de una tarea a medias marca su fracción REAL (40 %, no el tope)",
  conProgreso?.ancho === "40%",
  JSON.stringify(barras)
);
check(
  "y una tarea sin empezar no enseña barra",
  barras.filter((x) => x.encendida).length === 1,
  JSON.stringify(barras)
);

check("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0 ? "\nLa aguja apunta a donde dice, y la barra dice la verdad" : `\n${fallos} fallo(s)`
);
process.exit(fallos ? 1 : 0);
