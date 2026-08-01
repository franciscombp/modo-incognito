import { Character3D } from "./character3d.js";
import { WORLD_SCALE as S } from "../scene/config.js";

// Background coworker. Mostly set dressing, but they also block the boss's
// line of sight and one of them anchors the "conversar con colegas" activity.
// A few wander a short beat so the floor doesn't look frozen.
export class NPC {
  constructor(look, { id, x, z, radius = 0.28 * S, height = 1.4 * S, facing = "south", sway = 0 } = {}) {
    this.id = id;
    this.position = { x, z };
    this.home = { x, z };
    this.radius = radius;
    this.sway = sway * S;

    this.sprite = new Character3D(look, { height });
    this.sprite.setFacing(facing);
    this.sprite.setPosition(x, z);
    this._phase = Math.random() * Math.PI * 2;
  }

  get object3D() {
    return this.sprite.object;
  }

  update(dt, t) {
    if (this.sway > 0) {
      // A slow shuffle left and right in place — enough motion to read as
      // "someone is working here" without needing pathfinding.
      const offset = Math.sin(t * 0.6 + this._phase) * this.sway;
      const prev = this.position.x;
      this.position.x = this.home.x + offset;
      this.sprite.setFacing(this.position.x >= prev ? "east" : "west");
      this.sprite.setMoving(Math.abs(this.position.x - prev) > 0.0005);
      this.sprite.setPosition(this.position.x, this.position.z);
    }
    this.sprite.update(dt);
  }
}
