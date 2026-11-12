/**
 * LOS CHOCONES EN 3D: la pista del team building y los MISMOS muñecos del
 * juego grande, sentados cada uno en su carrito.
 *
 * Los personajes no son una copia: `Character3D` y las recetas de
 * `characters3d.json` (con su `.glb` si lo tienen) salen del motor, igual
 * que en El Soplón. La pista, los carros y las monedas sí son de aquí, y van
 * en metros de pista — los mismos números que `sim.js`, sin escalar.
 *
 * Este módulo NO juega: pinta la VISTA que le llega (`sim.vistaPara`).
 */
import * as THREE from "three";
import { loadGameData, preloadBaseModels } from "../src/data/loader.js";
import { Character3D } from "../src/entities/character3d.js";
import { resolveQuality } from "../src/game/settings.js";

const ALTURA_MUNECO = 1.2;
const POSTES = 36;
// el podio va corrido a la izquierda: a la derecha está la lista del resultado
const PODIO_X = -3.2;
const ESCALONES = [
  { x: 0, alto: 1.3 },
  { x: -2.3, alto: 0.85 },
  { x: 2.3, alto: 0.55 },
];

/** La textura de la pista: gajos de colores y el rótulo del evento. */
function texturaPista() {
  const n = 1024;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const g = cv.getContext("2d");
  const c = n / 2;
  const gajos = ["#1e3a5f", "#24476f"];
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, c, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
    g.closePath();
    g.fillStyle = gajos[i % 2];
    g.fill();
  }
  for (const [r, w, col] of [[0.98, 10, "#f5b041"], [0.66, 6, "rgba(255,255,255,0.35)"], [0.36, 6, "rgba(255,255,255,0.35)"]]) {
    g.beginPath();
    g.arc(c, c, c * r, 0, Math.PI * 2);
    g.lineWidth = w;
    g.strokeStyle = col;
    g.stroke();
  }
  g.beginPath();
  g.arc(c, c, c * 0.2, 0, Math.PI * 2);
  g.fillStyle = "#f5b041";
  g.fill();
  g.fillStyle = "#0b1a2a";
  g.font = "900 54px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TEAM", c, c - 30);
  g.fillText("BUILDING", c, c + 30);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.font = "800 40px system-ui, sans-serif";
  g.fillText("INTEGRACIÓN OBLIGATORIA · PISO 10", c, c + c * 0.52);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function formaEstrella(r1 = 0.45, r2 = 0.2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
}

export async function crearEscena3D(canvas, capaEtiquetas) {
  const data = await loadGameData();
  const modelos = preloadBaseModels(data.looks);
  const calidad = resolveQuality();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, calidad.maxPixelRatio ?? 2));
  renderer.shadowMap.enabled = calidad.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0b1724");
  scene.fog = new THREE.Fog(new THREE.Color("#0b1724"), 32, 70);

  scene.add(new THREE.HemisphereLight("#cfe8ff", "#1b2633", 0.9));
  const sol = new THREE.DirectionalLight("#fff1d6", 2.2);
  sol.position.set(-8, 18, 10);
  sol.castShadow = calidad.shadows;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sol);
  // dos focos de feria, cálidos, que barren la pista
  const focos = ["#f97316", "#ec4899"].map((col, i) => {
    const f = new THREE.SpotLight(col, 40, 40, 0.5, 0.6, 1.4);
    f.position.set(i ? 12 : -12, 14, -6);
    scene.add(f, f.target);
    return f;
  });

  // el parqueadero, abajo: lo que se ve al caer
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshStandardMaterial({ color: "#16202b", roughness: 1 }),
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = -7;
  suelo.receiveShadow = true;
  scene.add(suelo);
  const rayas = new THREE.Group();
  for (let i = -8; i <= 8; i++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 5), new THREE.MeshBasicMaterial({ color: "#c9d3dc" }));
    r.rotation.x = -Math.PI / 2;
    r.position.set(i * 3.2, -6.98, -16);
    rayas.add(r);
    const r2 = r.clone();
    r2.position.z = 16;
    rayas.add(r2);
  }
  scene.add(rayas);

  // LA PISTA: un disco que se ESCALA con el radio de la partida
  const pista = new THREE.Group();
  const disco = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.5, 96),
    [
      new THREE.MeshStandardMaterial({ color: "#0f2236", roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: texturaPista(), roughness: 0.55, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: "#0f2236" }),
    ],
  );
  disco.position.y = -0.25;
  // el rótulo de la textura, derecho para la cámara (que mira desde +z)
  disco.rotation.y = Math.PI / 2;
  disco.receiveShadow = true;
  pista.add(disco);
  scene.add(pista);
  // los postes del borde, rojo y blanco, como una feria
  const postes = [];
  const geoPoste = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10);
  const matPoste = [new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: "#7f1d1d" }), new THREE.MeshStandardMaterial({ color: "#f8fafc", emissive: "#334155" })];
  for (let i = 0; i < POSTES; i++) {
    const p = new THREE.Mesh(geoPoste, matPoste[i % 2]);
    p.castShadow = true;
    scene.add(p);
    postes.push(p);
  }
  // el aro de PELIGRO: dónde está el filo ahora mismo
  const aroPeligro = new THREE.Mesh(
    new THREE.RingGeometry(0.965, 1, 96),
    new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.0, side: THREE.DoubleSide }),
  );
  aroPeligro.rotation.x = -Math.PI / 2;
  aroPeligro.position.y = 0.02;
  scene.add(aroPeligro);

  // el podio, oculto hasta el final
  const podio = new THREE.Group();
  for (const [i, e] of ESCALONES.entries()) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, e.alto, 2.1),
      new THREE.MeshStandardMaterial({ color: ["#f5b041", "#cbd5e1", "#d97706"][i], roughness: 0.4, metalness: 0.2 }),
    );
    b.position.set(PODIO_X + e.x, e.alto / 2, -1);
    b.castShadow = b.receiveShadow = true;
    podio.add(b);
  }
  podio.visible = false;
  scene.add(podio);

  const camara = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  function ajustar() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }
  addEventListener("resize", ajustar);
  ajustar();

  /* ------------------------------ los carros ------------------------------ */
  const carros = new Map();
  const geoBase = new THREE.CylinderGeometry(0.88, 0.98, 0.42, 32);
  const geoGoma = new THREE.TorusGeometry(0.95, 0.15, 10, 40);
  const geoBarra = new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8);
  const geoLuz = new THREE.SphereGeometry(0.11, 12, 8);
  const geoLlama = new THREE.ConeGeometry(0.25, 0.9, 12);
  const geoEstrella = formaEstrella();
  const matGoma = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.9 });
  const matEstrella = new THREE.MeshStandardMaterial({ color: "#fde047", emissive: "#f59e0b", emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.3 });

  function carro(j) {
    let c = carros.get(j.id);
    if (c) return c;
    const g = new THREE.Group();
    const cuerpo = new THREE.Group(); // lo que vuelca al caer
    g.add(cuerpo);
    const matCarro = new THREE.MeshStandardMaterial({ color: j.color, roughness: 0.35, metalness: 0.15 });
    const base = new THREE.Mesh(geoBase, matCarro);
    base.position.y = 0.32;
    base.castShadow = true;
    cuerpo.add(base);
    const goma = new THREE.Mesh(geoGoma, matGoma);
    goma.rotation.x = Math.PI / 2;
    goma.position.y = 0.22;
    goma.castShadow = true;
    cuerpo.add(goma);
    // el morro, para que se lea hacia dónde mira
    const morro = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: "#f8fafc", emissive: j.color, emissiveIntensity: 0.25 }));
    morro.position.set(0, 0.5, 0.72);
    cuerpo.add(morro);
    // la barra con la lucecita, la de los chocones de feria
    const barra = new THREE.Mesh(geoBarra, matGoma);
    barra.position.set(0, 1.3, -0.62);
    cuerpo.add(barra);
    const luz = new THREE.Mesh(geoLuz, new THREE.MeshStandardMaterial({ color: j.color, emissive: j.color, emissiveIntensity: 1.2 }));
    luz.position.set(0, 2.26, -0.62);
    cuerpo.add(luz);
    const llama = new THREE.Mesh(geoLlama, new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.85 }));
    llama.rotation.x = -Math.PI / 2;
    llama.position.set(0, 0.35, -1.25);
    llama.visible = false;
    cuerpo.add(llama);
    // el muñeco del juego, sentado
    const m = new Character3D(data.looks.get(j.cara), { height: ALTURA_MUNECO });
    m.setPose("sit");
    m.setHeading(0, 1, { snap: true });
    m.object.position.set(0, 0.42, -0.12);
    cuerpo.add(m.object);
    const estrella = new THREE.Mesh(geoEstrella, matEstrella);
    estrella.position.y = 2.9;
    estrella.visible = false;
    g.add(estrella);
    scene.add(g);
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta";
    etiqueta.style.setProperty("--color", j.color);
    etiqueta.textContent = j.nombre;
    capaEtiquetas.append(etiqueta);
    c = { g, cuerpo, m, llama, estrella, etiqueta, x: j.x, z: j.z, ang: j.ang, caida: 0, giroCaida: 0 };
    carros.set(j.id, c);
    return c;
  }

  /* ------------------------------ las monedas ------------------------------ */
  const geoMoneda = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24);
  const matMoneda = new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#a16207", emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });
  const monedas = new Map();

  /* --------------------------- golpes: un destello --------------------------- */
  const destellos = [];
  const geoDestello = new THREE.RingGeometry(0.2, 0.45, 24);
  function destello(x, z, fuerza) {
    const d = new THREE.Mesh(geoDestello, new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    d.rotation.x = -Math.PI / 2;
    d.position.set(x, 0.6, z);
    d.userData = { t: 0, max: 0.35, escala: 1 + Math.min(4, fuerza / 4) };
    scene.add(d);
    destellos.push(d);
  }

  /**
   * LA DISTANCIA LA DECIDE LA PANTALLA, no un número fijo. En un teléfono
   * apaisado (20:9) la pista no cabía a lo ALTO y el fondo quedaba debajo
   * del marcador, con los carros de esa zona invisibles. Se busca la cámara
   * más cercana (los carros y las caras tienen que leerse) en la que el
   * filo entero cae dentro del cuadro, con margen arriba para el marcador.
   */
  const sonda = new THREE.PerspectiveCamera();
  const punto = new THREE.Vector3();
  let encuadreCache = { r: -1, aspecto: -1, pos: new THREE.Vector3() };
  function posicionQueEncuadra(r) {
    if (Math.abs(encuadreCache.r - r) < 0.05 && encuadreCache.aspecto === camara.aspect) return encuadreCache.pos;
    sonda.fov = camara.fov;
    sonda.aspect = camara.aspect;
    sonda.near = camara.near;
    sonda.far = camara.far;
    sonda.updateProjectionMatrix();
    const centro = new THREE.Vector3(0, 0, 0.6);
    let d = 8;
    for (let n = 0; n < 80; n++, d += 0.5) {
      sonda.position.set(0, d * 0.86, 0.6 + d * 0.72);
      sonda.lookAt(centro);
      sonda.updateMatrixWorld();
      let cabe = true;
      for (let k = 0; k < 16 && cabe; k++) {
        const a = (k / 16) * Math.PI * 2;
        punto.set(Math.cos(a) * (r + 0.4), 0.4, Math.sin(a) * (r + 0.4)).project(sonda);
        // arriba deja sitio al marcador y a la barra de ronda
        // (en una pantalla muy apaisada el HUD de arriba ocupa más fracción)
        const techo = camara.aspect > 1.9 ? 0.6 : 0.74;
        if (punto.y > techo || punto.y < -0.96 || Math.abs(punto.x) > 0.96) cabe = false;
      }
      if (cabe) break;
    }
    encuadreCache = { r, aspecto: camara.aspect, pos: sonda.position.clone() };
    return encuadreCache.pos;
  }

  const v3 = new THREE.Vector3();
  function aPantalla(x, y, z) {
    v3.set(x, y, z).project(camara);
    return { x: ((v3.x + 1) / 2) * innerWidth, y: ((1 - v3.y) / 2) * innerHeight, delante: v3.z < 1 };
  }

  let t = 0;
  let ultimoEvento = 0;
  let radioVisto = 11;
  const foco = new THREE.Vector3();

  function pintar(vista, dt) {
    t += dt;
    // en el podio la pista vuelve a su tamaño: el podio va encima de ella
    const radio = vista?.fase === "podio" ? vista.radioInicial : vista?.radio ?? 11;
    radioVisto += (radio - radioVisto) * (1 - Math.exp(-dt * 10));
    pista.scale.set(radioVisto, 1, radioVisto);
    for (let i = 0; i < POSTES; i++) {
      const a = (i / POSTES) * Math.PI * 2;
      postes[i].position.set(Math.cos(a) * (radioVisto + 0.05), 0.35, Math.sin(a) * (radioVisto + 0.05));
    }
    aroPeligro.scale.set(radioVisto, radioVisto, 1);
    const encogiendo = vista && vista.fase === "ronda" && radio < (vista.radioInicial ?? 11) - 0.01;
    aroPeligro.material.opacity = encogiendo ? 0.45 + Math.sin(t * 8) * 0.25 : 0;
    focos.forEach((f, i) => f.target.position.set(Math.sin(t * 0.6 + i * 2) * 6, 0, Math.cos(t * 0.5 + i) * 6));

    const enPodio = vista?.fase === "podio";
    podio.visible = enPodio;
    const lugar = new Map((vista?.podio ?? []).map((id, i) => [id, i]));
    const k = 1 - Math.exp(-dt * 18);
    const presentes = new Set();

    for (const j of vista?.jugadores ?? []) {
      presentes.add(j.id);
      const c = carro(j);
      // al empezar una ronda nueva todos vuelven al corro: sin suavizar ese salto
      if (Math.hypot(c.x - j.x, c.z - j.z) > 3 || (vista.fase === "intro" && vista.t < 0.2)) { c.x = j.x; c.z = j.z; c.ang = j.ang; }
      c.x += (j.x - c.x) * k;
      c.z += (j.z - c.z) * k;
      let da = j.ang - c.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.ang += da * k;

      let y = 0;
      if (enPodio) {
        const i = lugar.get(j.id) ?? 9;
        if (i < 3) {
          c.g.position.set(PODIO_X + ESCALONES[i].x, ESCALONES[i].alto, -1);
          c.g.rotation.set(0, 0, 0);
        } else {
          const a = ((i - 3) / Math.max(1, (vista.jugadores.length - 3))) * Math.PI - Math.PI;
          c.g.position.set(PODIO_X + Math.cos(a) * 5.5, 0, 2 + Math.sin(a) * -1.5);
          c.g.rotation.set(0, Math.PI, 0);
        }
        c.cuerpo.rotation.set(0, 0, 0);
        c.g.visible = true;
        c.m.setPose(i === 0 ? "point" : "sit");
      } else {
        if (!j.vivo && j.cayendo > 0) {
          // caída: gravedad y vuelta de campana
          c.caida = j.cayendo;
          y = -0.5 * 14 * c.caida * c.caida;
          c.cuerpo.rotation.x = c.caida * 5;
          c.cuerpo.rotation.z = c.caida * 3;
        } else {
          c.caida = 0;
          c.cuerpo.rotation.set(0, 0, 0);
          // un pequeño bamboleo al ir rápido
          c.cuerpo.rotation.z = Math.sin(t * 18 + c.x) * Math.min(0.06, j.v * 0.006);
        }
        c.g.position.set(c.x, y, c.z);
        c.g.rotation.set(0, c.ang, 0);
        c.g.visible = !j.fuera;
        c.m.setPose("sit");
      }
      c.llama.visible = j.turbo && !enPodio;
      c.llama.scale.setScalar(0.8 + Math.sin(t * 40) * 0.2);
      const conEstrella = (vista.fase === "finRonda" && vista.ganadorRonda === j.id) || (enPodio && lugar.get(j.id) === 0);
      c.estrella.visible = conEstrella;
      c.estrella.rotation.y = t * 3;
      c.estrella.position.y = 2.9 + Math.sin(t * 4) * 0.12;
      c.m.update(dt);
      const e = aPantalla(c.g.position.x, c.g.position.y + 2.6, c.g.position.z);
      c.etiqueta.hidden = !e.delante || !c.g.visible || (!j.vivo && !enPodio);
      c.etiqueta.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -100%)`;
      c.etiqueta.classList.toggle("yo", vista.yo?.id === j.id);
    }
    for (const [id, c] of carros) {
      if (presentes.has(id)) continue;
      c.g.visible = false;
      c.etiqueta.hidden = true;
    }

    // monedas
    const vivas = new Set();
    for (const m of enPodio ? [] : vista?.monedas ?? []) {
      vivas.add(m.id);
      let mesh = monedas.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(geoMoneda, matMoneda);
        mesh.rotation.z = Math.PI / 2;
        mesh.castShadow = true;
        scene.add(mesh);
        monedas.set(m.id, mesh);
      }
      mesh.position.set(m.x, 0.6 + Math.sin(t * 3 + m.id) * 0.12, m.z);
      mesh.rotation.y = t * 3 + m.id;
    }
    for (const [id, mesh] of monedas) {
      if (vivas.has(id)) continue;
      scene.remove(mesh);
      monedas.delete(id);
    }

    // destellos de los golpes (de los eventos nuevos)
    for (const e of vista?.eventos ?? []) {
      if (e.n <= ultimoEvento) continue;
      if (e.tipo === "choque") destello(e.x, e.z, e.fuerza);
    }
    ultimoEvento = Math.max(ultimoEvento, ...(vista?.eventos ?? []).map((e) => e.n), 0);
    for (let i = destellos.length - 1; i >= 0; i--) {
      const d = destellos[i];
      d.userData.t += dt;
      const f = d.userData.t / d.userData.max;
      d.scale.setScalar(1 + f * d.userData.escala * 3);
      d.material.opacity = 0.9 * (1 - f);
      if (f >= 1) { scene.remove(d); d.material.dispose(); destellos.splice(i, 1); }
    }

    // cámara: toda la pista en cuadro; en el podio, cerca
    if (enPodio) {
      const objetivo = new THREE.Vector3(PODIO_X + 2, 1.4, -1);
      foco.lerp(objetivo, 1 - Math.exp(-dt * 3));
      const d = 11 * (camara.aspect < 1.2 ? 1.2 / camara.aspect : 1);
      camara.position.lerp(new THREE.Vector3(foco.x, foco.y + d * 0.42, foco.z + d * 0.9), 1 - Math.exp(-dt * 3));
    } else {
      foco.lerp(new THREE.Vector3(0, 0, 0.6), 1 - Math.exp(-dt * 3));
      camara.position.lerp(posicionQueEncuadra(radioVisto), 1 - Math.exp(-dt * 3));
    }
    camara.lookAt(foco);
    renderer.render(scene, camara);
  }

  /** La cámara mira desde +z hacia el centro: pantalla → suelo es directo. */
  function aSuelo(derecha, arriba) {
    return { mx: derecha, mz: -arriba };
  }

  return { pintar, aSuelo, modelos, data, renderer, scene, camara };
}
