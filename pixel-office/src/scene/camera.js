import * as THREE from "three";
import { ISO_DIR, groundToScreen } from "./iso.js";
import { footprint } from "./floorplan.js";

// Fixed isometric camera. The angle never changes — only how far it is
// zoomed and, once zoomed past the overview, which point it centres on.

const FRUSTUM = 24; // vertical world units at zoom 1
const DISTANCE = 60; // far enough that nothing clips; orthographic, so scale
// is unaffected by this value.

/** Screen-space bounding box of the whole floor, used to frame the overview. */
function floorScreenExtents() {
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  // Footprint is stored in room coords (z flipped relative to scene space).
  for (const [x, z] of footprint) {
    const { right, up } = groundToScreen(x, -z);
    minR = Math.min(minR, right);
    maxR = Math.max(maxR, right);
    minU = Math.min(minU, up);
    maxU = Math.max(maxU, up);
  }
  // The entrance platform sticks out past the footprint at the front.
  const entrance = groundToScreen(-0.6, 13);
  minU = Math.min(minU, entrance.up);
  maxR = Math.max(maxR, entrance.right);
  minR = Math.min(minR, entrance.right);

  return {
    width: maxR - minR,
    height: maxU - minU + 3, // headroom for wall tops and floating labels
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
 * Zoom at which the entire floor fits on screen — the framing the reference
 * image uses. Below this the camera stays parked on the building; above it
 * the view is tighter than the floor, so it follows the player instead.
 */
export function overviewZoom(aspect) {
  const e = floorScreenExtents();
  return Math.min((FRUSTUM * aspect) / e.width, FRUSTUM / e.height);
}

/** World-space point the overview framing should be centred on. */
export function overviewTarget() {
  const e = floorScreenExtents();
  // Invert groundToScreen for the centre point: right = (x - z)/r2,
  // up = -(x + z) * slope / r2  ->  solve for (x, z).
  const r2 = Math.SQRT2;
  const a = e.centerX * r2; // x - z
  const b = (-e.centerY * r2) / 0.6; // x + z
  return new THREE.Vector3((a + b) / 2, 0, (b - a) / 2);
}
