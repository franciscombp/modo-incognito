import * as THREE from "three";

// Label visibility modes
export const LABEL_MODES = {
  MINIMAL: "minimal",
  CONTEXTUAL: "contextual",
  ALL: "all"
};

export class LabelManager {
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this.raycaster = new THREE.Raycaster();
    this.labels = new Map();
    this.mode = LABEL_MODES.MINIMAL;
    this.playerPosition = new THREE.Vector3();
    this.visibilityRadius = 25;
    this.maxLabelsVisible = 5;

    // Create DOM container for labels
    this.labelContainer = document.createElement("div");
    this.labelContainer.id = "label-container";
    this.labelContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      font-family: 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #333;
    `;
    renderer.domElement.parentElement.appendChild(this.labelContainer);
  }

  addLabel(id, labelData) {
    const label = {
      id,
      worldPos: new THREE.Vector3(labelData.x || 0, 0.5, labelData.z || 0),
      name: labelData.name,
      type: labelData.type,
      capacity: labelData.capacity,
      priority: labelData.priority || 1,
      distance: Infinity,
      visible: false,
      element: null,
      occludes: false
    };

    this.labels.set(id, label);
    this.createLabelElement(label);
    return label;
  }

  createLabelElement(label) {
    const element = document.createElement("div");
    element.className = `label label-${label.type} priority-${label.priority}`;
    element.style.cssText = `
      position: absolute;
      transform: translate(-50%, -100%);
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      padding: 4px 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      pointer-events: auto;
      cursor: default;
      z-index: 100;
      opacity: 0;
      transition: opacity 0.3s ease;
      font-size: 12px;
      font-weight: 500;
    `;

    const content = this.createLabelContent(label);
    element.innerHTML = content;

    label.element = element;
    this.labelContainer.appendChild(element);
  }

  createLabelContent(label) {
    let html = `<strong>${label.name}</strong>`;
    if (label.type === "open-office" && label.capacity) {
      html += `<br/><small>${label.capacity} puestos</small>`;
    }
    return html;
  }

  updateLabel(id, updates) {
    const label = this.labels.get(id);
    if (label) {
      Object.assign(label, updates);
      if (updates.name) {
        label.element.innerHTML = this.createLabelContent(label);
      }
    }
  }

  update(playerPos, geometryForOcclusion = null) {
    this.playerPosition.copy(playerPos);
    const screenPos = new THREE.Vector3();

    // Calculate distances and determine visibility
    const labelArray = Array.from(this.labels.values());
    labelArray.forEach(label => {
      label.distance = playerPos.distanceTo(label.worldPos);
    });

    // Determine which labels should be visible based on mode
    let visibleLabels = this.getVisibleLabels(labelArray);

    // Perform occlusion checks with raycast
    if (geometryForOcclusion) {
      visibleLabels = visibleLabels.filter(label => !this.isOccluded(label, geometryForOcclusion));
    }

    // Update all labels
    labelArray.forEach(label => {
      const shouldShow = visibleLabels.includes(label);
      this.updateLabelVisibility(label, shouldShow, screenPos);
    });
  }

  getVisibleLabels(labelArray) {
    switch (this.mode) {
      case LABEL_MODES.MINIMAL:
        return labelArray.filter(
          label => label.distance < this.visibilityRadius && label.priority >= 2
        ).slice(0, 2);

      case LABEL_MODES.CONTEXTUAL:
        return labelArray.filter(
          label => label.distance < this.visibilityRadius
        ).sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.distance - b.distance;
        }).slice(0, this.maxLabelsVisible);

      case LABEL_MODES.ALL:
        return labelArray.filter(
          label => label.distance < this.visibilityRadius * 1.5
        ).sort((a, b) => a.distance - b.distance);

      default:
        return [];
    }
  }

  isOccluded(label, geometryForOcclusion) {
    const direction = label.worldPos.clone().sub(this.camera.position).normalize();
    this.raycaster.set(this.camera.position, direction);

    const intersects = this.raycaster.intersectObjects(geometryForOcclusion, true);
    if (intersects.length === 0) return false;

    // Check if the first intersection is close to the label (not between camera and label)
    const firstHit = intersects[0];
    const distToLabel = this.camera.position.distanceTo(label.worldPos);
    const distToHit = firstHit.distance;

    return distToHit < distToLabel - 0.5; // Small tolerance
  }

  updateLabelVisibility(label, shouldShow, screenPos) {
    if (!label.element) return;

    // Project world position to screen
    screenPos.copy(label.worldPos);
    screenPos.project(this.camera);

    const x = (screenPos.x * 0.5 + 0.5) * this.renderer.domElement.clientWidth;
    const y = (screenPos.y * -0.5 + 0.5) * this.renderer.domElement.clientHeight;

    label.element.style.left = x + "px";
    label.element.style.top = y + "px";

    const targetOpacity = shouldShow ? 1 : 0;
    const fadeDistance = 15;

    let opacity = targetOpacity;
    if (shouldShow && label.distance > fadeDistance) {
      opacity = targetOpacity * (1 - (label.distance - fadeDistance) / (this.visibilityRadius - fadeDistance));
    }

    label.element.style.opacity = Math.max(0, opacity);
    label.visible = shouldShow;

    // Hide if off-screen
    if (screenPos.z < 0 || x < -100 || x > this.renderer.domElement.clientWidth + 100 ||
        y < -100 || y > this.renderer.domElement.clientHeight + 100) {
      label.element.style.opacity = 0;
    }
  }

  setMode(mode) {
    if (Object.values(LABEL_MODES).includes(mode)) {
      this.mode = mode;
    }
  }

  toggleMode() {
    const modes = Object.values(LABEL_MODES);
    const currentIdx = modes.indexOf(this.mode);
    this.mode = modes[(currentIdx + 1) % modes.length];
  }

  clear() {
    this.labels.forEach(label => {
      if (label.element) label.element.remove();
    });
    this.labels.clear();
  }

  dispose() {
    this.clear();
    if (this.labelContainer.parentElement) {
      this.labelContainer.parentElement.removeChild(this.labelContainer);
    }
  }
}
