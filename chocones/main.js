/**
 * LOS CHOCONES · interfaz, sala y red.
 *
 * Mismo montaje que El Soplón (`impostor/main.js`), y a propósito: el
 * ANFITRIÓN es el servidor. Su navegador corre la partida (`sim.js`) y los
 * bots (`bots.js`) a paso fijo y le manda a cada invitado su vista; los
 * invitados solo mandan su mando. La red es la misma (`impostor/net.js`):
 * WebRTC con la invitación en el enlace, o pestañas del mismo navegador.
 */
import { crearPartida, rngDe, MAX_JUGADORES } from "./sim.js";
import { crearBot } from "./bots.js";
import * as red from "../impostor/net.js";
import { CARAS, nombreDeCara, esCara } from "../impostor/reparto.js";

const VERSION = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const HZ = 20;
const CANAL = "chocones";

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...hijos) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const h of hijos) n.append(h);
  return n;
};
const guardado = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(`chocones:${k}`);
    localStorage.setItem(`chocones:${k}`, v);
  } catch { /* modo privado */ }
  return null;
};
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

/** Lo que dice Gabo, que organiza esto y no se sube a ningún carro. */
const GABO = {
  intro: [
    "Gabo: «Esto es team building. Cuenta para la evaluación.»",
    "Gabo: «Aquí somos una familia. Una familia que se choca.»",
    "Gabo: «El último en pie presenta el lunes a las ocho.»",
    "Gabo: «Sin rencores. Los apunto, pero sin rencores.»",
    "Gabo: «Vamo a calmarno. Bueno, no. ¡A chocar!»",
  ],
  estrella: [
    "Gabo: «Eso es actitud. Lo pongo en tu hoja de vida.»",
    "Gabo: «Así se empuja una agenda.»",
    "Gabo: «Liderazgo. Del que no se puede medir, pero yo lo mido.»",
    "Gabo: «Me encanta. Que no se repita.»",
  ],
  podio: [
    "Gabo: «Felicidades. El premio es más responsabilidad.»",
    "Gabo: «Ganó la mejor. El resto: plan de nivelación.»",
    "Gabo: «Foto para LinkedIn y todos a sus puestos.»",
  ],
};

const app = {
  papel: null, // "anfitrion" | "invitado"
  nombre: guardado("nombre") || "",
  cara: esCara(guardado("cara")) ? guardado("cara") : "giuli",
  miId: null,
  vista: null,
  partida: 0,
  enJuego: false,
};

/* =============================== ANFITRIÓN =============================== */

const host = {
  invitados: new Map(), // id → { con, nombre, cara }
  nBots: 3,
  sim: null,
  bots: [],
  rng: rngDe(Date.now()),
  sala: Math.random().toString(36).slice(2, 7),
  pestanas: null,
  reloj: null,
  siguienteId: 1,
};

function listaSala() {
  const humanos = [
    { id: "h", nombre: app.nombre, cara: app.cara },
    ...[...host.invitados].map(([id, i]) => ({ id, nombre: i.nombre, cara: i.cara })),
  ];
  const usadas = new Set(humanos.map((h) => h.cara));
  const nombres = new Set(humanos.map((h) => h.nombre.toLowerCase()));
  const bots = [];
  const hueco = Math.max(0, MAX_JUGADORES - humanos.length);
  for (const [cara, nombre] of CARAS) {
    if (bots.length >= Math.min(host.nBots, hueco)) break;
    if (usadas.has(cara) || nombres.has(nombre.toLowerCase())) continue;
    bots.push({ id: `bot${bots.length}`, nombre, cara, bot: true });
  }
  return [...humanos, ...bots].slice(0, MAX_JUGADORES);
}

function difundir(msg) {
  for (const { con } of host.invitados.values()) con.enviar(msg);
}

function difundirSala() {
  difundir({ t: "sala", jugadores: listaSala(), enJuego: !!host.sim });
  if (!host.sim) pintarSalaAnfitrion();
}

function recibirInvitado(con) {
  const id = `p${host.siguienteId++}`;
  host.invitados.set(id, { con, nombre: "…", cara: "giuli" });
  con.alMensaje((m) => {
    const inv = host.invitados.get(id);
    if (!inv) return;
    if (m.t === "hola") {
      inv.nombre = String(m.nombre || "Invitado").slice(0, 16);
      inv.cara = esCara(m.cara) ? m.cara : "giuli";
      con.enviar({ t: "bienvenida", id });
      difundirSala();
    } else if (host.sim && m.t === "in") host.sim.entrada(id, m);
  });
  con.alCerrar(() => {
    host.invitados.delete(id);
    // A media partida, un bot se queda con su carro: si no, se quedaría
    // quieto en la pista y la ronda dependería de que alguien lo eche.
    if (host.sim?.porId(id)) {
      host.bots.push(crearBot(host.sim, id, host.rng));
      avisar(`${host.sim.porId(id).nombre} se desconectó: lo sigue un bot.`);
    }
    difundirSala();
  });
}

function empezarPartida() {
  const jugadores = listaSala();
  host.sim = crearPartida({ jugadores, semilla: Date.now() & 0xffffffff });
  host.bots = jugadores.filter((j) => j.bot).map((j) => crearBot(host.sim, j.id, host.rng));
  app.miId = "h";
  app.partida++;
  difundir({ t: "empieza" });
  entrarEnJuego();
  // Mismo reloj que El Soplón: tics de un Worker (no se frenan con la
  // pestaña oculta) y paso FIJO recuperando lo que falte, con tope.
  const PASO = 1 / HZ;
  const MAX_RECUPERAR = 2;
  let antes = performance.now();
  let pendiente = 0;
  pararReloj(host.reloj);
  host.reloj = relojDeFondo(() => {
    const ahora = performance.now();
    pendiente = Math.min(MAX_RECUPERAR, pendiente + (ahora - antes) / 1000);
    antes = ahora;
    const sim = host.sim;
    if (!sim) return;
    sim.entrada("h", entradaLocal());
    while (pendiente >= PASO) {
      pendiente -= PASO;
      for (const b of host.bots) b.pensar(PASO);
      sim.paso(PASO);
    }
    app.vista = sim.vistaPara("h");
    for (const [id, { con }] of host.invitados) {
      if (sim.porId(id)) con.enviar({ t: "vista", p: app.partida, v: sim.vistaPara(id) });
    }
  }, 1000 / HZ);
}

function relojDeFondo(fn, ms) {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(() => postMessage(0), ${ms});`], { type: "text/javascript" }));
    const w = new Worker(url);
    w.onmessage = fn;
    return { worker: w, url };
  } catch {
    return { intervalo: setInterval(fn, ms) };
  }
}
function pararReloj(r) {
  if (!r) return;
  r.worker?.terminate();
  if (r.url) URL.revokeObjectURL(r.url);
  if (r.intervalo != null) clearInterval(r.intervalo);
}

function volverASala() {
  pararReloj(host.reloj);
  host.reloj = null;
  host.sim = null;
  host.bots = [];
  app.vista = null;
  salirDelJuego();
  difundir({ t: "sala", jugadores: listaSala(), enJuego: false });
  pintarSalaAnfitrion();
}

/* =============================== INVITADO =============================== */

const cliente = { con: null, reloj: null, sala: [] };

function conectarComoInvitado(con) {
  cliente.con = con;
  app.papel = "invitado";
  con.alMensaje((m) => {
    if (m.t === "bienvenida") app.miId = m.id;
    else if (m.t === "sala") {
      cliente.sala = m.jugadores;
      if (!m.enJuego && app.enJuego) { app.vista = null; salirDelJuego(); }
      if (!app.enJuego) pintarSalaInvitado(m.enJuego);
    } else if (m.t === "vista") {
      if (m.p !== app.partida) app.partida = m.p;
      app.vista = m.v;
      if (!app.enJuego) entrarEnJuego();
    }
  });
  con.alCerrar(() => {
    clearInterval(cliente.reloj);
    salirDelJuego();
    pantalla(el("div", { className: "menu" },
      el("h1", {}, "Se cortó"),
      el("p", {}, "Se perdió la conexión con el anfitrión."),
      el("button", { className: "primario", onclick: () => location.replace(location.pathname) }, "Volver al inicio"),
    ));
  });
  con.enviar({ t: "hola", nombre: app.nombre, cara: app.cara });
  clearInterval(cliente.reloj);
  cliente.reloj = setInterval(() => {
    if (app.vista?.fase === "ronda") con.enviar({ t: "in", ...entradaLocal() });
  }, 1000 / HZ);
  pintarSalaInvitado(false);
}

/* ================================ entrada ================================ */

const teclas = new Set();
const stick = { x: 0, y: 0 };
let turboPulsado = false;
// EL TURBO SE GUARDA HASTA QUE SALE. La partida lo cuenta en el FLANCO de
// pulsar, y el mando se manda 20 veces por segundo: un toque rápido que
// cayera entre dos envíos se perdía entero (pasaba en la prueba de red, y en
// un teléfono lento pasaría jugando). Pulsar lo deja pendiente; el siguiente
// envío lo lleva, y el de después ya va suelto para que haya flanco.
let turboPendiente = false;

addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (!e.repeat && ["Space", "ShiftLeft", "ShiftRight"].includes(e.code)) turboPendiente = true;
  teclas.add(e.code);
  if (app.enJuego && ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => teclas.delete(e.code));
addEventListener("blur", () => { teclas.clear(); turboPulsado = false; });

/** Mando en ejes de PANTALLA, pasado al suelo de la pista. */
function entradaLocal() {
  let derecha = stick.x, arriba = -stick.y;
  if (teclas.has("KeyA") || teclas.has("ArrowLeft")) derecha -= 1;
  if (teclas.has("KeyD") || teclas.has("ArrowRight")) derecha += 1;
  if (teclas.has("KeyW") || teclas.has("ArrowUp")) arriba += 1;
  if (teclas.has("KeyS") || teclas.has("ArrowDown")) arriba -= 1;
  const sostenido = turboPulsado || teclas.has("Space") || teclas.has("ShiftLeft") || teclas.has("ShiftRight");
  const turbo = turboPendiente || sostenido;
  turboPendiente = false;
  const { mx, mz } = esc ? esc.aSuelo(derecha, arriba) : { mx: derecha, mz: -arriba };
  return { mx, mz, turbo };
}

// palanca táctil (y de ratón): aparece donde pones el dedo
(() => {
  const zona = $("#stick"), base = zona.querySelector(".base"), pomo = zona.querySelector(".pomo");
  let origen = null, puntero = null;
  zona.addEventListener("pointerdown", (e) => {
    puntero = e.pointerId;
    try { zona.setPointerCapture(e.pointerId); } catch { /* mejora, no requisito */ }
    const r = zona.getBoundingClientRect();
    origen = { x: e.clientX - r.left, y: e.clientY - r.top };
    for (const n of [base, pomo]) { n.style.left = `${origen.x}px`; n.style.top = `${origen.y}px`; }
    zona.classList.add("activo");
  });
  zona.addEventListener("pointermove", (e) => {
    if (e.pointerId !== puntero || !origen) return;
    const r = zona.getBoundingClientRect();
    let dx = e.clientX - r.left - origen.x, dy = e.clientY - r.top - origen.y;
    const m = Math.hypot(dx, dy), max = 50;
    if (m > max) { dx = (dx / m) * max; dy = (dy / m) * max; }
    pomo.style.left = `${origen.x + dx}px`;
    pomo.style.top = `${origen.y + dy}px`;
    stick.x = dx / max;
    stick.y = dy / max;
  });
  const soltar = (e) => {
    if (e.pointerId !== puntero) return;
    puntero = null; origen = null; stick.x = 0; stick.y = 0;
    zona.classList.remove("activo");
  };
  zona.addEventListener("pointerup", soltar);
  zona.addEventListener("pointercancel", soltar);
})();

{
  const b = $("#btn-turbo");
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); turboPulsado = true; turboPendiente = true; });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { turboPulsado = false; });
}

/* ================================ pantallas ================================ */

function pantalla(contenido) {
  const p = $("#pantalla");
  p.replaceChildren(contenido);
  p.hidden = false;
}

function campoNombre() {
  const i = el("input", { value: app.nombre, maxLength: 16, placeholder: "Tu nombre en la pista" });
  i.addEventListener("input", () => { app.nombre = i.value.trim(); guardado("nombre", app.nombre); });
  return i;
}
function campoCara() {
  const sel = el("select", { className: "cara" });
  for (const [id, nombre] of CARAS) sel.append(el("option", { value: id, selected: id === app.cara }, nombre));
  sel.addEventListener("change", () => { app.cara = sel.value; guardado("cara", app.cara); });
  return sel;
}
const nombrePorDefecto = () => { if (!app.nombre) app.nombre = nombreDeCara(app.cara); };
const conNombre = (fn) => () => { nombrePorDefecto(); fn(); };

function pintarInicio() {
  const codigo = location.hash.match(/^#unir=(.+)$/)?.[1];
  if (codigo) return pintarUnirse(codigo);
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, "Modo Incógnito · spin-off"), "Los Chocones"),
    el("p", {}, "Gabo organizó un team building obligatorio: carritos chocones en el parqueadero. Echa a los demás de la pista a golpes. El último que queda dentro se lleva la estrella; quien junte tres, gana."),
    el("h2", {}, "Quién conduce"),
    el("div", { className: "fila" }, campoCara(), campoNombre()),
    el("h2", {}, "Jugar"),
    el("div", { className: "fila" },
      el("button", { className: "primario", onclick: conNombre(() => { abrirComoAnfitrion(); empezarPartida(); }) }, "Solo, contra bots"),
      el("button", { onclick: conNombre(() => { abrirComoAnfitrion(); pintarSalaAnfitrion(); }) }, "Crear sala"),
    ),
    el("div", { className: "fila" },
      el("button", { onclick: conNombre(() => pintarUnirse("")) }, "Tengo un enlace / código"),
      el("button", { onclick: conNombre(unirsePorPestana) }, "Unirme desde otra pestaña"),
    ),
    el("p", {}, "Mandos: WASD o flechas para conducir, espacio para el turbo. En el teléfono, palanca a la izquierda y botón de turbo a la derecha. Monedas: las de la pista y dos por cada carro que eches."),
    el("p", {}, "Sin servidor: el anfitrión hace de servidor y los demás se conectan directo a él (WebRTC). Los huecos los rellenan bots, hasta ocho carros."),
  ));
}

function abrirComoAnfitrion() {
  app.papel = "anfitrion";
  app.miId = "h";
  if (!host.pestanas) host.pestanas = red.abrirSalaPestanas(host.sala, recibirInvitado, CANAL);
}

function filaJugador(j, yo) {
  return el("li", {},
    el("span", { className: "punto", style: `background:${j.bot ? "var(--tinta-suave)" : "var(--acento)"}` }),
    j.nombre,
    el("span", { className: "etq" }, `${nombreDeCara(j.cara)} · ${j.id === yo ? "tú" : j.id === "h" ? "anfitrión" : j.bot ? "bot" : "invitado"}`),
  );
}

function pintarSalaAnfitrion() {
  if (app.enJuego) return;
  const jugadores = listaSala();
  const lista = el("ul", { className: "lista" }, ...jugadores.map((j) => filaJugador(j, "h")));
  const invitaciones = el("div", {});
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, `Sala ${host.sala}`), "La pista"),
    lista,
    el("div", { className: "fila" },
      el("button", { onclick: () => { host.nBots = Math.max(0, host.nBots - 1); difundirSala(); } }, "− bot"),
      el("span", {}, `${host.nBots} bots`),
      el("button", { onclick: () => { host.nBots = Math.min(MAX_JUGADORES - 1, host.nBots + 1); difundirSala(); } }, "+ bot"),
    ),
    el("h2", {}, "Invitar"),
    el("p", {}, "Cada invitación es para UNA persona: le mandas el enlace, te devuelve un código y lo pegas aquí. En la misma wifi el juego va directo entre aparatos."),
    el("div", { className: "fila" }, el("button", { onclick: () => nuevaInvitacion(invitaciones) }, "Nueva invitación")),
    invitaciones,
    el("p", {}, `Para probar en un solo ordenador: abre otra pestaña y pulsa «Unirme desde otra pestaña» (sala ${host.sala}).`),
    el("div", { className: "fila" },
      el("button", { className: "primario", disabled: jugadores.length < 2, onclick: empezarPartida }, "¡A la pista!"),
    ),
    jugadores.length < 2 ? el("p", { className: "error" }, "Hacen falta al menos 2 carros (suma un bot).") : "",
  ));
}

async function nuevaInvitacion(contenedor) {
  const caja = el("div", { className: "invitacion" }, el("span", { className: "estado" }, "Preparando invitación…"));
  contenedor.append(caja);
  try {
    const inv = await red.crearInvitacion();
    const enlace = `${location.origin}${location.pathname}#unir=${inv.codigo}`;
    const estado = el("span", { className: "estado" }, "Esperando su código…");
    const resp = el("textarea", { placeholder: "Pega aquí el código que te devuelva" });
    const enlaceTxt = el("textarea", { readOnly: true, value: enlace });
    const copiar = el("button", { onclick: async () => {
      try { await navigator.clipboard.writeText(enlace); copiar.textContent = "Copiado"; } catch { enlaceTxt.select(); }
    } }, "Copiar enlace");
    const compartir = navigator.share
      ? el("button", { onclick: () => navigator.share({ title: "Los Chocones", text: "Súbete a mi carrito", url: enlace }).catch(() => {}) }, "Compartir")
      : "";
    const conectar = el("button", { className: "primario", onclick: async () => {
      try { await inv.aceptar(resp.value); estado.textContent = "Conectando…"; } catch (e) { estado.textContent = e.message || "Código no válido"; }
    } }, "Conectar");
    caja.replaceChildren(estado, enlaceTxt, el("div", { className: "fila" }, copiar, compartir), resp, el("div", { className: "fila" }, conectar));
    inv.conectada.then((con) => {
      recibirInvitado(con);
      caja.replaceChildren(el("span", { className: "estado ok" }, "Conectado."));
    });
  } catch (e) {
    caja.replaceChildren(el("span", { className: "error" }, `No se pudo crear la invitación: ${e.message}`));
  }
}

async function pintarUnirse(codigo) {
  const enlace = el("textarea", { placeholder: "Pega el enlace o el código del anfitrión", value: codigo ? location.href : "" });
  const salida = el("div", {});
  const generar = el("button", { className: "primario", onclick: async () => {
    nombrePorDefecto();
    generar.disabled = true;
    salida.replaceChildren(el("span", { className: "estado" }, "Generando tu respuesta…"));
    try {
      const r = await red.responderInvitacion(enlace.value);
      const txt = el("textarea", { readOnly: true, value: r.codigo });
      const copiar = el("button", { className: "primario", onclick: async () => {
        try { await navigator.clipboard.writeText(r.codigo); copiar.textContent = "Copiado"; } catch { txt.select(); }
      } }, "Copiar código");
      salida.replaceChildren(
        el("p", {}, "Mándale este código al anfitrión (por el mismo chat). En cuanto lo pegue, entras."),
        txt, el("div", { className: "fila" }, copiar),
        el("span", { className: "estado" }, "Esperando al anfitrión…"),
      );
      r.conectada.then((con) => { history.replaceState(null, "", location.pathname); conectarComoInvitado(con); });
    } catch (e) {
      generar.disabled = false;
      salida.replaceChildren(el("p", { className: "error" }, e.message || "Ese enlace no vale."));
    }
  } }, "Unirme");
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, "Unirse a una pista"), "Te invitan"),
    el("h2", {}, "Quién conduce"), el("div", { className: "fila" }, campoCara(), campoNombre()),
    el("h2", {}, "Invitación"), enlace,
    el("div", { className: "fila" }, generar, el("button", { onclick: () => { history.replaceState(null, "", location.pathname); pintarInicio(); } }, "Atrás")),
    salida,
  ));
}

function unirsePorPestana() {
  const sala = prompt("Código de la sala (lo enseña el anfitrión en su pantalla):");
  if (!sala) return;
  conectarComoInvitado(red.unirsePestana(sala.trim(), CANAL));
}

function pintarSalaInvitado(enJuego) {
  if (app.enJuego) return;
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, "Dentro"), "En la pista"),
    el("ul", { className: "lista" }, ...cliente.sala.map((j) => filaJugador(j, app.miId))),
    el("p", {}, enJuego ? "Hay una partida en marcha: entras en la siguiente." : "Esperando a que el anfitrión arranque…"),
  ));
}

/* ================================ el juego ================================ */

function entrarEnJuego() {
  app.enJuego = true;
  hud.firmaGrande = "";
  hud.ultimoEvento = 0;
  $("#pantalla").hidden = true;
  $("#hud").hidden = false;
}
function salirDelJuego() {
  app.enJuego = false;
  $("#hud").hidden = true;
  $("#podio").hidden = true;
}

function avisar(texto) {
  const d = el("div", {}, texto);
  $("#avisos").append(d);
  setTimeout(() => d.remove(), 4000);
  while ($("#avisos").children.length > 5) $("#avisos").firstChild.remove();
}

const hud = { firmaGrande: "", firmaMarcador: "", firmaPodio: "", ultimoEvento: 0, cita: "" };

function grande(texto, sub = "", pop = true) {
  const firma = `${texto}|${sub}`;
  if (firma === hud.firmaGrande) return;
  hud.firmaGrande = firma;
  const t = $("#grande .texto");
  t.textContent = texto;
  t.classList.remove("pop");
  if (pop && texto) { void t.offsetWidth; t.classList.add("pop"); }
  $("#grande .sub").textContent = sub;
}

function pintarHud(v) {
  // marcador: solo se rehace cuando cambia algo que se lee
  const firma = v.jugadores.map((j) => `${j.id}${j.estrellas}${j.monedas}${j.vivo}`).join();
  if (firma !== hud.firmaMarcador) {
    hud.firmaMarcador = firma;
    const orden = [...v.jugadores].sort((a, b) => b.estrellas - a.estrellas || b.monedas - a.monedas);
    $("#marcador").replaceChildren(...orden.map((j) => el("div", { className: `ficha${j.vivo ? "" : " fuera"}${j.id === v.yo?.id ? " yo" : ""}` },
      el("span", { className: "punto", style: `background:${j.color}` }),
      j.nombre,
      el("span", { className: "estrellas" }, "★".repeat(j.estrellas) || "·"),
      el("span", { className: "monedas" }, el("span", { className: "moneda" }), String(j.monedas)),
    )));
  }

  // ronda y tiempo
  const enRonda = v.fase === "ronda";
  $("#ronda span").textContent = v.fase === "podio" ? "Resultado final" : `Ronda ${v.ronda}/${v.rondasMax} · primero a ${v.estrellasParaGanar} estrellas`;
  const barra = $("#ronda .barra");
  barra.querySelector("i").style.width = `${enRonda ? Math.max(0, 100 - (v.tRonda / v.tLimite) * 100) : 100}%`;
  barra.classList.toggle("encoge", enRonda && v.radio < v.radioInicial - 0.01);

  // turbo
  const b = $("#btn-turbo");
  const listo = !!v.yo?.turboListo && v.yo?.vivo;
  b.classList.toggle("listo", listo && enRonda);
  b.querySelector("i").style.height = `${v.yo ? (1 - Math.min(1, v.yo.turboEspera / v.yo.turboTotal)) * 100 : 0}%`;

  // el cartel grande
  const nombre = (id) => v.jugadores.find((j) => j.id === id)?.nombre ?? "";
  if (v.fase === "intro") {
    const n = Math.ceil(v.tIntro - v.t);
    if (v.t < 0.1 || !hud.cita) hud.cita = azar(GABO.intro);
    grande(n > 0 ? String(n) : "¡YA!", v.t < 1.6 ? `Ronda ${v.ronda} · ${hud.cita}` : "");
  } else if (v.fase === "ronda") {
    grande(v.t < 0.9 ? "¡YA!" : "", v.yo && !v.yo.vivo ? "Te echaron. Mira cómo se pelean los demás." : "", v.t < 0.1);
  } else if (v.fase === "finRonda") {
    if (v.t < 0.1 || !hud.citaEstrella) hud.citaEstrella = azar(GABO.estrella);
    const tu = v.ganadorRonda === v.yo?.id;
    grande(tu ? "¡TU ESTRELLA!" : `¡${nombre(v.ganadorRonda).toUpperCase()}!`, `Se lleva la estrella · ${hud.citaEstrella}`);
  } else {
    grande("", "", false);
  }

  // los KO, en la esquina
  for (const e of v.eventos) {
    if (e.n <= hud.ultimoEvento) continue;
    if (e.tipo === "ko") avisar(e.texto);
  }
  hud.ultimoEvento = Math.max(hud.ultimoEvento, ...v.eventos.map((e) => e.n), 0);

  // el podio: la lista ya dice el marcador, así que el HUD de ronda se aparta
  const podio = $("#podio");
  podio.hidden = v.fase !== "podio";
  $("#hud").classList.toggle("en-podio", v.fase === "podio");
  if (v.fase === "podio") {
    const firmaP = `${app.partida}|${v.podio.join()}`;
    if (firmaP !== hud.firmaPodio) {
      hud.firmaPodio = firmaP;
      const ganador = v.jugadores.find((j) => j.id === v.podio[0]);
      const botones = app.papel === "anfitrion"
        ? el("div", { className: "fila" },
            el("button", { className: "primario", onclick: () => { volverASala(); empezarPartida(); } }, "Otra partida"),
            el("button", { onclick: volverASala }, "A la sala"))
        : el("p", { className: "cita" }, "Esperando a que el anfitrión decida…");
      podio.replaceChildren(
        el("h2", {}, ganador.id === v.yo?.id ? "¡Ganaste el team building!" : `¡${ganador.nombre} gana!`),
        el("p", { className: "cita" }, azar(GABO.podio)),
        el("ol", {}, ...v.podio.map((id, i) => {
          const j = v.jugadores.find((x) => x.id === id);
          return el("li", {},
            el("span", { className: "pos" }, `${i + 1}º`),
            el("span", { className: "punto", style: `background:${j.color}` }),
            j.nombre + (j.id === v.yo?.id ? " (tú)" : ""),
            el("span", { className: "estrellas", style: "color:var(--estrella)" }, `★ ${j.estrellas}`),
            el("span", { className: "monedas", style: "color:var(--oro)" }, `${j.monedas} mon.`),
          );
        })),
        botones,
      );
    }
  }
}

let esc = null; // escena3d.js, cuando ha cargado

let antes = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - antes) / 1000);
  antes = ahora;
  const v = app.enJuego ? app.vista : null;
  esc?.pintar(v, dt);
  if (v) pintarHud(v);
  requestAnimationFrame(bucle);
}

/* ================================ arranque ================================ */

async function arrancar() {
  pantalla(el("div", { className: "menu" }, el("h1", {}, el("small", {}, "Modo Incógnito · spin-off"), "Los Chocones"), el("p", {}, "Inflando las gomas…")));
  try {
    const { crearEscena3D } = await import("./escena3d.js");
    esc = await crearEscena3D($("#mundo"), $("#etiquetas"));
  } catch (e) {
    console.error(e);
    pantalla(el("div", { className: "menu" }, el("h1", {}, "No carga la pista"), el("p", { className: "error" }, String(e.message || e))));
    return;
  }
  pintarInicio();
  requestAnimationFrame(bucle);
}

// para las pruebas (y para curiosear desde la consola)
window.__chocones = { app, host, cliente, VERSION };

arrancar();
