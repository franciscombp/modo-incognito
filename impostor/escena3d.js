/**
 * EL PISO EN 3D: el MISMO decorado y los MISMOS muñecos del juego grande.
 *
 * Nada de aquí es una copia: se importan los módulos reales del motor
 * (`buildOffice`, `Character3D`, `DioramaCamera`, la luz y las medallas), con
 * el mismo criterio que los builders de `creador/` — así un mueble que se
 * mueve en el piso o una receta que cambia en characters3d.json llega sola
 * al spin-off.
 *
 * Lo que este módulo NO hace es jugar: pinta la VISTA que le llega
 * (`sim.vistaPara`) y le presta a la partida la FÍSICA del piso (`fisica`),
 * para que se choque con las mesas que se ven.
 *
 * Unidades: la partida va en unidades de PLANO (las del JSON); el 3D en
 * unidades de mundo (× WORLD_SCALE). La conversión vive solo aquí.
 */
import * as THREE from "three";
import { loadGameData, preloadBaseModels } from "../src/data/loader.js";
import { setActiveScene } from "../src/scene/floorplan.js";
import { buildOffice } from "../src/scene/builder.js";
import { createCollisionWorld } from "../src/scene/collision.js";
import { buildNavmesh } from "../src/scene/navmesh.js";
import { createWorldLighting } from "../src/scene/lighting.js";
import { skyTexture, ATMOSPHERE } from "../src/scene/cozy.js";
import { DioramaCamera } from "../src/scene/camera.js";
import { screenToGround } from "../src/scene/iso.js";
import { createBeacon, updateBeacons } from "../src/scene/beacons.js";
import { Character3D } from "../src/entities/character3d.js";
import { resolveQuality } from "../src/game/settings.js";
import { WORLD_SCALE as S } from "../src/scene/config.js";

const ALTURA = 1.45 * S;

export async function crearEscena3D(canvas, capaEtiquetas) {
  const data = await loadGameData();
  const prep = data.scenes.get(data.levels[0].scene);
  setActiveScene(prep);
  // Los cuerpos esculpidos (.glb) se descargan aparte: el piso arranca ya
  // y cada muñeco cambia a su cuerpo de verdad en cuanto llega.
  const modelos = preloadBaseModels(data.looks);

  const calidad = resolveQuality();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, calidad.maxPixelRatio ?? 2));
  renderer.shadowMap.enabled = calidad.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(new THREE.Color(ATMOSPHERE.fog), 60, 190);
  createWorldLighting(scene, calidad, S);

  const world = createCollisionWorld();
  const oficina = buildOffice(scene, world);
  // Las medallas del juego grande dicen «aquí puedes fingir / esconderte»:
  // aquí esas reglas no existen. Se apagan y se ponen las nuestras.
  if (oficina.markerGroup) oficina.markerGroup.visible = false;
  const navmesh = buildNavmesh(world, { radius: 0.3 * S });

  const view = new DioramaCamera(1);
  const camara = view.camera;

  function ajustar() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    view.setAspect(w / h);
  }
  addEventListener("resize", ajustar);
  ajustar();

  /* ------------------------- la física, prestada ------------------------- */
  const fisica = {
    bloqueado: (x, z) => !navmesh.isWalkable(x * S, z * S),
    empujar: (p, r) => {
      const w = { x: p.x * S, z: p.z * S };
      world.resolveCircle(w, r * S);
      p.x = w.x / S;
      p.z = w.z / S;
    },
    ruta: (a, b) => navmesh.path({ x: a.x * S, z: a.z * S }, { x: b.x * S, z: b.z * S })
      ?.map((p) => ({ x: p.x / S, z: p.z / S })) ?? null,
    pegar: (x, z) => {
      const p = navmesh.snap(x * S, z * S);
      return { x: p.x / S, z: p.z / S };
    },
    recta: (a, b) => !world.pathBlocked({ x: a.x * S, z: a.z * S }, { x: b.x * S, z: b.z * S }, 0.3 * S),
  };

  /* ------------------------------ los muñecos ------------------------------ */
  const munecos = new Map(); // id → { c, aro, etiqueta, fantasma }
  const suaves = new Map();

  const aroDe = (color) => {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.32 * S, 0.42 * S, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    m.renderOrder = 2;
    return m;
  };

  function muneco(j) {
    let m = munecos.get(j.id);
    if (m) return m;
    const c = new Character3D(data.looks.get(j.cara), { height: ALTURA });
    scene.add(c.object);
    const aro = aroDe(j.color);
    scene.add(aro);
    const etiqueta = document.createElement("div");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = j.nombre;
    capaEtiquetas.append(etiqueta);
    m = { c, aro, etiqueta, fantasma: false };
    munecos.set(j.id, m);
    return m;
  }

  /**
   * Un fantasma se ve a medias. Clona el material (los .glb lo comparten
   * entre muñecos) y se repasa cada cuadro: el cuerpo de un .glb puede
   * llegar DESPUÉS de morir, y entonces vendría opaco.
   */
  function hacerFantasma(m) {
    m.c.object.traverse((o) => {
      if (!o.material || o.userData.fantasma) return;
      o.userData.fantasma = true;
      o.material = Array.isArray(o.material) ? o.material.map((x) => x.clone()) : o.material.clone();
      for (const mat of [].concat(o.material)) { mat.transparent = true; mat.opacity = 0.35; mat.depthWrite = false; }
    });
  }

  /* ------------- los gafetes: el muñeco tirado boca abajo ------------- */
  const cuerpos = new Map(); // id de la víctima → grupo
  function cuerpo(b) {
    let g = cuerpos.get(b.id);
    if (g) return g;
    g = new THREE.Group();
    const c = new Character3D(data.looks.get(b.cara), { height: ALTURA });
    // tumbado: se gira el muñeco entero sobre el suelo
    c.object.rotation.x = -Math.PI / 2;
    c.object.position.y = 0.18 * S;
    g.add(c.object);
    const gafete = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * S, 0.02 * S, 0.3 * S),
      new THREE.MeshStandardMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.4 }),
    );
    gafete.position.set(0.55 * S, 0.02 * S, 0.2 * S);
    gafete.rotation.y = 0.5;
    g.add(gafete);
    g.add(aroDe("#ef4444"));
    g.userData.c = c;
    g.position.set(b.x * S, 0, b.z * S);
    g.rotation.y = Math.random() * Math.PI * 2;
    scene.add(g);
    cuerpos.set(b.id, g);
    return g;
  }

  /* ----------------------- tareas y campana ----------------------- */
  let medallas = null; // se montan con el mapa de la partida
  const grupoMedallas = new THREE.Group();
  scene.add(grupoMedallas);
  let campana = null;

  function montarTareas(mapa) {
    if (medallas) return;
    medallas = new Map();
    for (const t of mapa.tareas) {
      const icono = t.id.startsWith("fingir_") ? undefined : t.icon;
      const s = createBeacon("activity", { x: t.x * S, z: t.z * S, icon: icono });
      s.visible = false;
      grupoMedallas.add(s);
      medallas.set(t.id, s);
    }
    // la campana: un botón rojo de verdad sobre un pedestal
    campana = new THREE.Group();
    const pie = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * S, 0.28 * S, 0.8 * S, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a3844 }),
    );
    pie.position.y = 0.4 * S;
    const boton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2 * S, 0.2 * S, 0.12 * S, 24),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.6 }),
    );
    boton.position.y = 0.86 * S;
    campana.add(pie, boton);
    campana.position.set(mapa.campana.x * S, 0, mapa.campana.z * S);
    scene.add(campana);
  }

  /* ------------------------------ por cuadro ------------------------------ */
  const v3 = new THREE.Vector3();
  const derecha = new THREE.Vector3();
  let t = 0;

  const aPantalla = (x, y, z) => {
    v3.set(x, y, z).project(camara);
    return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, delante: v3.z < 1 };
  };

  function pintar(vista, mapa, dt) {
    t += dt;
    montarTareas(mapa);
    // Los rótulos de zona solo en el menú (el plano visto desde lejos): en
    // partida tapan justo lo que hay que mirar, igual que en el juego grande.
    for (const r of oficina.roomLabels ?? []) r.visible = !vista;
    const k = 1 - Math.exp(-dt * 14);
    const presentes = new Set();

    for (const j of vista?.jugadores ?? []) {
      presentes.add(j.id);
      const m = muneco(j);
      let p = suaves.get(j.id);
      if (!p || Math.hypot(p.x - j.x, p.z - j.z) > 4) {
        p = { x: j.x, z: j.z };
        suaves.set(j.id, p);
      }
      const dx = (j.x - p.x) * k, dz = (j.z - p.z) * k;
      p.x += dx; p.z += dz;
      const vel = Math.hypot(dx, dz) / Math.max(dt, 1e-4);
      m.c.setPosition(p.x * S, p.z * S);
      m.aro.position.set(p.x * S, 0.02, p.z * S);
      if (vel > 0.4) m.c.setHeading(dx, dz);
      m.c.setMoving(vel > 0.4);
      m.c.setPose(j.usando ? "work" : null);
      if (!j.vivo) hacerFantasma(m);
      m.c.object.visible = true;
      m.aro.visible = j.vivo;
      m.c.update(dt);
      const e = aPantalla(p.x * S, ALTURA * 1.18, p.z * S);
      m.etiqueta.hidden = !e.delante;
      m.etiqueta.style.transform = `translate(${e.x}px, ${e.y}px) translate(-50%, -100%)`;
      m.etiqueta.classList.toggle("soplon", vista.yo?.rol === "soplon" && j.rol === "soplon");
      m.etiqueta.classList.toggle("fantasma", !j.vivo);
    }
    for (const [id, m] of munecos) {
      if (presentes.has(id)) continue;
      m.c.object.visible = false;
      m.aro.visible = false;
      m.etiqueta.hidden = true;
    }

    // gafetes
    const vivos = new Set((vista?.cuerpos ?? []).map((b) => b.id));
    for (const b of vista?.cuerpos ?? []) cuerpo(b).userData.c.update(dt);
    for (const [id, g] of cuerpos) {
      if (vivos.has(id)) continue;
      scene.remove(g);
      g.userData.c.dispose?.();
      cuerpos.delete(id);
    }

    // medallas: solo las TUYAS, y solo las pendientes (como en Among Us)
    const mias = new Map((vista?.yo?.tareas ?? []).map((x) => [x.id, x]));
    for (const [id, s] of medallas) {
      const mia = mias.get(id);
      s.visible = !!mia && !mia.hecha && vista?.fase === "juego";
    }
    updateBeacons(grupoMedallas, t);
    if (campana) campana.children[1].material.emissiveIntensity = 0.45 + Math.sin(t * 4) * 0.25;

    // cámara: sigue a quien juega; en los menús, la cafetería
    const yo = vista?.yo && suaves.get(vista.yo.id);
    const foco = yo ? { x: yo.x * S, z: yo.z * S } : { x: mapa.salida.x * S, z: mapa.salida.z * S };
    view.setFraming(yo ? 1 : 0.55);
    view.update(dt, foco);
    renderer.render(scene, camara);

    // radio de visión en píxeles, para la niebla del HUD
    let niebla = null;
    if (yo && vista.yo.vivo && vista.fase === "juego") {
      const c = aPantalla(yo.x * S, 0.8 * S, yo.z * S);
      derecha.setFromMatrixColumn(camara.matrixWorld, 0);
      const r = vista.yo.vision * S;
      const b = aPantalla(yo.x * S + derecha.x * r, 0.8 * S, yo.z * S + derecha.z * r);
      niebla = { x: c.x, y: c.y, r: Math.hypot(b.x - c.x, b.y - c.y) };
    }
    return { niebla, aPantalla: (x, z) => aPantalla(x * S, 0, z * S) };
  }

  /** WASD/palanca vienen en ejes de PANTALLA; el piso está girado. */
  function aSuelo(derechaPantalla, arribaPantalla) {
    const { dx, dz } = screenToGround(derechaPantalla, arribaPantalla);
    return { mx: dx, mz: dz };
  }

  return { fisica, pintar, aSuelo, modelos, data, renderer, scene, camara };
}
