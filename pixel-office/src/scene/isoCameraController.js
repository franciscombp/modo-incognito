import * as THREE from "three";

/**
 * Interactive controller for isometric camera angle adjustment.
 * Allows real-time modification of the camera offset (pitch/yaw effect).
 *
 * Controls:
 * - Arrow keys UP/DOWN: Adjust pitch (vertical angle)
 * - Arrow keys LEFT/RIGHT: Adjust yaw (horizontal rotation)
 * - W/S: Adjust distance
 * - P: Print current parameters to console and screen
 * - R: Reset to default
 */
export class IsoCameraController {
  constructor(camera, params = {}) {
    this.camera = camera;
    this.isEnabled = true;
    this.keys = {};

    // Default isometric parameters
    this.params = {
      pitchDeg: params?.pitchDeg !== undefined ? params.pitchDeg : 35,
      yawDeg: params?.yawDeg !== undefined ? params.yawDeg : -45,
      distance: params?.distance !== undefined ? params.distance : 60,
    };

    this.defaultParams = {
      pitchDeg: this.params.pitchDeg,
      yawDeg: this.params.yawDeg,
      distance: this.params.distance,
    };

    this.updateCameraOffset();
    this.setupKeyListener();
  }

  setupKeyListener() {
    this.handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = true;

      if (key === "p") {
        this.printParams();
      }
      if (key === "r") {
        this.reset();
      }
    };

    this.handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      this.keys[key] = false;
    };

    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);

    this.updateInterval = setInterval(() => {
      if (!this.isEnabled) return;

      const pitchStep = 1;
      const yawStep = 2;
      const distStep = 2;

      if (this.keys["arrowup"]) this.params.pitchDeg = Math.min(80, this.params.pitchDeg + pitchStep);
      if (this.keys["arrowdown"]) this.params.pitchDeg = Math.max(10, this.params.pitchDeg - pitchStep);
      if (this.keys["arrowleft"]) this.params.yawDeg -= yawStep;
      if (this.keys["arrowright"]) this.params.yawDeg += yawStep;

      if (this.keys["w"]) this.params.distance = Math.max(30, this.params.distance - distStep);
      if (this.keys["s"]) this.params.distance = Math.min(100, this.params.distance + distStep);

      this.updateCameraOffset();
    }, 50);
  }

  updateCameraOffset() {
    const pitchRad = THREE.MathUtils.degToRad(this.params.pitchDeg);
    const yawRad = THREE.MathUtils.degToRad(this.params.yawDeg);

    const height = this.params.distance * Math.sin(pitchRad);
    const radius = this.params.distance * Math.cos(pitchRad);

    const x = radius * Math.sin(yawRad);
    const z = radius * Math.cos(yawRad);

    this.camera.userData.isoOffset = { x, y: height, z };
  }

  printParams() {
    const p = this.params;
    const code = `{
  pitchDeg: ${p.pitchDeg.toFixed(1)},
  yawDeg: ${p.yawDeg.toFixed(1)},
  distance: ${p.distance.toFixed(1)}
}`;

    console.log("=== ISOMETRIC CAMERA PARAMETERS ===");
    console.log(code);
    console.log("===================================");
    this.showOnScreen(code);
  }

  showOnScreen(code) {
    let overlay = document.getElementById("iso-camera-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "iso-camera-overlay";
      overlay.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        padding: 15px;
        font-family: monospace;
        font-size: 12px;
        border: 2px solid #0f0;
        z-index: 10000;
        max-width: 350px;
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
    this.params.pitchDeg = this.defaultParams.pitchDeg;
    this.params.yawDeg = this.defaultParams.yawDeg;
    this.params.distance = this.defaultParams.distance;
    this.updateCameraOffset();
    console.log("Camera reset to defaults");
  }
}
