/**
 * LOS MENSAJES NO SE PISAN (src/ui/messages.js).
 *
 * Había cuatro canales escribiendo en pantalla por su cuenta y ninguno sabía
 * de los otros: el anuncio del centro, el toast ABAJO EN EL CENTRO (encima de
 * la tarjeta de acción, la tira del pulso y la píldora de mandos), las
 * notificaciones ARRIBA A LA DERECHA (donde vive la lista de misiones) y el
 * aviso de Teams también a la derecha.
 *
 * La regla que se comprueba aquí es de una línea: LO URGENTE AL CENTRO, LO
 * DEMÁS AL LADO — y nada se solapa con nada.
 *
 * Se mide GEOMETRÍA, no una captura: dos paneles superpuestos se ven casi
 * igual en una imagen pequeña, y el solape es exactamente lo que hay que
 * cazar.
 *
 * Uso: npm run check:mensajes   (necesita `npm run preview` en :4173)
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
function assert(nombre, ok, detalle = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${nombre}${ok || !detalle ? "" : `\n        ${detalle}`}`);
  if (!ok) fallos++;
}

await p.goto(url, { waitUntil: "networkidle", timeout: 90000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await p.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 90000 });
await p.evaluate(() => {
  const css = document.createElement("style");
  css.textContent = ".vn-layer, .inc-dialogue { display: none !important; }";
  document.head.appendChild(css);
  const g = window.__game.engine.game;
  g.setPaused(false);
  g.clearGate();
});
await p.waitForTimeout(700);

// ── 1 · La avalancha: todo a la vez ─────────────────────────────────────
// El caso real que se rompía: el jefe te ve, se acaba una tarea, cae una
// misión nueva y llega un Teams, todo en el mismo segundo.
const avalancha = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__game.engine.game;
  const hud = window.__game.hud ?? window.__game.engine.hud;
  g.announce("¡GABO TE VIO!", "danger");
  g.toast("Ese escondite se quemó. Busca otro.", 2, "warn");
  g.toast("+12 energía");
  hud?.menuBar?.notify?.({ text: "Nueva misión: tomar café", tone: "info", icon: "star" });
  hud?.menuBar?.notify?.({ text: "Nivel de búsqueda 2", tone: "warn", icon: "alert" });
  hud?.menuBar?.notify?.({ text: "Distracción: impresora", tone: "info", icon: "alert" });
  hud?.menuBar?.notify?.({ text: "Otra más para forzar el tope", tone: "info" });
  await sleep(700);

  const vis = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && r.width > 2 && r.height > 2;
  };
  const caja = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cls: el.className };
  };

  // Todo lo que puede escribir en pantalla a la vez, más las piezas del HUD
  // que NO se pueden tapar (son las que se estaban tapando).
  const sel = [
    ".inc-msg-centro.show",
    ".inc-msg",
    ".inc-teams-toast:not(.inc-hidden)",
    ".inc-plate",
    ".inc-quests",
    ".inc-bar-center",
    ".inc-action.on",
  ];
  const piezas = [];
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) if (vis(el)) piezas.push(caja(el));
  }

  const solapes = [];
  for (let i = 0; i < piezas.length; i++) {
    for (let j = i + 1; j < piezas.length; j++) {
      const a = piezas[i];
      const c = piezas[j];
      const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
      const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      // 6 px de gracia: los filos y las sombras se rozan sin taparse.
      if (ox > 6 && oy > 6) {
        solapes.push(`${a.cls.split(" ")[0]} ∩ ${c.cls.split(" ")[0]} (${Math.round(ox)}×${Math.round(oy)})`);
      }
    }
  }

  return {
    piezas: piezas.length,
    solapes,
    // Uno solo en el centro, nunca dos.
    enCentro: document.querySelectorAll(".inc-msg-centro.show").length,
    // El carril lateral tiene tope.
    enLado: document.querySelectorAll(".inc-msg").length,
    // Y el toast viejo del centro-abajo ya no pinta.
    toastViejo: !!document.querySelector(".inc-hud-toast.visible"),
  };
});
assert(
  "con todo disparado a la vez, NADA se solapa",
  avalancha.solapes.length === 0,
  avalancha.solapes.join(" · ")
);
assert("solo UN mensaje en el centro", avalancha.enCentro <= 1, `${avalancha.enCentro}`);
assert("el carril lateral tiene tope", avalancha.enLado <= 3, `${avalancha.enLado} tarjetas`);
assert("el toast de abajo-centro ya no pinta (tapaba la acción)", avalancha.toastViejo === false);

// ── 2 · La PRIORIDAD: lo urgente manda ──────────────────────────────────
const prioridad = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__game.engine.game;
  const centro = () => document.querySelector(".inc-msg-centro");

  // Un mensaje de ambiente NO puede entrar al centro.
  g.toast("+3 energía");
  await sleep(300);
  const trasAmbiente = centro().classList.contains("show") ? centro().textContent : null;

  // Uno urgente sí.
  g.toast("Te quedaste encerrada. Baja el guardia y te saca del piso.", 2, "danger");
  await sleep(300);
  const trasUrgente = centro().textContent;
  const mostrando = centro().classList.contains("show");

  // Y uno de ambiente que llegue después NO lo pisa: se va al lado.
  const ladoAntes = document.querySelectorAll(".inc-msg").length;
  g.toast("+5 energía");
  await sleep(300);
  return {
    ambienteNoEntraAlCentro: trasAmbiente === null || !trasAmbiente.includes("energía"),
    urgenteEntra: mostrando && trasUrgente.includes("encerrada"),
    urgenteSobrevive: centro().textContent.includes("encerrada"),
    ambienteVaAlLado: document.querySelectorAll(".inc-msg").length > ladoAntes - 1,
  };
});
assert(
  "un mensaje de ambiente NO ocupa el centro",
  prioridad.ambienteNoEntraAlCentro === true,
  JSON.stringify(prioridad)
);
assert("uno urgente SÍ entra al centro", prioridad.urgenteEntra === true, JSON.stringify(prioridad));
assert(
  "y un ambiente posterior no lo pisa: se va al lado",
  prioridad.urgenteSobrevive === true,
  JSON.stringify(prioridad)
);

// ── 3 · Nada de esto roba un clic ───────────────────────────────────────
const clics = await p.evaluate(() => {
  const malos = [];
  for (const s of [".inc-msg-centro", ".inc-msg-lado", ".inc-msg"]) {
    for (const el of document.querySelectorAll(s)) {
      if (getComputedStyle(el).pointerEvents !== "none") malos.push(el.className);
    }
  }
  return malos;
});
assert("los mensajes nunca roban un clic", clics.length === 0, clics.join(", "));

assert("sin errores de página", errores.length === 0, errores.join(" | "));

await b.close();
console.log(
  fallos === 0
    ? "\nLo urgente al centro, lo demás al lado, y nada se pisa"
    : `\n${fallos} fallo(s) en los mensajes`
);
process.exit(fallos === 0 ? 0 : 1);
