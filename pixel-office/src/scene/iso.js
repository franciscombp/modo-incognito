import * as THREE from "three";

// Shared constants for the fixed isometric projection.
//
// ISO_SLOPE is measured straight off the reference art: along its outer
// walls the silhouette drops ~6px for every 10px of horizontal travel, so
// a world-axis-aligned edge projects at slope 0.6. For an orthographic
// camera at 45deg azimuth that slope equals sin(elevation), which pins the
// camera elevation at ~36.9deg — noticeably flatter than the near-top-down
// angle the scene used before.
export const ISO_SLOPE = 0.6;
export const ISO_ELEVATION = Math.asin(ISO_SLOPE);

// Camera offset direction (unit length) for azimuth 45deg at that elevation.
export const ISO_DIR = new THREE.Vector3(
  Math.cos(ISO_ELEVATION) / Math.SQRT2,
  Math.sin(ISO_ELEVATION),
  Math.cos(ISO_ELEVATION) / Math.SQRT2
);

const INV_SQRT2 = 1 / Math.SQRT2;

/**
 * Project a ground-plane vector into screen space (right, up).
 * Used both for picking a sprite's facing row and for camera framing.
 */
export function groundToScreen(dx, dz) {
  return {
    right: (dx - dz) * INV_SQRT2,
    up: -(dx + dz) * INV_SQRT2 * ISO_SLOPE,
  };
}

/**
 * Convert screen-relative input (right/up, as from WASD or a joystick) into
 * a world ground direction. Without this, "up" on the keyboard would send
 * the character diagonally across the isometric view, which is the classic
 * thing that makes iso games feel broken to steer.
 */
export function screenToGround(right, up) {
  return {
    dx: (right - up) * INV_SQRT2,
    dz: (-right - up) * INV_SQRT2,
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
