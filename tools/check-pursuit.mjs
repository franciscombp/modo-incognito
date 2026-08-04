// La persecucion es "comprometida": en cuanto un vigilante te mete en su halo
// no te suelta hasta alcanzarte, y la UNICA forma de quitartelo de encima es
// llegar a un lugar seguro. Esconderse o doblar una esquina ya no bastan.
//
// Se comprueba aqui porque son cuatro reglas que se pisan entre si con
// facilidad: al tocarlas, el jefe volvia a rendirse solo (por perder la vista,
// o por atascarse contra un mueble) sin que se notara jugando de pasada.
//
// Uso: npm run check:pursuit   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
const url = process.argv[2] ?? "http://localhost:4173/";
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text()); });
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
await p.waitForFunction(() => !!window.__game, null, { timeout: 25000 });
await p.evaluate(() => { window.__game.engine.startDay(0, { skipMinigame: true }); });
// startDay espera a que los modelos 3D base terminen de cargar antes de
// montar el piso (ver preloadBaseModels en main.js), así que un tiempo fijo
// corto se quedaba corto en frío; se espera a que engine.game exista de verdad.
await p.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 60000 });
await p.waitForTimeout(300);

const out = await p.evaluate(() => {
  const g = window.__game.engine.game;
  const fp = window.__floorplan;
  const S = fp.WORLD_SCALE;
  const boss = g.boss;
  const res = {};
  const dist = () => Math.hypot(boss.position.x - g.player.position.x, boss.position.z - g.player.position.z);

  g.setPaused(false);
  g.rules.explore = false;
  // Sin pasar por el saludo de Gabo, el gate fuerza la sospecha a 0 cada
  // frame — y con la regla de "cero sostenido lo suelta", el jefe soltaba
  // la caza a los 1.5 s y todo el test de compromiso daba falso negativo.
  g.metGabo = true;
  g.minions.forEach((m) => m.setActive(false));
  const blind = function () { this.playerVisible = false; this.redAlert = false; };
  const sees = function () { this.playerVisible = true; this.redAlert = true; };

  // Coloca a la jugadora lejos de cualquier lugar seguro para las pruebas 1-3.
  const far = fp.patrolRoute[0];
  g.player.position.x = far.x; g.player.position.z = far.z;
  g.player.isHiding = false; g.player.isDoingActivity = true; g.player.isPretending = false;

  // --- 1. Te mete en el halo -> se compromete ---
  boss.resetToPatrol();
  boss.position.x = g.player.position.x + 14 * S;
  boss.position.z = g.player.position.z;
  boss._updateVision = sees;
  g.update(1 / 30);
  res.lockedAfterHalo = boss.lockedOn;
  res.stateAfterHalo = boss.state;

  // --- 2. Escondida y sin verla: NO se rinde y sigue cerrando distancia ---
  // Con la sospecha ALTA: la regla nueva de "enfriarse a 0 lo suelta" no
  // debe aplicar mientras el medidor siga caliente. Se silencia la alarma
  // de nivel 3 (pausaría la partida y congelaría el test).
  boss._updateVision = blind;
  g.player.isHiding = true;
  g._heatAlertShown = true;
  g.suspicion = 100;
  // Con el calor alto el jefe corre y ALCANZA a la escondida dentro de la
  // ventana: la amonestación resetearía el estado a mitad de prueba. Aquí
  // se mide el compromiso, no la captura (esa es la prueba 3).
  g._caughtCooldown = 999;
  const d0 = dist();
  for (let i = 0; i < 90; i++) {
    g.update(1 / 30); // 3 s (antes desistía a los 1.2 s)
    // Medidor SUJETO en caliente (bajo el umbral de la alarma): lo que se
    // prueba aquí es que esconderse no lo suelta MIENTRAS haya sospecha;
    // el enfriamiento a cero tiene su propia prueba justo debajo.
    g.suspicion = Math.max(g.suspicion, 50);
  }
  res.stateWhileHidden = boss.state;
  res.stillLocked = boss.lockedOn;
  res.closed = +(d0 - dist()).toFixed(2);

  // --- 2b. Pero ENFRIARSE A CERO (sostenido) sí lo suelta ---
  // En un ESCONDITE de verdad: isHiding se recalcula cada frame desde los
  // escondites del plano (el flag puesto a mano no sobrevive al update), y
  // sin esconderse la sospecha no baja sola — por diseño.
  const hide = fp.hidingSpots[0];
  g.player.position.x = hide.x; g.player.position.z = hide.z;
  for (let i = 0; i < 400 && boss.lockedOn; i++) g.update(1 / 30); // hasta ~13 s
  res.releasedWhenCold = !boss.lockedOn;
  res.suspicionWhenCold = Math.round(g.suspicion);

  // --- 3. Persigue HASTA atraparte ---
  // Ambos sobre waypoints de la ronda: por construccion estan en el navmesh
  // y conectados entre si, asi que un fallo aqui es de la IA y no del sitio.
  const wpA = fp.patrolRoute[0], wpB = fp.patrolRoute[2];
  g.player.position.x = wpA.x; g.player.position.z = wpA.z;
  boss.position.x = wpB.x; boss.position.z = wpB.z;
  // A la vista y en falta (redAlert): así la sospecha no se enfría por el
  // camino y la regla de "cero lo suelta" no interfiere — lo que se prueba
  // aquí es que la amonestación exige ALCANZARTE físicamente.
  g.player.isHiding = false;
  g.player.isDoingActivity = true;
  g.setPaused(false);
  g._caughtCooldown = 0;
  boss._updateVision = sees;
  boss.startChase();
  const warnings0 = g.warnings;
  for (let i = 0; i < 1800 && g.warnings === warnings0; i++) {
    g.update(1 / 30);
    // Sujeta el medidor entre 1 y el umbral del nivel 3: ni se enfría a 0
    // (soltaría la caza) ni dispara la alarma de pantalla completa (pausa).
    g.suspicion = Math.min(Math.max(g.suspicion, 1), 50);
  }
  res.caughtWhileHidden = g.warnings > warnings0;

  // --- 4. El lugar seguro SÍ corta una persecución comprometida ---
  const safe = fp.safeSpots[0];
  // Atraparla dispara el dialogo de regano, que pausa la partida: hay que
  // reanudarla o los update() siguientes no hacen nada.
  g.setPaused(false);
  g.gameOver = false;
  res.safeSpot = { r: safe.r ?? null, label: safe.label ?? null };
  g.player.position.x = safe.x; g.player.position.z = safe.z;
  g._caughtCooldown = 0;
  boss.resetToPatrol();
  boss.position.x = safe.x + 14 * S;
  boss.position.z = safe.z;
  boss._updateVision = sees;
  g.update(1 / 30);
  const lockedBeforeSafe = boss.lockedOn;
  boss._updateVision = blind;
  g.update(1 / 30); // primer frame ya dentro del lugar seguro
  res.lockedBeforeSafe = lockedBeforeSafe;
  res.inSafeSpot = g.inSafeSpot;
  res.lockedAfterSafe = boss.lockedOn;
  res.stateAfterSafe = boss.state;
  return res;
});

console.log(JSON.stringify(out, null, 1));
const checks = [
  ["se compromete al meterte en el halo", out.lockedAfterHalo && out.stateAfterHalo === "CHASE"],
  ["esconderse ya no le hace desistir", out.stillLocked && out.stateWhileHidden === "CHASE"],
  ["sigue cerrando distancia sin verte", out.closed > 1],
  ["enfriarse a cero (sostenido) lo suelta", out.releasedWhenCold],
  ["te persigue hasta atraparte", out.caughtWhileHidden],
  ["el lugar seguro corta la persecucion", out.lockedBeforeSafe && out.inSafeSpot && !out.lockedAfterSafe],
];
let ok = true;
for (const [label, pass] of checks) { ok = ok && !!pass; console.log(pass ? "PASS" : "FAIL", " ", label); }
if (errors.length) { console.log("ERRORES:"); errors.forEach((e) => console.log("  ", e)); }
await b.close();
process.exit(ok && !errors.length ? 0 : 1);
