import { CharacterSprite } from "./sprite.js";
import { screenToGround, facingFromGround } from "../scene/iso.js";
import { WORLD_SCALE as S } from "../scene/config.js";

// The protagonist. Input is interpreted in *screen* space and then rotated
// into world space, so W/A/S/D (and the joystick) move her up/left/down/right
// as seen on screen rather than diagonally across the isometric view.
export class Player {
  constructor(sheet, { x = 0, z = 12.6, radius = 0.26 * S, height = 1.45 * S, speed = 4.4 } = {}) {
    this.speed = speed * S;
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

  /** Screen-space intent, from either the keyboard or the on-screen stick. */
  _readInput() {
    const tx = this.touchAxis.x;
    const tz = this.touchAxis.z;
    if (Math.hypot(tx, tz) > 0.08) {
      // Joystick: +z on the pad is "down the screen".
      return { right: tx, up: -tz };
    }
    let right = 0;
    let up = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) up += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) up -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) right -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) right += 1;
    return { right, up };
  }

  update(dt, world) {
    const { right, up } = this._readInput();
    const magnitude = Math.min(Math.hypot(right, up), 1);
    let moving = false;

    if (magnitude > 0.001) {
      const { dx, dz } = screenToGround(right, up);
      const len = Math.hypot(dx, dz) || 1;
      const speedMul = this.isPretending ? 0.45 : 1;
      const step = this.speed * speedMul * magnitude * dt;
      this.position.x += (dx / len) * step;
      this.position.z += (dz / len) * step;
      this.facing = facingFromGround(dx, dz, this.facing);
      moving = true;
    }

    if (world) world.resolveCircle(this.position, this.radius);

    // Standing still while "working" still shows the idle pose, not a walk.
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
