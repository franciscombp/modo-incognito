// Comparativa: el muñeco procedural contra el cuerpo base importado, con
// varios grados de "chibificado".
//
// Existe para tomar UNA decisión con la imagen delante en vez de a ojo:
// ¿compensa cambiar el cuerpo que generamos por el modelo de fuera, y con qué
// proporciones? Sin morph targets, chibificar es escalar el hueso de la
// cabeza, y una cabeza pensada para medir un sexto del cuerpo agrandada al
// triple puede leerse rara. Esto lo enseña.
//
// Uso: node tools/shoot-base.mjs [salida.png] [personaje]
import { chromium } from "playwright";

const out = process.argv[2] ?? "base.png";
const who = process.argv[3] ?? "giuli";
// `close` encuadra cabeza y hombros, que es como se ven en un diálogo. Es el
// único encuadre en el que se decide si una cara aguanta: de cuerpo entero
// todas las cabezas parecen aceptables.
const close = process.argv[4] === "close";
const VIEW = close ? { width: 1500, height: 620 } : { width: 1500, height: 760 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: VIEW });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CONSOLE: " + m.text());
});
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

const info = await page.evaluate(
  async ({ who, VIEW, close }) => {
    const THREE = window.__three;
    const { Character3D } = window.__char3d;
    const base = window.__base;
    const looks = window.__game.data.looks;
    const recipe = looks.get(who);

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
    scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    const key = new THREE.DirectionalLight(0xfff0dd, 1.35);
    key.position.set(3, 6, 5);
    scene.add(key);

    const H = 1.5;
    const step = H * 0.95;
    const stats = {};

    // 1) El de siempre, como referencia de a dónde llegamos.
    const mine = new Character3D(recipe, { height: H });
    mine.setPosition((close ? -0.5 : -1.5) * step, 0);
    mine.setHeading(0.25, 1);
    for (let f = 0; f < 20; f++) mine.update(0.05);
    scene.add(mine.object);

    // 2..4) El base, tal cual y chibificado a dos alturas de cabeza.
    const gltf = await base.loadBaseModel(`${document.baseURI}models/base.gltf`);
    stats.bones = [];
    gltf.scene.traverse((o) => {
      if (o.isBone) stats.bones.push(o.name);
    });

    // De cerca solo se comparan los dos candidatos de verdad; con cuatro en
    // fila las caras salen tan pequeñas que no se decide nada.
    const variants = close
      ? [{ head: 1.8, width: 1.05, limbs: 0.86, x: 0.5 }]
      : [
          { head: 1.0, width: 1, limbs: 1, x: -0.5 },
          { head: 1.8, width: 1.05, limbs: 0.86, x: 0.5 },
          { head: 2.4, width: 1.1, limbs: 0.74, x: 1.5 },
        ];
    stats.variants = [];
    for (const v of variants) {
      const inst = base.instantiateBase(gltf, { height: H });
      base.paintBase(inst.meshes, { skin: recipe.skin ?? "#f0c9a8", body: recipe.top?.color ?? "#8fa8bd" });
      base.applyBuild(inst.bones, v);
      inst.root.position.x = v.x * step;
      inst.root.rotation.y = Math.atan2(0.25, 1);
      scene.add(inst.root);
      stats.variants.push({ head: v.head, meshes: [...inst.meshes.keys()], scale: +inst.scale.toFixed(4) });
    }

    const aspect = VIEW.width / VIEW.height;
    const fov = 30;
    const pitch = ((close ? 4 : 14) * Math.PI) / 180;
    const width = (close ? 1.9 : 4) * step;
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
    const dist = width / 2 / Math.tan(hfov / 2) + H * 0.2;
    const lookY = close ? H * 0.86 : H * 0.5;
    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 100);
    camera.position.set(0, lookY + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
    camera.lookAt(0, lookY, 0);
    renderer.render(scene, camera);
    return stats;
  },
  { who, VIEW, close }
);

await page.screenshot({ path: out });
await browser.close();

console.log("De izquierda a derecha: procedural · base tal cual · cabeza x1.8 · cabeza x2.4");
console.log("huesos tras renombrar:", info.bones?.filter((b) => /^(Hips|Spine|Chest|Neck|Head|Left|Right)/.test(b)).join(", "));
console.log("mallas del base:", info.variants?.[0]?.meshes.join(", "), "· escala:", info.variants?.[0]?.scale);
if (errors.length) console.log("ERRORES:\n" + errors.slice(0, 8).join("\n"));
