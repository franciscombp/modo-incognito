// PARTIDA VIGILADA: se juega el día 1 en el BUCLE REAL (render, cámara,
// globos, HUD) mientras se escucha la consola y se miden anomalías que las
// suites por API no miran: cuerpos dentro de muebles, posiciones rotas,
// diálogos colgados. Capturas en los momentos clave para mirar con los ojos.
// Uso: node tools/_partida-vigilada.mjs
import { chromium } from "playwright";

const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const consola = [];
p.on("console", (m) => {
  const t = m.text();
  if ((m.type() === "warning" || m.type() === "error") && !t.includes("favicon") && !t.includes("WebGL"))
    consola.push(`[${m.type()}] ${t.slice(0, 140)}`);
});
p.on("pageerror", (e) => consola.push(`[pageerror] ${String(e).slice(0, 140)}`));

await p.goto("http://localhost:4173/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
await p.evaluate(() => window.__game.engine.startDay(0, { skipMinigame: true }));
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });

// El guion del vestíbulo, a espacio.
for (let i = 0; i < 40; i++) {
  if (!(await p.evaluate(() => window.__game.engine.dialogue.isOpen))) break;
  await p.keyboard.press("Space");
  await p.waitForTimeout(150);
}
await p.evaluate(() => window.__game.engine.game.setPaused(false));

// Detector de anomalías: corre en la página y mira cada medio segundo.
await p.evaluate(() => {
  const g = window.__game.engine.game;
  const world = window.__game.world;
  window.__anomalias = [];
  const dentroDeCaja = (pos, radio) => {
    const antes = { x: pos.x, z: pos.z };
    const prueba = { x: pos.x, z: pos.z };
    world.resolveCircle(prueba, radio);
    return Math.hypot(prueba.x - antes.x, prueba.z - antes.z) > 0.15;
  };
  window.__vigia = setInterval(() => {
    if (!g || g.gameOver) return;
    const cuerpos = [
      ["jugadora", g.player.position, g.player.radius],
      ["jefe", g.boss.position, g.boss.radius],
      ...g.npcs.filter((n) => n.active !== false).map((n) => [n.id ?? "npc", n.position, n.radius]),
    ];
    for (const [id, pos, radio] of cuerpos) {
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.z)) {
        window.__anomalias.push(`${id}: posición rota ${pos.x},${pos.z}`);
      } else if (dentroDeCaja(pos, radio)) {
        window.__anomalias.push(`${id}: dentro de un mueble en ${pos.x.toFixed(1)},${pos.z.toFixed(1)}`);
      }
    }
  }, 500);
});

// ── LA ESCOLTA, en el bucle real ──
const beats = [];
for (const [espera, nombre] of [
  [3000, "vig-1-escolta"],
  [4000, "vig-2-camino"],
  [5000, "vig-3-sentada"],
]) {
  await p.waitForTimeout(espera);
  await p.screenshot({ path: `/tmp/${nombre}.png` });
  beats.push(
    await p.evaluate(() => {
      const g = window.__game.engine.game;
      return {
        d: +Math.hypot(
          g.boss.position.x - g.player.position.x,
          g.boss.position.z - g.player.position.z
        ).toFixed(1),
        sentada: g.player.isPretending,
        escolta: g._esperandoPuesto,
        globo: document.querySelector(".inc-globo.on .inc-globo-texto")?.textContent?.slice(0, 50) ?? null,
      };
    })
  );
}
console.log("escolta:", JSON.stringify(beats));

// ── CAMINAR CON TECLAS hacia la primera estación (mando real) ──
const paseo = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const st = g.objectives.find((o) => !o.done && !o.dynamic) ?? g.objectives[0];
  return st ? { x: st.x, z: st.z, id: st.id } : null;
});
if (paseo) {
  let llego = false;
  for (let i = 0; i < 120 && !llego; i++) {
    const dir = await p.evaluate(({ x, z }) => {
      const g = window.__game.engine.game;
      if (g.paused) g.setPaused(false);
      // se convierte el rumbo de mundo a tecla de pantalla con la misma
      // matemática del juego
      const dx = x - g.player.position.x;
      const dz = z - g.player.position.z;
      if (Math.hypot(dx, dz) < 1) return null;
      const yaw = 0; // cámara por defecto
      const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const up = -(dx * Math.sin(yaw) + dz * Math.cos(yaw));
      return Math.abs(right) > Math.abs(up) ? (right > 0 ? "d" : "a") : up > 0 ? "w" : "s";
    }, paseo);
    if (!dir) {
      llego = true;
      break;
    }
    await p.keyboard.down(dir);
    await p.waitForTimeout(150);
    await p.keyboard.up(dir);
  }
  console.log("paseo a", paseo.id, llego ? "LLEGÓ" : "no llegó en 18s");
  await p.screenshot({ path: "/tmp/vig-4-estacion.png" });
}

// ── Cierre: anomalías y consola ──
const anomalias = await p.evaluate(() => {
  clearInterval(window.__vigia);
  // dedupe
  return [...new Set(window.__anomalias)].slice(0, 12);
});
console.log("anomalías:", JSON.stringify(anomalias, null, 1));
console.log("consola:", JSON.stringify([...new Set(consola)].slice(0, 12), null, 1));
await b.close();
