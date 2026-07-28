import * as THREE from "three";

// Fixed isometric camera, matching the reference image's angle.
// It never rotates — only dolly-zoom and a small pan are allowed later.
export function createIsoCamera(aspect) {
  const frustumSize = 26;
  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    200
  );

  // Classic 2:1 dimetric/isometric look: camera pulled back equally on
  // x/z and elevated so each floor tile reads as a diamond.
  const distance = 40;
  camera.position.set(distance, distance * 0.9, distance);
  camera.lookAt(0, 0, 0);
  camera.zoom = 1;
  camera.updateProjectionMatrix();

  return { camera, frustumSize };
}

export function resizeIsoCamera(camera, frustumSize, aspect) {
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}
