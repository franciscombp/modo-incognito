import * as THREE from "three";
import { cameraDirection, groundToScreen } from "./iso.js";
import { footprint } from "./floorplan.js";
import { CAMERA_PRESET, WORLD_SCALE as S } from "./config.js";

// Oblique "diorama" camera: a narrow-FOV perspective camera parked high at a
// fixed yaw/pitch. The angle never changes — only the distance and the point
// it centres on — which is what gives the JRPG miniature-set feeling while
// keeping the floor readable.
//
// A single `framing` value in [0, 1] drives everything:
//   0 -> pulled back far enough to read the whole plan
//   1 -> the follow framing from CAMERA_PRESET, tracking the player
// Anything in between blends distance and look-at target, so wheel/pinch
// zoom feels continuous rather than snapping between two modes.

const DIR = cameraDirection();

/** Screen-space bounding box of the whole floor, used to frame the plan. */
function floorScreenExtents() {
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const [x, z] of footprint) {
    const { right, up } = groundToScreen(x, z);
    minR = Math.min(minR, right);
    maxR = Math.max(maxR, right);
    minU = Math.min(minU, up);
    maxU = Math.max(maxU, up);
  }
  return {
    width: maxR - minR,
    height: maxU - minU + 3 * S, // headroom for wall tops and floating labels
    centerRight: (minR + maxR) / 2,
    centerUp: (minU + maxU) / 2,
  };
}

/** World-space ground point at the centre of the floor's screen bounds. */
function floorCenter() {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of footprint) {
    sx += x;
    sz += z;
  }
  return new THREE.Vector3(sx / footprint.length, 0, sz / footprint.length);
}

export class DioramaCamera {
  constructor(aspect) {
    this.camera = new THREE.PerspectiveCamera(CAMERA_PRESET.fov, aspect, 0.5 * S, 400 * S);
    this.followDistance = CAMERA_PRESET.distance * S;
    this.center = floorCenter();
    this.target = this.center.clone();
    this.desired = new THREE.Vector3();

    // Start showing the whole plan on a wide screen; a phone in portrait
    // can't read it usefully, so it starts closer to the player instead.
    this.framing = aspect >= 1.15 ? 0 : 0.75;
    this.setAspect(aspect);
    this._apply();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.overviewDistance = this._fitDistance(aspect);
  }

  /** Distance at which the entire footprint fits inside the frustum. */
  _fitDistance(aspect) {
    const e = floorScreenExtents();
    const halfFov = THREE.MathUtils.degToRad(CAMERA_PRESET.fov / 2);
    const byHeight = e.height / 2 / Math.tan(halfFov);
    const byWidth = e.width / 2 / (Math.tan(halfFov) * Math.max(aspect, 0.4));
    return Math.max(byHeight, byWidth) * 1.06;
  }

  /** True once the view is tight enough that it should track the player. */
  get isFollowing() {
    return this.framing > 0.12;
  }

  /** `delta` in framing units; positive zooms in. */
  zoomBy(delta) {
    this.framing = THREE.MathUtils.clamp(this.framing + delta, 0, 1);
  }

  setFraming(value) {
    this.framing = THREE.MathUtils.clamp(value, 0, 1);
  }

  /** Follow the player (or stay parked on the plan) for one frame. */
  update(dt, playerPos) {
    const t = this.framing;
    if (this.isFollowing) this.desired.set(playerPos.x, 0, playerPos.z);
    else this.desired.copy(this.center);

    // Blend toward the player as we zoom in, so the pull-in reads as one
    // continuous move instead of the target teleporting.
    this.desired.lerpVectors(this.center, this.desired, THREE.MathUtils.smoothstep(t, 0.08, 0.55));

    const lerp = 1 - Math.pow(1 - CAMERA_PRESET.followLerp, Math.max(dt, 0.0001) * 60);
    this.target.lerp(this.desired, lerp);
    this._apply();
  }

  _apply() {
    const zoomMul = THREE.MathUtils.lerp(
      1 / CAMERA_PRESET.zoomMin,
      1 / CAMERA_PRESET.zoomMax,
      this.framing
    );
    const distance = THREE.MathUtils.lerp(
      this.overviewDistance,
      this.followDistance * zoomMul,
      THREE.MathUtils.smoothstep(this.framing, 0, 1)
    );

    this.camera.position.set(
      this.target.x + DIR.x * distance,
      DIR.y * distance,
      this.target.z + DIR.z * distance
    );
    this.lookAt = this.target.clone().setY(CAMERA_PRESET.lookAtYOffset * S);
    this.camera.lookAt(this.lookAt);
  }
}
