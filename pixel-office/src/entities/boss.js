import * as THREE from "three";
import { CharacterSprite } from "./sprite.js";
import { facingFromGround } from "../scene/iso.js";
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

function buildConeGeometry(range, halfAngle, segments = 24) {
  const positions = [];
  for (let i = 0; i < segments; i++) {
    const t0 = -halfAngle + 2 * halfAngle * (i / segments);
    const t1 = -halfAngle + 2 * halfAngle * ((i + 1) / segments);
    positions.push(0, 0, 0);
    positions.push(Math.sin(t0) * range, 0, -Math.cos(t0) * range);
    positions.push(Math.sin(t1) * range, 0, -Math.cos(t1) * range);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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
  constructor(sheet, {
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
    name = "Jefe",
    coneColor = 0xf2c744,
    onSpot = null,
    config = null,
  }) {
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
    this.world = world;
    this.navmesh = navmesh;
    this.route = route;
    this.routeIndex = 0;
    this.position = { x: route[0].x, z: route[0].z };
    this.radius = radius;
    this.facingDir = { x: 0, z: -1 };

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

    this.sprite = new CharacterSprite(sheet, { height });
    this.sprite.setPosition(this.position.x, this.position.z);

    const geometry = buildConeGeometry(this.visionRange, this.halfAngle);
    this.baseConeColor = coneColor;
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: coneColor,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      // The cone is a gameplay readout, not a lit surface — keep it flat and
      // saturated regardless of scene exposure.
      toneMapped: false,
    });
    this.cone = new THREE.Mesh(geometry, this.coneMaterial);
    this.cone.position.set(this.position.x, 0.16, this.position.z);
    this.cone.renderOrder = 2;

    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, toneMapped: false })
    );
    this.cone.add(rim);
  }

  get object3D() {
    return this.sprite.object;
  }

  get isHunting() {
    return this.state === CHASE || this.state === SEARCH;
  }

  startChase() {
    this.state = CHASE;
    this.loseSightTimer = 0;
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
  }

  update(dt, player, npcs) {
    if (this.active === false) return;
    if (this._reportCooldown > 0) this._reportCooldown -= dt;
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
    if (dir) this.facingDir = dir;
    else if (this.playerVisible) {
      // Standing still but watching her — keep the cone trained on the player.
      const dx = player.position.x - this.position.x;
      const dz = player.position.z - this.position.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.001) this.facingDir = { x: dx / len, z: dz / len };
    }

    this.sprite.setFacing(facingFromGround(this.facingDir.x, this.facingDir.z, "south"));
    this.sprite.setMoving(!!dir);
    this.sprite.setPosition(this.position.x, this.position.z);
    this.sprite.update(dt);

    this.cone.position.set(this.position.x, 0.16, this.position.z);
    this.cone.rotation.y = facingRotationY(this.facingDir.x, this.facingDir.z);

    const hot = this.redAlert || this.state === CHASE;
    this.coneMaterial.color.set(
      hot ? 0xe6483f : this.state === SEARCH ? 0xe0a03c : this.baseConeColor
    );
    this.coneMaterial.opacity = hot ? 0.68 : 0.55;
  }

  _advanceState(dt, player) {
    switch (this.state) {
      case CHASE: {
        if (this.playerVisible) {
          this.loseSightTimer = 0;
        } else {
          this.loseSightTimer += dt;
          // Give up the direct pursuit and go sweep her last known spot.
          if (this.loseSightTimer > 1.2) {
            this.state = SEARCH;
            this.searchTarget = this.lastSeenPlayerPos ?? { ...this.position };
            this.searchTimer = 5;
          }
        }
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
    if (this.state === PATROL) {
      this.routeIndex = (this.routeIndex + 1) % this.route.length;
      this._waypointTimer = 0;
    } else if (this.state === SEARCH) {
      this._resumeNearestRoutePoint();
    } else if (this.state === INVESTIGATE) {
      this.investigateTimer = 0;
    } else if (this.state === CHASE) {
      // El objetivo en persecución es la posición exacta del jugador, que
      // puede quedar pegada a un mueble (justo lo que la hace un buen
      // escondite): sin esta rama, el jefe o el secuaz se quedaba empujando
      // esa esquina para siempre. Se rinde y barre la última posición vista,
      // como al perderle la pista por línea de visión.
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
      if (!player.isHiding) return { x: player.position.x, z: player.position.z };
      return this.lastSeenPlayerPos ?? this.route[this.routeIndex];
    }
    if (this.state === SEARCH) return this.searchTarget ?? this.route[this.routeIndex];
    if (this.state === INVESTIGATE) return this.investigateTarget;
    return this.prowlTarget ?? this.route[this.routeIndex];
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
      this._path = this.navmesh.path(this.position, target);
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
    if (!target) return null;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06 * S) return null;

    const nx = dx / dist;
    const nz = dz / dist;
    const step = this._speed() * dt;

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
    if (Math.hypot(rdx, rdz) < 1e-4) return null;
    return { x: nx, z: nz };
  }

  _updateVision(player, npcs) {
    this.playerVisible = false;
    this.redAlert = false;
    if (player.isHiding) return;

    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > this.visionRange || dist < 0.001) return;

    const toPlayer = { x: dx / dist, z: dz / dist };
    const cos = this.facingDir.x * toPlayer.x + this.facingDir.z * toPlayer.z;
    if (cos < Math.cos(this.halfAngle)) return;

    const blockers = npcs.map((n) => ({ x: n.position.x, z: n.position.z, radius: n.radius }));
    if (this.world && this.world.lineBlocked(this.position, player.position, blockers)) return;

    this.playerVisible = true;
    this.lastSeenPlayerPos = { x: player.position.x, z: player.position.z };
    // "Fingir que trabajas" is exactly the defence against being seen slacking.
    if (player.isDoingActivity && !player.isPretending) this.redAlert = true;
  }
}
