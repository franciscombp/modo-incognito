import { Character3D } from "./character3d.js";
import { screenToGround, groundToScreen, facingFromGround } from "../scene/iso.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { createSleepIcon, updateSleepIcon, createHappyIcon, updateHappyIcon } from "./alertIcon.js";

// The protagonist. Input is interpreted in *screen* space and then rotated
// into world space, so W/A/S/D (and the joystick) move her up/left/down/right
// as seen on screen rather than diagonally across the isometric view.
export class Player {
  // Sizes and speeds arrive already in world units (the data loader scales
  // them by WORLD_SCALE), so nothing is multiplied twice.
  constructor(look, { x = 0, z = 12.6, radius = 0.26 * S, height = 1.45 * S, speed = 4.4 * S } = {}) {
    this.speed = speed;
    this.radius = radius;
    this.position = { x, z };
    this.keys = new Set();
    this.touchAxis = { x: 0, z: 0 };

    this.speedMul = 1; // perks (coffee) scale this
    this.isHiding = false;
    this.isPretending = false;
    this.isDoingActivity = false;
    // MIENTRAS DURA UN GESTO NO SE CAMINA. Lo pone game.js al empezar una
    // actividad con `gesto`, y es lo que deja el eje del mando libre para
    // bajarle el volumen a la tele sin inventar una tecla nueva que nadie
    // encontraría (ver `src/ui/controls.js`: los mandos salen de un solo
    // sitio). De paso refuerza el bucle: hacer una tarea tiene que
    // EXPONERTE, y estar clavada en el sitio expone más. Se sale soltando
    // la tecla de acción, así que nunca te deja atrapada.
    this.inputLocked = false;
    this.facing = "south";
    // Clave de POSES (sprite.js) mientras hace algo — la pone game.js a
    // partir de la actividad en curso. Sin hoja de acciones se ignora sola.
    this.pose = null;

    this.sprite = new Character3D(look, { height });
    this.sprite.setPosition(x, z);
    this.isAsleep = false;
    // El ZZZ: mismo globo que lleva el jefe sobre su cabeza, aquí en azul y
    // por SU propio estado (ver entities/alertIcon.js).
    this.sleepIcon = createSleepIcon(height);
    // Y su REVERSO: caritas mientras te escaqueas. La bandera la escribe
    // game.js (activando una actividad o aguantándola encendida), igual
    // que `isAsleep`: el muñeco solo la pinta.
    this.isEnjoying = false;
    this.happyIcon = createHappyIcon(height);
    this._sleepTime = 0;

    this._onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
  }

  get object3D() {
    return this.sprite.object;
  }

  /**
   * Lo que pide el mando ahora mismo, en espacio de PANTALLA y sin mirar si
   * se puede caminar o no. Público porque el gesto de una actividad lee este
   * mismo eje mientras el paso está bloqueado — un solo mando, dos usos.
   */
  readIntent() {
    return this._readInput();
  }

  /** Screen-space intent, from either the keyboard or the on-screen stick. */
  _readInput() {
    const tx = this.touchAxis.x;
    const tz = this.touchAxis.z;
    if (Math.hypot(tx, tz) > 0.08) {
      // Joystick: +z on the pad is "down the screen".
      return { right: tx, up: -tz };
    }
    let right = 0;
    let up = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) up += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) up -= 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) right -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) right += 1;
    return { right, up };
  }

  update(dt, world) {
    // ── LA CAMINATA GUIADA ───────────────────────────────────────────
    // Cuando el juego necesita llevarte a un sitio (te sientan en tu puesto
    // tras un regaño, una escena te coloca), NO se te teletransporta: se te
    // CAMINA. Un salto de posición rompe el hilo de que estás mirando a una
    // persona en un piso — no es un atajo de implementación, es que el
    // personaje deja de ser un cuerpo.
    //
    // Se resuelve aquí, en el mismo sitio donde se lee el mando, porque así
    // pasa por las MISMAS colisiones, el mismo giro y la misma animación de
    // andar que cuando caminas tú. Un movimiento paralelo por fuera de este
    // método volvería a atravesar mesas.
    let guiada = null;
    if (this.walkTo) {
      const dx = this.walkTo.x - this.position.x;
      const dz = this.walkTo.z - this.position.z;
      if (Math.hypot(dx, dz) < (this.walkTo.tol ?? 0.35 * this.radius * 4)) {
        this.walkTo.onArrive?.();
        this.walkTo = null;
      } else {
        // El rumbo se pasa a INTENCIÓN DE MANDO (la misma que devuelve el
        // joystick) y no a un desplazamiento directo: así el paso, el giro y
        // la animación salen del mismo camino de siempre. Normalizada, para
        // que la escena camine a velocidad de andar y no a la que toque por
        // lo lejos que esté el destino.
        const s = groundToScreen(dx, dz);
        const len = Math.hypot(s.right, s.up) || 1;
        guiada = { right: s.right / len, up: s.up / len };
      }
    }
    const { right, up } = guiada ?? (this.inputLocked ? { right: 0, up: 0 } : this._readInput());
    const magnitude = Math.min(Math.hypot(right, up), 1);
    let moving = false;

    if (magnitude > 0.001) {
      const { dx, dz } = screenToGround(right, up);
      const len = Math.hypot(dx, dz) || 1;
      // Shift = correr. El sprite no necesita que se lo digan: mide su propio
      // desplazamiento y cambia solo al ciclo de correr del .glb (ver
      // character3d.js). Correr NO es gratis: llamas más la atención — eso ya
      // lo cubre que te muevas más rápido por delante de más conos.
      const sprint = this.keys.has("shift") && !this.isPretending ? 1.55 : 1;
      const speedMul = (this.isPretending ? 0.45 : 1) * this.speedMul * sprint;
      const step = this.speed * speedMul * magnitude * dt;
      this.position.x += (dx / len) * step;
      this.position.z += (dz / len) * step;
      this.facing = facingFromGround(dx, dz, this.facing);
      // El muñeco 3D gira de verdad, así que se le pasa la dirección exacta en
      // vez de redondearla a una de las cuatro de siempre. `this.facing` se
      // sigue calculando porque el resto del juego lo lee.
      this.sprite.setHeading(dx / len, dz / len);
      moving = true;
    }

    if (world) world.resolveCircle(this.position, this.radius);

    // Standing still while "working" still shows the idle pose, not a walk.
    // Moverse cancela la pose: no puedes tomar café mientras caminas.
    this.sprite.setPose(moving ? null : this.pose);
    // Quieto, el muñeco CONSERVA el rumbo que le haya puesto el juego
    // (sentarse de cara a la mesa, encarar a quien te habla). Antes aquí se
    // re-imponía la cardinal de pantalla cada frame, y pisaba cualquier
    // orientación de mundo un frame después de fijarla. La cardinal
    // `facing` que lee el resto del juego se sincroniza DESDE el sprite.
    if (!moving) this.facing = this.sprite.facing;
    this.sprite.setMoving(moving && !this.isPretending);
    this.sprite.setPosition(this.position.x, this.position.z);
    this.sprite.setTint(this.isHiding ? 0.6 : 1);
    this.sprite.update(dt);

    this._sleepTime += dt;
    updateSleepIcon(this.sleepIcon, this.position.x, this.position.z, this.isAsleep, this._sleepTime);
    // Nunca los dos a la vez: dormida no te lo estás pasando bien.
    updateHappyIcon(
      this.happyIcon,
      this.position.x,
      this.position.z,
      this.isEnjoying && !this.isAsleep,
      this._sleepTime
    );
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
  }
}
