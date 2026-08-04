import * as THREE from "three";
import { Character3D } from "./character3d.js";
import { WORLD_SCALE as S } from "../scene/config.js";

export const BOSS_STATES = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
};

const { PATROL, INVESTIGATE, CHASE, SEARCH } = BOSS_STATES;

// Rotation (about Y) that points the cone's local -Z forward axis along
// world-space direction (dirX, dirZ). Derived analytically rather than via
// Object3D.lookAt, which produced inconsistent Euler extraction for some
// directions.
function facingRotationY(dirX, dirZ) {
  return Math.atan2(-dirX, -dirZ);
}

// El cono se dibuja con color POR VÉRTICE en RGBA: opaco en el vértice (donde
// está la mirada) y transparente en el borde exterior, además de más suave en
// los laterales que en el centro. Antes era un triángulo plano de opacidad
// única, que se leía como una cuña de cartulina pegada al suelo; con el
// degradado parece un haz de luz y además comunica mejor la mecánica — el
// peligro real está cerca del vértice, no en la punta lejana.
const CONE_ALPHA_CORE = 0.62; // en el vértice
const CONE_ALPHA_EDGE = 0.0; // en el arco exterior

// Radianes por segundo a los que gira la mirada. Persiguiendo gira casi al
// doble: está pendiente de ti, no paseando.
const TURN_RATE_CALM = 3.2;
const TURN_RATE_ALERT = 6.0;
// Cada cuántos segundos sale una onda nueva del radar de Washo.
const WAVE_PERIOD = 2.2;

// El haz NACE EN LOS OJOS. Antes el vértice estaba en el suelo, justo bajo
// los pies y dentro del cuerpo: con la cámara oblicua, mirando hacia el
// fondo el cono se dibujaba por encima del sprite y parecía salirle de la
// espalda o de un costado. Ahora el vértice sube a la altura de la mirada y
// se adelanta por delante del pecho, y el haz cae hasta el suelo en la punta
// — se lee como una mirada, no como una alfombra.
const EYE_HEIGHT = 0.82; // fracción de la altura del personaje
const EYE_FORWARD = 1.35; // veces el radio, hacia delante

function buildConeGeometry(range, halfAngle, segments = 28, apex = { y: 0, forward: 0 }) {
  const positions = [];
  const colors = [];
  // Local -Z es "hacia delante" (ver facingRotationY).
  const ax = 0;
  const ay = apex.y;
  const az = -apex.forward;

  // Suavidad angular: 1 en el eje central, 0 en los bordes laterales.
  const sideFade = (t) => {
    const k = Math.abs(t) / (halfAngle || 1e-3);
    return 1 - k * k * 0.75;
  };

  for (let i = 0; i < segments; i++) {
    const t0 = -halfAngle + 2 * halfAngle * (i / segments);
    const t1 = -halfAngle + 2 * halfAngle * ((i + 1) / segments);
    positions.push(ax, ay, az);
    positions.push(Math.sin(t0) * range, 0, -Math.cos(t0) * range);
    positions.push(Math.sin(t1) * range, 0, -Math.cos(t1) * range);
    // El color va en blanco: el tinte real lo pone material.color, así que
    // cambiar de amarillo a rojo en plena persecución sigue siendo una línea.
    colors.push(1, 1, 1, CONE_ALPHA_CORE);
    colors.push(1, 1, 1, CONE_ALPHA_EDGE * sideFade(t0));
    colors.push(1, 1, 1, CONE_ALPHA_EDGE * sideFade(t1));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  return geometry;
}

/**
 * Anillo plano para el radar de Washo. `inner`/`outer` en unidades de mundo;
 * el degradado va de opaco por dentro a transparente por fuera, para que la
 * onda se lea como un frente que se expande y no como una rosquilla.
 */
function buildRingGeometry(inner, outer, segments = 48) {
  const positions = [];
  const colors = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (a, r) => [Math.sin(a) * r, 0, -Math.cos(a) * r];
    const [ix0, , iz0] = p(a0, inner);
    const [ix1, , iz1] = p(a1, inner);
    const [ox0, , oz0] = p(a0, outer);
    const [ox1, , oz1] = p(a1, outer);
    positions.push(ix0, 0, iz0, ox0, 0, oz0, ox1, 0, oz1);
    positions.push(ix0, 0, iz0, ox1, 0, oz1, ix1, 0, iz1);
    for (const a of [1, 0, 0, 1, 0, 1]) colors.push(1, 1, 1, a);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  return geometry;
}

/**
 * El jefe. Patrols a fixed loop sweeping a vision cone; the moment he sees
 * the protagonist slacking off he breaks off the route and comes after her,
 * searching her last known position if she breaks line of sight. A
 * distraction pulls him away from whatever he was doing.
 */
export class Boss {
  // Like the player: `speeds`, `radius`, `height` and `visionRange` arrive
  // already scaled to world units from data/characters.json.
  constructor(look, {
    world,
    route,
    navmesh = null,
    radius = 0.3 * S,
    height = 1.55 * S,
    speeds = {},
    visionRange = 7.5 * S,
    visionHalfAngleDeg = 30,
    speedMul = 1,
    role = "boss",
    name = "Gabo",
    coneColor = 0xf2c744,
    visionShape = "cone", // "cone" | "radar" (ver characters.json)
    onSpot = null,
    config = null,
  }) {
    this.visionShape = visionShape;
    // "minion" watchers never grab you themselves — they report you, which
    // sends the real boss to that spot. That makes them a different kind of
    // threat instead of three more bosses.
    this.role = role;
    this.name = name;
    this.onSpot = onSpot;
    this._reportCooldown = 0;
    // Aproximación en dos fases (data/boss-config.json): con poca sospecha el
    // jefe tarda en llegar a la persecución a fondo, así que hay margen para
    // esconderse o fingir; a partir del umbral viene con todo.
    this.reportingCooldown = config?.reportingCooldown ?? 8;
    this.approachSpeedSlow = config?.approachSpeedSlow != null ? config.approachSpeedSlow * S : null;
    this.approachSpeedFast = config?.approachSpeedFast != null ? config.approachSpeedFast * S : null;
    this.suspicionThresholdFastApproach = config?.suspicionThresholdFastApproach ?? 90;
    this.suspicion = 0; // Game lo actualiza cada frame antes de update()
    this._graceTimer = 0; // grantGrace(): unos segundos ciego tras amonestar
    this.world = world;
    this.navmesh = navmesh;
    this.route = route;
    this.routeIndex = 0;
    this.position = { x: route[0].x, z: route[0].z };
    this.radius = radius;
    this.facingDir = { x: 0, z: -1 };
    // Hacia dónde QUIERE mirar. `facingDir` lo persigue suavemente cada
    // frame: antes el cono saltaba de golpe a la nueva dirección y se leía
    // como un parpadeo, sobre todo al girar hacia la jugadora de cerca.
    this.desiredFacing = { x: 0, z: -1 };
    // Si el paso de este frame movió el cuerpo de verdad (ver _moveToward) —
    // separado de "hacia dónde quiere ir", que sigue actualizándose aunque
    // esté quieto girando hacia allá.
    this._actuallyMoving = false;
    // Persecución comprometida: en cuanto te mete en el halo no te suelta
    // hasta alcanzarte. Solo un lugar seguro (game.js) lo cancela.
    this.lockedOn = false;
    this._waveTime = 0;

    // Path following state, so he rounds the big tables and the restroom
    // cores instead of grinding into them.
    this._path = null;
    this._pathTarget = null;
    this._repathTimer = 0;

    // Anti-stall. A waypoint the boss cannot physically reach used to freeze
    // him against a table for the whole day, which read as "the boss does
    // nothing". Now: if he stops making progress he gives up on that target.
    this._stuckTimer = 0;
    this._lastPos = { x: this.position.x, z: this.position.z };
    this._waypointTimer = 0;

    // Periodic prowl: he does not only walk his loop, he wanders toward
    // wherever the slacking is likely to happen.
    this.prowlTarget = null;
    this.prowlTimer = 0;
    this.pointsOfInterest = [];

    // Correa: en vez de dar su vuelta por todo el piso, se queda rondando a
    // alguien (la jugadora). Ver setTether().
    this.tether = null;
    this._tetherTarget = null;

    this.state = PATROL;
    this.baseSpeeds = {
      patrol: speeds.patrol ?? 2.4 * S,
      investigate: speeds.investigate ?? 3.2 * S,
      chase: speeds.chase ?? 4.9 * S, // faster than the player, so cover matters
      search: speeds.search ?? 3.0 * S,
    };
    this.speed = this.baseSpeeds.patrol * speedMul;
    this.investigateSpeed = this.baseSpeeds.investigate * speedMul;
    this.chaseSpeed = this.baseSpeeds.chase * speedMul;
    this.searchSpeed = this.baseSpeeds.search * speedMul;

    this.investigateTarget = null;
    this.investigateTimer = 0;
    this.searchTarget = null;
    this.searchTimer = 0;
    this.loseSightTimer = 0;
    this.lastSeenPlayerPos = null;

    this.baseVisionRange = visionRange;
    this.visionRange = visionRange;
    this.halfAngle = THREE.MathUtils.degToRad(visionHalfAngleDeg);

    this.playerVisible = false;
    this.redAlert = false;

    this.sprite = new Character3D(look, { height });
    this.sprite.setPosition(this.position.x, this.position.z);

    this.baseConeColor = coneColor;
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: coneColor,
      transparent: true,
      opacity: 1, // el degradado vive en el alfa por vértice
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      // The cone is a gameplay readout, not a lit surface — keep it flat and
      // saturated regardless of scene exposure.
      toneMapped: false,
    });

    if (this.visionShape === "radar") {
      // Washo no mira: barre. Su alcance es un círculo completo y lo anuncia
      // con ondas que salen de él, así que se entiende de un vistazo que el
      // peligro no depende de hacia dónde esté mirando.
      this.cone = new THREE.Mesh(
        buildRingGeometry(this.visionRange * 0.985, this.visionRange),
        this.coneMaterial
      );
      this.cone.position.set(this.position.x, 0.16, this.position.z);
      this.cone.renderOrder = 2;

      this._waves = [0, 1 / 3, 2 / 3].map((phase) => {
        const material = new THREE.MeshBasicMaterial({
          color: coneColor,
          transparent: true,
          opacity: 1,
          vertexColors: true,
          side: THREE.DoubleSide,
          depthWrite: false,
          toneMapped: false,
        });
        // Geometría de radio 1: la onda se escala en update(), así que no hay
        // que reconstruir buffers cada frame.
        const mesh = new THREE.Mesh(buildRingGeometry(0.86, 1), material);
        mesh.position.y = 0.005;
        this.cone.add(mesh);
        return { mesh, material, phase };
      });
    } else {
      const geometry = buildConeGeometry(this.visionRange, this.halfAngle, 28, {
        y: height * EYE_HEIGHT - 0.16,
        forward: this.radius * EYE_FORWARD,
      });
      this.cone = new THREE.Mesh(geometry, this.coneMaterial);
      this.cone.position.set(this.position.x, 0.16, this.position.z);
      this.cone.renderOrder = 2;
      this._waves = null;
    }
  }

  get object3D() {
    return this.sprite.object;
  }

  /** Un empujón de la jugadora: bamboleo corto. Ver game._updateBumps. */
  stumble() {
    this._stumbleLeft = 0.55;
  }

  get isHunting() {
    return this.state === CHASE || this.state === SEARCH;
  }

  startChase() {
    this.state = CHASE;
    this.loseSightTimer = 0;
    this.lockedOn = true;
  }

  /**
   * Cortar la persecución de verdad. Lo llama game.js cuando la jugadora
   * alcanza un lugar seguro (bebedero, baño, su propia mesa): ahí no puede
   * seguir persiguiéndola sin quedar él en evidencia, así que suelta la presa
   * y vuelve a la ronda. Es la ÚNICA salida a un `lockedOn`, junto con
   * alcanzarla; esconderse o fingir ya no bastan una vez te tiene fichada.
   */
  breakPursuit() {
    if (!this.lockedOn && this.state !== CHASE && this.state !== SEARCH) return false;
    this.lockedOn = false;
    this._resumeNearestRoutePoint();
    return true;
  }

  distract(target, duration) {
    if (this.state === CHASE) return false;
    this.state = INVESTIGATE;
    this.investigateTarget = { x: target.x, z: target.z };
    this.investigateTimer = duration;
    return true;
  }

  catches(playerPos, playerRadius) {
    if (this.role === "minion") return false;
    return (
      Math.hypot(playerPos.x - this.position.x, playerPos.z - this.position.z) <
      this.radius + playerRadius + 0.25 * S
    );
  }

  /** Where slacking tends to happen: the boss drifts toward these on patrol. */
  /**
   * Atarlo a alguien: mientras patrulla no se va del piso entero, se queda
   * orbitando a `target` (un objeto vivo con .x/.z, normalmente
   * player.position). Si se aleja mas de `far` camina hasta ponerse a `near`;
   * dentro de esa banda sigue con su ronda normal, asi que no se le ve
   * pegado como una sombra sino "casualmente por aquí" todo el rato.
   *
   * No toca la persecucion: perseguir, investigar y buscar siguen mandando.
   */
  setTether(target, { near = 5 * S, far = 9 * S } = {}) {
    this.tether = target ? { target, near, far } : null;
    this._tetherTarget = null;
  }

  setPointsOfInterest(points) {
    this.pointsOfInterest = points;
    this.prowlTarget = null;
    this.prowlTimer = 4 + Math.random() * 6;
  }

  /** Swap the patrol loop (levels give minions their own round). */
  setRoute(route, startIndex = 0) {
    this.route = route;
    this.routeIndex = Math.min(startIndex, route.length - 1);
    this.position.x = route[this.routeIndex].x;
    this.position.z = route[this.routeIndex].z;
    this._path = null;
    this._waypointTimer = 0;
    this._stuckTimer = 0;
    this.resetToPatrol();
  }

  /** Watchers that are not on duty today are hidden, not destroyed. */
  setActive(active) {
    this.active = active;
    this.sprite.object.visible = active;
    this.cone.visible = active;
    if (!active) {
      // Stale readings from the instant before going off duty must not keep
      // counting: an inactive watcher does not see anyone.
      this.playerVisible = false;
      this.redAlert = false;
    }
  }

  /** Called by Game after a warning, so he gives up and goes back to work. */
  resetToPatrol() {
    this.state = PATROL;
    this.loseSightTimer = 0;
    this.searchTimer = 0;
    this.lastSeenPlayerPos = null;
    this.lockedOn = false;
  }

  /**
   * Unos segundos de gracia justo después de amonestarte: acaba de soltarte,
   * así que mirar para otro lado un momento (en vez de clavarte los ojos de
   * nuevo al instante) le da tiempo a alejarse antes de que la caza pueda
   * reanudarse de verdad.
   */
  grantGrace(duration) {
    this._graceTimer = duration;
  }

  get inGrace() {
    return this._graceTimer > 0;
  }

  /**
   * ¿Está `pos` dentro del alcance, sin mirar hacia dónde? Lo usa el radar de
   * Washo para frenarte: su efecto es de área, no de mirada, así que rodearlo
   * por detrás no te libra — es justo lo que la onda dibuja en el suelo.
   */
  inRange(pos) {
    if (this.active === false) return false;
    return Math.hypot(pos.x - this.position.x, pos.z - this.position.z) <= this.visionRange;
  }

  update(dt, player, npcs) {
    if (this.active === false) return;
    if (this._reportCooldown > 0) this._reportCooldown -= dt;
    if (this._graceTimer > 0) this._graceTimer -= dt;
    this._updateVision(player, npcs);

    // A minion that catches you slacking shouts for the boss instead of
    // grabbing you, then goes back to its round.
    if (this.role === "minion" && this.redAlert && this._reportCooldown <= 0) {
      this._reportCooldown = this.reportingCooldown;
      this.onSpot?.(this, { x: player.position.x, z: player.position.z });
    }

    this._advanceState(dt, player);
    this._updateStuck(dt);

    const target = this._pickTarget(player);
    const dir = this._moveToward(dt, this._steer(dt, target));
    // Adónde MIRA. Persiguiéndote (o simplemente teniéndote a la vista) el
    // cono se queda encarado a la jugadora aunque el cuerpo esté rodeando una
    // mesa; si no, mira hacia donde camina.
    if (this.playerVisible || this.lockedOn) {
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) this.desiredFacing = { x: dx / len, z: dz / len };
    } else if (dir) {
      this.desiredFacing = dir;
    }
    this._turnToward(dt);

    // El cuerpo gira con la misma dirección continua que el cono, así que el
    // jefe ya no puede mirar a un lado y alumbrar al contrario.
    this.sprite.setHeading(this.facingDir.x, this.facingDir.z);
    this.sprite.setMoving(this._actuallyMoving);
    this.sprite.setPosition(this.position.x, this.position.z);
    if (this._stumbleLeft > 0) {
      this._stumbleLeft -= dt;
      const k = Math.max(0, this._stumbleLeft / 0.55);
      this.sprite.object.rotation.z = Math.sin(this._stumbleLeft * 24) * 0.14 * k;
      if (this._stumbleLeft <= 0) this.sprite.object.rotation.z = 0;
    }
    this.sprite.update(dt);

    this.cone.position.set(this.position.x, 0.16, this.position.z);
    this.cone.rotation.y = facingRotationY(this.facingDir.x, this.facingDir.z);

    const hot = this.redAlert || this.state === CHASE;
    // El halo es un TERMÓMETRO: con la sospecha baja conserva su color base
    // tranquilo, y según sube se va tiñendo a ámbar y luego a rojo — el
    // nivel se lee del suelo sin abrir el HUD. Cazando (o viéndote en falta)
    // se planta en rojo pleno, y buscando en ámbar, pase lo que pase con el
    // medidor.
    const ratio = THREE.MathUtils.clamp(this.suspicionRatio ?? 0, 0, 1);
    if (hot) {
      this.coneMaterial.color.set(0xe6483f);
    } else if (this.state === SEARCH) {
      this.coneMaterial.color.set(0xe0a03c);
    } else {
      this._heatColor = this._heatColor ?? new THREE.Color();
      this._heatColor.set(this.baseConeColor);
      if (ratio > 0.35) {
        // 35%→70% funde hacia ámbar; 70%→100% de ámbar a rojo.
        const amber = this._amberColor ?? (this._amberColor = new THREE.Color(0xe0a03c));
        const red = this._redColor ?? (this._redColor = new THREE.Color(0xe6483f));
        if (ratio < 0.7) this._heatColor.lerp(amber, (ratio - 0.35) / 0.35);
        else this._heatColor.copy(amber).lerp(red, (ratio - 0.7) / 0.3);
      }
      this.coneMaterial.color.copy(this._heatColor);
    }
    this._updateWaves(dt, hot);
  }

  /**
   * Gira `facingDir` hacia `desiredFacing` a velocidad angular limitada, en
   * vez de teletransportar la mirada. Con la jugadora al lado el ángulo cambia
   * muy rápido, y el salto instantáneo hacía parpadear el cono de un lado a
   * otro; así el haz la sigue con un barrido continuo.
   */
  _turnToward(dt) {
    const current = Math.atan2(this.facingDir.x, this.facingDir.z);
    const wanted = Math.atan2(this.desiredFacing.x, this.desiredFacing.z);
    let delta = wanted - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    // Persiguiendo gira más rápido: está pendiente de ti, no distraído.
    const rate = (this.lockedOn || this.playerVisible ? TURN_RATE_ALERT : TURN_RATE_CALM) * dt;
    const step = THREE.MathUtils.clamp(delta, -rate, rate);
    const next = current + step;
    this.facingDir = { x: Math.sin(next), z: Math.cos(next) };
  }

  /** Ondas del radar de Washo: tres frentes que salen y se desvanecen. */
  _updateWaves(dt, hot) {
    if (!this._waves) return;
    this._waveTime += dt;
    const color = hot ? 0xe6483f : this.baseConeColor;
    for (const wave of this._waves) {
      const t = (this._waveTime / WAVE_PERIOD + wave.phase) % 1;
      // Arranca pegado a él y se expande hasta el borde de su alcance.
      const radius = this.visionRange * (0.12 + t * 0.88);
      wave.mesh.scale.set(radius, 1, radius);
      // Se apaga al llegar al borde; el frente joven es el más visible.
      wave.material.opacity = 0.5 * (1 - t) * (1 - t);
      wave.material.color.set(color);
    }
  }

  _advanceState(dt, player) {
    switch (this.state) {
      case CHASE: {
        if (this.playerVisible) {
          this.loseSightTimer = 0;
        } else if (!this.lockedOn) {
          this.loseSightTimer += dt;
          // Give up the direct pursuit and go sweep her last known spot.
          if (this.loseSightTimer > 1.2) {
            this.state = SEARCH;
            this.searchTarget = this.lastSeenPlayerPos ?? { ...this.position };
            this.searchTimer = 5;
          }
        }
        // Con lockedOn no hay rendición: te metió en el halo, así que viene
        // hasta alcanzarte. Perderle de vista (esconderte, doblar una
        // esquina) ya no basta — solo un lugar seguro lo corta, y de eso se
        // encarga game.js llamando a breakPursuit().
        break;
      }
      case SEARCH: {
        this.searchTimer -= dt;
        if (this.playerVisible) {
          this.startChase();
        } else if (this.searchTimer <= 0) {
          this._resumeNearestRoutePoint();
        }
        break;
      }
      case INVESTIGATE: {
        this.investigateTimer -= dt;
        if (this.playerVisible && player.isDoingActivity) {
          this.startChase();
        } else if (this.investigateTimer <= 0 || this._reached(this.investigateTarget)) {
          this._resumeNearestRoutePoint();
        }
        break;
      }
      default: {
        // Seeing her slacking off is what actually starts the pursuit.
        if (this.redAlert) {
          this.startChase();
          break;
        }
        // Con correa puesta, su ronda deja de ser el piso entero y pasa a ser
        // "donde estes tu". Se acerca hasta la banda `near` y ahi la suelta,
        // para volver a la ronda de siempre hasta que te vuelvas a alejar.
        if (this.tether) {
          const { target, near, far } = this.tether;
          const d = Math.hypot(target.x - this.position.x, target.z - this.position.z);
          if (d > far) {
            // Un punto sobre el anillo `near`, en la linea que los une: llega
            // a ponerse cerca, no encima.
            const k = near / (d || 1);
            this._tetherTarget = {
              x: target.x + (this.position.x - target.x) * k,
              z: target.z + (this.position.z - target.z) * k,
            };
          } else if (d < near) {
            this._tetherTarget = null;
          }
        } else {
          this._tetherTarget = null;
        }

        // Even without seeing her he keeps drifting toward wherever people
        // are most likely to be wasting time, so no corner of the floor is
        // ever permanently safe.
        this.prowlTimer -= dt;
        if (this.prowlTimer <= 0 && this.pointsOfInterest.length) {
          this.prowlTimer = 14 + Math.random() * 10;
          this.prowlTarget =
            this.pointsOfInterest[Math.floor(Math.random() * this.pointsOfInterest.length)];
        }
        if (this.prowlTarget && this._reached(this.prowlTarget, 1.6 * S)) this.prowlTarget = null;

        this._waypointTimer += dt;
        if (this._reached(this.route[this.routeIndex]) || this._waypointTimer > 14) {
          this.routeIndex = (this.routeIndex + 1) % this.route.length;
          this._waypointTimer = 0;
          this._path = null;
        }
        break;
      }
    }
  }

  /** Rejoin the patrol at whichever waypoint is closest, not waypoint 0. */
  _resumeNearestRoutePoint() {
    let best = 0;
    let bestD = Infinity;
    this.route.forEach((p, i) => {
      const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    this.routeIndex = best;
    this.state = PATROL;
    this.searchTimer = 0;
    this.loseSightTimer = 0;
  }

  /**
   * If he has barely moved for a while, whatever he is walking at is
   * unreachable. Drop it and pick something else rather than grinding into a
   * table until the day ends.
   */
  _updateStuck(dt) {
    const moved = Math.hypot(this.position.x - this._lastPos.x, this.position.z - this._lastPos.z);
    this._lastPos.x = this.position.x;
    this._lastPos.z = this.position.z;

    if (moved > 0.02 * S) {
      this._stuckTimer = 0;
      return;
    }
    this._stuckTimer += dt;
    if (this._stuckTimer < 1.4) return;

    this._stuckTimer = 0;
    this._path = null;
    this._pathTarget = null;
    this.prowlTarget = null;
    this._tetherTarget = null;
    if (this.state === PATROL) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this._waypointTimer = 0;
    } else if (this.state === SEARCH && !this.lockedOn) {
      this._resumeNearestRoutePoint();
    } else if (this.state === INVESTIGATE) {
      this.investigateTimer = 0;
    } else if (this.lockedOn) {
      // Comprometido: atascarse contra un mueble NO es motivo para soltarte.
      // Se limpia la ruta para replanificar y el empujón de abajo lo saca del
      // bloqueo, pero sigue viniendo. Sin esto, quedarte al otro lado de una
      // mesa bastaba para que desistiera — justo lo que el lugar seguro
      // debería ser el único en conseguir.
      this.state = CHASE;
    } else if (this.state === CHASE && !this.playerVisible) {
      // El objetivo en persecución es la posición exacta del jugador, que
      // puede quedar pegada a un mueble (justo lo que la hace un buen
      // escondite): sin esta rama, el jefe o el secuaz se quedaba empujando
      // esa esquina para siempre. Se rinde y barre la última posición vista,
      // como al perderle la pista por línea de visión. Pero si TODAVÍA la
      // ve (solo está atascado contra una esquina, o ya la alcanzó y no
      // puede acercarse más), no debe soltarla: el empujón de abajo lo
      // libera del atasco sin abandonar la persecución.
      this.state = SEARCH;
      this.searchTarget = this.lastSeenPlayerPos ?? { ...this.position };
      this.searchTimer = 5;
    }

    // Empujón lateral pequeño para salir de un bloqueo numérico exacto (dos
    // colisionadores que se cancelan cada frame): sin esto, el cambio de
    // objetivo de arriba no sirve de nada si la posición sigue exactamente
    // encajada donde estaba.
    const nudge = Math.random() * Math.PI * 2;
    this.position.x += Math.cos(nudge) * 0.5 * S;
    this.position.z += Math.sin(nudge) * 0.5 * S;
    if (this.world) this.world.resolveCircle(this.position, this.radius);
  }

  _pickTarget(player) {
    if (this.state === CHASE) {
      // Comprometido: va a por ella aunque se haya metido en un escondite.
      // Sin compromiso (una caza que arrancó de rebote) sigue valiendo el
      // escondite para despistarlo hacia la última posición conocida.
      if (this.lockedOn || !player.isHiding) {
        return { x: player.position.x, z: player.position.z };
      }
      return this.lastSeenPlayerPos ?? this.route[this.routeIndex];
    }
    if (this.state === SEARCH) return this.searchTarget ?? this.route[this.routeIndex];
    if (this.state === INVESTIGATE) return this.investigateTarget;
    return this._tetherTarget ?? this.prowlTarget ?? this.route[this.routeIndex];
  }

  /**
   * Turn a far-away goal into the next immediate step. While the straight
   * line is clear he just walks at it; the moment furniture is in the way he
   * follows a navmesh path instead, re-planning a couple of times a second.
   */
  _steer(dt, target) {
    if (!target || !this.navmesh) return target;
    this._repathTimer -= dt;

    if (this.world && !this.world.lineBlocked(this.position, target)) {
      this._path = null;
      return target;
    }

    const goalMoved =
      !this._pathTarget ||
      Math.hypot(this._pathTarget.x - target.x, this._pathTarget.z - target.z) > 1.2 * S;
    if (!this._path || goalMoved || this._repathTimer <= 0) {
      // Un objetivo inalcanzable (nearestWalkable falla, o no hay ruta)
      // devuelve null — y null es falsy, igual que "todavía no hay plan".
      // Sin el `?? []` esto reentraba en el `if` de arriba EN CADA FRAME
      // (nunca deja de ser falsy), así que cada perseguidor recalculaba un
      // A* sobre TODA la rejilla, 60 veces por segundo, hasta congelar el
      // juego. Un array vacío es "ya lo intenté" y respeta el enfriamiento.
      this._path = this.navmesh.path(this.position, target) ?? [];
      this._pathTarget = { x: target.x, z: target.z };
      this._repathTimer = 0.5;
    }
    if (!this._path || !this._path.length) return target;

    while (
      this._path.length > 1 &&
      Math.hypot(this._path[0].x - this.position.x, this._path[0].z - this.position.z) < 0.6 * S
    ) {
      this._path.shift();
    }
    return this._path[0];
  }

  _reached(target, eps = 0.4 * S) {
    if (!target) return true;
    return Math.hypot(target.x - this.position.x, target.z - this.position.z) < eps;
  }

  _speed() {
    if (this.state === CHASE) {
      // El jefe (no los secuaces, que nunca persiguen) tarda en tomar
      // velocidad mientras la sospecha no es crítica — eso da margen para
      // escapar — y solo va a fondo una vez se cruza el umbral.
      if (this.role === "boss" && this.approachSpeedSlow != null && this.approachSpeedFast != null) {
        return this.suspicion >= this.suspicionThresholdFastApproach
          ? this.approachSpeedFast
          : this.approachSpeedSlow;
      }
      return this.chaseSpeed;
    }
    if (this.state === SEARCH) return this.searchSpeed;
    if (this.state === INVESTIGATE) return this.investigateSpeed;
    return this.speed;
  }

  _moveToward(dt, target) {
    this._actuallyMoving = false;
    if (!target) return null;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06 * S) return null;

    const nx = dx / dist;
    const nz = dz / dist;

    // No camina de lado ni de espaldas: si el objetivo le queda a la
    // espalda, primero gira sobre sí mismo (a velocidad limitada, ver
    // _turnToward) y solo acelera hacia delante según `facingDir` se va
    // alineando con hacia dónde tiene que ir. `desiredFacing` se sigue
    // fijando a `nx,nz` más abajo pase lo que pase, así que el giro avanza
    // aunque el cuerpo se quede quieto este frame.
    const align = this.facingDir.x * nx + this.facingDir.z * nz;
    const step = this._speed() * dt * Math.max(0, align);
    if (step < 1e-5) return { x: nx, z: nz };

    const before = { x: this.position.x, z: this.position.z };
    this.position.x += nx * step;
    this.position.z += nz * step;
    if (this.world) this.world.resolveCircle(this.position, this.radius);

    // Simple wall-slide: if a collider ate the whole step, try each axis on
    // its own so he rounds desk banks instead of grinding into them.
    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    if (moved < step * 0.3) {
      for (const [ax, az] of [
        [nx, 0],
        [0, nz],
      ]) {
        this.position.x = before.x + ax * step;
        this.position.z = before.z + az * step;
        if (this.world) this.world.resolveCircle(this.position, this.radius);
        if (Math.hypot(this.position.x - before.x, this.position.z - before.z) > step * 0.3) break;
      }
    }

    const rdx = this.position.x - before.x;
    const rdz = this.position.z - before.z;
    this._actuallyMoving = Math.hypot(rdx, rdz) >= 1e-4;
    return { x: nx, z: nz };
  }

  _updateVision(player, npcs) {
    this.playerVisible = false;
    this.redAlert = false;
    if (player.isHiding || this._graceTimer > 0) return;

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.visionRange || dist < 0.001) return;

    // Un radar no tiene "delante": barre los 360°. Solo el cono comprueba
    // hacia dónde mira.
    if (this.visionShape !== "radar") {
      const toPlayer = { x: dx / dist, z: dz / dist };
      const cos = this.facingDir.x * toPlayer.x + this.facingDir.z * toPlayer.z;
      if (cos < Math.cos(this.halfAngle)) return;
    }

    // Un array + objetos nuevos por comprobación de visión, por cada
    // perseguidor, cada frame que el jugador está en rango: con el jefe y
    // varios secuaces persiguiendo a la vez eso es basura constante para el
    // recolector. Se reutiliza un array de esta instancia, del mismo tamaño
    // que `npcs` (estable durante la jornada), y solo se rellenan los campos.
    if (!this._blockersCache || this._blockersCache.length !== npcs.length) {
      this._blockersCache = npcs.map(() => ({ x: 0, z: 0, radius: 0 }));
    }
    const blockers = this._blockersCache;
    for (let i = 0; i < npcs.length; i++) {
      const b = blockers[i];
      const n = npcs[i];
      b.x = n.position.x;
      b.z = n.position.z;
      b.radius = n.radius;
    }
    if (this.world && this.world.lineBlocked(this.position, player.position, blockers)) return;

    this.playerVisible = true;
    this.lastSeenPlayerPos = { x: player.position.x, z: player.position.z };
    // "Fingir que trabajas" is exactly the defence against being seen slacking.
    // Boss only cares if the player has met them (otherwise they're dormant)
    const canAlert = this.role === "minion" ? this._playerMetMinion !== false : this._playerMetBoss !== false;
    if (player.isDoingActivity && !player.isPretending && canAlert) this.redAlert = true;
  }
}
