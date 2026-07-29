import * as THREE from "three";
import { ISO_DIR, groundToScreen } from "./iso.js";
import { footprint } from "./floorplan.js";

// Isometric camera at 45° azimuth, measuring ~36.9° elevation from reference art.
// The angle never changes — only zoom and target position move.

const FRUSTUM = 24; // vertical world units at zoom 1
const DISTANCE = 60; // far enough nothing clips; orthographic so scale unaffected

/** Screen-space bounding box of the whole floor for framing. */
function floorScreenExtents() {
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;

  for (const [x, z] of footprint) {
    const { right, up } = groundToScreen(x, -z);
    minR = Math.min(minR, right);
    maxR = Math.max(maxR, right);
    minU = Math.min(minU, up);
    maxU = Math.max(maxU, up);
  }

  // Headroom for labels and floating elements
  return {
    width: maxR - minR,
    height: maxU - minU + 3,
    centerX: (minR + maxR) / 2,
    centerY: (minU + maxU) / 2,
  };
}

export function createIsoCamera(aspect) {
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM * aspect) / 2,
    (FRUSTUM * aspect) / 2,
    FRUSTUM / 2,
    -FRUSTUM / 2,
    -200,
    400
  );

  const offset = ISO_DIR.clone().multiplyScalar(DISTANCE);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  return { camera, frustumSize: FRUSTUM, offset };
}

export function resizeIsoCamera(camera, frustumSize, aspect) {
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}

/**
 * Zoom at which entire floor fits on screen. Below this, camera stays
 * parked; above it, view is tighter and follows the player.
 */
export function overviewZoom(aspect) {
  const e = floorScreenExtents();
  return Math.min((FRUSTUM * aspect) / e.width, FRUSTUM / e.height);
}

/** World-space point the overview should center on. */
export function overviewTarget() {
  const e = floorScreenExtents();
  // Invert groundToScreen: right = (x - z)/√2, up = -(x + z)*slope/√2
  const r2 = Math.SQRT2;
  const a = e.centerX * r2; // x - z
  const b = (-e.centerY * r2) / 0.6; // x + z
  return new THREE.Vector3((a + b) / 2, 0, (b - a) / 2);
}
