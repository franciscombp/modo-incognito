import * as THREE from "three";
import { subscribeCameraSettings } from "./cameraSettings.js";

// Screen<->ground conversions for the oblique diorama camera.
//
// The camera orbits its target at a yaw/pitch the player can retune live, so
// the mapping between "up on the screen" and "away in the world" is a plain
// rotation by the current yaw. Deriving it from the live settings — instead
// of a hard-coded 45deg isometric — means turning the camera can never leave
// the controls pointing somewhere else than the view.

let cosY = 1;
let sinY = 0;
let viewSlope = 1;
let dir = new THREE.Vector3(0, 1, 0);

subscribeCameraSettings((s) => {
  const yaw = THREE.MathUtils.degToRad(s.yawDeg);
  const pitch = THREE.MathUtils.degToRad(s.pitchDeg);
  cosY = Math.cos(yaw);
  sinY = Math.sin(yaw);
  viewSlope = Math.sin(pitch);
  const horizontal = Math.cos(pitch);
  dir = new THREE.Vector3(sinY * horizontal, Math.sin(pitch), cosY * horizontal);
});

/** Vertical foreshortening of the ground plane, used for sprite facing. */
export function viewSlopeNow() {
  return viewSlope;
}

/** Unit offset from the look-at point to the camera, before distance. */
export function cameraDirection() {
  return dir;
}

/**
 * Project a ground-plane vector into screen space (right, up).
 * Used for camera framing and for picking a sprite's facing row.
 */
export function groundToScreen(dx, dz) {
  return {
    right: dx * cosY - dz * sinY,
    up: (-dx * sinY - dz * cosY) * viewSlope,
  };
}

/**
 * Convert screen-relative input (right/up, as from WASD or a joystick) into
 * a world ground direction. Without this, "up" on the keyboard would send
 * the character diagonally across the oblique view, which is the classic
 * thing that makes 3/4-view games feel broken to steer.
 */
export function screenToGround(right, up) {
  return {
    dx: right * cosY - up * sinY,
    dz: -right * sinY - up * cosY,
  };
}

/**
 * Which of the four sprite-sheet rows to show for a given world movement.
 * Compares the *projected* screen motion, so a character walking along the
 * screen's horizontal reads as a side view even though it is moving
 * diagonally through world space.
 */
export function facingFromGround(dx, dz, fallback = "south") {
  if (dx === 0 && dz === 0) return fallback;
  const { right, up } = groundToScreen(dx, dz);
  if (Math.abs(right) >= Math.abs(up)) return right > 0 ? "east" : "west";
  return up > 0 ? "north" : "south";
}
