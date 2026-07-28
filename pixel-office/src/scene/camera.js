import * as THREE from "three";

// Fixed isometric camera, matching the reference image's angle.
// It never rotates — only dolly-zoom and a small pan are allowed later.
export function createIsoCamera(aspect) {
  const frustumSize = 20;
  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    200
  );

  // Steeper, more top-down look-down angle than a classic 2:1 isometric,
  // matching the reference art (you read floor plan + furniture almost
  // like a blueprint, with just enough tilt to see wall/furniture faces).
  const distance = 34;
  const offset = new THREE.Vector3(distance, distance * 1.35, distance);
  camera.position.copy(offset);
  camera.lookAt(0, 0, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  return { camera, frustumSize, offset };
}

export function resizeIsoCamera(camera, frustumSize, aspect) {
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}
