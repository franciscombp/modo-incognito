import * as THREE from "three";

/**
 * LA LUZ DEL MUNDO.
 *
 * Vivía suelta en `main.js`, entre el arranque del renderer y el del motor.
 * Se sacó aquí por una razón práctica: `main.js` es de MOTOR y se toca a
 * menudo, mientras que la luz es de ARTE y se calibra a ojo, en muchas
 * pasadas seguidas. Teniéndolas en el mismo archivo, cada tanda de ajuste
 * artístico chocaba con cualquier cambio de arranque. Ver `docs/ARTE.md`.
 *
 * El contrato con el motor es el objeto que devuelve `createWorldLighting`:
 * `engine.js` lo recibe y lo derrama en `applyTheme(theme, { renderer,
 * scene, ...lights })`. Por eso AÑADIR una luz aquí la hace llegar sola a
 * `game/themes.js` sin tocar el motor — que es justo lo que se quería.
 *
 * ── EL SOL SE MUEVE ──────────────────────────────────────────────────
 *
 * `sun` es la única luz con sombra, y su posición NO es fija: la mueve
 * `themes.js` a lo largo de la jornada con `setSunAngles()`. Estaba clavada
 * en una esquina todo el día, y ese es el motivo de que la hora no se
 * leyera: la sombra caía siempre igual a las 7am y a las 7pm, así que lo
 * único que cambiaba era el tinte, y un tinte sin sombra que lo acompañe se
 * lee como "le han puesto un filtro", no como que ha pasado el día.
 *
 * `radius` es la distancia a la que orbita, no un dato físico: la sombra es
 * ortográfica, así que solo importa la DIRECCIÓN. Se mantiene lejos para que
 * el volumen de sombra cubra el piso entero desde cualquier ángulo.
 */

/** Distancia a la que orbita el sol, en unidades de mundo ya escaladas. */
const SUN_ORBIT = 62;

/** Media sombra proyectada, en unidades de mundo ya escaladas. */
const SHADOW_SPAN = 44;

/**
 * Monta la luz del piso y la devuelve.
 *
 * @param {THREE.Scene} scene
 * @param {{shadows:boolean, shadowMap:number}} quality Ajustes de calidad.
 * @param {number} S Escala de mundo (`WORLD_SCALE`).
 */
export function createWorldLighting(scene, quality, S = 1) {
  // Relleno suave. Alto a propósito en el arranque: `themes.js` lo baja en
  // cuanto entra el tema del día, y así el primer frame nunca sale a oscuras.
  const ambient = new THREE.AmbientLight(0xfff6ea, 1.15);
  scene.add(ambient);

  // Cielo contra suelo. Es lo que da el rebote frío por arriba y cálido por
  // abajo sin costar una luz de verdad.
  const hemi = new THREE.HemisphereLight(0xf0e6ff, 0xd8c4a8, 0.95);
  scene.add(hemi);

  // El sol. La única que proyecta sombra.
  const key = new THREE.DirectionalLight(0xfff0d4, 1.1);
  key.castShadow = quality.shadows;
  key.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  const span = SHADOW_SPAN * S;
  key.shadow.camera.left = -span;
  key.shadow.camera.right = span;
  key.shadow.camera.top = span;
  key.shadow.camera.bottom = -span;
  key.shadow.camera.far = 220 * S;
  key.shadow.bias = -0.0018;
  // El BORDE de la sombra, que es la mitad de lo duro que se ve el set.
  // Con radio 1 (el de por defecto) el canto sale a cuchillo y el piso se
  // lee como recortado en cartulina; el sol de una oficina entra por metros
  // de vidrio, así que su sombra tiene penumbra ancha. Con PCFSoftShadowMap
  // el radio ensancha ese difuminado sin pagar otro mapa.
  key.shadow.radius = 4;
  scene.add(key);
  // El objetivo tiene que estar EN la escena: una DirectionalLight apunta a
  // su `target`, y un target suelto se queda en el origen del mundo sin
  // matriz actualizada, así que la sombra sale desplazada del piso.
  key.target.position.set(0, 0, 0);
  scene.add(key.target);

  setSunAngles(key, { azimuth: 0.9, elevation: 0.95 }, S);

  return { ambient, hemi, key, worldScale: S };
}

/**
 * Coloca el sol por ángulos en vez de por coordenadas.
 *
 * `azimuth` es el giro alrededor del piso en radianes (0 = este, π = oeste)
 * y `elevation` la altura sobre el horizonte (0 = rasante, π/2 = cenit).
 * Pensado para interpolarlo a lo largo del día desde `themes.js`.
 *
 * La elevación se topa por abajo: con el sol EXACTAMENTE en el horizonte la
 * sombra se estira hasta el infinito y sale rayada por el borde del mapa de
 * sombras. Un par de grados de margen lo evitan y no se nota.
 */
export function setSunAngles(key, { azimuth, elevation }, S = 1) {
  const e = Math.max(elevation, 0.06);
  const r = SUN_ORBIT * S;
  const horizontal = Math.cos(e) * r;
  key.position.set(Math.cos(azimuth) * horizontal, Math.sin(e) * r, Math.sin(azimuth) * horizontal);
  key.target.updateMatrixWorld();
}

/**
 * EL REGISTRO DE LOS CHARCOS DE LUZ.
 *
 * Los charcos (`sunlight.js`) los CONSTRUYE `builder.js`, porque es quien
 * tiene el contorno del piso y el alto de la fachada; y los MUEVE
 * `themes.js`, porque es quien sabe dónde está el sol en cada instante. Ni
 * uno ni otro se conocen, así que se dejan aquí en medio — al lado de la luz
 * a la que siguen.
 *
 * Va por un registro de módulo, y no pasándolos por el objeto de luces,
 * a propósito: los charcos nacen al MONTAR el piso, mucho después de que
 * `main.js` haya creado las luces y se las haya dado al motor. Enchufarlos
 * por ahí obligaría a que el motor los conociera, y este frente no debe
 * tocar el motor (ver `docs/ARTE.md`).
 *
 * Se reemplaza entero en cada montaje: un día nuevo reconstruye el piso, y
 * quedarse con los charcos del anterior sería dejar luz de un edificio que
 * ya no existe.
 */
let sunPools = null;

export function setSunPools(pools) {
  sunPools?.dispose?.();
  sunPools = pools ?? null;
}

export function getSunPools() {
  return sunPools;
}
