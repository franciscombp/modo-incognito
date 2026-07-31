// Retrato de grupo del reparto 3D: monta cada receta de characters3d.json y
// las fotografía en fila, para ver de un vistazo si alguien salió deforme.
//
// El diff de una receta no dice nada ("¿#6b4526 es un afro creíble?"), y en
// una captura del juego los personajes salen a tamaño hormiga. Esto es lo que
// hay que mirar después de tocar characters3d.json o character3d.js.
//
// Uso:
//   node tools/shoot-cast.mjs salida.png                 todo el reparto
//   node tools/shoot-cast.mjs salida.png gabo,giuli      solo esos
//   node tools/shoot-cast.mjs salida.png poses:giuli     un personaje, sus 8 poses
//   node tools/shoot-cast.mjs salida.png front:giuli     uno grande y de frente
import { chromium } from "playwright";

const out = process.argv[2] ?? "cast.png";
const arg = process.argv[3] ?? "";
const posesOf = arg.startsWith("poses:") ? arg.slice(6) : null;
// La vista de frente y a media altura es la única en la que se juzga una
// cara. La cámara del juego mira desde arriba y a esa distancia da igual
// cómo sean los ojos — pero de cerca es lo único que se mira.
const frontOf = arg.startsWith("front:") ? arg.slice(6) : null;
const only = !posesOf && !frontOf && arg ? arg.split(",") : null;

const VIEW = frontOf
  ? { width: 900, height: 900 }
  : { width: 1400, height: posesOf ? 520 : 460 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: VIEW });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

const shown = await page.evaluate(
  ({ only, posesOf, frontOf, VIEW }) => {
    const THREE = window.__three;
    const { Character3D } = window.__char3d;
    const looks = window.__game.data.looks;

    document.body.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.width = VIEW.width;
    canvas.height = VIEW.height;
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh";
    document.body.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(VIEW.width, VIEW.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xece7f2);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dd, 1.4);
    key.position.set(3, 6, 5);
    scene.add(key);

    const ALL_POSES = ["work", "coffee", "eat", "movie", "phone", "scared", "shrug", "sleep"];
    const H = 1.5;
    const step = H * 1.15;

    // Dos modos: la fila del reparto, o un mismo personaje repetido en todas
    // sus poses (que es como se ve si una pose quedó rota).
    let labels;
    let build;
    if (frontOf) {
      labels = [frontOf];
      build = (name) => ({ look: looks.get(name), pose: null });
    } else if (posesOf) {
      labels = ALL_POSES;
      build = (pose) => ({ look: looks.get(posesOf), pose });
    } else {
      labels = only ?? Object.keys(looks.characters).filter((n) => n !== "generic");
      const spread = [null, "coffee", "phone", "work", "shrug", "scared", "sleep", "eat"];
      build = (name, i) => ({ look: looks.get(name), pose: spread[i % spread.length] });
    }

    labels.forEach((label, i) => {
      const { look, pose } = build(label, i);
      const c = new Character3D(look, { height: H });
      c.setPosition((i - (labels.length - 1) / 2) * step, 0);
      c.setHeading(0.35, 1);
      if (pose) c.setPose(pose);
      // Se deja correr la animación: una pose que solo se ve bien en su primer
      // fotograma es exactamente el fallo que esto tiene que cazar.
      for (let f = 0; f < 40; f++) c.update(0.05);
      scene.add(c.object);
    });

    // Con una cámara a la altura de los ojos, todo lo que un brazo hace hacia
    // delante queda escorzado y parece que la pose no se mueve — se afinaron
    // poses enteras contra una vista que en el juego no ve nadie.
    const aspect = VIEW.width / VIEW.height;
    const fov = 30;
    // MISMA cámara que el juego (picada 44°, ver CAMERA_PRESET), salvo en el
    // modo `front:`, que baja a la altura del pecho porque es la única vista
    // en la que se puede juzgar una cara.
    const pitch = ((frontOf ? 8 : 44) * Math.PI) / 180;
    const width = labels.length * step;
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    const dist = (frontOf ? H * 2.1 : width / 2 / Math.tan(hfov / 2) + H);
    const lookY = frontOf ? H * 0.72 : H * 0.5;
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    camera.position.set(0, lookY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
    return labels;
  },
  { only, posesOf, frontOf, VIEW }
);

await page.screenshot({ path: out });
await browser.close();
console.log(`${posesOf ? `poses de ${posesOf}` : "reparto"}: ${shown.join(", ")}`);
if (errors.length) console.log("ERRORES:\n" + errors.slice(0, 8).join("\n"));
