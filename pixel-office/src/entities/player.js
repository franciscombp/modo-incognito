import * as THREE from "three";

// Placeholder 2D character: a billboard sprite that always faces the
// camera, exactly the shape real pixel-art sprite sheets will fill in
// later. Movement is basic WASD/arrow-key ground movement for now — no
// game mechanics yet, this only proves the structure/scale works.
export class Player {
  constructor({ color = 0x7fdca0, footprint = [-15, 15, -12, 9] } = {}) {
    this.speed = 5.5;
    this.bounds = footprint; // [minX, maxX, minZ, maxZ] in local (x, -z) space
    this.keys = new Set();

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    // Simple placeholder silhouette: head + body, swap for a real
    // spritesheet texture later.
    ctx.fillStyle = "#00000000";
    ctx.clearRect(0, 0, 64, 96);
    ctx.fillStyle = "#2b2f38";
    ctx.beginPath();
    ctx.ellipse(32, 90, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(16, 30, 32, 48);
    ctx.fillStyle = "#f2caa0";
    ctx.beginPath();
    ctx.arc(32, 18, 16, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(1.1, 1.65, 1);
    this.sprite.position.set(0, 0.82, 12.6);

    this._onKeyDown = (e) => this.keys.add(e.key.toLowerCase());
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  update(dt) {
    let dx = 0;
    let dz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) dz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      dx = (dx / len) * this.speed * dt;
      dz = (dz / len) * this.speed * dt;
      const [minX, maxX, minZ, maxZ] = this.bounds;
      this.sprite.position.x = THREE.MathUtils.clamp(this.sprite.position.x + dx, minX, maxX);
      this.sprite.position.z = THREE.MathUtils.clamp(this.sprite.position.z + dz, minZ, maxZ);
    }
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
