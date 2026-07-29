import * as THREE from "three";

// Placeholder 2D character: a billboard sprite that always faces the
// camera, exactly the shape real pixel-art sprite sheets will fill in
// later. Movement collides against the office's collision world, and the
// entity carries the state flags (hiding / pretending / doing an activity)
// the boss AI and suspicion meter read every frame.
export class Player {
  constructor({ color = 0x7fdca0, x = 0, z = 12.6, radius = 0.32 } = {}) {
    this.speed = 4.6;
    this.radius = radius;
    this.position = { x, z };
    this.keys = new Set();

    this.isHiding = false;
    this.isPretending = false;
    this.isDoingActivity = false;

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
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
    this.sprite.position.set(x, 0.82, z);

    this._onKeyDown = (e) => this.keys.add(e.key.toLowerCase());
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  update(dt, world) {
    let dx = 0;
    let dz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) dz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;

    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      const speedMul = this.isPretending ? 0.5 : 1;
      this.position.x += (dx / len) * this.speed * speedMul * dt;
      this.position.z += (dz / len) * this.speed * speedMul * dt;
    }

    if (world) world.resolveCircle(this.position, this.radius);

    this.sprite.position.x = this.position.x;
    this.sprite.position.z = this.position.z;
    this.sprite.material.color.setScalar(this.isHiding ? 0.55 : 1);
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
