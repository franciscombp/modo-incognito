import { chromium } from "playwright";

/**
 * ¿Se está usando de verdad el cuerpo importado (`recipe.baseModel`)?
 *
 * Existe porque este camino estuvo escrito y publicado SIN EJECUTARSE NUNCA:
 * `mergeRecipe` se comía el campo `baseModel`, así que todo el mundo salía por
 * el camino procedural y las capturas de prueba enseñaban el muñeco de siempre
 * — que es exactamente igual de bonito, y por eso nadie lo notó.
 *
 * De ahí que esto NO valide mirando una imagen: comprueba que el .glb se pide
 * por red y que la malla que acaba en la escena es la del archivo.
 */
const URL = process.env.GAME_URL ?? "http://localhost:4173/";

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });

const glbRequests = [];
page.on("response", (res) => {
  const url = res.url();
  if (url.endsWith(".glb")) glbRequests.push({ url, status: res.status() });
});
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
await page.evaluate(() => {
  window.__game.engine.save.setCharacter("giu");
  window.__game.engine.menus.close();
});
// Con llaves a propósito: `startDay` devuelve una promesa que no resuelve
// hasta que alguien pasa los diálogos, y devolverla aquí cuelga el test.
await page.evaluate(() => {
  window.__game.engine.startDay(0, { skipMinigame: true });
});
await page.waitForFunction(() => !!window.__game.engine.game, null, { timeout: 20000 });

// La carga del .glb es asíncrona y no bloquea el arranque del día.
await page
  .waitForFunction(
    () => {
      const g = window.__game;
      const all = [g?.player?.sprite, g?.engine?.game?.boss?.sprite].filter(Boolean);
      return all.some((s) => s.recipe?.baseModel && s._built);
    },
    null,
    { timeout: 30000 }
  )
  .catch(() => {});

// --- 1. ¿Alguien pide el archivo? ---
const ok200 = glbRequests.filter((r) => r.status === 200);
check(glbRequests.length > 0, "el juego pide algún .glb", `${glbRequests.length} peticiones`);
check(
  ok200.length > 0 && ok200.length === glbRequests.length,
  "todos los .glb responden 200",
  glbRequests.map((r) => `${r.url.split("/").pop()}:${r.status}`).join(", ") || "ninguna"
);

// --- 2. ¿El campo sobrevive a la receta? ---
const recipes = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  for (const [name, s] of [
    ["player", g?.player?.sprite],
    ["boss", g?.engine?.game?.boss?.sprite],
  ]) {
    if (s) out[name] = { baseModel: s.recipe?.baseModel ?? null, built: !!s._built };
  }
  return out;
});
const withModel = Object.entries(recipes).filter(([, v]) => v.baseModel);
check(withModel.length > 0, "algún personaje conserva `baseModel` en su receta", JSON.stringify(recipes));

// --- 3. ¿La malla en escena viene del archivo, no de primitivas? ---
// El cuerpo generado es UNA malla con color por vértice y sin textura; el
// importado trae mapa de textura. Es la diferencia que no se puede fingir.
const meshInfo = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  for (const [name, s] of [
    ["player", g?.player?.sprite],
    ["boss", g?.engine?.game?.boss?.sprite],
  ]) {
    if (!s?._built) continue;
    let textured = false;
    let skinned = 0;
    s.object.traverse((o) => {
      if (o.isSkinnedMesh) {
        skinned++;
        if (o.material?.map) textured = true;
      }
    });
    out[name] = { baseModel: s.recipe?.baseModel ?? null, textured, skinned };
  }
  return out;
});
for (const [name, info] of Object.entries(meshInfo)) {
  if (!info.baseModel) continue;
  check(info.skinned > 0, `${name}: hay una malla con esqueleto en escena`, JSON.stringify(info));
  check(info.textured, `${name}: la malla lleva la textura del modelo`, JSON.stringify(info));
}

// --- 4. Las poses siguen moviendo el rig importado ---
const posed = await page.evaluate(async () => {
  const g = window.__game;
  const s = g?.player?.sprite;
  if (!s?._built || !s.recipe?.baseModel) return null;
  const arm = s.bone("LeftArm");
  const chest = s.bone("Chest");
  if (!arm) return { arm: false };
  // El giro se compone sobre el reposo (ver `setBoneRotation`), así que lo que
  // hay que mirar es el cuaternión entero, no una componente de Euler.
  const before = arm.quaternion.clone();
  s.setPose("coffee");
  for (let i = 0; i < 60; i++) s.update(1 / 30);
  const delta = before.angleTo(arm.quaternion);
  // Y que la postura de reposo siga guardada: es lo que mantiene al modelo
  // de pie en vez de tumbado y en cruz.
  const rest = !!arm.userData?.restQuat;
  return { arm: true, chest: !!chest, moved: delta > 0.05, deltaRad: +delta.toFixed(3), rest };
});
if (posed) {
  check(posed.arm, "el rig importado expone los huesos que usan las poses");
  check(!!posed.chest, "`Chest` queda mapeado (el export lo llama Spine02)");
  check(!!posed.rest, "el rig importado conserva su postura de reposo");
  check(!!posed.moved, "una pose mueve de verdad el rig importado", `giro ${posed.deltaRad} rad`);
}

// --- 5. La caminata sale del ARCHIVO, no de nuestro paso chibi ---
const walk = await page.evaluate(async () => {
  const s = window.__game?.player?.sprite;
  if (!s?._built || !s.recipe?.baseModel) return null;
  const out = { tieneClip: !!s._walkAction };
  if (!s._walkAction) return out;
  out.clip = s._walkAction.getClip()?.name ?? null;
  // Andando, el clip tiene que tomar el mando…
  s.setPose(null);
  s.setMoving(true);
  for (let i = 0; i < 40; i++) s.update(1 / 30);
  out.pesoAndando = +s._walkAction.getEffectiveWeight().toFixed(2);
  // …y soltarlo en cuanto hay una pose del juego, que el .glb no trae.
  s.setPose("coffee");
  for (let i = 0; i < 40; i++) s.update(1 / 30);
  out.pesoEnPose = +s._walkAction.getEffectiveWeight().toFixed(2);
  s.setMoving(false);
  return out;
});
if (walk) {
  check(walk.tieneClip, "el cuerpo importado trae su ciclo de andar", walk.clip ?? "");
  check(walk.pesoAndando > 0.9, "andando manda el clip del archivo", `peso ${walk.pesoAndando}`);
  check(walk.pesoEnPose < 0.1, "en una pose del juego el clip se aparta", `peso ${walk.pesoEnPose}`);
}

check(errors.length === 0, "sin errores de consola", errors.slice(0, 3).join(" | "));

await browser.close();
console.log(failures ? `\n${failures} fallo(s)` : "\nCuerpo importado en uso de verdad");
process.exit(failures ? 1 : 0);
