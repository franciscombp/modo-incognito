import * as THREE from "three";
import { CAMERA_PRESET } from "./config.js";

// Screen<->ground conversions for the oblique diorama camera.
//
// The camera orbits the target at a fixed yaw/pitch, so the mapping between
// "up on the screen" and "away in the world" is a plain rotation by the yaw.
// Deriving it from CAMERA_PRESET (instead of hard-coding a 45deg isometric)
// means retuning the camera angle never desyncs the controls from the view.

const YAW = THREE.MathUtils.degToRad(CAMERA_PRESET.yawDeg);
const PITCH = THREE.MathUtils.degToRad(CAMERA_PRESET.pitchDeg);

const COS_Y = Math.cos(YAW);
const SIN_Y = Math.sin(YAW);

/** Vertical foreshortening of the ground plane, used for sprite facing. */
export const VIEW_SLOPE = Math.sin(PITCH);

/** Unit offset from the look-at point to the camera, before distance. */
export function cameraDirection() {
  const horizontal = Math.cos(PITCH);
  return new THREE.Vector3(SIN_Y * horizontal, Math.sin(PITCH), COS_Y * horizontal);
}

/**
 * Project a ground-plane vector into screen space (right, up).
 * Used for camera framing and for picking a sprite's facing row.
 */
export function groundToScreen(dx, dz) {
  return {
    right: dx * COS_Y - dz * SIN_Y,
    up: (-dx * SIN_Y - dz * COS_Y) * VIEW_SLOPE,
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
    dx: right * COS_Y - up * SIN_Y,
    dz: -right * SIN_Y - up * COS_Y,
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
