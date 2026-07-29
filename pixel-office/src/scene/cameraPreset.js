import * as THREE from "three";

// Diorama-oblique camera preset matching JRPG isometric style
export const DIORAMA_PRESET = {
  type: "perspective",
  fov: 32,
  aspect: 16 / 9,
  near: 0.1,
  far: 200,

  // Position and rotation
  pitchDeg: 50,  // tilt down from horizontal
  yawDeg: -35,   // rotation around vertical
  distance: 38,  // camera distance from target

  // Follow settings
  followLerp: 0.08,
  lookAtYOffset: 1.2,  // height of focus point above ground

  // Zoom constraints
  zoomMin: 0.8,
  zoomMax: 1.4,
  zoomDefault: 1.0,

  // Fog for miniature effect
  fog: {
    color: 0x1a1a2e,
    near: 25,
    far: 120
  }
};

export function createDioramaCamera(aspect) {
  const preset = { ...DIORAMA_PRESET, aspect };

  const camera = new THREE.PerspectiveCamera(
    preset.fov,
    preset.aspect,
    preset.near,
    preset.far
  );

  // Calculate position from polar coordinates
  const pitchRad = THREE.MathUtils.degToRad(preset.pitchDeg);
  const yawRad = THREE.MathUtils.degToRad(preset.yawDeg);

  const cameraDistance = preset.distance;
  const height = cameraDistance * Math.sin(pitchRad);
  const radius = cameraDistance * Math.cos(pitchRad);

  const x = radius * Math.sin(yawRad);
  const z = radius * Math.cos(yawRad);

  camera.position.set(x, height, z);
  camera.lookAt(0, preset.lookAtYOffset, 0);

  return {
    camera,
    preset,
    targetPosition: new THREE.Vector3(),
    currentZoom: preset.zoomDefault
  };
}

export function updateDioramaCamera(cameraState, playerPos, followEnabled = true) {
  const { camera, preset, targetPosition, currentZoom } = cameraState;

  if (followEnabled) {
    targetPosition.lerp(
      new THREE.Vector3(playerPos.x, 0, playerPos.z),
      preset.followLerp
    );
  }

  // Apply zoom to camera
  const zoomedDistance = preset.distance * (1 / currentZoom);
  const pitchRad = THREE.MathUtils.degToRad(preset.pitchDeg);
  const yawRad = THREE.MathUtils.degToRad(preset.yawDeg);

  const height = zoomedDistance * Math.sin(pitchRad);
  const radius = zoomedDistance * Math.cos(pitchRad);

  const x = targetPosition.x + radius * Math.sin(yawRad);
  const z = targetPosition.z + radius * Math.cos(yawRad);

  camera.position.set(x, height, z);
  camera.lookAt(
    targetPosition.x,
    targetPosition.y + preset.lookAtYOffset,
    targetPosition.z
  );

  return cameraState;
}

export function setDioramaZoom(cameraState, zoomLevel) {
  cameraState.currentZoom = THREE.MathUtils.clamp(
    zoomLevel,
    cameraState.preset.zoomMin,
    cameraState.preset.zoomMax
  );
  return cameraState;
}
