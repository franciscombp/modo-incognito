import * as THREE from "three";
import { CharacterSprite } from "./sprite.js";
import { facingFromGround } from "../scene/iso.js";

export const BOSS_STATES = {
  PATROL: "PATROL",
  INVESTIGATE: "INVESTIGATE",
  CHASE: "CHASE",
  SEARCH: "SEARCH",
};

const { PATROL, INVESTIGATE, CHASE, SEARCH } = BOSS_STATES;

// Rotation (about Y) that points the cone's local -Z forward axis along
// world-space direction (dirX, dirZ). Derived analytically rather than via
// Object3D.lookAt, which produced inconsistent Euler extraction for some directions.
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
  constructor(sheet, { world, route, radius = 0.3 }) {
    this.world = world;
    this.route = route;
    this.routeIndex = 0;
    this.position = { x: route[0].x, z: route[0].z };
    this.radius = radius;
    this.facingDir = { x: 0, z: -1 };

    this.state = PATROL;
    this.speed = 2.4;
    this.investigateSpeed = 3.2;
    this.chaseSpeed = 4.9; // faster than the player, so cover matters
    this.searchSpeed = 3.0;

    this.investigateTarget = null;
    this.investigateTimer = 0;
    this.searchTarget = null;
    this.searchTimer = 0;
    this.loseSightTimer = 0;
    this.lastSeenPlayerPos = null;

    this.visionRange = 7.5;
    this.halfAngle = THREE.MathUtils.degToRad(30);

    this.playerVisible = false;
    this.redAlert = false;

    this.sprite = new CharacterSprite(sheet, { height: 1.55 });
    this.sprite.setPosition(this.position.x, this.position.z);

    const geometry = buildConeGeometry(this.visionRange, this.halfAngle);
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2c744,
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
    return (
      Math.hypot(playerPos.x - this.position.x, playerPos.z - this.position.z) <
      this.radius + playerRadius + 0.25
    );
  }

  /** Called by Game after a warning, so he gives up and goes back to work. */
  resetToPatrol() {
    this.state = PATROL;
    this.loseSightTimer = 0;
    this.searchTimer = 0;
    this.lastSeenPlayerPos = null;
  }

  update(dt, player, npcs) {
    this._updateVision(player, npcs);
    this._advanceState(dt, player);

    const target = this._pickTarget(player);
    const dir = this._moveToward(dt, target);
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
    this.coneMaterial.color.set(hot ? 0xe6483f : this.state === SEARCH ? 0xe0a03c : 0xf2c744);
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
        } else if (this._reached(this.route[this.routeIndex])) {
          this.routeIndex = (this.routeIndex + 1) % this.route.length;
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

  _pickTarget(player) {
    if (this.state === CHASE) {
      if (!player.isHiding) return { x: player.position.x, z: player.position.z };
      return this.lastSeenPlayerPos ?? this.route[this.routeIndex];
    }
    if (this.state === SEARCH) return this.searchTarget ?? this.route[this.routeIndex];
    if (this.state === INVESTIGATE) return this.investigateTarget;
    return this.route[this.routeIndex];
  }

  _reached(target, eps = 0.4) {
    if (!target) return true;
    return Math.hypot(target.x - this.position.x, target.z - this.position.z) < eps;
  }

  _speed() {
    if (this.state === CHASE) return this.chaseSpeed;
    if (this.state === SEARCH) return this.searchSpeed;
    if (this.state === INVESTIGATE) return this.investigateSpeed;
    return this.speed;
  }

  _moveToward(dt, target) {
    if (!target) return null;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.06) return null;

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
