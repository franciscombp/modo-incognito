import * as THREE from "three";
// Los módulos REALES del juego, nunca una copia: es lo único que garantiza
// que lo que se prueba aquí sea lo que sale al jugar. Mismo criterio que el
// resto de creador/ (ver CLAUDE.md → «Los builders»).
import { Character3D, POSES } from "../../src/entities/character3d.js";
import {
  createAlertIcon,
  updateAlertIcon,
  createSleepIcon,
  updateSleepIcon,
} from "../../src/entities/alertIcon.js";
import { createGameHud } from "../../src/ui/gamehud.js";
import { createDialogue } from "../../src/game/dialogue.js";
import { prepareLooks } from "../../src/data/loader.js";
import { siteRoot } from "../../src/data/siteRoot.js";
import { WORLD_SCALE as S } from "../../src/scene/config.js";

/**
 * EL BANCO DE PRUEBAS.
 *
 * ── Para qué existe ──────────────────────────────────────────────────
 * Para no tener que JUGAR UNA PARTIDA cada vez que se toca una pose, un
 * anuncio, un globo o una caja de diálogo. Verificar «¿se ve el Zzz?»
 * costaba: arrancar el día, saltar el ascensor, limpiar la puerta, vaciar
 * la energía, esperar a que se duerma… varios minutos por intento, y la
 * mitad de las veces lo que fallaba era el montaje de la prueba, no el
 * juego. Aquí cada cosa se dispara SOLA, en un segundo.
 *
 * ── Por qué no reutiliza el juego entero ─────────────────────────────
 * Porque entonces heredaría justo lo que estorba: el lienzo fijo, el
 * prólogo, la campaña, la puerta del día. El banco monta lo MÍNIMO —una
 * escena con un muñeco, el HUD real y el diálogo real— y le habla
 * directamente. Lo que se prueba es el módulo, no la partida.
 *
 * ── Y por qué cada botón tiene URL ───────────────────────────────────
 * `?pose=doze`, `?globo=zzz`, `?anuncio=atrapada`… Con eso una captura de
 * Playwright es `goto(url)` + `screenshot()`: sin simular teclas, sin
 * esperar estados, sin que el montaje pueda mentir. Es lo que convierte
 * «lo reviso» en tres segundos en vez de diez minutos.
 */

const DATA = `${siteRoot()}data/`;
const stage = document.getElementById("pr-stage");
const params = new URLSearchParams(location.search);

// ───────────────────────────────────────────────────────── escena 3D
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10161f);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const key = new THREE.DirectionalLight(0xfff0dd, 2.2);
key.position.set(3, 6, 4);
scene.add(key);
// Un suelo, para que los props y el mobiliario de una pose tengan dónde
// apoyarse — sin él no se nota si una cama está flotando.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(20 * S, 20 * S),
  new THREE.MeshStandardMaterial({ color: 0x2a3546 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);

// ───────────────────────────────────────────────────────── estado
let looks = null;
let muñeco = null;
let castId = params.get("cast") ?? "giu";
let pose = params.get("pose") ?? null;
let globo = params.get("globo") ?? null; // null | "ambar" | "rojo" | "zzz"

const alertIcon = createAlertIcon(1.55 * S);
const sleepIcon = createSleepIcon(1.45 * S);
scene.add(alertIcon, sleepIcon);

async function montarMuñeco() {
  if (muñeco) {
    scene.remove(muñeco.object);
    muñeco.dispose?.();
  }
  const look = looks.get(castId) ?? looks.characters?.generic;
  muñeco = new Character3D(look, { height: 1.55 * S });
  muñeco.setPosition(0, 0);
  scene.add(muñeco.object);
  muñeco.setPose(pose);
  // De frente a la cámara: aquí se viene a MIRAR al personaje.
  muñeco.setHeading(0, 1);
  encuadrar();
}

function encuadrar() {
  // Encuadre de cuerpo entero CON AIRE ARRIBA: los globos (Zzz, alerta)
  // viven por encima de la cabeza, y un encuadre ajustado al cuerpo los
  // dejaba fuera de plano — que es justo lo que se viene a mirar aquí.
  camera.position.set(0, 1.9 * S, 4.4 * S);
  camera.lookAt(0, 1.15 * S, 0);
}

// ───────────────────────────────────────────────────────── HUD real
const hudRoot = document.createElement("div");
hudRoot.id = "app";
// El HUD se dibuja con `position: fixed`, y `#app` sin transform lo ancla a
// la ventana. Aquí eso vale: el banco no escala nada.
stage.appendChild(hudRoot);
const hud = createGameHud(hudRoot, { onOpenPause: () => {}, playerLook: null });
const dialogue = createDialogue(hudRoot, { looks: null });

/** Un snapshot de mentira, con la forma EXACTA que pinta gamehud.render. */
function snapshot(extra = {}) {
  return {
    warnings: 1,
    maxWarnings: 3,
    energy: 62,
    energyMax: 100,
    asleep: false,
    timeLeft: 143,
    levelDuration: 240,
    currentTime: "11:20 a.m.",
    objectives: [
      { id: "coffee", label: "Tomar café", icon: "coffee", kind: "que", x: 4 * S, z: 2 * S, progress: 0.4, done: false },
      { id: "chisme", label: "Fran tiene un chisme", icon: "chat", kind: "como", x: 9 * S, z: 5 * S, progress: 0, done: false },
    ],
    guia: { id: "coffee", text: 'Primero consigue «Café del Parce»: háblale al Parce' },
    playerPos: { x: 0, z: 0 },
    bossPos: { x: 8 * S, z: 3 * S },
    bossDistance: 8 * S,
    bossState: "PATROL",
    redAlert: false,
    minionAlert: false,
    heat: 0,
    maxHeat: 4,
    worldScale: S,
    area: { name: "Ala sur" },
    pulse: null,
    gesture: null,
    deadline: null,
    aguantando: null,
    currentAction: null,
    bigMessage: null,
    message: null,
    inventario: [],
    gameOver: false,
    win: false,
    ...extra,
  };
}

let hudExtra = {};
hud.setLive(true);

// ───────────────────────────────────────────────────────── botones
function grupo(sel, items, onPick, activo = () => false) {
  const host = document.querySelector(sel);
  host.replaceChildren();
  for (const it of items) {
    const b = document.createElement("button");
    b.textContent = it.label;
    b.classList.toggle("on", activo(it));
    b.addEventListener("click", () => {
      onPick(it);
      pintarBotones();
      escribirUrl();
    });
    host.appendChild(b);
  }
}

let pintarBotones = () => {};

function escribirUrl() {
  const p = new URLSearchParams();
  if (castId) p.set("cast", castId);
  if (pose) p.set("pose", pose);
  if (globo) p.set("globo", globo);
  const url = `${location.pathname}?${p}`;
  history.replaceState(null, "", url);
  document.getElementById("pr-url").textContent = url;
}

function construirUI() {
  const casts = ["giu", "fran", "kiara", "manu", "gabo", "crispo", "parce"];
  const poses = [{ id: null, label: "— ninguna —" }, ...Object.keys(POSES).map((p) => ({ id: p, label: p }))];

  pintarBotones = () => {
    grupo("#pr-cast", casts.map((c) => ({ id: c, label: c })), (it) => {
      castId = it.id;
      montarMuñeco();
    }, (it) => it.id === castId);

    grupo("#pr-poses", poses, (it) => {
      pose = it.id;
      muñeco?.setPose(pose);
    }, (it) => it.id === pose);

    grupo("#pr-globos", [
      { id: null, label: "— ninguno —" },
      { id: "ambar", label: "Alerta ámbar (?)" },
      { id: "rojo", label: "Alerta roja (!)" },
      { id: "zzz", label: "Zzz (dormida)" },
    ], (it) => { globo = it.id; }, (it) => it.id === globo);

    grupo("#pr-anuncios", [
      { id: "vio", label: "¡GABO TE VIO!", tone: "danger" },
      { id: "atrapada", label: "¡TE ATRAPÓ! (1/3)", tone: "danger" },
      { id: "sentada", label: "TE SENTÓ EN TU PUESTO", tone: "warn" },
      { id: "falta", label: "TE FALTA: CAFÉ", tone: "warn" },
      { id: "lista", label: "¡TAREA LISTA!", tone: "ok" },
      { id: "dormida", label: "TE QUEDASTE DORMIDA", tone: "warn" },
    ], (it) => {
      const textos = {
        vio: "¡GABO TE VIO!",
        atrapada: "¡GABO TE ATRAPÓ! (1/3)",
        sentada: "TE SENTÓ EN TU PUESTO: A TRABAJAR",
        falta: "TE FALTA: CAFÉ DEL PARCE",
        lista: "¡TOMAR CAFÉ: LISTO!",
        dormida: "TE QUEDASTE DORMIDA",
      };
      hudExtra = { ...hudExtra, bigMessage: { text: textos[it.id], tone: it.tone, timer: 2.2, key: Date.now() } };
      setTimeout(() => { hudExtra = { ...hudExtra, bigMessage: null }; }, 2400);
    });

    grupo("#pr-hud", [
      { id: "calma", label: "Calma" },
      { id: "alerta", label: "Alerta (repliega)" },
      { id: "caza", label: "Persecución" },
      { id: "sinenergia", label: "Sin energía" },
      { id: "toast", label: "Toast" },
    ], (it) => {
      if (it.id === "calma") hudExtra = { bossState: "PATROL", heat: 0, energy: 62, asleep: false };
      if (it.id === "alerta") hudExtra = { bossState: "INVESTIGATE", heat: 2 };
      if (it.id === "caza") hudExtra = { bossState: "CHASE", heat: 3, redAlert: true, guia: { id: "coffee", text: "¡CORRE a un lugar seguro (medalla verde)!" } };
      if (it.id === "sinenergia") hudExtra = { energy: 6, asleep: true };
      if (it.id === "toast") {
        hudExtra = { ...hudExtra, message: { text: "Conseguiste: Café del Parce", timer: 2.6 } };
        setTimeout(() => { hudExtra = { ...hudExtra, message: null }; }, 2600);
      }
    });

    grupo("#pr-dialogos", [
      { id: "linea", label: "Línea simple" },
      { id: "opciones", label: "Con opciones" },
      { id: "largo", label: "Texto largo" },
    ], async (it) => {
      const escenas = {
        linea: [
          { speaker: "Gabo", mood: "tense", text: "¡AJÁ! Te vi. Y no estabas trabajando." },
          { speaker: "Giuli", text: "Estaba… validando la experiencia de usuario del pasillo." },
        ],
        opciones: [
          {
            speaker: "Gabo",
            prompt: "¿Y esto qué es?",
            options: [
              { label: "Investigación de campo", reply: "Ajá. De campo." },
              { label: "Me lo pidió Steven", reply: "¿Steven? ¿QUÉ Steven?" },
            ],
          },
        ],
        largo: [
          {
            speaker: "Fran",
            text: "Dicen que en este piso hay un proyecto que no está en ningún tablero, que lleva meses, y que si preguntas quién lo hace la respuesta es «todos y ninguno». Yo no digo nada, pero mira la Sala 6.",
          },
        ],
      };
      await dialogue.play(escenas[it.id], {
        getPlayerName: () => "Giuli",
        getPlayerGender: () => "f",
      });
    });

    grupo("#pr-mini", [
      { id: "pulso", label: "Pulso (tira)" },
      { id: "gesto", label: "Gesto (carril)" },
      { id: "aguante", label: "Aguantando" },
      { id: "off", label: "— apagar —" },
    ], (it) => {
      if (it.id === "off") hudExtra = { ...hudExtra, pulse: null, gesture: null, aguantando: null };
      if (it.id === "pulso") hudExtra = { ...hudExtra, gesture: null, aguantando: null, pulse: { pos: 0.5, zona: 0.26, zonaAt: 0.62, aciertos: 1, necesarios: 3, label: "Tomar café" } };
      if (it.id === "gesto") hudExtra = { ...hudExtra, pulse: null, aguantando: null, gesture: { valor: 0.55, zona: 0.3, zonaAt: 0.3, eje: "y", dentro: false, delatada: false, verbo: "Bájale el volumen", label: "Ver la película", icon: "movie" } };
      if (it.id === "aguante") hudExtra = { ...hudExtra, pulse: null, gesture: null, aguantando: { id: "coffee", label: "Tomar café", icon: "coffee", aguante: 4, max: 12 } };
    });
  };
  pintarBotones();
}

// ───────────────────────────────────────────────────────── bucle
let t = 0;
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  t += dt;

  muñeco?.update(dt);
  // El pulso del banco se mueve solo, para poder ver la animación de la
  // tira sin tener que jugarla.
  if (hudExtra.pulse) {
    hudExtra.pulse = { ...hudExtra.pulse, pos: (Math.sin(t * 1.6) + 1) / 2 };
  }
  updateAlertIcon(alertIcon, 0, 0, globo === "ambar" ? "amber" : globo === "rojo" ? "red" : null, t);
  updateSleepIcon(sleepIcon, 0, 0, globo === "zzz", t);
  hud.render(snapshot(hudExtra));
  renderer.render(scene, camera);
}

// ───────────────────────────────────────────────────────── arranque
(async () => {
  const [looksRaw, modelsRaw] = await Promise.all([
    fetch(`${DATA}characters3d.json`).then((r) => r.json()),
    fetch(`${DATA}models.json`).then((r) => r.json()).catch(() => ({ bodies: {}, faces: {} })),
  ]);
  looks = prepareLooks(looksRaw, modelsRaw);
  await montarMuñeco();
  construirUI();
  escribirUrl();
  resize();
  // Bandera para las capturas: `waitForFunction(() => window.__pruebas.listo)`
  // en vez de un sleep a ojo.
  window.__pruebas = {
    listo: true,
    setPose: (p) => { pose = p; muñeco?.setPose(p); },
    setGlobo: (g) => { globo = g; },
    setHud: (e) => { hudExtra = { ...hudExtra, ...e }; },
    get muñeco() { return muñeco; },
    get sleepIcon() { return sleepIcon; },
    get alertIcon() { return alertIcon; },
  };
  requestAnimationFrame(animate);

  // Estado inicial desde la URL (?anuncio= dispara al entrar).
  const anuncio = params.get("anuncio");
  if (anuncio) {
    hudExtra = { bigMessage: { text: anuncio, tone: params.get("tono") ?? "danger", timer: 9, key: 1 } };
  }
  if (params.get("hud") === "caza") {
    hudExtra = { ...hudExtra, bossState: "CHASE", heat: 3, redAlert: true };
  }
})();
