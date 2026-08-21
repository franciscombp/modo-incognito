import { Character3D } from "./character3d.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { createWalker } from "./walk.js";

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
    {
      id,
      x,
      z,
      radius = 0.28 * S,
      height = 1.4 * S,
      facing = "south",
      sway = 0,
      pose = "sitWork",
      navmesh = null,
      world = null,
      // El puesto REAL que le tocó (scene/furniture.js → claimNearestSeat) y
      // cómo mover su silla. Sin asiento, se queda donde lo puso el JSON.
      seat = null,
      moveSeatChair = null,
    } = {}
  ) {
    this.id = id;
    this.seat = seat;
    this._moveSeatChair = moveSeatChair;
    // SENTARSE EN LA SILLA QUE HAY, no al lado. Las posiciones del JSON se
    // escribieron a mano y las sillas las genera `placeSeatedTable`: medido
    // en el día 1, el compañero sentado más cercano estaba a 0,76 unidades
    // de su silla — casi tres veces el radio de la silla. El JSON sigue
    // decidiendo a QUÉ puesto pertenece cada quien (por cercanía); el
    // asiento decide el centímetro exacto y hacia dónde mira.
    if (seat) {
      x = seat.x;
      z = seat.z;
    }
    this.position = { x, z };
    this.home = { x, z };
    this.radius = radius;
    this.sway = sway * S;
    this.homeFacing = facing;
    this.homeDir = seat
      ? { x: Math.sin(seat.facing), z: Math.cos(seat.facing) }
      : WORLD_FACING[facing] ?? WORLD_FACING.south;
    this.navmesh = navmesh;
    this.world = world;
    // SU PASEO, con anti-atasco (walk.js). Antes esto era un recorrer la ruta
    // waypoint a waypoint sin resolver colisiones ni medir si avanzaba: como
    // la separación de cuerpos (game.js → `_updateCrowdSeparation`) empuja a
    // los figurantes fuera de su ruta, uno empujado contra un mueble se
    // quedaba moliendo contra él para siempre — su waypoint seguía estando al
    // otro lado y nada le decía que dejara de intentarlo.
    this._walker = createWalker({ navmesh, world, radius });
    // La pose de "estar en su puesto". `null` explícito en el JSON = de pie.
    //
    // SIN SILLA NO HAY SENTARSE. Quien no consiguió puesto (el plano lo dejó
    // lejos de cualquier mesa) se queda DE PIE: antes la silla se la traía
    // el propio personaje, así que daba igual dónde estuviera; ahora la
    // silla es la del escenario, y mantener la pose sentada sin una debajo
    // deja a alguien flotando en cuclillas en mitad del pasillo.
    this.homePose = pose === "sitWork" && !seat ? null : pose;

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
   *
   * La silla que rueda es LA DEL PUESTO (una instancia del escenario que se
   * mueve, ver `moveSeatChair`), no una que el personaje llevara encima: esa
   * era justo la que sobraba y hacía que cada puesto tuviera dos.
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

  /**
   * LAS SEIS: a casa. Se levanta, deja su puesto y camina a los ascensores;
   * al llegar, desaparece del piso.
   *
   * El `delay` escalona las salidas. Con todos saliendo en el mismo cuadro
   * el piso se vacía de golpe, que se lee como un fallo del juego y no como
   * una oficina cerrando — igual que los relojes desfasados del paseo, la
   * gracia está en que no se muevan a la vez.
   */
  leaveFloor(exit, delay = 0) {
    if (!exit || this._state === "leaving" || this._state === "gone") return;
    // La silla vuelve a su sitio: se va de la oficina, no se lleva el
    // mobiliario (ver moveSeatChair).
    this._moveSeatChair?.(this.seat, null);
    this.sprite.setPose(null);
    // Un punto a la redonda de la puerta, para que no se apilen los diez en
    // el mismo metro cuadrado esperando su turno.
    //
    // SNAP AL NAVMESH, y no es un detalle: el centro de la zona de
    // ascensores (más el desperdigado) cae fácilmente dentro del hueco del
    // ascensor o contra un muro, o sea en una casilla NO transitable. Pedir
    // ruta a un punto inalcanzable hace que el A* recorra la rejilla ENTERA
    // antes de rendirse — medido, ~12 segundos por compañero. Con diez
    // saliendo a la vez, el juego se congelaba varios segundos justo al dar
    // las seis, que es el peor momento posible para congelarse.
    const suelto = {
      x: exit.x + (Math.random() - 0.5) * (exit.w ?? 2) * 0.6,
      z: exit.z + (Math.random() - 0.5) * (exit.d ?? 2) * 0.6,
    };
    this._exit = this.navmesh?.snap(suelto.x, suelto.z) ?? suelto;
    this._leaveIn = delay;
    // Techo de paciencia: si a los quince segundos sigue por el pasillo
    // (le tocó salir desde el otro extremo del ala), se le retira igual. La
    // oficina tiene que quedar vacía; nadie está contando cabezas.
    this._leaveLeft = 15;
    this._state = "leaving";
    this._walker.parar();
  }

  /** Un punto alcanzable a un par de mesas de distancia, o null. */
  _pickStrollTarget() {
    if (!this.navmesh) return null;
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = (2 + Math.random() * 3) * S;
      const cand = this.navmesh.snap(this.home.x + Math.cos(ang) * dist, this.home.z + Math.sin(ang) * dist);
      if (!cand) continue;
      // Se comprueba que HAY camino antes de echar a andar: un destino
      // inalcanzable no se distingue, mirándolo, de alguien que se quedó
      // pasmado. El paseo de verdad lo lleva el caminante compartido.
      if (this.navmesh.path(this.position, cand)?.length) return cand;
    }
    return null;
  }

  /**
   * UN CUADRO DE PASEO. Devuelve qué pasó, y el «atascado» es la novedad:
   * antes no existía, así que un figurante empujado contra un mueble se
   * quedaba moliendo contra él indefinidamente.
   *
   * @returns {"andando"|"llego"|"atascado"}
   */
  _andar(dt) {
    const r = this._walker.paso(dt, this.position, {
      tol: ARRIVE_EPS,
      velocidad: STROLL_SPEED,
    });
    if (r.llego) return "llego";
    if (r.abandonado) return "atascado";
    if (!r.dir) return "andando";
    const step = STROLL_SPEED * dt;
    this.position.x += r.dir.x * step;
    this.position.z += r.dir.z * step;
    // Y PASA POR LAS COLISIONES, que es lo que aquí faltaba entero: el paseo
    // viejo escribía la posición a pelo, así que un figurante desviado de su
    // ruta caminaba DENTRO de los muebles hasta volver a ella.
    this.world?.resolveCircle(this.position, this.radius);
    this.sprite.setHeading(r.dir.x, r.dir.z);
    this.sprite.setMoving(true);
    this.sprite.setPosition(this.position.x, this.position.z);
    return "andando";
  }

  /**
   * NO PUEDE VOLVER A SU SITIO. Pasa poco (hace falta que algo se plante en
   * el hueco de su mesa un buen rato), pero cuando pasa hay que resolverlo
   * SIN teletransportar a nadie y sin dejarlo moliendo.
   *
   * Se reintenta un par de veces —normalmente el estorbo se aparta solo— y,
   * si no hay manera, ADOPTA EL SITIO donde está: se queda ahí de pie, suelta
   * su silla y sigue con su ciclo. Un figurante de fondo plantado en otro
   * metro cuadrado no lo nota nadie; uno vibrando contra una maceta, sí.
   */
  _rendirseVolviendo() {
    this._intentosVuelta = (this._intentosVuelta ?? 0) + 1;
    if (this._intentosVuelta < 3) {
      this._state = "pause";
      this._timer = 1 + Math.random() * 2;
      return;
    }
    this._intentosVuelta = 0;
    this.home = { x: this.position.x, z: this.position.z };
    this.homePose = null; // de pie: sentarse sin silla debajo deja a alguien flotando
    this._moveSeatChair?.(this.seat, null);
    this.seat = null;
    this.sprite.setMoving(false);
    this._state = "settle";
    this._timer = 15 + Math.random() * 30;
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
      case "leaving": {
        // Espera su turno para levantarse y luego enfila hacia la puerta.
        if (this._leaveIn > 0) {
          this._leaveIn -= dt;
          this.sprite.setMoving(false);
          break;
        }
        // ── SIN NAVMESH, Y A PROPÓSITO ───────────────────────────────
        // Esto pedía ruta al ascensor con A*. Medido: ~3 segundos por
        // compañero, porque es un trayecto que cruza el piso ENTERO
        // (rejilla de 152x55). Con diez saliendo a la vez, el juego se
        // congelaba más de treinta segundos justo al dar las seis — el
        // peor momento posible para congelarse.
        //
        // Un figurante que se va a casa no necesita ruta: nadie va a
        // seguirle para ver si rozó una mesa camino del ascensor. Camina
        // derecho, y se le retira en cuanto llega o al cabo de un rato.
        // Lo que tiene que leerse es que la oficina se VACÍA, y eso se lee
        // igual de bien sin gastar un pathfinding por cabeza.
        this._leaveLeft -= dt;
        const dx = this._exit.x - this.position.x;
        const dz = this._exit.z - this.position.z;
        const d = Math.hypot(dx, dz);
        if (d < ARRIVE_EPS || this._leaveLeft <= 0) {
          this._state = "gone";
          break;
        }
        const step = Math.min(d, STROLL_SPEED * dt);
        this.position.x += (dx / d) * step;
        this.position.z += (dz / d) * step;
        this.sprite.setHeading(dx / d, dz / d);
        this.sprite.setMoving(true);
        this.sprite.setPosition(this.position.x, this.position.z);
        break;
      }
      case "gone": {
        // Fuera del piso: ni se ve, ni tapa la vista del jefe, ni ocupa
        // sitio. `active = false` es lo que ya usa el resto del motor para
        // "este no está" (ver game._liveNpcsBuf).
        if (this.active !== false) {
          this.active = false;
          this.sprite.object.visible = false;
        }
        break;
      }
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
          // Y la silla del puesto rueda con él, que es el chiste entero.
          this._moveSeatChair?.(this.seat, this.position.x, this.position.z, this.sprite._targetYaw);
        } else {
          this.sprite.setPose(null);
          this._walker.ir(this.home.x, this.home.z);
          this._state = "return";
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
          // Vuelve a su puesto: y la silla, si se la habían llevado rodando,
          // vuelve con él. Se devuelve AQUÍ y no al terminar el rodaje para
          // que el salto de la silla coincida con el momento en que su dueño
          // se sienta — el ojo está en él, así que se lee como que la arrimó,
          // no como que la silla se teletransportó sola por el piso.
          this._moveSeatChair?.(this.seat, null);
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
          const cand = this._pickStrollTarget();
          if (cand) {
            this.sprite.setPose(null);
            this._target = cand;
            this._walker.ir(cand.x, cand.z);
            this._state = "stroll";
          } else {
            this._timer = 10 + Math.random() * 15;
          }
        }
        break;
      }
      case "stroll": {
        const r = this._andar(dt);
        // Atascarse dando una vuelta no es un drama: se da por paseado y se
        // vuelve. Lo que no puede pasar es seguir empujando el obstáculo.
        if (r === "llego" || r === "atascado") {
          this.sprite.setMoving(false);
          this._state = "pause";
          this._timer = 2 + Math.random() * 4;
        }
        break;
      }
      case "pause": {
        if (this._timer <= 0) {
          this._walker.ir(this.home.x, this.home.z);
          this._state = "return";
        }
        break;
      }
      case "return": {
        const r = this._andar(dt);
        if (r === "atascado") {
          this._rendirseVolviendo();
          break;
        }
        if (r === "llego") {
          this._intentosVuelta = 0;
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
