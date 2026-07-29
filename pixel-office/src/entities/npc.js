import * as THREE from "three";

// Background coworker: mostly a static billboard that blocks the boss's
// line of sight, with a small idle bob so the office doesn't feel frozen.
// One of them (the `chat` station's npc) is also what the "conversar con
// colegas" activity is anchored to.
export class NPC {
  constructor({ x, z, color = 0xd8c39a, radius = 0.32 }) {
    this.position = { x, z };
    this.radius = radius;

    const canvas = document.createElement("canvas");
    canvas.width = 56;
    canvas.height = 88;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#00000000";
    ctx.clearRect(0, 0, 56, 88);
    ctx.fillStyle = "#2b2f38";
    ctx.beginPath();
    ctx.ellipse(28, 82, 18, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillRect(13, 26, 30, 44);
    ctx.fillStyle = "#e3b489";
    ctx.beginPath();
    ctx.arc(28, 16, 15, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(1, 1.55, 1);
    this.sprite.position.set(x, 0.78, z);
    this._bobOffset = Math.random() * Math.PI * 2;
  }

  update(t) {
    this.sprite.position.y = 0.78 + Math.sin(t * 1.4 + this._bobOffset) * 0.02;
  }
}
