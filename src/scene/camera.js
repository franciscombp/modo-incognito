import * as THREE from "three";
import { cameraDirection, groundToScreen } from "./iso.js";
import { footprint } from "./floorplan.js";
import { CAMERA_PRESET, WORLD_SCALE as S } from "./config.js";
import { getCameraSettings, subscribeCameraSettings, setCameraSettings } from "./cameraSettings.js";

// Oblique "diorama" camera: a narrow-FOV perspective camera parked high at a
// yaw/pitch you can retune live from the in-game camera panel.
//
// A single `framing` value in [0, 1] drives distance:
//   0 -> pulled back far enough to read the whole plan
//   1 -> the follow framing from the camera settings, tracking the player
// Anything in between blends distance and look-at target, so wheel/pinch
// zoom feels continuous rather than snapping between two modes.

/** Screen-space bounding box of the whole floor, used to frame the plan. */
function floorScreenExtents() {
  let minR = Infinity;
  let maxR = -Infinity;
  let minU = Infinity;
  let maxU = -Infinity;
  for (const [x, z] of footprint) {
    const { right, up } = groundToScreen(x, z);
    minR = Math.min(minR, right);
    maxR = Math.max(maxR, right);
    minU = Math.min(minU, up);
    maxU = Math.max(maxU, up);
  }
  return {
    width: maxR - minR,
    height: maxU - minU + 3 * S, // headroom for wall tops and floating labels
  };
}

/** World-space ground point at the centre of the floor. */
function floorCenter() {
  let sx = 0;
  let sz = 0;
  for (const [x, z] of footprint) {
    sx += x;
    sz += z;
  }
  return new THREE.Vector3(sx / footprint.length, 0, sz / footprint.length);
}

/**
 * Cuánto cierra el plano de conversación respecto al de juego.
 *
 * Calibrado a ojo sobre captura, que es lo único que vale aquí: 0,55 (el de
 * acción) dejaba a la jugadora pequeña y con medio cuadro de techo; 0,30 la
 * metía tanto que la cabeza se salía por arriba. En 0,52 entra de busto, con
 * la cara por encima de la caja de diálogo y un dedo de aire arriba.
 */
const CINE_DISTANCE = 0.52;

/**
 * A qué altura de mundo mira, y va al REVÉS de lo que parece: el punto al que
 * mira la cámara cae en el CENTRO del cuadro, así que subir la mira empuja al
 * personaje hacia ABAJO y mete techo por arriba.
 *
 * Apuntando al suelo (lo normal al jugar) la pared de arriba se comía media
 * pantalla. 1,05 —el pecho— dejaba la cara centrada pero todavía con un
 * palmo de techo. En 0,78 la cabeza sube al tercio superior y lo que queda
 * arriba es un margen, no un decorado.
 */
const CINE_LOOK_Y = 0.78;

export class DioramaCamera {
  constructor(aspect) {
    const s = getCameraSettings();
    this.camera = new THREE.PerspectiveCamera(s.fov, aspect, 0.5 * S, 400 * S);
    this.center = floorCenter();
    this.target = this.center.clone();
    this.desired = new THREE.Vector3();
    this.lookAt = this.center.clone();
    this.aspect = aspect;

    // Default: zoom as close to the player as the framing allows. The
    // overview (framing 0, whole floor) is still one zoom-out away.
    this.framing = 1;

    // Cinematic override: while set, the camera looks at this world point
    // instead of following the player — used to "introduce" a secuaz or
    // frame the elevator core for a beat. Cleared with setFocus(null).
    this._focus = null;

    // Extra pull-in while the player holds an activity (fingir/tarea): a
    // smoothed 0-1 knob that tightens the follow distance without touching
    // `framing`, so it eases in/out independently of zoom/orbit input.
    this._actionZoom = 0;
    this._actionZoomTarget = 0;

    // ── EL PLANO CINEMÁTICO (diálogo) ────────────────────────────────────
    // El acercamiento de acción (×0,55) NO es un primer plano: se pensó para
    // ver bien lo que hace la jugadora sin perder el piso de vista. En una
    // conversación hay que CERRAR de verdad, y además subir el punto de mira
    // — apuntando al suelo, el personaje queda bajo, medio tapado por la caja
    // de diálogo, y todo lo que sobra es techo.
    //
    // Son dos números y no uno a propósito: la distancia hace el tamaño y el
    // punto de mira hace la ALTURA en cuadro. Con solo distancia, acercarse
    // agranda el techo igual que a ella.
    this._cine = 0;
    this._cineTarget = 0;

    this._unsubscribe = subscribeCameraSettings((next) => {
      this.settings = next;
      this.camera.fov = next.fov;
      this.camera.updateProjectionMatrix();
      this.overviewDistance = this._fitDistance(this.aspect);
      this._apply();
    });
    this.setAspect(aspect);
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.overviewDistance = this._fitDistance(aspect);
  }

  /** Distance at which the entire footprint fits inside the frustum. */
  _fitDistance(aspect) {
    const e = floorScreenExtents();
    const halfFov = THREE.MathUtils.degToRad(this.settings.fov / 2);
    const byHeight = e.height / 2 / Math.tan(halfFov);
    const byWidth = e.width / 2 / (Math.tan(halfFov) * Math.max(aspect, 0.4));
    return Math.max(byHeight, byWidth) * 1.06;
  }

  /** True once the view is tight enough that it should track the player. */
  get isFollowing() {
    return this.framing > 0.12;
  }

  /** `delta` in framing units; positive zooms in. */
  zoomBy(delta) {
    this.framing = THREE.MathUtils.clamp(this.framing + delta, 0, 1);
  }

  setFraming(value) {
    this.framing = THREE.MathUtils.clamp(value, 0, 1);
  }

  /** `{x,z}` to hold the camera on, or `null` to resume following the player. */
  setFocus(point) {
    this._focus = point ? { x: point.x, z: point.z } : null;
  }

  /** Toggle the extra pull-in used while an activity/pretend action is active. */
  setActionZoom(active) {
    this._actionZoomTarget = active ? 1 : 0;
  }

  /**
   * Plano cinemático de conversación: cierra el encuadre y sube la mirada a
   * la altura del pecho, para que el personaje llene la banda que queda
   * libre encima de la caja de diálogo.
   */
  setCinematic(active) {
    this._cineTarget = active ? 1 : 0;
  }

  /** Live orbit, used by right-drag on desktop and two-finger drag on touch. */
  orbitBy(deltaYawDeg, deltaPitchDeg) {
    setCameraSettings(
      {
        yawDeg: this.settings.yawDeg + deltaYawDeg,
        pitchDeg: this.settings.pitchDeg + deltaPitchDeg,
      },
      { persistNow: false }
    );
  }

  /** Follow the player (or stay parked on the plan) for one frame. */
  update(dt, playerPos) {
    const t = this.framing;
    if (this._focus) this.desired.set(this._focus.x, 0, this._focus.z);
    else if (this.isFollowing) this.desired.set(playerPos.x, 0, playerPos.z);
    else this.desired.copy(this.center);

    // Blend toward the player as we zoom in, so the pull-in reads as one
    // continuous move instead of the target teleporting.
    this.desired.lerpVectors(this.center, this.desired, THREE.MathUtils.smoothstep(t, 0.08, 0.55));

    const lerp = 1 - Math.pow(1 - this.settings.followLerp, Math.max(dt, 0.0001) * 60);
    this.target.lerp(this.desired, lerp);

    const zoomLerp = 1 - Math.pow(1 - 0.12, Math.max(dt, 0.0001) * 60);
    this._actionZoom = THREE.MathUtils.lerp(this._actionZoom, this._actionZoomTarget, zoomLerp);
    this._cine = THREE.MathUtils.lerp(this._cine, this._cineTarget, zoomLerp);

    this._apply();
  }

  _apply() {
    const zoomMul = THREE.MathUtils.lerp(
      1 / CAMERA_PRESET.zoomMin,
      1 / CAMERA_PRESET.zoomMax,
      this.framing
    );
    const distance = THREE.MathUtils.lerp(
      this.overviewDistance,
      this.settings.distance * S * zoomMul,
      THREE.MathUtils.smoothstep(this.framing, 0, 1)
    ) *
      THREE.MathUtils.lerp(1, 0.55, this._actionZoom) *
      // El plano de conversación cierra MUCHO más que el de acción.
      THREE.MathUtils.lerp(1, CINE_DISTANCE, this._cine);

    const dir = cameraDirection();
    this.camera.position.set(
      this.target.x + dir.x * distance,
      dir.y * distance,
      this.target.z + dir.z * distance
    );
    // La mirada SUBE al pecho durante una conversación: es lo que quita el
    // techo de encima y deja al personaje llenando el cuadro.
    const mira = THREE.MathUtils.lerp(this.settings.lookAtYOffset * S, CINE_LOOK_Y * S, this._cine);
    this.lookAt.set(this.target.x, mira, this.target.z);
    this.camera.lookAt(this.lookAt);
  }

  dispose() {
    this._unsubscribe?.();
  }
}
