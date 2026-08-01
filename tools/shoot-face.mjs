// La cara PINTADA sobre la cabeza del modelo base, en varias expresiones.
//
// En este estilo de muñeco la cara no se modela: la geometría pone el mentón
// —que es lo que le da el carácter— y los ojos y la boca van en textura.
// Esto enseña si el reparto aguanta ese enfoque, y de paso si cambiar de
// expresión funciona, que es lo que hace falta al conversar de cerca.
//
// Uso: node tools/shoot-face.mjs [salida.png] [personaje]
import { chromium } from "playwright";

const out = process.argv[2] ?? "face.png";
const who = process.argv[3] ?? "giuli";
const VIEW = { width: 1500, height: 560 };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: VIEW });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });

const info = await page.evaluate(async ({ who, VIEW }) => {
  const THREE = window.__three;
  const base = window.__base;
  const face = window.__face;
  const recipe = window.__game.data.looks.get(who);

  document.body.innerHTML = "";
  const canvas = document.createElement("canvas");
  canvas.width = VIEW.width; canvas.height = VIEW.height;
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh";
  document.body.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setSize(VIEW.width, VIEW.height, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xece7f2);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const k = new THREE.DirectionalLight(0xfff0dd, 1.2); k.position.set(1, 4, 6); scene.add(k);

  const gltf = await base.loadBaseModel(`${document.baseURI}models/base.gltf`);
  const moods = ["neutral", "happy", "blink", "surprised", "annoyed", "talk"];
  const step = 1.0;

  moods.forEach((mood, i) => {
    const inst = base.instantiateBase(gltf, { height: 1.5 });
    base.applyBuild(inst.bones, { head: 1.8, width: 1.05, limbs: 0.86 });
    const head = inst.meshes.get("head");
    // Cada cabeza necesita SU geometría: las UV se reproyectan y compartirla
    // pondría la misma cara en todas.
    head.geometry = face.projectFaceUVs(head.geometry.clone());
    head.material = new THREE.MeshLambertMaterial({ map: face.faceTexture(recipe, mood) });
    for (const [role, mesh] of inst.meshes) {
      if (role !== "head") mesh.material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(role === "body" ? recipe.top?.color ?? "#8fa8bd" : recipe.skin ?? "#f0c9a8"),
      });
    }
    inst.root.position.x = (i - (moods.length - 1) / 2) * step;
    scene.add(inst.root);
  });

  const cam = new THREE.PerspectiveCamera(26, VIEW.width / VIEW.height, 0.1, 100);
  const width = moods.length * step;
  const hfov = 2 * Math.atan(Math.tan((26 * Math.PI) / 360) * (VIEW.width / VIEW.height));
  const dist = width / 2 / Math.tan(hfov / 2);
  cam.position.set(0, 1.28, dist);
  cam.lookAt(0, 1.28, 0);
  r.render(scene, cam);
  return { moods };
}, { who, VIEW });

await page.screenshot({ path: out });
await browser.close();
console.log("expresiones:", info.moods.join(" · "));
if (errors.length) console.log("ERRORES:\n" + errors.slice(0, 6).join("\n"));
