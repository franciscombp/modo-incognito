// El halo de visión: de dónde sale y hacia dónde mira.
//
// Dos cosas que se ven raro enseguida jugando pero que ningún test cubría:
//
//  1. EL VÉRTICE ESTÁ EN LOS OJOS. Si vuelve al suelo, con la cámara oblicua
//     el cono se dibuja por encima del sprite y parece salirle de la espalda.
//     Se comprueba en la geometría: el vértice tiene que estar por encima del
//     suelo y por delante del pecho (local -Z), no en (0,0,0).
//  2. EL CONO Y EL SPRITE MIRAN A LO MISMO. El sprite solo tiene cuatro
//     direcciones y el cono gira de forma continua, así que nunca coinciden
//     del todo; lo que no puede pasar es que discrepen más de lo que separa
//     a dos direcciones vecinas. Si alguien toca una de las dos rotaciones y
//     no la otra, el jefe acaba mirando a un lado y alumbrando al contrario.
//
// Uso: node tools/check-vision.mjs [url]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.menus.close();
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 15000 });

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { boss, player } = window.__game;
  const game = window.__game.engine.game;
  game.setPaused(false);
  document.querySelector(".vn-layer")?.classList.add("hidden");

  // --- 1. El vértice de la geometría ---
  const pos = boss.cone.geometry.attributes.position;
  // El primer vértice de cada triángulo es el vértice del cono.
  const apex = { x: pos.getX(0), y: pos.getY(0), z: pos.getZ(0) };
  // Y el segundo es un punto del arco lejano, que sí debe estar en el suelo.
  const rim = { y: pos.getY(1) };

  // --- 2. Cono vs sprite, barriendo todas las direcciones ---
  // Se congela al jefe mirando a cada ángulo y se compara hacia dónde apunta
  // el cono en pantalla con hacia dónde mira el sprite dibujado.
  boss.setTether(null);
  boss._pickTarget = () => ({ x: boss.position.x, z: boss.position.z });
  boss._updateVision = () => {
    boss.playerVisible = false;
    boss.redAlert = false;
  };

  const SCREEN = window.__iso.groundToScreen;
  let worst = 0;
  const samples = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dir = { x: Math.sin(a), z: Math.cos(a) };
    boss.facingDir = { ...dir };
    boss.desiredFacing = { ...dir };
    await sleep(60); // deja correr un frame para que se apliquen rotaciones

    // Dirección del cono en el mundo, sacada de su rotación real.
    const ry = boss.cone.rotation.y;
    const coneDir = { x: -Math.sin(ry), z: -Math.cos(ry) };
    const cone = SCREEN(coneDir.x, coneDir.z);
    const coneAngle = Math.atan2(cone.up, cone.right);

    // Dirección de pantalla del sprite que se está dibujando.
    const facing = boss.sprite.facing;
    const SPRITE_ANGLE = { east: 0, north: Math.PI / 2, west: Math.PI, south: -Math.PI / 2 };
    let delta = coneAngle - SPRITE_ANGLE[facing];
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const deg = Math.abs((delta * 180) / Math.PI);
    worst = Math.max(worst, deg);
    samples.push({ i, facing, deg: +deg.toFixed(1) });
  }

  return { apex, rim, worst: +worst.toFixed(1), samples, height: boss.sprite.height };
});

await browser.close();

let failed = 0;
function assert(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failed++;
}

assert(
  `el haz nace por encima del suelo (vértice a y=${out.apex.y.toFixed(2)})`,
  out.apex.y > out.height * 0.4
);
assert(
  `el haz nace por delante del cuerpo (vértice a z=${out.apex.z.toFixed(2)})`,
  out.apex.z < -0.01
);
assert(`la punta del haz sí toca el suelo (y=${out.rim.y.toFixed(2)})`, Math.abs(out.rim.y) < 0.01);
// Cuatro direcciones de sprite = 90 grados entre vecinas, o sea 45 de
// desvío como mucho. Se deja un poco de aire por el suavizado del giro.
assert(
  `el haz nunca se desvía del sprite más de media dirección (peor caso ${out.worst}°)`,
  out.worst <= 50
);

process.exit(failed ? 1 : 0);
