/**
 * LA RED, SIN SERVIDOR DE JUEGO.
 *
 * Dos transportes con la misma cara (`{ enviar(obj), alMensaje(fn), alCerrar(fn) }`):
 *
 * 1. **WebRTC con señalización a mano.** El anfitrión genera un ENLACE
 *    (la oferta, comprimida en el `#` de la URL) y lo manda por WhatsApp,
 *    Teams o lo que haya; quien lo abre genera un CÓDIGO DE RESPUESTA y se lo
 *    devuelve por el mismo sitio. Con eso el canal de datos va directo de
 *    aparato a aparato. En la MISMA WIFI no sale nada del edificio: los
 *    candidatos son de red local. El STUN público solo sirve para encontrarse
 *    si estáis en redes distintas, y si no hay internet se sigue sin él.
 *
 * 2. **BroadcastChannel**, para jugar con varias pestañas del mismo
 *    navegador. Es el modo de PROBAR sin dos aparatos, y el de las pruebas.
 *
 * ¿Bluetooth? Web Bluetooth solo deja a la página ser CENTRAL (conectarse a
 * un periférico), nunca anunciarse, así que dos navegadores no se pueden
 * ver entre sí por ahí. La wifi local —o el punto de acceso de un teléfono—
 * es lo que cubre ese caso.
 */

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];
const ESPERA_ICE = 3000;

/* ---------------- códigos: comprimir y empaquetar una SDP ---------------- */

const b64url = (bytes) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deB64url = (txt) => {
  const s = atob(txt.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
async function pasarPor(stream, bytes) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
export async function empaquetar(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return b64url(await pasarPor(new CompressionStream("deflate-raw"), bytes));
}
export async function desempaquetar(codigo) {
  // se acepta el enlace entero o solo el código
  const limpio = String(codigo).trim().replace(/^.*#(?:unir=)?/, "");
  const bytes = await pasarPor(new DecompressionStream("deflate-raw"), deB64url(limpio));
  return JSON.parse(new TextDecoder().decode(bytes));
}

const esperarIce = (pc) => new Promise((ok) => {
  if (pc.iceGatheringState === "complete") return ok();
  const t = setTimeout(ok, ESPERA_ICE);
  pc.addEventListener("icegatheringstatechange", () => {
    if (pc.iceGatheringState === "complete") { clearTimeout(t); ok(); }
  });
});

function envolverCanal(dc, pc) {
  const oyentes = new Set(), cierres = new Set();
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    for (const f of cierres) f();
  };
  dc.addEventListener("message", (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    for (const f of oyentes) f(m);
  });
  dc.addEventListener("close", cerrar);
  pc.addEventListener("connectionstatechange", () => {
    if (["failed", "closed", "disconnected"].includes(pc.connectionState)) cerrar();
  });
  return {
    tipo: "webrtc",
    enviar: (obj) => { if (dc.readyState === "open") dc.send(JSON.stringify(obj)); },
    alMensaje: (f) => oyentes.add(f),
    alCerrar: (f) => cierres.add(f),
    cerrar: () => { try { pc.close(); } catch { /* ya estaba */ } cerrar(); },
  };
}

/**
 * ANFITRIÓN · una invitación = una conexión. Devuelve el código de la oferta
 * y una función para pegar la respuesta. `conectada` se resuelve con el
 * transporte en cuanto el canal abre.
 */
export async function crearInvitacion() {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const dc = pc.createDataChannel("juego", { ordered: true });
  await pc.setLocalDescription(await pc.createOffer());
  await esperarIce(pc);
  const codigo = await empaquetar({ t: pc.localDescription.type, sdp: pc.localDescription.sdp });
  const conectada = new Promise((ok) => dc.addEventListener("open", () => ok(envolverCanal(dc, pc)), { once: true }));
  return {
    codigo,
    conectada,
    aceptar: async (respuesta) => {
      const r = await desempaquetar(respuesta);
      if (r.t !== "answer") throw new Error("Eso no es un código de respuesta.");
      await pc.setRemoteDescription({ type: "answer", sdp: r.sdp });
    },
    cancelar: () => pc.close(),
  };
}

/** INVITADO · con el código (o el enlace) de la oferta, genera la respuesta. */
export async function responderInvitacion(codigoOferta) {
  const o = await desempaquetar(codigoOferta);
  if (o.t !== "offer") throw new Error("Eso no es un enlace de invitación.");
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const conectada = new Promise((ok) => {
    pc.addEventListener("datachannel", (e) => {
      const dc = e.channel;
      if (dc.readyState === "open") ok(envolverCanal(dc, pc));
      else dc.addEventListener("open", () => ok(envolverCanal(dc, pc)), { once: true });
    });
  });
  await pc.setRemoteDescription({ type: "offer", sdp: o.sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await esperarIce(pc);
  const codigo = await empaquetar({ t: pc.localDescription.type, sdp: pc.localDescription.sdp });
  return { codigo, conectada };
}

/* ---------------- pestañas del mismo navegador ---------------- */

const idAzar = () => Math.random().toString(36).slice(2, 10);

/** ANFITRIÓN · escucha pestañas que pidan entrar a `sala`. */
export function abrirSalaPestanas(sala, alConectar) {
  const bc = new BroadcastChannel(`impostor:${sala}`);
  const conexiones = new Map();
  bc.addEventListener("message", (e) => {
    const { de, a, m } = e.data ?? {};
    if (a !== "anfitrion" || !de) return;
    let c = conexiones.get(de);
    if (!c) {
      if (m?.t !== "hola") return;
      const oyentes = new Set(), cierres = new Set();
      c = {
        tipo: "pestana",
        oyentes, cierres,
        enviar: (obj) => bc.postMessage({ de: "anfitrion", a: de, m: obj }),
        alMensaje: (f) => oyentes.add(f),
        alCerrar: (f) => cierres.add(f),
        cerrar: () => { conexiones.delete(de); for (const f of cierres) f(); },
      };
      conexiones.set(de, c);
      alConectar(c);
    }
    if (m?.t === "adios") { c.cerrar(); return; }
    for (const f of c.oyentes) f(m);
  });
  return { cerrar: () => bc.close() };
}

/** INVITADO · entra por pestaña a la sala (si nadie contesta, no pasa nada). */
export function unirsePestana(sala) {
  const bc = new BroadcastChannel(`impostor:${sala}`);
  const yo = idAzar();
  const oyentes = new Set(), cierres = new Set();
  bc.addEventListener("message", (e) => {
    const { a, m } = e.data ?? {};
    if (a !== yo) return;
    for (const f of oyentes) f(m);
  });
  const enviar = (obj) => bc.postMessage({ de: yo, a: "anfitrion", m: obj });
  addEventListener("beforeunload", () => enviar({ t: "adios" }));
  return {
    tipo: "pestana",
    enviar,
    alMensaje: (f) => oyentes.add(f),
    alCerrar: (f) => cierres.add(f),
    cerrar: () => { enviar({ t: "adios" }); bc.close(); for (const f of cierres) f(); },
  };
}
