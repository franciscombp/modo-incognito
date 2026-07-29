import { CharacterSprite } from "./sprite.js";

// Top-down RPG player. Cardinal direction movement (up/down/left/right).
export class Player {
  constructor(sheet, { x = 0, z = 12.6, radius = 0.26, height = 1.45 } = {}) {
    this.speed = 4.4;
    this.radius = radius;
    this.position = { x, z };
    this.keys = new Set();
    this.touchAxis = { x: 0, z: 0 };

    this.isHiding = false;
    this.isPretending = false;
    this.isDoingActivity = false;
    this.facing = "south";

    this.sprite = new CharacterSprite(sheet, { height });
    this.sprite.setPosition(x, z);

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get object3D() {
    return this.sprite.object;
  }

  /** Read input as cardinal directions. */
  _readInput() {
    const tx = this.touchAxis.x;
    const tz = this.touchAxis.z;
    if (Math.hypot(tx, tz) > 0.08) {
      return { dx: tx, dz: -tz };
    }
    let dx = 0;
    let dz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) dz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) dz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) dx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) dx += 1;
    return { dx, dz };
  }

  update(dt, world) {
    const { dx, dz } = this._readInput();
    const magnitude = Math.min(Math.hypot(dx, dz), 1);
    let moving = false;

    if (magnitude > 0.001) {
      const speedMul = this.isPretending ? 0.45 : 1;
      const step = this.speed * speedMul * magnitude * dt;
      this.position.x += dx * step;
      this.position.z += dz * step;

      // Update facing based on movement direction
      if (Math.abs(dx) > Math.abs(dz)) {
        this.facing = dx > 0 ? "east" : "west";
      } else {
        this.facing = dz > 0 ? "south" : "north";
      }
      moving = true;
    }

    if (world) world.resolveCircle(this.position, this.radius);

    this.sprite.setFacing(this.facing);
    this.sprite.setMoving(moving && !this.isPretending);
    this.sprite.setPosition(this.position.x, this.position.z);
    this.sprite.setTint(this.isHiding ? 0.6 : 1);
    this.sprite.update(dt);
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
