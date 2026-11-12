// LOS CHOCONES SE JUEGAN EN RED, con los DOS transportes y sin servidor.
//
// `check:chocones` ya juega partidas de bots en node; esto mira lo que allí
// no existe: que tres navegadores se encuentren y conduzcan en la MISMA pista.
//   - Ana abre sala (anfitriona).
//   - Beto entra desde OTRA PESTAÑA (BroadcastChannel, mismo navegador).
//   - Cris entra por WebRTC desde OTRO CONTEXTO, con el ritual de verdad:
//     enlace de Ana → código de respuesta de Cris → Ana lo pega.
// Luego se arranca: Beto conduce con TECLAS de verdad y el carro se mueve en
// la partida del anfitrión; Cris pulsa el turbo y el anfitrión lo registra;
// los dos invitados ven el podio y la revancha.
//
// Uso: npm run check:chocones-red   (necesita `npm run preview` en :4173)
import { chromium } from "playwright";

const url = (process.argv[2] ?? "http://localhost:4173/") + "chocones/";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  // En un contenedor no hay mDNS que resuelva los candidatos `.local`.
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
});
let fallos = 0;
const errores = [];
const check = (ok, label, detalle = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalle ? ` — ${detalle}` : ""}`);
  if (!ok) fallos++;
};
const ojo = (p, quien) => p.on("pageerror", (e) => errores.push(`${quien}: ${e.message}`));
const nombre = (p, n) => p.fill('input[placeholder="Tu nombre en la pista"]', n);
const espera = (p, fn, arg, ms = 30000) => p.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

try {
  const ctxA = await b.newContext();
  const ana = await ctxA.newPage(); ojo(ana, "Ana");
  await ana.goto(url);
  await ana.waitForSelector("text=Crear sala", { timeout: 90000 });
  await nombre(ana, "Ana");
  await ana.click("text=Crear sala");
  const sala = await ana.evaluate(() => window.__chocones.host.sala);

  // --- Beto: pestaña del mismo navegador ---
  const beto = await ctxA.newPage(); ojo(beto, "Beto");
  await beto.goto(url);
  await beto.waitForSelector("text=Crear sala", { timeout: 90000 });
  await nombre(beto, "Beto");
  beto.once("dialog", (d) => d.accept(sala));
  await beto.click("text=Unirme desde otra pestaña");
  check(await espera(ana, () => window.__chocones.host.invitados.size === 1, null, 8000), "Beto entra por pestaña");

  // --- Cris: WebRTC con enlace + código ---
  await ana.click("text=Nueva invitación");
  await ana.waitForSelector(".invitacion textarea[readonly]", { timeout: 15000 });
  const enlace = await ana.inputValue(".invitacion textarea[readonly]");
  check(enlace.includes("#unir="), "el enlace de invitación lleva la oferta", `${enlace.length} caracteres`);
  const ctxC = await b.newContext();
  const cris = await ctxC.newPage(); ojo(cris, "Cris");
  await cris.goto(enlace);
  await cris.waitForSelector("button:has-text('Unirme')", { timeout: 90000 });
  await nombre(cris, "Cris");
  await cris.click("button:has-text('Unirme')");
  await cris.waitForSelector("textarea[readonly]", { timeout: 15000 });
  const respuesta = await cris.inputValue("textarea[readonly]");
  await ana.fill('.invitacion textarea[placeholder^="Pega"]', respuesta);
  await ana.click(".invitacion button:has-text('Conectar')");
  check(await espera(ana, () => window.__chocones.host.invitados.size === 2, null, 20000), "Cris entra por WebRTC (enlace + código)");
  check(await espera(cris, () => document.body.textContent.includes("Esperando a que el anfitrión"), null, 30000), "y Cris ve la sala");

  const nombres = await ana.evaluate(() => [...window.__chocones.host.invitados.values()].map((i) => i.nombre).sort().join());
  check(nombres === "Beto,Cris", "la sala de Ana tiene a los dos", nombres);

  // --- a la pista ---
  await ana.click("button:has-text('¡A la pista!')");
  for (const [p, n] of [[beto, "Beto"], [cris, "Cris"]]) {
    check(await espera(p, () => !!window.__chocones.app.vista, null, 30000), `${n} recibe la partida`);
  }
  const ids = await ana.evaluate(() => {
    const inv = [...window.__chocones.host.invitados.entries()];
    return Object.fromEntries(inv.map(([id, i]) => [i.nombre, id]));
  });
  // esperar al «¡YA!» en la pantalla de Beto
  check(await espera(beto, () => window.__chocones.app.vista?.fase === "ronda", null, 15000), "la cuenta atrás termina y empieza la ronda");

  // Beto conduce: tecla de verdad, y se mide EN EL ANFITRIÓN
  const antes = await ana.evaluate((id) => ({ ...window.__chocones.host.sim.porId(id) }), ids.Beto);
  await beto.bringToFront();
  // 1,5 s y no menos: con tres navegadores pintando 3D por software la
  // máquina de pruebas va muy cargada y los mensajes llegan a trompicones
  await beto.keyboard.down("KeyD");
  await beto.waitForTimeout(1500);
  await beto.keyboard.up("KeyD");
  const despues = await ana.evaluate((id) => ({ ...window.__chocones.host.sim.porId(id) }), ids.Beto);
  const movido = Math.hypot(despues.x - antes.x, despues.z - antes.z);
  check(movido > 1.5 || !despues.vivo, "las teclas de Beto mueven SU carro en la partida del anfitrión", `${movido.toFixed(2)} m`);

  // Cris: turbo con el teclado, en una ronda EN JUEGO y con su carro vivo
  // (fuera de la ronda el invitado no manda mando, y una ronda puede haber
  // terminado mientras la máquina de pruebas iba cargada)
  await espera(ana, (id) => { const sim = window.__chocones.host.sim; return sim.fase === "ronda" && sim.porId(id).vivo; }, ids.Cris, 40000);
  await cris.bringToFront();
  await cris.keyboard.down("KeyW");
  await cris.waitForTimeout(300);
  // un TOQUE corto, el caso difícil: tiene que llegar aunque caiga entre
  // dos envíos del mando. Se vigila en la partida (el turbo se recarga), no
  // en la lista de eventos, que es corta y la llenan los bots.
  await ana.evaluate((id) => {
    window.__turbo = false;
    const sim = window.__chocones.host.sim;
    const t = setInterval(() => { if (sim.porId(id)?.turboEspera > 0) { window.__turbo = true; clearInterval(t); } }, 20);
  }, ids.Cris);
  await cris.keyboard.press("Space");
  await cris.keyboard.up("KeyW");
  await espera(ana, () => window.__turbo, null, 3000);
  const turbo = await ana.evaluate(() => window.__turbo);
  const crisVivo = await ana.evaluate((id) => window.__chocones.host.sim.porId(id).vivo, ids.Cris);
  check(turbo || !crisVivo, "el turbo de Cris llega al anfitrión");

  // lo que ve Cris es la partida del anfitrión: se comparan vistas DEL MISMO
  // TIC (el reloj de la partida viaja en cada una), así la medida no depende
  // de lo rápido que conteste cada pestaña. Cris guarda las que le llegan.
  // y en Cris, lo que LE LLEGA por la red (un oyente más del canal: no
  // depende de cuántos cuadros consiga dibujar el navegador de pruebas)
  await cris.evaluate(() => {
    window.__vistas = new Map();
    window.__chocones.cliente.con.alMensaje((m) => { if (m.t === "vista") window.__vistas.set(m.v.reloj, m.v); });
  });
  // En el anfitrión se graba lo que SE LE MANDA a Cris (la partida real en
  // ese tic): la pestaña de Ana va en segundo plano y su dibujado está
  // frenado, pero su reloj de partida no (va en un Worker).
  await ana.evaluate((id) => {
    window.__vistas = new Map();
    const con = window.__chocones.host.invitados.get(id).con;
    const enviar = con.enviar;
    con.enviar = (m) => { if (m.t === "vista") window.__vistas.set(m.v.reloj, m.v); return enviar(m); };
  }, ids.Cris);
  await cris.waitForTimeout(1500);
  const deCris = await cris.evaluate(() => [...window.__vistas.values()].slice(-40).map((v) => ({ reloj: v.reloj, js: v.jugadores.map((j) => [j.id, j.x, j.z]) })));
  const deAna = await ana.evaluate(() => Object.fromEntries([...window.__vistas.values()].map((v) => [v.reloj, v.jugadores.map((j) => [j.id, j.x, j.z])])));
  let comunes = 0, maxDif = 0;
  for (const v of deCris) {
    const r = deAna[v.reloj];
    if (!r) continue;
    comunes++;
    for (const [id, x, z] of v.js) {
      const o = r.find((q) => q[0] === id);
      maxDif = Math.max(maxDif, o ? Math.hypot(o[1] - x, o[2] - z) : 99);
    }
  }
  // Dos tics idénticos bastan para probar que llega LA MISMA partida; cuántos
  // coinciden depende de la CPU (tres navegadores con 3D por software).
  check(comunes >= 2 && maxDif < 0.01, "Cris ve EXACTAMENTE la partida del anfitrión, tic a tic", `${comunes} tics comparados · ${maxDif.toFixed(3)} m de diferencia`);

  // --- al podio, a cámara rápida en el anfitrión ---
  await ana.evaluate(() => {
    const h = window.__chocones.host;
    for (let i = 0; i < 20 * 600 && !h.sim.terminada; i++) { for (const bot of h.bots) bot.pensar(0.05); h.sim.paso(0.05); }
  });
  for (const [p, n] of [[ana, "Ana"], [beto, "Beto"], [cris, "Cris"]]) {
    check(await espera(p, () => !document.querySelector("#podio").hidden, null, 15000), `${n} ve el podio`);
  }
  const partidaAntes = await cris.evaluate(() => window.__chocones.app.partida);
  await ana.bringToFront();
  await ana.click("#podio button:has-text('Otra partida')");
  check(await espera(cris, (p0) => window.__chocones.app.partida !== p0 && window.__chocones.app.vista?.fase === "intro", partidaAntes, 15000), "la revancha le llega a Cris");
  check(await espera(beto, () => window.__chocones.app.vista?.fase === "intro" && document.querySelector("#podio").hidden, null, 15000), "y a Beto, sin el podio de la anterior");

  // --- si Cris se va, un bot sigue con su carro ---
  await ctxC.close();
  check(await espera(ana, (id) => window.__chocones.host.bots.some((bot) => bot.id === id), ids.Cris, 20000), "si alguien se desconecta, un bot sigue con su carro");
} catch (e) {
  console.error(e);
  fallos++;
} finally {
  check(errores.length === 0, "sin errores de página", errores.slice(0, 3).join(" | "));
  await b.close();
}
console.log(fallos ? `\n${fallos} comprobación(es) fallan` : "\nTres navegadores, dos transportes, una sola pista");
process.exit(fallos ? 1 : 0);
