import * as THREE from "three";
import { Character3D } from "../entities/character3d.js";

/**
 * EL RETRATO DEL DIÁLOGO, EN 3D.
 *
 * Antes era una celda del pliego de píxeles ampliada x2.35. Con el piso y el
 * reparto ya en 3D cozy, esa esquina de la pantalla era lo único que quedaba
 * del juego anterior: al hablar con Gabo salía un muñeco pixelado al lado de
 * un Gabo modelado. Y peor: los que no tenían pliego (Recepción, la propia
 * jugadora en las réplicas) caían en `npc-camina`, una silueta gris sin cara.
 *
 * Aquí se monta el MISMO `Character3D` que anda por el piso, encuadrado de
 * pecho para arriba, y se le pasa el ánimo de la línea como expresión — que
 * es justo para lo que se hizo `face.js`. Nadie se queda sin cara: si el
 * hablante no está en el reparto, `looks.get()` devuelve la receta genérica.
 *
 * Un solo contexto WebGL extra, creado la primera vez que alguien habla y
 * reutilizado el resto de la partida. Solo dibuja mientras el diálogo está
 * abierto (`start()`/`stop()`); con el diálogo cerrado no gasta un fotograma.
 */

/** El ánimo que trae la línea del JSON, traducido a cara. */
const MOOD_TO_FACE = {
  neutral: "neutral",
  happy: "happy",
  angry: "annoyed",
  sad: "sad",
  surprised: "surprised",
  scared: "surprised",
  smug: "happy",
  tired: "sad",
};

/** Y a postura: el cuerpo también cuenta el ánimo, no solo la cara. */
const MOOD_TO_POSE = {
  angry: "shrug",
  scared: "scared",
  surprised: "scared",
};

const HEIGHT = 1.5;

export function createPortrait3D(host) {
  let renderer = null;
  let scene = null;
  let camera = null;
  let character = null;
  let recipe = null;
  let raf = 0;
  let last = 0;
  let running = false;

  function init() {
    if (renderer) return true;
    const canvas = document.createElement("canvas");
    canvas.className = "vn-portrait-canvas";
    host.appendChild(canvas);

    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      // Sin WebGL disponible el diálogo tiene que seguir funcionando: se queda
      // sin retrato, no sin conversación.
      canvas.remove();
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    // Luz cálida y frontal, la misma receta que el piso: la clave desde arriba
    // a la izquierda marca el mentón (que es lo que da el carácter en este
    // estilo) y el relleno evita que el otro lado se vaya a negro.
    scene.add(new THREE.AmbientLight(0xfff4e6, 1.5));
    const key = new THREE.DirectionalLight(0xfff0d4, 1.5);
    key.position.set(-2.2, 4, 3.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf0e6ff, 0.7);
    rim.position.set(2.6, 1.4, -2);
    scene.add(rim);

    camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
    return true;
  }

  /** Encuadre de busto: la cabeza arriba y el pecho abajo, mirando de frente. */
  function frame() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // El retrato es una franja alta y estrecha: si se encuadra por ancho, en
    // pantallas anchas la cabeza se sale por arriba. Se encuadra por ALTO y se
    // deja que el ancho sobre.
    const lookY = HEIGHT * 0.74;
    const fit = HEIGHT * 0.58; // media altura visible, de la cintura a la coronilla
    camera.position.set(0, lookY + HEIGHT * 0.05, fit / Math.tan((camera.fov * Math.PI) / 360) + 0.35);
    camera.lookAt(0, lookY, 0);
    camera.updateProjectionMatrix();
  }

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (character) character.update(dt);
    frame();
    renderer.render(scene, camera);
  }

  return {
    /**
     * Pone a alguien en el marco. `look` es la receta de `looks.get(nombre)`.
     * Devuelve false si no hay 3D disponible, para que quien llama vuelva al
     * pliego de píxeles.
     */
    show(look, mood = "neutral") {
      if (!look || !init()) return false;

      if (look !== recipe) {
        recipe = look;
        character?.dispose();
        character = new Character3D(look, { height: HEIGHT });
        // Ligeramente de tres cuartos: de frente del todo el muñeco se ve
        // plano, y es la vista en la que peor se lee el mentón.
        character.setHeading(0.34, 1);
        scene.add(character.object);
      }

      character.setExpression(MOOD_TO_FACE[mood] ?? "neutral");
      const pose = MOOD_TO_POSE[mood];
      character.setPose(pose ?? null);
      // Un par de fotogramas para que la pose no entre a medio camino en el
      // primer dibujo, que se ve como un tirón al abrirse la caja.
      for (let i = 0; i < 8; i++) character.update(0.05);
      return true;
    },

    /** Boca abierta mientras escribe la máquina de escribir. */
    setTalking(talking, mood = "neutral") {
      if (!character) return;
      character.setExpression(talking ? "talk" : MOOD_TO_FACE[mood] ?? "neutral");
    },

    start() {
      if (!renderer || running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },

    dispose() {
      this.stop();
      character?.dispose();
      renderer?.dispose();
      renderer?.domElement.remove();
      renderer = null;
      character = null;
      recipe = null;
    },
  };
}
