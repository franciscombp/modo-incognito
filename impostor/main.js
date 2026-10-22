/**
 * EL SOPLÓN · Among Us en el Piso 10 (spin-off de Modo Incógnito).
 *
 * Una página, dos papeles:
 *   - ANFITRIÓN: corre la partida (`sim.js`), los bots (`bots.js`) y reparte a
 *     cada invitado SU vista. Es el servidor, en un teléfono o un portátil.
 *   - INVITADO: manda hacia dónde anda y qué pulsa, y pinta lo que le llega.
 *
 * La red está en `net.js` (WebRTC directo con enlace + código, o pestañas
 * del mismo navegador). Jugar solo contra bots es ser anfitrión sin invitar
 * a nadie.
 */
import { crearMapa } from "./mapa.js";
import { crearPartida, rngDe } from "./sim.js";
import { crearBot } from "./bots.js";
import * as red from "./net.js";
import { CARAS, nombreDeCara, esCara } from "./reparto.js";

const VERSION = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const HZ = 20;

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, ...hijos) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const h of hijos) n.append(h);
  return n;
};
const guardado = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(`soplon:${k}`);
    localStorage.setItem(`soplon:${k}`, v);
  } catch { /* modo privado */ }
  return null;
};

const app = {
  mapa: null,
  papel: null,          // "anfitrion" | "invitado"
  nombre: guardado("nombre") || "",
  cara: esCara(guardado("cara")) ? guardado("cara") : "giuli",
  miId: null,
  vista: null,
  partida: 0,
  ultimoEvento: 0,
  enJuego: false,
};

/* =============================== ANFITRIÓN =============================== */

const host = {
  invitados: new Map(), // id → { con, nombre }
  nBots: 5,
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
  // los bots se llevan el reparto que nadie eligió, con su nombre
  const usadas = new Set(humanos.map((h) => h.cara));
  const nombres = new Set(humanos.map((h) => h.nombre.toLowerCase()));
  const bots = [];
  for (const [cara, nombre] of CARAS) {
    if (bots.length >= host.nBots) break;
    if (usadas.has(cara) || nombres.has(nombre.toLowerCase())) continue;
    bots.push({ id: `bot${bots.length}`, nombre, cara, bot: true });
  }
  return [...humanos, ...bots];
}

function difundir(msg) {
  for (const { con } of host.invitados.values()) con.enviar(msg);
}

function difundirSala() {
  const jugadores = listaSala();
  difundir({ t: "sala", jugadores, enJuego: !!host.sim });
  if (!host.sim) pintarSalaAnfitrion();
}

function recibirInvitado(con) {
  const id = `p${host.siguienteId++}`;
  host.invitados.set(id, { con, nombre: "…", cara: "generic" });
  con.alMensaje((m) => {
    const inv = host.invitados.get(id);
    if (!inv) return;
    if (m.t === "hola") {
      inv.nombre = String(m.nombre || "Invitado").slice(0, 16);
      inv.cara = esCara(m.cara) ? m.cara : "generic";
      con.enviar({ t: "bienvenida", id });
      difundirSala();
    } else if (host.sim && m.t === "in") host.sim.entrada(id, m);
    else if (host.sim && m.t === "accion") host.sim.accion(id, m.a);
    else if (host.sim && m.t === "chat") host.sim.decir(id, m.texto);
  });
  con.alCerrar(() => {
    host.invitados.delete(id);
    // A media partida, un bot se queda con su sitio: si no, su muñeco se
    // quedaría plantado y la partida no podría acabar nunca por tareas.
    if (host.sim?.porId(id)) {
      host.bots.push(crearBot(host.sim, id, host.rng));
      avisar(`${host.sim.porId(id).nombre} se desconectó: lo sigue un bot.`);
    }
    difundirSala();
  });
}

function empezarPartida() {
  const jugadores = listaSala();
  host.sim = crearPartida({ mapa: app.mapa, jugadores, semilla: Date.now() });
  host.bots = jugadores.filter((j) => j.bot).map((j) => crearBot(host.sim, j.id, host.rng));
  app.miId = "h";
  app.partida++;
  difundir({ t: "empieza" });
  entrarEnJuego();
  let antes = performance.now();
  clearInterval(host.reloj);
  // setInterval y no rAF: el anfitrión es el servidor y tiene que seguir
  // simulando aunque no esté pintando (el rAF se para con la pestaña oculta).
  host.reloj = setInterval(() => {
    const ahora = performance.now();
    const dt = Math.min(0.1, (ahora - antes) / 1000);
    antes = ahora;
    const sim = host.sim;
    if (!sim) return;
    sim.entrada("h", entradaLocal());
    for (const b of host.bots) b.pensar(dt);
    sim.paso(dt);
    app.vista = sim.vistaPara("h");
    for (const [id, { con }] of host.invitados) {
      if (sim.porId(id)) con.enviar({ t: "vista", p: app.partida, v: sim.vistaPara(id) });
    }
  }, 1000 / HZ);
}

function volverASala() {
  clearInterval(host.reloj);
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
      if (m.p !== app.partida) { app.partida = m.p; app.ultimoEvento = 0; }
      app.vista = m.v;
      if (!app.enJuego) entrarEnJuego();
    }
  });
  con.alCerrar(() => {
    clearInterval(cliente.reloj);
    app.enJuego = false;
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
    if (app.vista?.fase === "juego") con.enviar({ t: "in", ...entradaLocal() });
  }, 1000 / HZ);
  pintarSalaInvitado(false);
}

/* ============================ acciones locales ============================ */

function accion(a) {
  if (app.papel === "anfitrion") host.sim?.accion("h", a);
  else cliente.con?.enviar({ t: "accion", a });
}
function decir(texto) {
  if (app.papel === "anfitrion") host.sim?.decir("h", texto);
  else cliente.con?.enviar({ t: "chat", texto });
}

/* ================================ entrada ================================ */

const teclas = new Set();
const stick = { x: 0, z: 0 };
let usarPulsado = false;

addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  teclas.add(e.code);
  if (!app.enJuego) return;
  if (e.code === "KeyE" || e.code === "Space") { contextual(); e.preventDefault(); }
  if (e.code === "KeyQ") accion({ tipo: "matar" });
});
addEventListener("keyup", (e) => teclas.delete(e.code));
addEventListener("blur", () => { teclas.clear(); usarPulsado = false; });

/** E/espacio: reportar si hay gafete, campana si estás en ella, si no usar. */
function contextual() {
  const yo = app.vista?.yo;
  if (!yo) return;
  if (yo.puedeReportar) accion({ tipo: "reportar" });
  else if (yo.puedeCampana && !yo.puedeUsar) accion({ tipo: "campana" });
}

/** Entrada en ejes de PANTALLA, pasada al suelo del piso (que va girado). */
function entradaLocal() {
  let derecha = stick.x, arriba = -stick.z;
  if (teclas.has("KeyA") || teclas.has("ArrowLeft")) derecha -= 1;
  if (teclas.has("KeyD") || teclas.has("ArrowRight")) derecha += 1;
  if (teclas.has("KeyW") || teclas.has("ArrowUp")) arriba += 1;
  if (teclas.has("KeyS") || teclas.has("ArrowDown")) arriba -= 1;
  const usar = usarPulsado || teclas.has("KeyE") || teclas.has("Space");
  const { mx, mz } = esc ? esc.aSuelo(derecha, arriba) : { mx: derecha, mz: -arriba };
  return { mx, mz, usar };
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
    stick.x = dx / max; stick.z = dy / max;
  });
  const soltar = (e) => {
    if (e.pointerId !== puntero) return;
    puntero = null; origen = null; stick.x = 0; stick.z = 0;
    zona.classList.remove("activo");
  };
  zona.addEventListener("pointerup", soltar);
  zona.addEventListener("pointercancel", soltar);
})();

{
  const usar = $("#btn-usar");
  usar.addEventListener("pointerdown", (e) => { e.preventDefault(); usarPulsado = true; });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) usar.addEventListener(ev, () => { usarPulsado = false; });
  $("#btn-reportar").addEventListener("click", () => accion({ tipo: "reportar" }));
  $("#btn-campana").addEventListener("click", () => accion({ tipo: "campana" }));
  $("#btn-matar").addEventListener("click", () => accion({ tipo: "matar" }));
  $("#btn-saltar").addEventListener("click", () => accion({ tipo: "votar", objetivo: "nadie" }));
  $("#junta-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const i = $("#junta-texto");
    if (i.value.trim()) decir(i.value);
    i.value = "";
  });
}

/* ================================ pantallas ================================ */

function pantalla(contenido) {
  const p = $("#pantalla");
  p.replaceChildren(contenido);
  p.hidden = false;
}

function campoNombre() {
  const i = el("input", { value: app.nombre, maxLength: 16, placeholder: "Tu nombre en el piso" });
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
    el("h1", {}, el("small", {}, "Modo Incógnito · spin-off"), "El Soplón"),
    el("p", {}, "Alguien de la Célula le pasa todo a Gabo. Haz tus escaqueos, encuentra los gafetes tirados y descubre al soplón en la junta antes de que mande a toda la Célula a RRHH."),
    el("h2", {}, "Quién eres"),
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
    el("p", {}, "Sin servidor: el anfitrión hace de servidor y los demás se conectan directo a él por la wifi del piso (WebRTC). Los huecos los rellenan bots."),
  ));
}

function abrirComoAnfitrion() {
  app.papel = "anfitrion";
  app.miId = "h";
  if (!host.pestanas) host.pestanas = red.abrirSalaPestanas(host.sala, recibirInvitado);
}

function pintarSalaAnfitrion() {
  if (app.enJuego) return;
  const lista = el("ul", { className: "lista" });
  for (const j of listaSala()) {
    lista.append(el("li", {},
      el("span", { className: "punto", style: `background:${j.bot ? "var(--tinta-suave)" : "var(--acento)"}` }),
      j.nombre,
      el("span", { className: "etq" }, `${nombreDeCara(j.cara)} · ${j.id === "h" ? "anfitrión" : j.bot ? "bot" : "invitado"}`),
    ));
  }
  const nBots = el("span", {}, `${host.nBots} bots`);
  const invitaciones = el("div", {});
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, `Sala ${host.sala}`), "La sala"),
    lista,
    el("div", { className: "fila" },
      el("button", { onclick: () => { host.nBots = Math.max(0, host.nBots - 1); difundirSala(); } }, "− bot"),
      nBots,
      el("button", { onclick: () => { host.nBots = Math.min(9, host.nBots + 1); difundirSala(); } }, "+ bot"),
    ),
    el("h2", {}, "Invitar"),
    el("p", {}, "Cada invitación es para UNA persona: le mandas el enlace, ella te devuelve un código y lo pegas aquí. En la misma wifi el juego va directo entre aparatos."),
    el("div", { className: "fila" }, el("button", { onclick: () => nuevaInvitacion(invitaciones) }, "Nueva invitación")),
    invitaciones,
    el("p", {}, `Para probar en un solo ordenador: abre otra pestaña de esta página y pulsa «Unirme desde otra pestaña» (sala ${host.sala}).`),
    el("div", { className: "fila" },
      el("button", { className: "primario", disabled: listaSala().length < 4, onclick: empezarPartida }, "Empezar"),
    ),
    listaSala().length < 4 ? el("p", { className: "error" }, "Hacen falta al menos 4 en la mesa (suma bots).") : "",
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
    const copiar = el("button", { onclick: async () => {
      try { await navigator.clipboard.writeText(enlace); copiar.textContent = "Copiado"; } catch { enlaceTxt.select(); }
    } }, "Copiar enlace");
    const enlaceTxt = el("textarea", { readOnly: true, value: enlace });
    const compartir = navigator.share
      ? el("button", { onclick: () => navigator.share({ title: "El Soplón", text: "Únete a la partida", url: enlace }).catch(() => {}) }, "Compartir")
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
  const nombre = campoNombre();
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
    el("h1", {}, el("small", {}, "Unirse a una sala"), "Te invitan"),
    el("h2", {}, "Quién eres"), el("div", { className: "fila" }, campoCara(), nombre),
    el("h2", {}, "Invitación"), enlace,
    el("div", { className: "fila" }, generar, el("button", { onclick: () => { history.replaceState(null, "", location.pathname); pintarInicio(); } }, "Atrás")),
    salida,
  ));
}

function unirsePorPestana() {
  const sala = prompt("Código de la sala (lo enseña el anfitrión en su pantalla):");
  if (!sala) return;
  const con = red.unirsePestana(sala.trim());
  conectarComoInvitado(con);
}

function pintarSalaInvitado(enJuego) {
  if (app.enJuego) return;
  const lista = el("ul", { className: "lista" });
  for (const j of cliente.sala) {
    lista.append(el("li", {},
      el("span", { className: "punto", style: `background:${j.bot ? "var(--tinta-suave)" : "var(--acento)"}` }),
      j.nombre, el("span", { className: "etq" }, `${nombreDeCara(j.cara)}${j.id === app.miId ? " · tú" : j.bot ? " · bot" : ""}`),
    ));
  }
  pantalla(el("div", { className: "menu" },
    el("h1", {}, el("small", {}, "Dentro"), "En la sala"),
    lista,
    el("p", {}, enJuego ? "Hay una partida en marcha: entras en la siguiente." : "Esperando a que el anfitrión empiece…"),
  ));
}

/* ================================ el juego ================================ */

function entrarEnJuego() {
  app.enJuego = true;
  app.ultimoEvento = 0;
  $("#pantalla").hidden = true;
  $("#hud").hidden = false;
  mostrarRol = performance.now() + 3500;
}
function salirDelJuego() {
  app.enJuego = false;
  $("#hud").hidden = true;
  $("#junta").hidden = true;
  $("#cartel").hidden = true;
}

let mostrarRol = 0;

function avisar(texto) {
  const caja = $("#avisos");
  const n = el("div", {}, texto);
  caja.append(n);
  setTimeout(() => n.remove(), 4000);
  while (caja.children.length > 4) caja.firstChild.remove();
}

/* ---------------- HUD y capas ---------------- */

let firmaLista = "", firmaJunta = "", firmaCartel = "";

function pintarHud(v, dt) {
  const yo = v.yo;
  if (!yo) return;
  for (const e of v.eventos) {
    if (e.seq <= app.ultimoEvento) continue;
    app.ultimoEvento = e.seq;
    if (e.tipo !== "junta" && e.tipo !== "expulsion" && e.tipo !== "fin") avisar(e.texto);
  }

  const rol = $("#hud-rol");
  rol.textContent = (yo.rol === "soplon" ? "Soplón de Gabo" : "Célula") + (yo.vivo ? "" : " · fantasma");
  rol.className = yo.rol;
  const firma = JSON.stringify(yo.tareas.map((t) => [t.id, t.hecha]));
  if (firma !== firmaLista) {
    firmaLista = firma;
    $("#hud-lista").replaceChildren(...yo.tareas.map((t) => el("li", { className: t.hecha ? "hecha" : "" },
      (yo.rol === "soplon" ? "(finge) " : "") + (app.mapa.tareas.find((x) => x.id === t.id)?.label ?? t.id))));
  }
  $("#hud-progreso i").style.width = `${Math.round(v.progreso * 100)}%`;

  $("#btn-usar").hidden = yo.rol !== "celula";
  $("#btn-usar").disabled = !yo.puedeUsar;
  $("#btn-reportar").hidden = !yo.puedeReportar;
  $("#btn-campana").hidden = !yo.puedeCampana;
  const matar = $("#btn-matar");
  matar.hidden = yo.rol !== "soplon" || !yo.vivo;
  matar.disabled = !yo.puedeMatar;
  matar.querySelector("small").textContent = yo.matarEn > 0 ? `${Math.ceil(yo.matarEn)} s` : "";

  // junta
  const junta = $("#junta");
  junta.hidden = v.fase !== "junta";
  if (v.fase === "junta") pintarJunta(v);

  // carteles: rol al empezar, expulsión, fin
  let cartel = null;
  if (v.fase === "fin") {
    const gana = v.fin.gana;
    cartel = {
      clave: `fin${app.partida}`,
      grande: gana === "soplon" ? "Gana el soplón" : "Gana la Célula",
      clase: gana,
      texto: v.fin.motivo,
      extra: v.censo.filter((c) => c.rol === "soplon").map((c) => `${c.nombre} era el soplón.`).join(" "),
      boton: app.papel === "anfitrion" ? ["Otra partida", volverASala] : null,
    };
  } else if (v.fase === "expulsion" && v.expulsion) {
    const x = v.expulsion;
    cartel = {
      clave: `exp${app.partida}${x.hasta}`,
      grande: x.nombre ? `${x.nombre} se va a RRHH` : "Nadie se va a RRHH",
      clase: x.nombre ? (x.eraSoplon ? "celula" : "soplon") : "",
      texto: x.nombre ? (x.eraSoplon ? "Era el soplón." : "No era el soplón.") : "Ni modo. A seguir fingiendo.",
    };
  } else if (performance.now() < mostrarRol) {
    // reloj de pared y no `dt`: con pocos cuadros por segundo, `dt` se
    // recorta y el cartel se quedaba tapando el piso el doble de tiempo.
    cartel = {
      clave: `rol${app.partida}`,
      grande: yo.rol === "soplon" ? "Eres el soplón" : "Eres de la Célula",
      clase: yo.rol,
      texto: yo.rol === "soplon"
        ? "Manda a la Célula a RRHH (Q) cuando nadie mire. Finge tareas. Que no te pillen en la junta."
        : "Haz tus escaqueos (mantén E en cada estación). Si encuentras un gafete tirado, repórtalo.",
      extra: yo.rol === "soplon"
        ? v.censo.filter((c) => c.rol === "soplon" && c.id !== yo.id).map((c) => `Tu cómplice: ${c.nombre}.`).join(" ")
        : "",
    };
  }
  const capa = $("#cartel");
  capa.hidden = !cartel;
  if (cartel && cartel.clave !== firmaCartel) {
    firmaCartel = cartel.clave;
    capa.firstElementChild.replaceChildren(
      el("div", { className: `grande ${cartel.clase}` }, cartel.grande),
      el("p", {}, cartel.texto),
      cartel.extra ? el("p", {}, cartel.extra) : "",
      cartel.boton ? el("div", { className: "fila" }, el("button", { className: "primario", onclick: cartel.boton[1] }, cartel.boton[0])) : "",
      !cartel.boton && v.fase === "fin" ? el("p", {}, "Esperando a que el anfitrión arranque otra…") : "",
    );
  }
  if (!cartel) firmaCartel = "";
}

function pintarJunta(v) {
  const j = v.junta, yo = v.yo;
  $("#junta-reloj").textContent = `Quedan ${Math.ceil(j.quedan)} s · votaron ${j.votaron.length}/${v.censo.filter((c) => c.vivo).length}`;
  const nombre = (id) => v.censo.find((c) => c.id === id)?.nombre ?? "?";
  $("#junta-motivo").textContent = j.motivo === "cuerpo"
    ? `${nombre(j.convoca)} encontró el gafete de ${nombre(j.cuerpo)}.`
    : `${nombre(j.convoca)} tocó la campana.`;
  const firma = JSON.stringify([j.votaron, j.miVoto, yo.vivo, v.censo.map((c) => c.vivo)]);
  if (firma !== firmaJunta) {
    firmaJunta = firma;
    const puedoVotar = yo.vivo && !j.miVoto;
    $("#btn-saltar").disabled = !puedoVotar;
    $("#junta-texto").disabled = !yo.vivo;
    $("#junta-votos").replaceChildren(...v.censo.map((c) => el("li", { className: c.vivo ? "" : "fuera" },
      el("span", { className: "punto", style: `background:${c.color}` }),
      c.nombre + (c.id === yo.id ? " (tú)" : ""),
      el("span", { className: "voto" },
        j.votaron.includes(c.id) ? el("span", { className: "ya" }, "votó") : "",
        j.miVoto === c.id ? el("span", { className: "ya" }, "← tu voto") : "",
        puedoVotar && c.vivo && c.id !== yo.id
          ? el("button", { onclick: () => accion({ tipo: "votar", objetivo: c.id }) }, "Votar")
          : "",
      ),
    )));
  }
  const chat = $("#junta-chat");
  if (chat.dataset.n !== String(j.chat.length) || chat.dataset.t !== String(j.chat[0]?.t)) {
    chat.dataset.n = String(j.chat.length);
    chat.dataset.t = String(j.chat[0]?.t);
    chat.replaceChildren(...j.chat.map((m) => {
      if (!m.de) return el("div", { className: "sistema" }, m.texto);
      const c = v.censo.find((x) => x.id === m.de);
      return el("div", {}, el("b", { style: `color:${c?.color}` }, `${c?.nombre ?? "?"}: `), m.texto);
    }));
    chat.scrollTop = chat.scrollHeight;
  }
}

/* ---------------- el piso 3D ---------------- */

let esc = null; // escena3d.js, cuando ha cargado
const flechas = [];

/** Flechas al borde hacia tus tareas pendientes que no salen en pantalla. */
function pintarFlechas(v, aPantalla) {
  const capa = $("#flechas");
  const pend = v.yo?.rol === "celula" && v.fase === "juego" ? v.yo.tareas.filter((t) => !t.hecha) : [];
  const W = innerWidth, H = innerHeight, m = 26;
  let n = 0;
  for (const t of pend) {
    const p = app.mapa.tareas.find((x) => x.id === t.id);
    const s = aPantalla(p.x, p.z);
    if (s.delante && s.x > m && s.x < W - m && s.y > m && s.y < H - m) continue;
    const ang = Math.atan2(s.y - H / 2, s.x - W / 2) + (s.delante ? 0 : Math.PI);
    const f = flechas[n] ?? capa.appendChild(Object.assign(document.createElement("i"), { className: "flecha" }));
    flechas[n++] = f;
    const ex = Math.max(m, Math.min(W - m, W / 2 + Math.cos(ang) * W));
    const ey = Math.max(m, Math.min(H - m, H / 2 + Math.sin(ang) * H));
    f.hidden = false;
    f.style.transform = `translate(${ex}px, ${ey}px) rotate(${ang}rad)`;
  }
  for (let i = n; i < flechas.length; i++) flechas[i].hidden = true;
}

function pintarNiebla(n) {
  const capa = $("#niebla");
  capa.hidden = !n;
  if (!n) return;
  // lo que no ves es lo que da miedo
  capa.style.background = `radial-gradient(circle at ${n.x}px ${n.y}px, transparent ${n.r * 0.7}px, var(--niebla) ${n.r}px)`;
}

let antes = performance.now();
function bucle(ahora) {
  const dt = Math.min(0.1, (ahora - antes) / 1000);
  antes = ahora;
  const v = app.enJuego ? app.vista : null;
  if (esc) {
    const { niebla, aPantalla } = esc.pintar(v, app.mapa, dt);
    pintarNiebla(niebla);
    if (v) pintarFlechas(v, aPantalla);
  }
  if (v) pintarHud(v, dt);
  requestAnimationFrame(bucle);
}

/* ================================ arranque ================================ */

async function arrancar() {
  pantalla(el("div", { className: "menu" }, el("h1", {}, el("small", {}, "Modo Incógnito · spin-off"), "El Soplón"), el("p", {}, "Montando el Piso 10…")));
  try {
    const crudo = await fetch(`../data/scenes/piso7.json?v=${VERSION}`).then((r) => {
      if (!r.ok) throw new Error(`piso7.json: ${r.status}`);
      return r.json();
    });
    // El 3D se carga aparte (import dinámico): las pruebas de la partida no
    // lo necesitan y el menú puede salir antes de que esté.
    const { crearEscena3D } = await import("./escena3d.js");
    esc = await crearEscena3D($("#mundo"), $("#etiquetas"));
    // La partida choca con los muebles del 3D: ver `fisica` en escena3d.js.
    app.mapa = crearMapa(crudo, esc.fisica);
  } catch (e) {
    console.error(e);
    pantalla(el("div", { className: "menu" }, el("h1", {}, "No carga el piso"), el("p", { className: "error" }, String(e.message || e))));
    return;
  }
  pintarInicio();
  requestAnimationFrame(bucle);
}

// para las pruebas (y para curiosear desde la consola)
window.__soplon = { app, host, cliente, modulos: { crearPartida, crearBot, rngDe } };
arrancar();
