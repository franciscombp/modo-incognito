import * as THREE from "three";

const PATROL = "PATROL";
const INVESTIGATE = "INVESTIGATE";
const CHASE = "CHASE";

// Rotation (about Y) that points the cone's local -Z forward axis along
// world-space direction (dirX, dirZ). Derived directly from the Y-axis
// rotation formula rather than Object3D.lookAt, which produced inconsistent
// results for some directions (Euler-extraction ambiguity).
function facingRotationY(dirX, dirZ) {
  return Math.atan2(-dirX, -dirZ);
}

function buildConeGeometry(range, halfAngle, segments = 20) {
  const positions = [];
  for (let i = 0; i < segments; i++) {
    const t0 = -halfAngle + (2 * halfAngle) * (i / segments);
    const t1 = -halfAngle + (2 * halfAngle) * ((i + 1) / segments);
    positions.push(0, 0, 0);
    positions.push(Math.sin(t0) * range, 0, -Math.cos(t0) * range);
    positions.push(Math.sin(t1) * range, 0, -Math.cos(t1) * range);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// El jefe: patrols a fixed loop, sweeps a vision cone as it walks, gives
// chase when suspicion caps out, and can be pulled off-route by a
// distraction. Blocked line-of-sight and hidden players simply can't be
// seen, regardless of the cone.
export class Boss {
  constructor({ world, route, radius = 0.38 }) {
    this.world = world;
    this.route = route;
    this.routeIndex = 0;
    this.position = { x: route[0].x, z: route[0].z };
    this.radius = radius;
    this.facingDir = { x: 0, z: -1 };

    this.state = PATROL;
    this.speed = 2.5;
    this.investigateSpeed = 3.3;
    this.chaseSpeed = 4.3;

    this.investigateTarget = null;
    this.investigateTimer = 0;
    this.chaseTimer = 0;
    this.lastSeenPlayerPos = null;

    this.visionRange = 6.5;
    this.halfAngle = THREE.MathUtils.degToRad(27);

    this.playerVisible = false;
    this.redAlert = false;

    this._buildMesh();
  }

  _buildMesh() {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 60, 96);
    ctx.fillStyle = "#15161a";
    ctx.beginPath();
    ctx.ellipse(30, 90, 20, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#22252c";
    ctx.fillRect(14, 28, 32, 48);
    ctx.fillStyle = "#d9ad82";
    ctx.beginPath();
    ctx.arc(30, 17, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#15161a";
    ctx.fillRect(14, 30, 32, 8);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    this.sprite.scale.set(1.15, 1.75, 1);
    this.sprite.position.set(this.position.x, 0.87, this.position.z);

    const geometry = buildConeGeometry(this.visionRange, this.halfAngle);
    this.coneMaterial = new THREE.MeshBasicMaterial({
      color: 0xf2c744,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      // Keep the cone a flat, saturated color regardless of scene exposure —
      // it's a gameplay readout, not a lit surface.
      toneMapped: false,
    });
    this.cone = new THREE.Mesh(geometry, this.coneMaterial);
    this.cone.position.set(this.position.x, 0.12, this.position.z);
    this.cone.renderOrder = 1;

    const rim = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false })
    );
    this.cone.add(rim);
  }

  startChase() {
    this.state = CHASE;
    this.chaseTimer = 8;
  }

  distract(target, duration) {
    if (this.state === CHASE) return;
    this.state = INVESTIGATE;
    this.investigateTarget = { x: target.x, z: target.z };
    this.investigateTimer = duration;
  }

  catches(playerPos, playerRadius) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    return Math.hypot(dx, dz) < this.radius + playerRadius;
  }

  update(dt, player, npcs) {
    const target = this._pickTarget(player);
    const dir = this._moveToward(dt, target);

    if (dir) this.facingDir = dir;

    if (this.state === INVESTIGATE) {
      this.investigateTimer -= dt;
      if (this.investigateTimer <= 0 || this._reached(this.investigateTarget)) {
        this.state = PATROL;
      }
    } else if (this.state === CHASE) {
      this.chaseTimer -= dt;
      if (this.chaseTimer <= 0) this.state = PATROL;
    } else {
      if (this._reached(this.route[this.routeIndex])) {
        this.routeIndex = (this.routeIndex + 1) % this.route.length;
      }
    }

    this._updateVision(player, npcs);

    this.sprite.position.set(this.position.x, 0.87, this.position.z);
    this.cone.position.set(this.position.x, 0.12, this.position.z);
    this.cone.rotation.y = facingRotationY(this.facingDir.x, this.facingDir.z);
    this.coneMaterial.color.set(this.redAlert || this.state === CHASE ? 0xe6483f : 0xf2c744);
    this.coneMaterial.opacity = this.redAlert || this.state === CHASE ? 0.68 : 0.55;
  }

  _pickTarget(player) {
    if (this.state === CHASE) {
      return player.isHiding ? this.lastSeenPlayerPos ?? this.position : { x: player.position.x, z: player.position.z };
    }
    if (this.state === INVESTIGATE) return this.investigateTarget;
    return this.route[this.routeIndex];
  }

  _reached(target, eps = 0.35) {
    if (!target) return true;
    return Math.hypot(target.x - this.position.x, target.z - this.position.z) < eps;
  }

  _moveToward(dt, target) {
    if (!target) return null;
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return null;
    const speed = this.state === CHASE ? this.chaseSpeed : this.state === INVESTIGATE ? this.investigateSpeed : this.speed;
    const nx = dx / dist;
    const nz = dz / dist;
    this.position.x += nx * speed * dt;
    this.position.z += nz * speed * dt;
    if (this.world) this.world.resolveCircle(this.position, this.radius);
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
    if (player.isDoingActivity) this.redAlert = true;
  }
}
