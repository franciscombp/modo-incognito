import { Character3D } from "./character3d.js";
import { WORLD_SCALE as S } from "../scene/config.js";

// Background coworker. Mostly set dressing, but they also block the boss's
// line of sight and one of them anchors the "conversar con colegas" activity.
//
// Ya no están congelados en su sitio: cada uno vive un pequeño ciclo propio —
// trabaja sentado en su puesto (pose `sitWork`, que trae su silla), de vez en
// cuando se levanta, da un paseo corto por el navmesh y vuelve. El piso se
// lee como una oficina habitada sin que nadie tenga guion.
const STROLL_SPEED = 1.1 * S;
const ARRIVE_EPS = 0.3 * S;

/**
 * El `facing` del JSON es una dirección DEL MUNDO, no de la pantalla. Se
 * autoró con la cámara en su yaw por defecto (0°), donde "south" es +z; al
 * pasar por `setFacing` (que es relativa a la cámara VIVA) un asiento
 * quedaba mirando a cualquier lado en cuanto alguien orbitaba. Sentarse
 * frente a la mesa no puede depender de desde dónde mires tú.
 */
const WORLD_FACING = {
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

export class NPC {
  constructor(
    look,
    { id, x, z, radius = 0.28 * S, height = 1.4 * S, facing = "south", sway = 0, pose = "sitWork", navmesh = null } = {}
  ) {
    this.id = id;
    this.position = { x, z };
    this.home = { x, z };
    this.radius = radius;
    this.sway = sway * S;
    this.homeFacing = facing;
    this.homeDir = WORLD_FACING[facing] ?? WORLD_FACING.south;
    this.navmesh = navmesh;
    // La pose de "estar en su puesto". `null` explícito en el JSON = de pie.
    this.homePose = pose;

    this.sprite = new Character3D(look, { height });
    this.sprite.setHeading(this.homeDir.x, this.homeDir.z);
    this.sprite.setPosition(x, z);
    this._phase = Math.random() * Math.PI * 2;

    // Ciclo de vida: settle → (rato) → stroll → pause → return → settle…
    this._state = "settle";
    // Desfasados entre sí: si todos arrancan con el mismo reloj, el piso
    // entero se levanta a pasear a la vez como un simulacro de incendio.
    this._timer = 6 + Math.random() * 20;
    this._target = null;
    this._path = null;
  }

  get object3D() {
    return this.sprite.object;
  }

  /** Un empujón: medio segundo de tambaleo. Lo dispara game._updateBumps. */
  stumble() {
    this._stumbleLeft = 0.55;
  }

  /** ¿Está ahora mismo sentado en su puesto? (para que el empujón ruede). */
  get isSeated() {
    return this._state === "settle" && !!this.homePose && this.sprite._poseName === this.homePose;
  }

  /**
   * El empujón a alguien SENTADO: la silla de rueditas se lo lleva en la
   * dirección del golpe, girando un poco, y cuando la silla se para se
   * levanta y vuelve a su puesto andando. La computadora ni se entera.
   */
  rollAway(nx, nz) {
    if (this._state === "roll") return;
    // Empujón franco y giro discreto: el chiste es que la silla LO LLEVE a
    // otro lado, no que dé vueltas como un trompo en el sitio.
    const speed = (3.4 + Math.random() * 1.2) * S;
    this._rollVX = nx * speed;
    this._rollVZ = nz * speed;
    this._rollSpin = (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random());
    this._rollBlocked = 0;
    this._state = "roll";
  }

  /** Un punto alcanzable a un par de mesas de distancia, o null. */
  _pickStrollTarget() {
    if (!this.navmesh) return null;
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = (2 + Math.random() * 3) * S;
      const cand = this.navmesh.snap(this.home.x + Math.cos(ang) * dist, this.home.z + Math.sin(ang) * dist);
      if (!cand) continue;
      const path = this.navmesh.path(this.position, cand);
      if (path?.length) return { target: cand, path };
    }
    return null;
  }

  _walkAlong(dt) {
    if (!this._path?.length) return true;
    while (
      this._path.length > 1 &&
      Math.hypot(this._path[0].x - this.position.x, this._path[0].z - this.position.z) < ARRIVE_EPS
    ) {
      this._path.shift();
    }
    const wp = this._path[0];
    const dx = wp.x - this.position.x;
    const dz = wp.z - this.position.z;
    const d = Math.hypot(dx, dz);
    if (d < ARRIVE_EPS && this._path.length <= 1) return true;
    const step = Math.min(d, STROLL_SPEED * dt);
    this.position.x += (dx / d) * step;
    this.position.z += (dz / d) * step;
    this.sprite.setHeading(dx / d, dz / d);
    this.sprite.setMoving(true);
    this.sprite.setPosition(this.position.x, this.position.z);
    return false;
  }

  update(dt, t) {
    this._timer -= dt;
    // Tambaleo del choque: un bamboleo corto que se apaga solo. Se escribe
    // sobre la rotación Z del grupo (la Y es del rumbo), así no pisa nada.
    if (this._stumbleLeft > 0) {
      this._stumbleLeft -= dt;
      const k = Math.max(0, this._stumbleLeft / 0.55);
      this.sprite.object.rotation.z = Math.sin(this._stumbleLeft * 24) * 0.16 * k;
      if (this._stumbleLeft <= 0) this.sprite.object.rotation.z = 0;
    }
    switch (this._state) {
      case "roll": {
        // La silla de rueditas se lo lleva: sigue SENTADO (la silla es hija
        // suya y rueda con él; el escritorio y la computadora, ancladas al
        // mundo, se quedan trabajando solas). El empujón decae, gira un
        // poquito sobre sí mismo, y al pararse se levanta y vuelve andando.
        const speed = Math.hypot(this._rollVX, this._rollVZ);
        if (speed > 0.25 * S) {
          // La silla rueda, pero por el SUELO transitable: el navmesh la
          // sujeta y no cruza paredes ni se cuela dentro de un mueble.
          const next = this.navmesh?.snap(this.position.x + this._rollVX * dt, this.position.z + this._rollVZ * dt) ?? {
            x: this.position.x + this._rollVX * dt,
            z: this.position.z + this._rollVZ * dt,
          };
          // Si el navmesh se come el paso (una pared, la mesa), no tiene
          // sentido seguir girando en el sitio: se levanta y ya.
          const intended = speed * dt;
          const got = Math.hypot(next.x - this.position.x, next.z - this.position.z);
          this._rollBlocked = got < intended * 0.25 ? this._rollBlocked + dt : 0;
          if (this._rollBlocked > 0.3) {
            this._rollVX = 0;
            this._rollVZ = 0;
          }
          this.position.x = next.x;
          this.position.z = next.z;
          const damp = Math.pow(0.25, dt);
          this._rollVX *= damp;
          this._rollVZ *= damp;
          // El girito va por el yaw objetivo: la rotación directa la pisa
          // _updateTurn en el mismo frame.
          this.sprite._targetYaw += this._rollSpin * dt;
          this.sprite.setPosition(this.position.x, this.position.z);
        } else {
          this.sprite.setPose(null);
          this._path = this.navmesh?.path(this.position, this.home) ?? null;
          this._state = this._path?.length ? "return" : "teleportHome";
          this._timer = 0;
        }
        break;
      }
      case "settle": {
        // En su puesto: sentado trabajando (o de pie si su def lo pide), con
        // el vaivén sutil de siempre por encima si lo trae. El rumbo se
        // vuelve a fijar AL SENTARSE, en mundo: es lo que lo deja frente a
        // su mesa venga de donde venga el paseo.
        if (this.sprite._poseName !== this.homePose) {
          this.sprite.setHeading(this.homeDir.x, this.homeDir.z);
          this.sprite.setPose(this.homePose);
        }
        this.sprite.setMoving(false);
        if (this.sway > 0 && !this.homePose) {
          const offset = Math.sin(t * 0.6 + this._phase) * this.sway;
          const prev = this.position.x;
          this.position.x = this.home.x + offset;
          this.sprite.setHeading(this.position.x >= prev ? 1 : -1, 0);
          this.sprite.setMoving(Math.abs(this.position.x - prev) > 0.0005);
          this.sprite.setPosition(this.position.x, this.position.z);
        }
        if (this._timer <= 0) {
          const pick = this._pickStrollTarget();
          if (pick) {
            this.sprite.setPose(null);
            this._target = pick.target;
            this._path = pick.path;
            this._state = "stroll";
          } else {
            this._timer = 10 + Math.random() * 15;
          }
        }
        break;
      }
      case "stroll": {
        if (this._walkAlong(dt)) {
          this.sprite.setMoving(false);
          this._state = "pause";
          this._timer = 2 + Math.random() * 4;
        }
        break;
      }
      case "pause": {
        if (this._timer <= 0) {
          this._path = this.navmesh?.path(this.position, this.home) ?? null;
          this._state = this._path?.length ? "return" : "teleportHome";
        }
        break;
      }
      case "return": {
        if (this._walkAlong(dt)) {
          this.position.x = this.home.x;
          this.position.z = this.home.z;
          this.sprite.setPosition(this.position.x, this.position.z);
          this.sprite.setMoving(false);
          this.sprite.setHeading(this.homeDir.x, this.homeDir.z);
          this._state = "settle";
          this._timer = 15 + Math.random() * 30;
        }
        break;
      }
      default: {
        // Sin camino de vuelta (no debería pasar): a casa sin animación antes
        // de que se note.
        this.position.x = this.home.x;
        this.position.z = this.home.z;
        this.sprite.setPosition(this.position.x, this.position.z);
        this._state = "settle";
        this._timer = 15 + Math.random() * 30;
      }
    }
    this.sprite.update(dt);
  }
}
