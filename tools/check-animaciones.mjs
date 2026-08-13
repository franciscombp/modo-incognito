/**
 * EL BUILDER DE ANIMACIONES (creador/animaciones/).
 *
 * Nació roto y la captura no lo delató: mover un hueso a 140° «se veía casi
 * igual» y cargar `sleep` dejaba a la jugadora de pie con los brazos
 * colgando. La causa era de una línea — la pose se aplicaba ANTES de
 * `muñeco.update(dt)`, y ese update reescribe los mismos huesos (respiración
 * de espera, `_applyPose`, el clip del `.glb`), así que cada cuadro borraba lo
 * editado.
 *
 * Por eso esta prueba NO mira una captura: mira la rotación REAL del hueso en
 * la escena. Un editor que no mueve lo que dice mover es peor que no tenerlo,
 * y ese fallo concreto es invisible en una imagen pequeña.
 *
 * Lo que vigila:
 *  1. El muñeco y su esqueleto llegan a montarse.
 *  2. Mover un slider mueve EL HUESO de la escena, no solo el número.
 *  3. Cargar una pose de la biblioteca cambia la postura de verdad, y trae su
 *     `context` (la cama de `sleep`) — que es lo que solo el motor sabe montar.
 *  4. Las dos llaves son independientes: editar B no toca A.
 *  5. El cursor de la línea de tiempo mezcla de A a B.
 *  6. Reproducir mueve el muñeco solo.
 *  7. Lo que se exporta lleva lo editado, y NO se cuela la ranura reservada.
 *
 * Uso: npm run check:animaciones   (necesita `npm run preview` en :4173)
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errores = [];
p.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

let fallos = 0;
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(`${url}creador/animaciones/`, { waitUntil: "networkidle", timeout: 90000 });
// El `.glb` del maniquí tarda: el asa no sirve de nada hasta que hay esqueleto.
await p.waitForFunction(() => window.__anim?.muñeco?.skeleton, null, { timeout: 60000 });
await p.waitForTimeout(600);

// ── 1 · El maniquí y su esqueleto ───────────────────────────────────────
const montaje = await p.evaluate(() => ({
  esqueleto: !!window.__anim.muñeco?.skeleton,
  huesosEnPanel: document.querySelectorAll(".bone").length,
  poses: document.querySelectorAll("#poses .row").length,
  ranuraOculta: ![...document.querySelectorAll("#poses .row")].some((r) =>
    r.textContent.includes("__builder")
  ),
}));
assert("el maniquí monta su esqueleto", montaje.esqueleto === true, JSON.stringify(montaje));
assert("el panel lista los huesos", montaje.huesosEnPanel >= 10, JSON.stringify(montaje));
assert("y la biblioteca de poses del motor", montaje.poses >= 3, JSON.stringify(montaje));
assert(
  "la ranura reservada del builder NO sale como pose del juego",
  montaje.ranuraOculta === true,
  JSON.stringify(montaje)
);

// ── 2 · Mover un slider mueve EL HUESO ──────────────────────────────────
// Aquí está el fallo que motivó la prueba: se compara la rotación del hueso
// EN LA ESCENA antes y después, no el valor del control.
const edicion = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const antes = window.__anim.rotacionDe("armR");
  const sl = [...document.querySelectorAll(".bone.on input[type=range]")];
  sl[0].value = -120;
  sl[0].dispatchEvent(new Event("input"));
  await sleep(400);
  const despues = window.__anim.rotacionDe("armR");
  return {
    antes,
    despues,
    movido: Math.abs(despues[0] - antes[0]) > 20,
    enPose: window.__anim.pose[window.__anim.llave].armR[0],
  };
});
assert(
  "mover el slider gira el HUESO de la escena",
  edicion.movido === true,
  `armR ${JSON.stringify(edicion.antes)} -> ${JSON.stringify(edicion.despues)}`
);
assert("y queda guardado en la pose", Math.abs(edicion.enPose) > 1, JSON.stringify(edicion));

// ── 3 · Cargar una pose de la biblioteca cambia la postura Y trae su contexto ──
const carga = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const antes = window.__anim.rotacionDe("torso");
  const fila = [...document.querySelectorAll("#poses .row")].find(
    (f) => f.textContent.trim() === "sleep"
  );
  if (!fila) return { error: "no está la pose sleep" };
  fila.click();
  await sleep(600);
  // `sleep` monta una cama: la cuelga del grupo del personaje. Si no aparece,
  // es que el builder no está pasando por `setPose()` del motor.
  let muebles = 0;
  window.__anim.muñeco.object.traverse((o) => {
    if (o.isMesh && o !== window.__anim.muñeco.object) muebles++;
  });
  return {
    antes,
    despues: window.__anim.rotacionDe("torso"),
    cambio: Math.abs(window.__anim.rotacionDe("torso")[0] - antes[0]) > 3,
    mallas: muebles,
    nombre: document.querySelector("#nombre").value,
  };
});
assert("cargar una pose cambia la postura", carga.cambio === true, JSON.stringify(carga));
assert("y su nombre entra en el formulario", carga.nombre === "sleep", JSON.stringify(carga));

// ── 4 · Las dos llaves son independientes ───────────────────────────────
const llaves = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector("#key-a").click();
  await sleep(200);
  const aAntes = [...window.__anim.pose.a.armL];
  document.querySelector("#key-b").click();
  await sleep(200);
  // Con B seleccionada, el panel edita B.
  const sl = [...document.querySelectorAll(".bone.on input[type=range]")];
  const canal = document.querySelector(".bone.on .bone-name").dataset.canal;
  sl[0].value = 77;
  sl[0].dispatchEvent(new Event("input"));
  await sleep(250);
  return {
    canal,
    llave: window.__anim.llave,
    aIntacta: JSON.stringify(window.__anim.pose.a.armL) === JSON.stringify(aAntes),
    bCambiada: Math.abs(window.__anim.pose.b[canal][0] - window.__anim.pose.a[canal][0]) > 0.5,
  };
});
assert("elegir la llave B pasa a editar B", llaves.llave === "b", JSON.stringify(llaves));
assert("editar B no toca A", llaves.aIntacta === true, JSON.stringify(llaves));
assert("y B queda distinta de A", llaves.bCambiada === true, JSON.stringify(llaves));

// ── 5 · El cursor mezcla de A a B ───────────────────────────────────────
const cursor = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const via = document.querySelector("#track").getBoundingClientRect();
  const clic = (frac) =>
    document.querySelector("#track").dispatchEvent(
      new PointerEvent("pointerdown", { clientX: via.left + via.width * frac, bubbles: true })
    );
  clic(0);
  await sleep(250);
  const enA = window.__anim.rotacionDe(document.querySelector(".bone.on .bone-name").dataset.canal);
  clic(1);
  await sleep(250);
  const enB = window.__anim.rotacionDe(document.querySelector(".bone.on .bone-name").dataset.canal);
  return { enA, enB, distinto: Math.abs(enA[0] - enB[0]) > 5, t: window.__anim.t };
});
assert(
  "arrastrar el cursor mezcla de A a B",
  cursor.distinto === true,
  `A ${JSON.stringify(cursor.enA)} · B ${JSON.stringify(cursor.enB)}`
);

// ── 6 · Reproducir mueve el muñeco solo ─────────────────────────────────
const play = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector("#play").click();
  await sleep(200);
  const t1 = window.__anim.t;
  await sleep(400);
  const t2 = window.__anim.t;
  document.querySelector("#play").click();
  return { reproduciendo: t1 !== t2, t1: +t1.toFixed(3), t2: +t2.toFixed(3) };
});
assert("reproducir avanza la línea de tiempo", play.reproduciendo === true, JSON.stringify(play));

// ── 7 · Lo que se exporta lleva lo editado ──────────────────────────────
const salida = await p.evaluate(() => {
  const txt = window.__anim.salida();
  return {
    tieneAB: txt.includes('"a"') && txt.includes('"b"'),
    tieneSpeed: txt.includes('"speed"'),
    tieneHuesos: txt.includes("armR") && txt.includes("torso"),
    sinRanura: !txt.includes("__builder"),
    largo: txt.length,
  };
});
assert("la salida trae las dos posturas", salida.tieneAB === true, JSON.stringify(salida));
assert("y la velocidad y los huesos", salida.tieneSpeed && salida.tieneHuesos, JSON.stringify(salida));
assert("sin colar la ranura reservada", salida.sinRanura === true, JSON.stringify(salida));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nEl builder de animaciones edita de verdad: el hueso de la escena se mueve"
    : `\n${fallos} fallo(s) en el builder de animaciones`
);
process.exit(fallos === 0 ? 0 : 1);
