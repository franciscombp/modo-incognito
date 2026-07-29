import * as THREE from "three";

/**
 * Interactive camera controller for development.
 * Allows real-time adjustment of perspective camera parameters.
 *
 * Controls:
 * - Arrow keys: Adjust pitch (up/down) and yaw (left/right)
 * - WASD: Adjust camera distance and height
 * - R: Reset to default
 * - P: Print current parameters to console
 * - Q/E: Adjust FOV
 */
export class CameraController {
  constructor(camera, params = {}) {
    this.camera = camera;

    // Default parameters
    this.params = {
      fov: params.fov || 45,
      distance: params.distance || 35,
      pitchDeg: params.pitchDeg || 30,
      yawDeg: params.yawDeg || -45,
      heightOffset: params.heightOffset || 0,
      ...params
    };

    this.defaultParams = { ...this.params };
    this.isEnabled = true;

    this.setupKeyListener();
    this.updateCamera();
  }

  setupKeyListener() {
    const keys = {};
    window.addEventListener("keydown", (e) => {
      keys[e.key.toLowerCase()] = true;

      if (e.key.toLowerCase() === "p") {
        this.printParams();
      }
      if (e.key.toLowerCase() === "r") {
        this.reset();
      }
    });

    window.addEventListener("keyup", (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    // Update camera based on held keys
    setInterval(() => {
      if (!this.isEnabled) return;

      const step = 2; // degrees per frame
      const distStep = 1;

      if (keys["arrowup"]) this.params.pitchDeg = Math.min(85, this.params.pitchDeg + step);
      if (keys["arrowdown"]) this.params.pitchDeg = Math.max(5, this.params.pitchDeg - step);
      if (keys["arrowleft"]) this.params.yawDeg -= step;
      if (keys["arrowright"]) this.params.yawDeg += step;

      if (keys["w"]) this.params.distance = Math.max(5, this.params.distance - distStep);
      if (keys["s"]) this.params.distance += distStep;
      if (keys["a"]) this.params.heightOffset = Math.max(-20, this.params.heightOffset - distStep * 0.5);
      if (keys["d"]) this.params.heightOffset += distStep * 0.5;

      if (keys["q"]) this.params.fov = Math.max(10, this.params.fov - 0.5);
      if (keys["e"]) this.params.fov = Math.min(120, this.params.fov + 0.5);

      this.updateCamera();
    }, 50);
  }

  updateCamera() {
    if (!this.camera.isPerspectiveCamera) return;

    const pitchRad = THREE.MathUtils.degToRad(this.params.pitchDeg);
    const yawRad = THREE.MathUtils.degToRad(this.params.yawDeg);

    const height = this.params.distance * Math.sin(pitchRad) + this.params.heightOffset;
    const radius = this.params.distance * Math.cos(pitchRad);

    const x = radius * Math.sin(yawRad);
    const z = radius * Math.cos(yawRad);

    this.camera.position.set(x, height, z);
    this.camera.lookAt(0, this.params.heightOffset, 0);
    this.camera.fov = this.params.fov;
    this.camera.updateProjectionMatrix();
  }

  printParams() {
    const params = this.params;
    const code = `{
  fov: ${params.fov.toFixed(1)},
  distance: ${params.distance.toFixed(1)},
  pitchDeg: ${params.pitchDeg.toFixed(1)},
  yawDeg: ${params.yawDeg.toFixed(1)},
  heightOffset: ${params.heightOffset.toFixed(1)}
}`;

    console.log("=== CAMERA PARAMETERS (copy this) ===");
    console.log(code);
    console.log("=====================================");

    // Also show on screen
    this.showOnScreen(code);
  }

  showOnScreen(code) {
    let overlay = document.getElementById("camera-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "camera-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        padding: 15px;
        font-family: monospace;
        font-size: 12px;
        border: 1px solid #0f0;
        z-index: 10000;
        max-width: 300px;
        white-space: pre;
        border-radius: 4px;
      `;
      document.body.appendChild(overlay);
    }
    overlay.textContent = code;
    setTimeout(() => {
      if (overlay.parentElement) overlay.remove();
    }, 5000);
  }

  reset() {
    this.params = { ...this.defaultParams };
    this.updateCamera();
    console.log("Camera reset to defaults");
  }
}
