// Debug script to check scene setup
export function debugScene(scene, camera, cameraState) {
  console.log("=== SCENE DEBUG ===");
  console.log("Scene children:", scene.children.length);
  console.log("Scene fog:", scene.fog);
  console.log("Scene background:", scene.background);

  console.log("\n=== CAMERA DEBUG ===");
  console.log("Camera position:", camera.position);
  console.log("Camera lookAt point:", cameraState.preset.lookAtYOffset);
  console.log("Camera FOV:", camera.fov);
  console.log("Camera aspect:", camera.aspect);

  console.log("\n=== LIGHTS DEBUG ===");
  scene.children.forEach((child, idx) => {
    if (child.isLight) {
      console.log(`Light ${idx}:`, child.type, "intensity:", child.intensity);
    }
  });

  console.log("\n=== GEOMETRY DEBUG ===");
  function countGeometry(obj, prefix = "") {
    if (obj.geometry) {
      console.log(`${prefix}Mesh:`, obj.name || "unnamed", "vertices:", obj.geometry.attributes.position?.count || 0);
    }
    obj.children?.forEach(child => countGeometry(child, prefix + "  "));
  }
  scene.children.forEach(child => countGeometry(child));
}
