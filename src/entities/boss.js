import * as THREE from "three";
import { Character3D } from "./character3d.js";
import { WORLD_SCALE as S } from "../scene/config.js";
import { createAlertIcon, updateAlertIcon } from "./alertIcon.js";

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
const CONE_ALPHA_CORE = 0.34; // en el vértice
const CONE_ALPHA_EDGE = 0.0; // en el arco exterior

// LA PRESENCIA DEL HALO: cuánto pesa en pantalla, aparte de su color.
//
// Estaba clavada al máximo, y con ~7 vigilantes en el piso el suelo acababa
// cubierto de cuñas de color: el halo tapaba el escenario que se supone que
// tienes que leer para esconderte. Y encima se comía su propia escalada —
// si en ronda ya está a tope, la persecución solo puede cambiar de tono.
//
// Ahora el halo RESPIRA con la presión: en ronda es un susurro, y se va
// haciendo presente según sube la sospecha. El contraste comunica más que
// el brillo constante, y en el estado normal —que es donde pasas casi toda
// la jornada— el piso vuelve a verse.
const HALO_PRESENCE_CALM = 0.45; // en ronda, sin sospecha
const HALO_PRESENCE_HOT = 1; // cazando o viéndote en falta
// Velocidad a la que se funde entre esos dos. Saltar de golpe delata el
// frame exacto en que cambió el estado interno y se lee como un parpadeo.
const HALO_PRESENCE_EASE = 4;

// Los TRES colores del halo, y no hay más: azul claro = no te ha visto,
// ámbar = te tiene fichada, rojo = viene a por ti. Ver `update()`.
const HALO_CALM = 0x6fb2e0;
const HALO_AMBER = 0xe0a03c;
const HALO_RED = 0xe6483f;

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
    // Por debajo de esta sospecha no persigue: hace su ronda. Ver
    // `_mayChase()`, que es donde de verdad se aplica.
    this.chaseSuspicionFloor = config?.chaseSuspicionFloor ?? 40;
    this.suspicion = 0; // Game lo actualiza cada frame antes de update()
    // VIGILANCIA INDIVIDUAL: cuánto sospecha ESTE vigilante en concreto,
    // 0–1, aparte del medidor compartido del HUD. En el jefe, Game.js se
    // limita a copiar aquí la fracción del medidor compartido (sigue siendo
    // ÉL a quien representa ese número); en cada secuaz, Game.js lo hace
    // subir y bajar por su cuenta según lo que ESE secuaz ve — así Crispo
    // puede llevar medio camino de sospechar de ti mientras Washo, que no te
    // ha visto en toda la mañana, sigue a cero. Pinta el halo (más abajo, en
    // update()) y, solo en secuaces, decide cuándo rompe la ronda para
    // seguirte (ver _advanceState).
    this.localHeat = 0;
    // El umbral de ESTE vigilante. El jefe no lo usa para nada — su
    // persecución de verdad la sigue gobernando `chaseSuspicionFloor` sobre
    // el medidor compartido; esto es solo para que un secuaz decida cuándo
    // deja de rondar y se pone a seguirte.
    this.followThreshold = config?.followThreshold ?? 0.55;
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
      // El degradado a lo largo del haz vive en el alfa POR VÉRTICE; esta
      // opacidad es el mando global de PRESENCIA, y la mueve update() con la
      // presión (ver HALO_PRESENCE_*). Arranca en el susurro de la ronda.
      opacity: HALO_PRESENCE_CALM,
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

    // El globo de sospecha SOBRE SU CABEZA (ver entities/alertIcon.js): la
    // sospecha ya no es un número del jugador, es de quien sospecha.
    this.alertIcon = createAlertIcon(height);
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

  /**
   * ¿Le toca perseguir, o sigue a lo suyo?
   *
   * Con la sospecha baja el jefe hace su RONDA aunque te vea en falta. Antes
   * bastaba una alerta roja para que se lanzara desde el primer minuto, y con
   * Gabo además atado a la jugadora en el día 1 el resultado era que no
   * dejaba hacer nada: te veía, venía, te alcanzaba, vuelta a empezar.
   *
   * El respiro es la parte del bucle que faltaba. La tensión tiene que
   * SUBIR: primero te miran raro, luego te vigilan, y solo cuando ya has
   * acumulado sospecha se convierte en persecución. Sin esa rampa no hay
   * juego de sigilo, hay un pasillo con un perro suelto.
   *
   * Una vez comprometido (`lockedOn`) esto ya no aplica: bajar la sospecha
   * en mitad de la carrera no lo despista — de eso se encargan el lugar
   * seguro y el enfriamiento sostenido, en game.js.
   */
  _mayChase() {
    if (this.lockedOn) return true;
    if (this.chaseSuspicionFloor <= 0) return true;
    return this.suspicion >= this.chaseSuspicionFloor;
  }

  startChase() {
    // La puerta está aquí, y no en cada uno de los sitios que la llaman,
    // para que no se pueda colar una persecución nueva por una rama que
    // alguien añada mañana y olvide comprobar el umbral.
    if (!this._mayChase()) {
      // Te ha visto, pero no le da para perseguirte: se acerca a mirar. Se
      // nota que sospecha (viene hacia ti) sin que sea una cacería.
      if (this.state !== INVESTIGATE) {
        this.state = INVESTIGATE;
        this.investigateTarget = this.lastSeenPlayerPos
          ? { ...this.lastSeenPlayerPos }
          : { ...this.position };
        this.investigateTimer = 2.5;
      }
      return;
    }
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

  /**
   * ALEJARSE de verdad. `breakPursuit` retoma la ronda en el punto MÁS
   * CERCANO — o sea que el jefe soltaba la presa y se quedaba merodeando a
   * dos mesas de ti, y "llegué a mi puesto" no se sentía como llegar a
   * ninguna parte. Ahora, al cortarse la persecución por lugar seguro,
   * agarra hacia el waypoint de su ronda MÁS LEJOS de la jugadora y se le
   * dan unos segundos de gracia (sin observar) para que la retirada se VEA:
   * tú te sientas, él se va. La tensión vuelve a subir cuando su ronda lo
   * traiga de vuelta — que es el ciclo del juego, no un favor.
   */
  retreatFrom(pos, seconds = 6) {
    let pick = this.routeIndex;
    let best = -Infinity;
    this.route.forEach((p, i) => {
      const d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d > best) {
        best = d;
        pick = i;
      }
    });
    // La retirada va como INVESTIGATE hacia ese punto, no como PATROL: la
    // ronda deriva por diseño hacia los puntos de interés del día (prowl), y
    // dejada a su aire volvía a acercarse en cuanto una tarea caía cerca.
    // Investigar es el único estado con un destino IMPERATIVO — camina hasta
    // allí y, al agotarse el tiempo, retoma la ronda en ese mismo extremo
    // (routeIndex ya apunta ahí).
    const far = this.route[pick];
    this.lockedOn = false;
    this.state = INVESTIGATE;
    this.investigateTarget = { x: far.x, z: far.z };
    this.investigateTimer = seconds;
    this.routeIndex = pick;
    // El camino VIEJO se tira: breakPursuit acaba de trazar ruta al waypoint
    // más cercano, y sin limpiarla seguía caminando ESA — o sea, hacia ti.
    this._path = null;
    this._pathTarget = null;
    this.prowlTarget = null;
    this.grantGrace(seconds * 0.8);
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

  /**
   * SENTARLO A UNA MESA. Es lo que hace que la primera misión del día no sea
   * una persecución: Gabo está reunido en una sala, se le ve desde lejos y
   * vas a hablarle — en vez de correr detrás de alguien que patrulla el piso
   * entero mientras tú todavía no sabes ni dónde está tu puesto.
   *
   * Se sienta AL MONTAR EL PISO, nunca a mitad de partida: colocarlo de un
   * frame al siguiente sería el teletransporte que estamos quitando.
   *
   * Sigue MIRANDO (su cono, su halo y su sospecha funcionan igual); lo único
   * que se congela es que ande. Un jefe sentado que además fuera ciego sería
   * un mueble.
   */
  sitAt({ x, z, facing = 0 }) {
    this.position.x = x;
    this.position.z = z;
    this.seated = true;
    this.state = PATROL;
    this.lockedOn = false;
    this.facingDir = { x: Math.sin(facing), z: Math.cos(facing) };
    this.desiredFacing = { ...this.facingDir };
    this.sprite?.setHeading(this.facingDir.x, this.facingDir.z);
    this.sprite?.setPose?.("sitWork");
  }

  /** Se levanta y vuelve a su ronda. Lo llama la puerta del día al superarse. */
  standUp() {
    if (!this.seated) return;
    this.seated = false;
    this.sprite?.setPose?.(null);
    this._resumeNearestRoutePoint();
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
    // Ya sea el interrogatorio de un secuaz o la amonestación del jefe: se
    // resolvió, así que la vigilancia de ESTE vigilante vuelve a cero. Sin
    // esto, un secuaz recién reseteado a PATROL volvía a pasar su propio
    // umbral en el mismo frame y se ponía a seguirte otra vez de inmediato
    // — "vuelve a su ronda" se quedaba en el nombre, no en el hecho.
    this.localHeat = 0;
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
    // grabbing you, then goes back to its round. También avisa por
    // vigilancia sostenida (`localHeat` sobre su umbral) aunque nunca te
    // haya pillado con las manos en la masa — un secuaz que lleva un rato
    // siguiéndote igual termina llamando al jefe.
    if (
      this.role === "minion" &&
      (this.redAlert || this.localHeat >= this.followThreshold) &&
      this._reportCooldown <= 0
    ) {
      this._reportCooldown = this.reportingCooldown;
      this.onSpot?.(this, { x: player.position.x, z: player.position.z });
    }

    this._advanceState(dt, player);
    this._updateStuck(dt);

    const target = this._pickTarget(player);
    // Sentado NO se mueve — pero sigue viendo, girando la cabeza y
    // sospechando: eso ya pasó por encima. Un jefe sentado y ciego sería un
    // mueble; uno sentado y atento es una reunión de la que te vigila.
    const dir = this.seated ? null : this._moveToward(dt, this._steer(dt, target));
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
    // ── EL HALO DICE EN QUÉ FASE ESTÁS, EN TRES COLORES ──────────────
    //
    //   AZUL CLARO — no te ha visto. Está a lo suyo.
    //   ÁMBAR      — te tiene fichada: te vio, sospecha, o va a mirar.
    //   ROJO       — viene a por ti.
    //
    // Antes el color de reposo era el de CADA vigilante (`baseConeColor`:
    // Chispita amarillo, Washo turquesa, Crispo cobre), así que el amarillo
    // de Chispita en calma era indistinguible del ámbar de "te vi" de
    // cualquier otro. Un código de color que quiere decir peligro no puede
    // compartir tono con la identidad de nadie: quién es quién se sabe por
    // el cuerpo, que para eso cada uno tiene el suyo.
    //
    // El azul es además el único de los tres que NO alarma, que es justo lo
    // que tiene que comunicar el estado en el que pasas casi toda la
    // jornada.
    const ratio = THREE.MathUtils.clamp(this.localHeat ?? 0, 0, 1);
    if (hot) {
      this.coneMaterial.color.set(HALO_RED);
    } else if (this.state === SEARCH || this.state === INVESTIGATE) {
      // Buscando o yendo a mirar: te tiene fichada aunque no te vea ahora.
      this.coneMaterial.color.set(HALO_AMBER);
    } else {
      this._heatColor = this._heatColor ?? new THREE.Color();
      this._calmColor = this._calmColor ?? new THREE.Color(HALO_CALM);
      this._amberColor = this._amberColor ?? new THREE.Color(HALO_AMBER);
      this._heatColor.copy(this._calmColor);
      // Del azul al ámbar según SU propia vigilancia. Que te esté viendo
      // ahora mismo cuenta como medio camino aunque el medidor vaya frío:
      // el halo tiene que reaccionar en el momento en que entras en él, no
      // dos segundos después.
      const visto = Math.max(ratio, this.playerVisible ? 0.5 : 0);
      if (visto > 0) this._heatColor.lerp(this._amberColor, Math.min(1, visto));
      this.coneMaterial.color.copy(this._heatColor);
    }

    // Y además de teñirse, PESA más: en ronda es un susurro y en caza se
    // planta. El color dice QUÉ pasa; la presencia dice CUÁNTO importa, y
    // separarlos es lo que deja el piso visible el resto del tiempo.
    // `SEARCH` sube sin llegar al tope: te está buscando, no te tiene.
    const wanted = hot
      ? HALO_PRESENCE_HOT
      : this.state === SEARCH
        ? THREE.MathUtils.lerp(HALO_PRESENCE_CALM, HALO_PRESENCE_HOT, 0.6)
        : THREE.MathUtils.lerp(HALO_PRESENCE_CALM, HALO_PRESENCE_HOT, ratio);
    this._presence = this._presence ?? HALO_PRESENCE_CALM;
    this._presence += (wanted - this._presence) * Math.min(1, dt * HALO_PRESENCE_EASE);
    this.coneMaterial.opacity = this._presence;

    this._updateWaves(dt, hot, this._presence);

    // EL GLOBO DE ALERTA: la misma lectura que el halo (rojo = te tiene,
    // ámbar = sospecha), pero SOBRE SU CABEZA en vez de en un panel — así se
    // lee quién sospecha sin tener que abrir la placa de nadie. Un secuaz
    // cuenta además su PROPIO umbral de seguimiento (`followThreshold`): es
    // el mismo número que lo pone a seguirte de verdad, así que el globo se
    // pone rojo justo cuando deja de rondar y va a por ti.
    this._iconTime = (this._iconTime ?? 0) + dt;
    const following = this.role === "minion" && this.localHeat >= this.followThreshold;
    let alertState = null;
    if (hot || following) alertState = "red";
    else if (this.playerVisible || ratio > 0.12 || this.state === SEARCH || this.state === INVESTIGATE) {
      alertState = "amber";
    }
    // EL RELLENO del globo: lo cerca que está ESTA persona de actuar, que no
    // es lo mismo para cada rol. Un secuaz mide contra SU `followThreshold`
    // —el número que le hace romper la ronda y seguirte—, así que el aro se
    // completa justo cuando se pone en marcha. El jefe ES el medidor
    // compartido, así que el suyo es la fracción a secas.
    const fill =
      this.role === "minion" && this.followThreshold > 0
        ? this.localHeat / this.followThreshold
        : ratio;
    updateAlertIcon(
      this.alertIcon,
      this.position.x,
      this.position.z,
      alertState,
      this._iconTime,
      fill
    );
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
  _updateWaves(dt, hot, presence = 1) {
    if (!this._waves) return;
    this._waveTime += dt;
    // Las ondas del radar hablan el MISMO idioma que el cono, o Washo sería
    // el único vigilante cuyo color no significa nada.
    const color = hot ? HALO_RED : this.playerVisible ? HALO_AMBER : HALO_CALM;
    for (const wave of this._waves) {
      const t = (this._waveTime / WAVE_PERIOD + wave.phase) % 1;
      // Arranca pegado a él y se expande hasta el borde de su alcance.
      const radius = this.visionRange * (0.12 + t * 0.88);
      wave.mesh.scale.set(radius, 1, radius);
      // Se apaga al llegar al borde; el frente joven es el más visible. Y
      // respira con la presión igual que el cono: el radar de Washo barre
      // 360°, así que es el halo que más suelo tapa de los siete.
      wave.material.opacity = 0.5 * (1 - t) * (1 - t) * presence;
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
        // SEGUIMIENTO: un secuaz cuya PROPIA vigilancia (`localHeat`) sigue
        // por encima de su umbral no suelta la pista con un vistazo de 2.5s
        // — se queda tirando de ti mientras dure. El objetivo se refresca a
        // tu posición REAL cada cuadro que te ve (esto es lo que lo
        // convierte en "te sigue" y no en "camina una vez a donde te vio"),
        // y solo te deja cuando el calor baja bastante — con la MISMA cifra
        // exacta se quedaría enganchando y desenganchando en el filo.
        const following = this.role === "minion" && this.localHeat >= this.followThreshold;
        if (following) {
          if (this.playerVisible) {
            this.investigateTarget = { x: player.position.x, z: player.position.z };
          }
          if (this.localHeat < this.followThreshold * 0.6) this._resumeNearestRoutePoint();
          break;
        }
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
        // Vigilancia individual: un secuaz no necesita pillarte con las
        // manos en la masa — si ya te ha visto lo bastante como para pasar
        // SU propio umbral (arriba en update()), rompe la ronda y se pone a
        // seguirte. Nunca te atrapa él (ver catches()): solo te tiene
        // fichada y avisa al jefe (ver update()).
        if (this.role === "minion" && this.localHeat >= this.followThreshold) {
          this.state = INVESTIGATE;
          this.investigateTarget = { x: player.position.x, z: player.position.z };
          break;
        }
        // Con correa puesta, su ronda deja de ser el piso entero y pasa a ser
        // "donde estes tu". Se acerca hasta la banda `near` y ahi la suelta,
        // para volver a la ronda de siempre hasta que te vuelvas a alejar.
        if (this.tether) {
          const { target, near: nearBase, far: farBase } = this.tether;
          // Con la sospecha baja la correa se AFLOJA. No basta con no
          // perseguir: si su ronda sigue siendo "donde estés tú", te lo
          // encuentras encima igual y el piso se hace injugable — que es
          // literalmente lo que pasaba el día 1. Al aflojarla se queda en la
          // misma zona (sigue estando ahí, sigue dando miedo) pero te deja
          // sitio para trabajar. En cuanto subes de sospecha vuelve a
          // cerrarse sola.
          const holgura = this._mayChase() ? 1 : 1.9;
          const near = nearBase * holgura;
          const far = farBase * holgura;
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
    // SENTADO NO ESTÁ ATASCADO, ESTÁ SENTADO. Sin esto el detector veía a
    // Gabo sin avanzar en su silla, lo daba por encajado contra un mueble y
    // le metía el codazo de abajo cada pocos segundos: el jefe se iba
    // deslizando solo por la sala de reuniones.
    if (this.seated) {
      this._stuckTimer = 0;
      return;
    }
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

    // Empujón lateral para salir de un bloqueo numérico exacto (dos
    // colisionadores que se cancelan cada frame): sin esto, el cambio de
    // objetivo de arriba no sirve de nada si la posición sigue exactamente
    // encajada donde estaba.
    //
    // ERA DE MEDIA UNIDAD DE PLANO, o sea medio puesto de trabajo de un
    // cuadro al siguiente: un teletransporte pequeño, y de los que más se
    // notan porque pasa justo cuando estás mirando al jefe atascado contra
    // una mesa. Ahora es un CODAZO (0.12): suficiente para romper un empate
    // numérico, demasiado poco para verse como un salto. Si de verdad sigue
    // encajado, el del cuadro siguiente lo termina de sacar.
    const nudge = Math.random() * Math.PI * 2;
    this.position.x += Math.cos(nudge) * 0.12 * S;
    this.position.z += Math.sin(nudge) * 0.12 * S;
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

    // ¿PASA EL CUERPO en línea recta? `pathBlocked`, no `lineBlocked`: la
    // segunda responde «¿me ve?» (solo colliders de vista, línea sin
    // grosor). Preguntando eso, el jefe veía camino libre A TRAVÉS de una
    // fila de escritorios —no tapan la vista—, se lanzaba recto y se
    // estampaba: rozaba el mueble, `resolveCircle` lo frenaba, el
    // anti-atasco le metía un empujón aleatorio, y la captura se volvía un
    // baile de tropezones. Con el ancho real del cuerpo, o cabe o se va por
    // el navmesh.
    if (this.world && !this.world.pathBlocked(this.position, target, this.radius)) {
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

    // ── SUAVIZADO: tirar de la cuerda ──────────────────────────────────
    // Un camino de A* sobre rejilla va en ESCALERA: nodo arriba, nodo a la
    // derecha, nodo arriba… Caminarlo tal cual es lo que le hacía ir
    // rebotando de esquina en esquina y rozar todos los muebles del pasillo,
    // porque cada nodo lo manda contra el borde de la casilla siguiente en
    // vez de hacia donde va de verdad.
    //
    // Aquí se busca el nodo MÁS LEJANO al que ya se puede ir en línea recta
    // y se apunta directamente a él. La escalera se convierte en tramos
    // rectos y el recorrido se lee como alguien que sabe por dónde va.
    //
    // Se mira desde el final hacia atrás y se corta en el primero que valga:
    // el más lejano visible es siempre el mejor: cualquier nodo intermedio
    // solo añadiría un quiebro inútil.
    //
    // El límite de 6 nodos es para no pagar una traza de línea por cada
    // casilla de un camino largo, con veinte personajes a la vez. Más allá
    // de seis el suavizado ya no se nota: lo que se ve es el quiebro de al
    // lado, no el de dentro de diez metros.
    if (this.world) {
      const hasta = Math.min(this._path.length - 1, 6);
      for (let i = hasta; i > 0; i--) {
        // También con el CUERPO (`pathBlocked`), no con la vista: el atajo
        // se tomaba en cuanto se VEÍA el nodo, aunque por ahí no cupiera —
        // así que el suavizado, que existe para no rozar los muebles, era
        // justo lo que lo mandaba a rozarlos en diagonal.
        if (!this.world.pathBlocked(this.position, this._path[i], this.radius)) {
          this._path.splice(0, i);
          break;
        }
      }
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

    // ── DESLIZAR POR EL MUEBLE, no rebotar contra él ────────────────────
    // Si un collider se comió el paso, se prueba a bordearlo. El orden
    // importa: PRIMERO las dos tangentes (±60° del rumbo), que es lo que
    // hace un cuerpo que roza una mesa y sigue de largo; los ejes puros se
    // quedan de último recurso.
    //
    // Antes solo estaban los ejes, y en una diagonal contra una fila de
    // escritorios eso significa frenar en seco y avanzar a saltos de medio
    // paso — se leía como que el jefe «se aturde» al llegar. Deslizar
    // conserva casi toda la velocidad, así que la captura no se rompe por
    // haber rozado un mueble por el camino.
    const moved = Math.hypot(this.position.x - before.x, this.position.z - before.z);
    if (moved < step * 0.3) {
      const COS = Math.cos(Math.PI / 3);
      const SIN = Math.sin(Math.PI / 3);
      const alternativas = [
        [nx * COS - nz * SIN, nx * SIN + nz * COS], // +60°
        [nx * COS + nz * SIN, -nx * SIN + nz * COS], // −60°
        [Math.sign(nx), 0],
        [0, Math.sign(nz)],
      ];
      for (const [ax, az] of alternativas) {
        if (!ax && !az) continue;
        this.position.x = before.x + ax * step;
        this.position.z = before.z + az * step;
        if (this.world) this.world.resolveCircle(this.position, this.radius);
        if (Math.hypot(this.position.x - before.x, this.position.z - before.z) > step * 0.3) break;
        // Ninguna sirvió todavía: se vuelve al punto de partida antes de
        // probar la siguiente, o se irían acumulando desplazamientos
        // fallidos y el cuerpo derivaría de lado sin avanzar.
        this.position.x = before.x;
        this.position.z = before.z;
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
