import * as THREE from "three";
import { footprint } from "./floorplan.js";

// Classic top-down orthographic camera looking straight down, like a 2D RPG.
// No rotation, just vertical movement and zoom.

const FRUSTUM = 24; // vertical world units at zoom 1

export function createTopDownCamera(aspect) {
  const camera = new THREE.OrthographicCamera(
    (-FRUSTUM * aspect) / 2,
    (FRUSTUM * aspect) / 2,
    FRUSTUM / 2,
    -FRUSTUM / 2,
    -200,
    400
  );

  // Position high above the floor, looking straight down
  camera.position.set(0, 40, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  return { camera, frustumSize: FRUSTUM };
}

export function resizeTopDownCamera(camera, frustumSize, aspect) {
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}

/** Calculate world-space bounding box of the floor. */
function floorBounds() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const [x, z] of footprint) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }

  return {
    width: maxX - minX,
    height: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

/**
 * Zoom at which the entire floor fits on screen. Below this the camera
 * stays on the building; above it the view is tighter, so it follows the player.
 */
export function overviewZoom(aspect) {
  const b = floorBounds();
  return Math.min((FRUSTUM * aspect) / b.width, FRUSTUM / b.height);
}

/** World-space point the overview should be centred on. */
export function overviewTarget() {
  const b = floorBounds();
  return new THREE.Vector3(b.centerX, 0, b.centerZ);
}
