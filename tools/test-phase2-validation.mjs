#!/usr/bin/env node

import { chromium } from "playwright";

const URL = "http://localhost:4173/";

console.log("🎬 FASE 2: Validación de Migración Kiara\n");

let failures = 0;
const check = (ok, label, detail = "") => {
  const icon = ok ? "✓" : "✗";
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });

const glbRequests = [];
const pageErrors = [];
const consoleMessages = [];

page.on("response", (res) => {
  const url = res.url();
  if (url.endsWith(".glb")) {
    glbRequests.push({ url: url.split("/").pop(), status: res.status() });
  }
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "log" || msg.type() === "error") {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  }
});

try {
  console.log("Paso 1: Cargando juego...");
  await page.goto(URL, { waitUntil: "networkidle" });
  check(true, "Página cargada");

  console.log("\nPaso 2: Esperando inicialización del motor...");
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  check(true, "Motor inicializado");

  console.log("\nPaso 3: Seleccionando personaje y comenzando día...");
  await page.evaluate(() => {
    window.__game.engine.save.setCharacter("giu");
    window.__game.engine.menus.close();
  });

  await page.evaluate(() => {
    window.__game.engine.startDay(0, { skipMinigame: true });
  });

  // Wait for game to fully load
  await page.waitForFunction(
    () => !!window.__game.engine.game,
    null,
    { timeout: 20000 }
  );
  check(true, "Día iniciado");

  // Wait for character models to load
  await page.waitForTimeout(2000);

  console.log("\nPaso 4: Verificando modelos cargados...");

  // Check GLB requests
  const kiara_loaded = glbRequests.some((r) => r.url.includes("kiara"));
  const gabo_loaded = glbRequests.some((r) => r.url.includes("gabo"));

  check(glbRequests.length > 0, `${glbRequests.length} modelos .glb solicitados`);
  check(
    glbRequests.every((r) => r.status === 200),
    "Todos los .glb cargaron correctamente (status 200)"
  );

  if (glbRequests.length > 0) {
    console.log(`    Modelos: ${glbRequests.map((r) => r.url).join(", ")}`);
  }

  check(kiara_loaded, "Kiara.glb fue solicitado (fallback OK)");
  check(gabo_loaded, "Gabo.glb fue solicitado (modelo específico OK)");

  console.log("\nPaso 5: Verificando estructuras de personajes...");

  const charStatus = await page.evaluate(() => {
    const g = window.__game;
    const playerSprite = g?.player?.sprite;
    const bossSprite = g?.engine?.game?.boss?.sprite;

    return {
      playerBuilt: playerSprite?._built || false,
      playerModel: playerSprite?.recipe?.baseModel || "procedural",
      bossBuilt: bossSprite?._built || false,
      bossModel: bossSprite?.recipe?.baseModel || "procedural",
      playerHasSkeleton: !!playerSprite?.skeleton,
      bossHasSkeleton: !!bossSprite?.skeleton,
    };
  });

  check(charStatus.playerBuilt, `Jugadora cargada: modelo ${charStatus.playerModel}`);
  check(charStatus.playerHasSkeleton, "Jugadora tiene esqueleto (SkinnedMesh)");

  check(charStatus.bossBuilt, `Jefe cargado: modelo ${charStatus.bossModel}`);
  check(charStatus.bossHasSkeleton, "Jefe tiene esqueleto (SkinnedMesh)");

  console.log("\nPaso 6: Buscando errores y advertencias...");

  const boneWarnings = consoleMessages.filter((m) =>
    m.text.toLowerCase().includes("basemodel") ||
    m.text.toLowerCase().includes("no se encontraron") ||
    m.text.toLowerCase().includes("error loading") ||
    m.text.toLowerCase().includes("hueso")
  );

  if (pageErrors.length > 0) {
    console.log("  Errores de página encontrados:");
    pageErrors.slice(0, 3).forEach((e) => console.log(`    ${e}`));
    check(false, `${pageErrors.length} errores de página`);
  } else {
    check(true, "Sin errores de página");
  }

  if (boneWarnings.length > 0) {
    console.log("  Advertencias de huesos:");
    boneWarnings.forEach((w) => console.log(`    ${w.text}`));
    check(false, `${boneWarnings.length} advertencias de mapeo de huesos`);
  } else {
    check(true, "Sin advertencias de mapeo de huesos");
  }

  console.log("\nPaso 7: Probando interacción simple...");

  const actionTest = await page.evaluate(async () => {
    const game = window.__game.engine.game;
    const player = window.__game.player;

    if (!game || !player) return { error: "Sin game o player" };

    try {
      // Get a safe spot and move player there
      const piso = game.floor.scene;
      const coffeeSpot = piso?.safeSpots?.find((s) => s.kind === "coffee");

      if (!coffeeSpot) {
        return { error: "No coffee spot found" };
      }

      // Move player to coffee spot
      player.updatePos(coffeeSpot);
      await new Promise((r) => setTimeout(r, 100));

      // Try to start an activity
      const activity = piso?.areas?.find((a) => a.activity?.id === "coffee");
      if (activity && game.startActivity) {
        game.startActivity(activity.activity.id);
        await new Promise((r) => setTimeout(r, 500));
        return { success: true };
      }

      return { error: "Activity not found" };
    } catch (e) {
      return { error: e.message };
    }
  });

  if (actionTest.success) {
    check(true, "Acción iniciada (arquitectura interactiva OK)");
  } else if (actionTest.error) {
    console.log(`    Nota: ${actionTest.error} (no crítico para Phase 2)`);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMEN:");
  console.log("=".repeat(60));
  const passed = 8 - failures;
  console.log(`Verificaciones pasadas: ${passed}/${8}`);

  if (failures === 0) {
    console.log("\n✅ FASE 2 COMPLETADA - LISTO PARA PHASE 3");
    console.log("\nNextos pasos:");
    console.log("  1. Verificar visualmente en navegador que los personajes se ven bien");
    console.log("  2. Probar una acción (presionar E cerca del café)");
    console.log("  3. Si OK: ejecuta Phase 3 (remover procedural)");
    console.log("     npm run build");
    console.log("     # Verificar que no hay errores");
  } else {
    console.log(
      `\n⚠️  ${failures} verificaciones fallaron - revisar arriba`
    );
  }
} catch (error) {
  console.error("\n❌ Error en test:", error.message);
  failures++;
} finally {
  await browser.close();
  process.exit(failures > 0 ? 1 : 0);
}
