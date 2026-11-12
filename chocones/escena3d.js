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
import { characterShot } from "../src/ui/charshot.js";

const ALTURA_MUNECO = 1.2;
const POSTES = 36;
// el podio va corrido a la izquierda: a la derecha está la lista del resultado
const PODIO_X = -3.2;
const ESCALONES = [
  { x: 0, alto: 1.3 },
  { x: -2.3, alto: 0.85 },
  { x: 2.3, alto: 0.55 },
];

/** La textura de la pista: una pista de feria, con su banda de peligro en el filo. */
function texturaPista() {
  const n = 1024;
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const g = cv.getContext("2d");
  const c = n / 2;
  // gajos alternos sobre un degradado radial: el centro, más claro
  const gajos = ["#1d3f6b", "#27508a"];
  for (let i = 0; i < 16; i++) {
    g.beginPath();
    g.moveTo(c, c);
    g.arc(c, c, c, (i / 16) * Math.PI * 2, ((i + 1) / 16) * Math.PI * 2);
    g.closePath();
    g.fillStyle = gajos[i % 2];
    g.fill();
  }
  const luz = g.createRadialGradient(c, c, 0, c, c, c);
  luz.addColorStop(0, "rgba(120, 190, 255, 0.35)");
  luz.addColorStop(0.6, "rgba(120, 190, 255, 0.05)");
  luz.addColorStop(1, "rgba(0, 0, 20, 0.35)");
  g.fillStyle = luz;
  g.fillRect(0, 0, n, n);
  // la banda de peligro del filo: amarillo y negro, como en una obra
  const N = 72;
  for (let i = 0; i < N; i++) {
    g.beginPath();
    g.arc(c, c, c * 0.955, (i / N) * Math.PI * 2, ((i + 1) / N) * Math.PI * 2);
    g.lineWidth = c * 0.07;
    g.strokeStyle = i % 2 ? "#111827" : "#facc15";
    g.stroke();
  }
  for (const [r, w, col] of [[0.915, 5, "#fff7d6"], [0.66, 5, "rgba(255,255,255,0.3)"], [0.36, 5, "rgba(255,255,255,0.3)"]]) {
    g.beginPath();
    g.arc(c, c, c * r, 0, Math.PI * 2);
    g.lineWidth = w;
    g.strokeStyle = col;
    g.stroke();
  }
  // estrellitas en el anillo medio
  g.fillStyle = "rgba(255,255,255,0.16)";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26, r = c * 0.51;
    estrella2D(g, c + Math.cos(a) * r, c + Math.sin(a) * r, 16);
  }
  // el centro: el rótulo del evento
  const oro = g.createRadialGradient(c, c - 30, 10, c, c, c * 0.21);
  oro.addColorStop(0, "#ffe08a");
  oro.addColorStop(1, "#f59e0b");
  g.beginPath();
  g.arc(c, c, c * 0.2, 0, Math.PI * 2);
  g.fillStyle = oro;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = "#7c2d12";
  g.stroke();
  g.fillStyle = "#3b0d0d";
  g.font = "900 54px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("TEAM", c, c - 30);
  g.fillText("BUILDING", c, c + 30);
  g.fillStyle = "rgba(255,255,255,0.6)";
  g.font = "800 38px system-ui, sans-serif";
  g.fillText("INTEGRACIÓN OBLIGATORIA · PISO 10", c, c + c * 0.5);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function estrella2D(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.45 : r;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

/** El cielo: noche de feria, con el horizonte encendido. */
function texturaCielo() {
  const cv = document.createElement("canvas");
  cv.width = 8;
  cv.height = 512;
  const g = cv.getContext("2d");
  const d = g.createLinearGradient(0, 0, 0, 512);
  d.addColorStop(0, "#090b22");
  d.addColorStop(0.45, "#1a1446");
  d.addColorStop(0.72, "#4a1d5e");
  d.addColorStop(1, "#b43a5e");
  g.fillStyle = d;
  g.fillRect(0, 0, 8, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ventanas encendidas al azar: los edificios de alrededor (donde sí se trabaja). */
function texturaVentanas() {
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 128;
  const g = cv.getContext("2d");
  g.fillStyle = "#0d1020";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 124; y += 10) {
    for (let x = 4; x < 60; x += 10) {
      const r = Math.random();
      g.fillStyle = r < 0.3 ? "#ffd27a" : r < 0.38 ? "#9fd6ff" : "#161a30";
      g.fillRect(x, y, 6, 6);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** El letrero de bombillas del fondo. */
function texturaLetrero() {
  const cv = document.createElement("canvas");
  cv.width = 1024;
  cv.height = 256;
  const g = cv.getContext("2d");
  g.fillStyle = "#3b0764";
  g.fillRect(0, 0, 1024, 256);
  g.lineWidth = 10;
  g.strokeStyle = "#f59e0b";
  g.strokeRect(12, 12, 1000, 232);
  g.fillStyle = "#fde68a";
  for (let x = 30; x < 1000; x += 36) { g.beginPath(); g.arc(x, 30, 7, 0, 7); g.arc(x, 226, 7, 0, 7); g.fill(); }
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "900 120px system-ui, sans-serif";
  g.lineWidth = 14;
  g.strokeStyle = "#7c2d12";
  g.strokeText("LOS CHOCONES", 512, 132);
  const d = g.createLinearGradient(0, 70, 0, 190);
  d.addColorStop(0, "#fff3b0");
  d.addColorStop(1, "#fb923c");
  g.fillStyle = d;
  g.fillText("LOS CHOCONES", 512, 132);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Un halo redondo que muere en transparente (brillos del suelo, sombras). */
function texturaHalo(color = "255,255,255") {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, `rgba(${color},1)`);
  d.addColorStop(0.5, `rgba(${color},0.35)`);
  d.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/**
 * PARTÍCULAS: chispas, humo, confeti y estela, en UN solo objeto por modo de
 * mezcla. Un `Points` con hueco fijo: emitir es escribir en el siguiente
 * hueco, así que no se reserva memoria en mitad de un choque.
 */
function crearParticulas(n, { aditivo = false, cuadrado = false } = {}) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), tam = new Float32Array(n);
  const vel = new Float32Array(n * 3), vida = new Float32Array(n), vidaMax = new Float32Array(n);
  const grav = new Float32Array(n), crece = new Float32Array(n), alfa = new Float32Array(n), tam0 = new Float32Array(n), roce = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color4", new THREE.BufferAttribute(col, 4));
  geo.setAttribute("tam", new THREE.BufferAttribute(tam, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { escala: { value: 600 } },
    transparent: true,
    depthWrite: false,
    blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute vec4 color4; attribute float tam; uniform float escala; varying vec4 vC;
      void main() { vC = color4; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = tam * escala / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec4 vC;
      void main() { float r = length(gl_PointCoord - 0.5);
        ${cuadrado ? "float a = 1.0;" : "if (r > 0.5) discard; float a = smoothstep(0.5, 0.25, r);"}
        gl_FragColor = vec4(vC.rgb, vC.a * a); }`,
  });
  const puntos = new THREE.Points(geo, mat);
  puntos.frustumCulled = false;
  puntos.renderOrder = 5;
  let sig = 0;
  const c = new THREE.Color();
  return {
    puntos,
    mat,
    emitir(o) {
      const i = sig;
      sig = (sig + 1) % n;
      pos[i * 3] = o.x; pos[i * 3 + 1] = o.y; pos[i * 3 + 2] = o.z;
      vel[i * 3] = o.vx ?? 0; vel[i * 3 + 1] = o.vy ?? 0; vel[i * 3 + 2] = o.vz ?? 0;
      vida[i] = vidaMax[i] = o.vida ?? 0.6;
      grav[i] = o.grav ?? 0;
      crece[i] = o.crece ?? 0;
      roce[i] = o.roce ?? 0;
      alfa[i] = o.alfa ?? 1;
      tam0[i] = o.tam ?? 0.2;
      c.set(o.color ?? "#ffffff");
      col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b;
    },
    paso(dt) {
      for (let i = 0; i < n; i++) {
        if (vida[i] <= 0) { tam[i] = 0; continue; }
        vida[i] -= dt;
        const f = Math.max(0, vida[i] / vidaMax[i]);
        vel[i * 3 + 1] -= grav[i] * dt;
        if (roce[i]) { const k = Math.exp(-roce[i] * dt); vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k; }
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        tam[i] = tam0[i] * (1 + crece[i] * (1 - f));
        col[i * 4 + 3] = alfa[i] * Math.min(1, f * 2);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color4.needsUpdate = true;
      geo.attributes.tam.needsUpdate = true;
    },
  };
}

const CONFETI = ["#f43f5e", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#fb923c", "#f8fafc"];
const al = (a, b) => a + Math.random() * (b - a);

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
  scene.background = texturaCielo();
  scene.fog = new THREE.Fog(new THREE.Color("#2a1647"), 45, 130);

  scene.add(new THREE.HemisphereLight("#cfe0ff", "#3a1d4a", 1.0));
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
    new THREE.MeshStandardMaterial({ color: "#0f1226", roughness: 1 }),
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

  // el resplandor de la pista sobre el parqueadero: la feria se ve desde lejos
  const resplandor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshBasicMaterial({ map: texturaHalo("255,150,90"), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  resplandor.rotation.x = -Math.PI / 2;
  resplandor.position.y = -6.95;
  scene.add(resplandor);

  // los edificios de alrededor: un corro de torres con ventanas encendidas
  {
    const tex = texturaVentanas();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + al(-0.08, 0.08);
      // por delante (hacia la cámara) no: taparían la pista
      if (Math.sin(a) > 0.35) continue;
      const r = al(50, 72), ancho = al(8, 14), alto = al(14, 38);
      const m = tex.clone();
      m.wrapS = m.wrapT = THREE.RepeatWrapping;
      m.repeat.set(Math.round(ancho / 5), Math.round(alto / 9));
      m.needsUpdate = true;
      const b = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: m, fog: true }));
      b.scale.set(ancho, alto, ancho);
      b.position.set(Math.cos(a) * r, -7 + alto / 2, Math.sin(a) * r);
      b.rotation.y = -a;
      scene.add(b);
    }
  }

  // postes y guirnaldas de bombillas por detrás y a los lados
  const bombillas = [];
  {
    const angulos = [-12, -50, -90, -130, -168].map((g) => (g * Math.PI) / 180);
    const R = 15.5, ALTO = 6.2;
    const matPalo = new THREE.MeshStandardMaterial({ color: "#2b2540", roughness: 0.8 });
    const cimas = angulos.map((a) => {
      const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, ALTO + 7, 8), matPalo);
      palo.position.set(Math.cos(a) * R, (ALTO - 7) / 2, Math.sin(a) * R);
      scene.add(palo);
      return new THREE.Vector3(Math.cos(a) * R, ALTO, Math.sin(a) * R);
    });
    const POR_TRAMO = 13;
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ fog: false }), (cimas.length - 1) * POR_TRAMO);
    const mtx = new THREE.Matrix4();
    let n = 0;
    for (let k = 0; k < cimas.length - 1; k++) {
      for (let q = 1; q <= POR_TRAMO; q++) {
        const f = q / (POR_TRAMO + 1);
        const p = cimas[k].clone().lerp(cimas[k + 1], f);
        p.y -= Math.sin(f * Math.PI) * 1.5; // la comba del cable
        mtx.setPosition(p);
        inst.setMatrixAt(n, mtx);
        bombillas.push(n++);
      }
    }
    inst.userData.color = new THREE.Color();
    scene.add(inst);
    bombillas.inst = inst;
    // el letrero, colgado entre los dos postes del fondo
    const letrero = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: texturaLetrero(), fog: false }));
    letrero.position.set(0, 3.4, -17);
    scene.add(letrero);
    for (const x of [-6, 6]) {
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 8), matPalo);
      pata.position.set(x, -2.6, -17.05);
      scene.add(pata);
    }
  }

  // LA PISTA: un disco que se ESCALA con el radio de la partida
  const pista = new THREE.Group();
  const disco = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.5, 96),
    [
      new THREE.MeshStandardMaterial({ color: "#3b1d63", emissive: "#3b1d63", emissiveIntensity: 0.5, roughness: 0.7 }),
      new THREE.MeshStandardMaterial({ map: texturaPista(), roughness: 0.5, metalness: 0.05 }),
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
  // EL FILO: un tubo de neón que sigue al radio (ámbar; rojo cuando encoge)
  const neon = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.012, 8, 96),
    new THREE.MeshBasicMaterial({ color: "#fbbf24", fog: false }),
  );
  neon.rotation.x = Math.PI / 2;
  neon.position.y = 0.06;
  scene.add(neon);
  // y la ZONA DE PELIGRO: la franja del suelo que está a punto de caerse
  const aroPeligro = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 96),
    new THREE.MeshBasicMaterial({ color: "#ef4444", transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }),
  );
  aroPeligro.rotation.x = -Math.PI / 2;
  aroPeligro.position.y = 0.02;
  scene.add(aroPeligro);

  // partículas: unas suman luz (chispas, fuego) y otras tapan (humo, confeti)
  const chispas = crearParticulas(500, { aditivo: true });
  const humo = crearParticulas(300);
  const confeti = crearParticulas(500, { cuadrado: true });
  scene.add(humo.puntos, chispas.puntos, confeti.puntos);

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
    // el tamaño de las partículas va en metros: píxeles por metro a 1 m
    const e = (h * renderer.getPixelRatio()) / (2 * Math.tan((camara.fov * Math.PI) / 360));
    for (const p of [chispas, humo, confeti]) p.mat.uniforms.escala.value = e;
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

  const geoFaro = new THREE.SphereGeometry(0.09, 10, 8);
  const matFaro = new THREE.MeshBasicMaterial({ color: "#fff7c2" });
  const geoRespaldo = new THREE.BoxGeometry(0.7, 0.4, 0.12);
  const geoSombra = new THREE.CircleGeometry(1.25, 24);
  const matSombra = new THREE.MeshBasicMaterial({ map: texturaHalo("0,0,0"), transparent: true, opacity: 0.55, depthWrite: false });
  const geoAroYo = new THREE.RingGeometry(1.22, 1.42, 40);
  const geoFranja = new THREE.TorusGeometry(0.9, 0.035, 6, 40);
  const matFranja = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.3 });

  function quitarCarro(id) {
    const c = carros.get(id);
    if (!c) return;
    scene.remove(c.g);
    c.m.dispose?.();
    c.etiqueta.remove();
    carros.delete(id);
  }

  function carro(j) {
    let c = carros.get(j.id);
    // el mismo id puede traer otra cara en la partida siguiente
    if (c && c.firma !== j.cara + j.color) { quitarCarro(j.id); c = null; }
    if (c) return c;
    const g = new THREE.Group();
    const cuerpo = new THREE.Group(); // lo que vuelca al caer
    g.add(cuerpo);
    const matCarro = new THREE.MeshStandardMaterial({ color: j.color, roughness: 0.3, metalness: 0.25 });
    const base = new THREE.Mesh(geoBase, matCarro);
    base.position.y = 0.32;
    base.castShadow = true;
    cuerpo.add(base);
    const goma = new THREE.Mesh(geoGoma, matGoma);
    goma.rotation.x = Math.PI / 2;
    goma.position.y = 0.22;
    goma.castShadow = true;
    cuerpo.add(goma);
    const franja = new THREE.Mesh(geoFranja, matFranja);
    franja.rotation.x = Math.PI / 2;
    franja.position.y = 0.535;
    cuerpo.add(franja);
    // el morro, para que se lea hacia dónde mira, con sus dos faros
    const morro = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), new THREE.MeshStandardMaterial({ color: "#f8fafc", emissive: j.color, emissiveIntensity: 0.25 }));
    morro.position.set(0, 0.5, 0.72);
    cuerpo.add(morro);
    for (const x of [-0.3, 0.3]) {
      const faro = new THREE.Mesh(geoFaro, matFaro);
      faro.position.set(x, 0.5, 0.9);
      cuerpo.add(faro);
    }
    const respaldo = new THREE.Mesh(geoRespaldo, matGoma);
    respaldo.position.set(0, 0.7, -0.52);
    cuerpo.add(respaldo);
    // la barra con la lucecita, la de los chocones de feria
    const barra = new THREE.Mesh(geoBarra, matGoma);
    barra.position.set(0, 1.3, -0.62);
    cuerpo.add(barra);
    const luz = new THREE.Mesh(geoLuz, new THREE.MeshBasicMaterial({ color: j.color }));
    luz.position.set(0, 2.26, -0.62);
    cuerpo.add(luz);
    const llama = new THREE.Mesh(geoLlama, new THREE.MeshBasicMaterial({ color: "#fb923c", transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
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
    // sombra de contacto (también donde la calidad apaga las sombras de verdad)
    const sombra = new THREE.Mesh(geoSombra, matSombra);
    sombra.rotation.x = -Math.PI / 2;
    sombra.position.y = 0.015;
    g.add(sombra);
    // el aro de «este soy yo»: se enciende solo en el carro propio
    const aroYo = new THREE.Mesh(geoAroYo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    aroYo.rotation.x = -Math.PI / 2;
    aroYo.position.y = 0.03;
    aroYo.visible = false;
    g.add(aroYo);
    scene.add(g);
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta";
    etiqueta.style.setProperty("--color", j.color);
    etiqueta.textContent = j.nombre;
    capaEtiquetas.append(etiqueta);
    c = { firma: j.cara + j.color, g, cuerpo, m, llama, estrella, sombra, aroYo, etiqueta, color: j.color, x: j.x, z: j.z, ang: j.ang, caida: 0, golpe: 0, inclina: 0, vivoAntes: true, pantalla: { x: 0, y: 0 } };
    carros.set(j.id, c);
    return c;
  }

  /* ------------------------------ las monedas ------------------------------ */
  const geoMoneda = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24);
  const matMoneda = new THREE.MeshStandardMaterial({ color: "#facc15", emissive: "#a16207", emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.25 });
  const monedas = new Map();
  const geoHaloMoneda = new THREE.CircleGeometry(0.9, 20);
  const matHaloMoneda = new THREE.MeshBasicMaterial({ map: texturaHalo("255,210,60"), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });

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
        const techo = camara.aspect > 1.9 ? 0.4 : 0.7;
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
  let relojPrevio = 0;
  let radioVisto = 11;
  let sacudida = 0;
  const foco = new THREE.Vector3();
  const camBase = new THREE.Vector3(0, 20, 18);
  const colorNeon = new THREE.Color();

  /* ------------------------------ efectos ------------------------------ */
  function fxChoque(x, z, fuerza) {
    destello(x, z, fuerza);
    const n = Math.min(26, 6 + fuerza * 1.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = al(3, 5 + fuerza * 0.6);
      chispas.emitir({ x, y: 0.6, z, vx: Math.cos(a) * v, vy: al(1, 5), vz: Math.sin(a) * v, vida: al(0.25, 0.55), tam: al(0.12, 0.26), color: Math.random() < 0.5 ? "#fde68a" : "#fb923c", grav: 12, roce: 2 });
    }
    sacudida = Math.min(0.6, sacudida + fuerza * 0.022);
  }
  function fxKO(c) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      humo.emitir({ x: c.x + Math.cos(a) * 0.5, y: 0.4, z: c.z + Math.sin(a) * 0.5, vx: Math.cos(a) * al(0.5, 2), vy: al(1, 3), vz: Math.sin(a) * al(0.5, 2), vida: al(0.6, 1), tam: al(0.3, 0.55), crece: 1.2, alfa: 0.4, color: "#cbd5e1", roce: 1.5 });
    }
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = al(3, 8);
      chispas.emitir({ x: c.x, y: 0.5, z: c.z, vx: Math.cos(a) * v, vy: al(3, 8), vz: Math.sin(a) * v, vida: al(0.4, 0.8), tam: al(0.15, 0.3), color: c.color, grav: 14 });
    }
    sacudida = Math.min(0.8, sacudida + 0.45);
  }
  function fxMoneda(c) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      chispas.emitir({ x: c.x + Math.cos(a) * 0.5, y: 0.8, z: c.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 1.5, vy: al(2, 5), vz: Math.sin(a) * 1.5, vida: al(0.35, 0.7), tam: al(0.12, 0.22), color: "#fde047", grav: 5 });
    }
  }
  function fxConfeti(x, y, z, n, abre = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = al(0.5, abre);
      confeti.emitir({ x, y, z, vx: Math.cos(a) * v, vy: al(2, 8), vz: Math.sin(a) * v, vida: al(1.6, 3), tam: al(0.07, 0.13), color: CONFETI[(Math.random() * CONFETI.length) | 0], grav: 5, roce: 1.2 });
    }
  }

  function pintar(vista, dt) {
    t += dt;
    const demo = !!vista?.demo;
    // partida nueva (o del escaparate a la de verdad): los eventos vuelven a contarse
    if (vista && vista.reloj < relojPrevio) ultimoEvento = 0;
    relojPrevio = vista?.reloj ?? 0;

    // en el podio la pista vuelve a su tamaño: el podio va encima de ella
    const radio = vista?.fase === "podio" ? vista.radioInicial : vista?.radio ?? 11;
    radioVisto += (radio - radioVisto) * (1 - Math.exp(-dt * 10));
    pista.scale.set(radioVisto, 1, radioVisto);
    for (let i = 0; i < POSTES; i++) {
      const a = (i / POSTES) * Math.PI * 2;
      postes[i].position.set(Math.cos(a) * (radioVisto + 0.05), 0.35, Math.sin(a) * (radioVisto + 0.05));
    }
    const encogiendo = !!vista && vista.fase === "ronda" && radio < (vista.radioInicial ?? 11) - 0.01;
    const late = 0.5 + Math.sin(t * 9) * 0.5;
    neon.scale.setScalar(radioVisto + 0.02);
    neon.material.color.copy(colorNeon.set(encogiendo ? "#ef4444" : "#fbbf24")).multiplyScalar(encogiendo ? 0.7 + late * 0.6 : 1);
    aroPeligro.scale.set(radioVisto, radioVisto, 1);
    aroPeligro.material.opacity = encogiendo ? 0.16 + late * 0.2 : 0;
    focos.forEach((f, i) => f.target.position.set(Math.sin(t * 0.6 + i * 2) * 6, 0, Math.cos(t * 0.5 + i) * 6));
    // las bombillas: una ola de colores que corre por la guirnalda
    {
      const inst = bombillas.inst, col = inst.userData.color;
      for (const n of bombillas) {
        const enc = Math.sin(t * 3 - n * 0.9) > -0.3;
        col.set(CONFETI[n % 5]).multiplyScalar(enc ? 1.4 : 0.25);
        inst.setColorAt(n, col);
      }
      inst.instanceColor.needsUpdate = true;
    }

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
      const px = c.x, pz = c.z;
      c.x += (j.x - c.x) * k;
      c.z += (j.z - c.z) * k;
      let da = j.ang - c.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.ang += da * k;
      c.inclina += (THREE.MathUtils.clamp(-da * 1.2, -0.3, 0.3) - c.inclina) * (1 - Math.exp(-dt * 8));
      c.golpe = Math.max(0, c.golpe - dt * 4);
      const soyYo = vista.yo?.id === j.id;

      let y = 0;
      if (enPodio) {
        const i = lugar.get(j.id) ?? 9;
        if (i < 3) {
          c.g.position.set(PODIO_X + ESCALONES[i].x, ESCALONES[i].alto, -1);
          c.g.rotation.set(0, 0, 0);
          // el ganador da saltitos
          if (i === 0) c.g.position.y += Math.abs(Math.sin(t * 5)) * 0.25;
        } else {
          const a = ((i - 3) / Math.max(1, vista.jugadores.length - 3)) * Math.PI - Math.PI;
          c.g.position.set(PODIO_X + Math.cos(a) * 5.5, 0, 2 + Math.sin(a) * -1.5);
          c.g.rotation.set(0, Math.PI, 0);
        }
        c.cuerpo.rotation.set(0, 0, 0);
        c.cuerpo.scale.setScalar(1);
        c.g.visible = true;
        c.m.setPose(i === 0 ? "point" : "sit");
      } else {
        if (!j.vivo && j.cayendo > 0) {
          if (c.vivoAntes) fxKO(c);
          // caída: gravedad y vuelta de campana
          c.caida = j.cayendo;
          y = -0.5 * 14 * c.caida * c.caida;
          c.cuerpo.rotation.x = c.caida * 5;
          c.cuerpo.rotation.z = c.caida * 3;
        } else {
          c.caida = 0;
          // se inclina en las curvas y tiembla un poco al ir rápido
          c.cuerpo.rotation.set(0, 0, c.inclina + Math.sin(t * 18 + c.x) * Math.min(0.05, j.v * 0.005));
        }
        // el golpe lo aplasta un instante, como una goma
        const g = c.golpe;
        c.cuerpo.scale.set(1 + g * 0.2, 1 - g * 0.16, 1 + g * 0.2);
        c.g.position.set(c.x, y, c.z);
        c.g.rotation.set(0, c.ang, 0);
        c.g.visible = !j.fuera;
        c.m.setPose("sit");

        if (j.vivo && vista.fase === "ronda") {
          const atrasX = c.x - Math.sin(c.ang) * 1.1, atrasZ = c.z - Math.cos(c.ang) * 1.1;
          if (j.turbo) {
            for (let n = 0; n < 3; n++) chispas.emitir({ x: atrasX + al(-0.2, 0.2), y: 0.4, z: atrasZ + al(-0.2, 0.2), vx: -Math.sin(c.ang) * al(2, 5), vy: al(0, 1.5), vz: -Math.cos(c.ang) * al(2, 5), vida: al(0.2, 0.45), tam: al(0.3, 0.55), color: n ? "#fb923c" : "#fde047", roce: 2 });
          } else if (j.v > 5 && Math.random() < 0.25) {
            humo.emitir({ x: atrasX, y: 0.15, z: atrasZ, vy: 0.5, vida: 0.5, tam: 0.35, crece: 1.5, alfa: 0.22, color: "#e2e8f0" });
          }
        }
      }
      c.vivoAntes = j.vivo;
      c.sombra.visible = j.vivo && !enPodio;
      c.aroYo.visible = soyYo && j.vivo && !enPodio;
      if (c.aroYo.visible) {
        c.aroYo.material.opacity = 0.55 + Math.sin(t * 6) * 0.3;
        c.aroYo.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
      }
      c.llama.visible = j.turbo && !enPodio;
      c.llama.scale.setScalar(0.8 + Math.sin(t * 40) * 0.2);
      const conEstrella = (vista.fase === "finRonda" && vista.ganadorRonda === j.id) || (enPodio && lugar.get(j.id) === 0);
      if (conEstrella && !c.estrella.visible) fxConfeti(c.g.position.x, c.g.position.y + 2.5, c.g.position.z, 90);
      c.estrella.visible = conEstrella;
      c.estrella.rotation.y = t * 3;
      c.estrella.position.y = 2.9 + Math.sin(t * 4) * 0.12;
      c.m.update(dt);
      const e = aPantalla(c.g.position.x, c.g.position.y + 2.6, c.g.position.z);
      c.pantalla = e;
      c.etiqueta.hidden = demo || !e.delante || !c.g.visible || (!j.vivo && !enPodio);
      c.etiqueta.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -100%)`;
      c.etiqueta.classList.toggle("yo", soyYo);
    }
    for (const id of [...carros.keys()]) if (!presentes.has(id)) quitarCarro(id);

    // monedas
    const vivas = new Set();
    for (const m of enPodio ? [] : vista?.monedas ?? []) {
      vivas.add(m.id);
      let mesh = monedas.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(geoMoneda, matMoneda);
        mesh.rotation.z = Math.PI / 2;
        mesh.castShadow = true;
        mesh.userData.nace = t;
        mesh.userData.halo = new THREE.Mesh(geoHaloMoneda, matHaloMoneda);
        mesh.userData.halo.rotation.x = -Math.PI / 2;
        scene.add(mesh, mesh.userData.halo);
        monedas.set(m.id, mesh);
      }
      // nace con un saltito, y luego flota girando
      const e = Math.min(1, (t - mesh.userData.nace) * 3);
      mesh.scale.setScalar(e * (1 + (1 - e) * 0.6));
      mesh.position.set(m.x, 0.65 + Math.sin(t * 3 + m.id) * 0.12 + (1 - e) * 1.2, m.z);
      mesh.rotation.y = t * 3 + m.id;
      mesh.userData.halo.position.set(m.x, 0.03, m.z);
      mesh.userData.halo.scale.setScalar(e * (1 + Math.sin(t * 5 + m.id) * 0.12));
    }
    for (const [id, mesh] of monedas) {
      if (vivas.has(id)) continue;
      scene.remove(mesh, mesh.userData.halo);
      monedas.delete(id);
    }

    // los eventos nuevos se vuelven efectos
    for (const e of vista?.eventos ?? []) {
      if (e.n <= ultimoEvento) continue;
      if (e.tipo === "choque") {
        fxChoque(e.x, e.z, e.fuerza);
        for (const id of [e.a, e.b]) { const c = carros.get(id); if (c) c.golpe = 1; }
      } else if (e.tipo === "moneda") {
        const c = carros.get(e.id);
        if (c) fxMoneda(c);
      } else if (e.tipo === "turbo") {
        const c = carros.get(e.id);
        if (c) for (let n = 0; n < 10; n++) humo.emitir({ x: c.x - Math.sin(c.ang), y: 0.3, z: c.z - Math.cos(c.ang), vx: al(-1.5, 1.5), vy: al(0.3, 1.5), vz: al(-1.5, 1.5), vida: 0.6, tam: 0.5, crece: 1.4, alfa: 0.35, color: "#fed7aa" });
      }
    }
    ultimoEvento = Math.max(ultimoEvento, ...(vista?.eventos ?? []).map((e) => e.n), 0);
    // en el podio llueve confeti
    if (enPodio) for (let n = 0; n < 2; n++) confeti.emitir({ x: PODIO_X + al(-5, 5), y: al(7, 9), z: al(-3, 2), vx: al(-0.5, 0.5), vy: -1, vz: al(-0.5, 0.5), vida: 4, tam: al(0.07, 0.12), color: CONFETI[(Math.random() * CONFETI.length) | 0], grav: 1.5, roce: 0.8 });
    chispas.paso(dt);
    humo.paso(dt);
    confeti.paso(dt);
    for (let i = destellos.length - 1; i >= 0; i--) {
      const d = destellos[i];
      d.userData.t += dt;
      const f = d.userData.t / d.userData.max;
      d.scale.setScalar(1 + f * d.userData.escala * 3);
      d.material.opacity = 0.9 * (1 - f);
      if (f >= 1) { scene.remove(d); d.material.dispose(); destellos.splice(i, 1); }
    }

    // cámara: toda la pista en cuadro; en el podio, cerca; en el menú, de paseo
    const suave = 1 - Math.exp(-dt * 3);
    if (enPodio && !demo) {
      foco.lerp(v3.set(PODIO_X + 2, 1.4, -1), suave);
      const d = 11 * (camara.aspect < 1.2 ? 1.2 / camara.aspect : 1);
      camBase.lerp(v3.set(foco.x, foco.y + d * 0.42, foco.z + d * 0.9), suave);
    } else if (!vista || demo) {
      // el escaparate del menú: más cerca y girando despacio alrededor
      foco.lerp(v3.set(0, 0.5, 0), suave);
      const a = t * 0.1;
      camBase.lerp(v3.set(Math.sin(a) * 19, 11, Math.cos(a) * 19), suave);
    } else {
      foco.lerp(v3.set(0, 0, 0.6), suave);
      camBase.lerp(posicionQueEncuadra(radioVisto), suave);
    }
    sacudida *= Math.exp(-dt * 7);
    camara.position.set(camBase.x + al(-1, 1) * sacudida, camBase.y + al(-1, 1) * sacudida, camBase.z + al(-1, 1) * sacudida * 0.5);
    camara.lookAt(foco);
    renderer.render(scene, camara);
  }

  /** La cámara mira desde +z hacia el centro: pantalla → suelo es directo. */
  function aSuelo(derecha, arriba) {
    return { mx: derecha, mz: -arriba };
  }

  /** Dónde está en pantalla el carro de alguien (para los «+1» del HUD). */
  const posCarro = (id) => carros.get(id)?.pantalla ?? null;
  /** La foto de un personaje para las tarjetas (null si su cuerpo aún no cargó). */
  const retrato = (cara) => characterShot(data.looks.get(cara));

  return { pintar, aSuelo, posCarro, retrato, modelos, data, renderer, scene, camara };
}
