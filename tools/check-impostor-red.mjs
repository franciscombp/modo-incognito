// EL SPIN-OFF SE JUEGA EN RED, con los DOS transportes y sin servidor.
//
// `check:impostor` ya juega la partida entre bots en node; esto mira lo que
// allí no existe: que tres navegadores se encuentren y jueguen la MISMA.
//   - Ana abre sala (anfitriona).
//   - Beto entra desde OTRA PESTAÑA (BroadcastChannel, mismo navegador).
//   - Cris entra por WebRTC desde OTRO CONTEXTO, con el ritual de verdad:
//     enlace de Ana → código de respuesta de Cris → Ana lo pega.
// Luego se empieza, Beto anda (y Ana lo ve moverse en el piso del anfitrión),
// Beto toca la campana, la junta le llega a Cris y lo que Cris escribe le
// llega a la junta de Ana. Son clics y teclas de verdad, no llamadas a mano.
//
// Uso: npm run check:impostor-red   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";

const url = (process.argv[2] ?? "http://localhost:4173/") + "impostor/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  // En un contenedor no hay mDNS que resuelva los candidatos `.local`;
  // en una wifi de verdad sí. Esto solo enseña la IP local al par.
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
});
const fallos = [];
const errores = [];
const ojo = (p, quien) => p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
const nombre = async (p, n) => p.fill('input[placeholder="Tu nombre en el piso"]', n);

try {
  const ctxA = await b.newContext();
  const ana = await ctxA.newPage(); ojo(ana, "Ana");
  await ana.goto(url);
  // el 3D (piso + reparto) tarda en montarse, más con GL por software
  await ana.waitForSelector("text=Crear sala", { timeout: 60000 });
  await nombre(ana, "Ana");
  await ana.click("text=Crear sala");
  const sala = await ana.evaluate(() => window.__soplon.host.sala);

  // --- Beto: pestaña del mismo navegador ---
  const beto = await ctxA.newPage(); ojo(beto, "Beto");
  await beto.goto(url);
  await beto.waitForSelector("text=Crear sala", { timeout: 60000 });
  await nombre(beto, "Beto");
  beto.once("dialog", (d) => d.accept(sala));
  await beto.click("text=Unirme desde otra pestaña");
  await ana.waitForFunction(() => window.__soplon.host.invitados.size === 1, null, { timeout: 5000 });

  // --- Cris: WebRTC con enlace + código ---
  await ana.click("text=Nueva invitación");
  await ana.waitForSelector(".invitacion textarea[readonly]", { timeout: 10000 });
  const enlace = await ana.inputValue(".invitacion textarea[readonly]");
  if (!enlace.includes("#unir=")) fallos.push(`el enlace no lleva la oferta: ${enlace.slice(0, 80)}`);
  console.log(`enlace de invitación: ${enlace.length} caracteres`);
  const ctxC = await b.newContext();
  const cris = await ctxC.newPage(); ojo(cris, "Cris");
  await cris.goto(enlace);
  await cris.waitForSelector("button:has-text('Unirme')", { timeout: 60000 });
  await nombre(cris, "Cris");
  await cris.click("button:has-text('Unirme')");
  await cris.waitForSelector("textarea[readonly]", { timeout: 10000 });
  const respuesta = await cris.inputValue("textarea[readonly]");
  console.log(`código de respuesta: ${respuesta.length} caracteres`);
  await ana.fill('.invitacion textarea[placeholder^="Pega"]', respuesta);
  await ana.click(".invitacion button:has-text('Conectar')");
  await ana.waitForFunction(() => window.__soplon.host.invitados.size === 2, null, { timeout: 15000 });
  await cris.waitForFunction(() => document.body.textContent.includes("En la sala"), null, { timeout: 30000 });

  const sala0 = await ana.evaluate(() => [...window.__soplon.host.invitados.values()].map((i) => i.nombre).sort());
  if (sala0.join() !== "Beto,Cris") fallos.push(`la sala de Ana tiene ${sala0}`);

  // --- a jugar ---
  await ana.click("button:has-text('Empezar')");
  for (const [p, n] of [[beto, "Beto"], [cris, "Cris"]]) {
    await p.waitForFunction(() => window.__soplon.app.vista?.fase === "juego", null, { timeout: 30000 })
      .catch(() => fallos.push(`${n} no recibe la partida`));
  }
  const idBeto = await beto.evaluate(() => window.__soplon.app.miId);
  const antes = await ana.evaluate((id) => { const j = window.__soplon.host.sim.porId(id); return { x: j.x, z: j.z }; }, idBeto);
  await beto.waitForTimeout(3500); // que se vaya el cartel del rol
  await beto.keyboard.down("KeyA");
  await beto.waitForTimeout(900);
  await beto.keyboard.up("KeyA");
  const despues = await ana.evaluate((id) => { const j = window.__soplon.host.sim.porId(id); return { x: j.x, z: j.z }; }, idBeto);
  const movido = Math.hypot(despues.x - antes.x, despues.z - antes.z);
  console.log(`Beto anduvo ${movido.toFixed(2)} u en el piso del anfitrión`);
  if (movido < 1) fallos.push(`las teclas de Beto no mueven su muñeco en el anfitrión (${movido.toFixed(2)} u)`);

  // vuelve a la campana y la toca con E
  await beto.keyboard.down("KeyD");
  await beto.waitForTimeout(900);
  await beto.keyboard.up("KeyD");
  await beto.waitForFunction(() => window.__soplon.app.vista?.yo?.puedeCampana, null, { timeout: 3000 })
    .catch(() => fallos.push("Beto no llega a la campana tras volver"));
  await beto.keyboard.press("KeyE");
  await cris.waitForSelector("#junta:not([hidden])", { timeout: 5000 })
    .catch(() => fallos.push("la junta no le llega a Cris"));

  await cris.fill("#junta-texto", "Yo digo que fue Beto");
  await cris.press("#junta-texto", "Enter");
  await ana.waitForFunction(() => window.__soplon.host.sim.estado.junta?.chat.some((m) => m.texto.includes("fue Beto")), null, { timeout: 5000 })
    .catch(() => fallos.push("lo que escribe Cris no llega a la junta"));
  await cris.click("#btn-saltar");
  await ana.waitForFunction(() => window.__soplon.host.sim.estado.junta?.votos?.[[...window.__soplon.host.invitados].find(([, i]) => i.nombre === "Cris")[0]] === "nadie", null, { timeout: 5000 })
    .catch(() => fallos.push("el voto de Cris no llega"));
  await ana.screenshot({ path: "test-results/impostor-junta.png" }).catch(() => {});

  // --- los bots, CON LOS MUEBLES ---
  // En node la partida corre sobre el suelo pelado; aquí el mapa trae la
  // física del 3D (navmesh + colisiones de buildOffice). Se juegan partidas
  // enteras a toda velocidad con ese mapa: si un bot se encaja contra una
  // mesa, la partida no acaba y canta.
  const r = await ana.evaluate(() => {
    const { app, modulos: { crearPartida, crearBot, rngDe } } = window.__soplon;
    const out = [];
    for (let p = 0; p < 10; p++) {
      const sim = crearPartida({
        mapa: app.mapa,
        semilla: 500 + p,
        jugadores: ["giuli", "fran", "manu", "crispo", "washo", "parce", "kiara"].slice(0, 5 + (p % 3))
          .map((c, i) => ({ id: `b${i}`, nombre: c, cara: c, bot: true })),
      });
      const rng = rngDe(9 + p);
      const bots = sim.estado.jugadores.map((j) => crearBot(sim, j.id, rng));
      let i = 0;
      for (; i < 15 * 60 * 20 && sim.estado.fase !== "fin"; i++) {
        for (const b of bots) b.pensar(0.05);
        sim.paso(0.05);
      }
      out.push({ fin: sim.estado.fin?.gana ?? null, s: Math.round(sim.estado.t), progreso: sim.progresoGlobal() });
    }
    return out;
  });
  console.log("partidas de bots con muebles:", JSON.stringify(r));
  for (const [i, x] of r.entries()) if (!x.fin) fallos.push(`con muebles, la partida ${i} no acaba (progreso ${(x.progreso * 100) | 0}%): algún bot se encaja`);
} catch (e) {
  fallos.push(`se cortó: ${e.message}`);
} finally {
  await b.close();
}

if (errores.length) fallos.push(...errores.map((e) => `error de página — ${e}`));
if (fallos.length) {
  console.error("FALLA:\n - " + fallos.join("\n - "));
  process.exit(1);
}
console.log("OK · tres navegadores, dos transportes, una partida.");
